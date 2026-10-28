
/* ===== JavaScript / TypeScript / JSX / TSX / Vue SFC / Node / Express ===== */
const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.mts', '.cts', '.d.ts'];
const TYPE_KINDS = new Set(['interface', 'type', 'enum', 'struct', 'trait', 'sqltype']);

function tryJSFile(ctx, base) {
  const m = ctx.fileByPath;
  if (m.has(base) && /\.(js|jsx|ts|tsx|mjs|cjs|vue|mts|cts)$/.test(base)) return m.get(base);
  const noExt = base.replace(/\.(m|c)?jsx?$/, '');
  for (const cand of [base, noExt]) for (const e of JS_EXTS) { const p = cand + e; if (m.has(p)) return m.get(p); }
  for (const e of JS_EXTS) { const p = base + '/index' + e; if (m.has(p)) return m.get(p); }
  return null;
}
function resolveJSSpec(ctx, spec, f) {
  if (spec.startsWith('.')) { const t = tryJSFile(ctx, joinPath(f.dir, spec)); return t ? { file: t } : { ext: null, unresolved: true }; }
  for (const a of ctx.aliases) {
    if (a.exact ? spec === a.prefix : spec.startsWith(a.prefix)) {
      const rest = a.exact ? '' : spec.slice(a.prefix.length);
      for (const t of a.targets) { const r = tryJSFile(ctx, a.exact ? t : joinPath(t, rest)); if (r) return { file: r }; }
    }
  }
  if (spec.startsWith('node:')) return { ext: spec.slice(5), builtin: true };
  const parts = spec.split('/'); const pkg = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (NODE_BUILTINS.has(pkg)) return { ext: pkg, builtin: true };
  const ws = ctx.pkgNames.get(pkg);
  if (ws) {
    const rest = parts.slice(spec.startsWith('@') ? 2 : 1).join('/');
    const tries = rest ? [joinPath(ws.dir, rest), joinPath(ws.dir, 'src/' + rest)] : [ws.main && joinPath(ws.dir, ws.main), joinPath(ws.dir, 'src/index'), joinPath(ws.dir, 'index')];
    for (const t of tries) { if (!t) continue; const r = tryJSFile(ctx, t); if (r) return { file: r }; }
  }
  for (const b of ctx.baseUrls) { const r = tryJSFile(ctx, joinPath(b, spec)); if (r) return { file: r }; }
  return { ext: pkg };
}
function parseImportClause(cl) {
  cl = cl.trim(); const r = { def: null, ns: null, names: [] };
  const brace = /\{([^}]*)\}/.exec(cl);
  if (brace) {
    for (const part of brace[1].split(',')) { const p = part.trim().replace(/^type\s+/, ''); if (!p) continue; const m = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(p); if (m) r.names.push({ imported: m[1], local: m[2] || m[1] }); }
    cl = cl.replace(brace[0], '');
  }
  const nsm = /\*\s+as\s+([\w$]+)/.exec(cl); if (nsm) { r.ns = nsm[1]; cl = cl.replace(nsm[0], ''); }
  const dm = /([\w$]+)/.exec(cl.replace(/^type\s+/, '')); if (dm) r.def = dm[1];
  return r;
}
function findBody(m, from) {
  const lim = Math.min(m.length, from + 600);
  for (let i = from; i < lim; i++) { const c = m[i]; if (c === '{') return i; if (c === ';') return -1; if (c === '=' && m[i + 1] === '>') return -1; }
  return -1;
}
function exprEnd(m, from) {
  let d = 0;
  for (let i = from; i < m.length; i++) {
    const c = m[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { if (d === 0) return i; d--; }
    else if (d === 0 && (c === ';' || c === ',')) return i;
    else if (d === 0 && c === '\n') {
      let j = i + 1; while (j < m.length && /\s/.test(m[j])) j++;
      if (/^(\.|\?|:|&&|\|\||\+|-|\*|\/|=>)/.test(m.slice(j, j + 2))) continue;
      return i;
    }
  }
  return m.length;
}
function typeAliasEnd(m, from) {
  let d = 0;
  for (let i = from; i < m.length; i++) {
    const c = m[i];
    if ('([{<'.includes(c)) d++;
    else if (')]}>'.includes(c)) { if (!(c === '>' && m[i - 1] === '=')) d--; }
    else if (c === ';' && d <= 0) return i + 1;
    else if (c === '\n' && d <= 0) {
      let j = i + 1; while (j < m.length && /\s/.test(m[j])) j++;
      let k = i - 1; while (k > from && /\s/.test(m[k])) k--;
      if ('|&'.includes(m[j]) || '|&=,?:'.includes(m[k])) continue;
      return i;
    }
  }
  return m.length;
}
// give every call/ref the innermost symbol that contains it
function assignOwners(items, syms) {
  const arr = syms.filter(s => s.endPos > s.startPos && !TYPE_KINDS.has(s.kind)).sort((a, b) => a.startPos - b.startPos || b.endPos - a.endPos);
  items.sort((a, b) => a.pos - b.pos);
  let idx = 0; const stack = [];
  for (const it of items) {
    while (idx < arr.length && arr[idx].startPos <= it.pos) { while (stack.length && stack[stack.length - 1].endPos <= arr[idx].startPos) stack.pop(); stack.push(arr[idx]); idx++; }
    while (stack.length && stack[stack.length - 1].endPos <= it.pos) stack.pop();
    it.owner = stack.length ? stack[stack.length - 1] : null;
  }
}
const normHttpPath = p => p.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').replace(/\$\{[^}]*\}/g, ':p').replace(/\/+$/, '') || '/';

function parseJS(f, ctx) {
  const text = f.text; const ext = extOf(f.path);
  let code = text, tplText = '', vueMeta = null;
  if (f.kind === 'vue') {
    let out = '', last = 0, m; const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; vueMeta = { setup: false, ts: false };
    while ((m = re.exec(text))) {
      const cs = m.index + m[0].indexOf('>') + 1, ce = cs + m[2].length;
      out += blankKeepNL(text.slice(last, cs)) + text.slice(cs, ce); last = ce;
      if (/\bsetup\b/.test(m[1])) vueMeta.setup = true; if (/lang\s*=\s*["']tsx?["']/.test(m[1])) vueMeta.ts = true;
    }
    code = out + blankKeepNL(text.slice(last));
    const tm = /<template\b[^>]*>([\s\S]*)<\/template>/i.exec(text); tplText = tm ? tm[1] : '';
    f.vue = vueMeta;
  }
  const mAll = maskJS(code, false), mStr = maskJS(code, true);
  const lineOf = f.lineOf; const syms = []; const declPos = new Set();
  const depth = new Int32Array(mAll.length + 1), pdepth = new Int32Array(mAll.length + 1);
  { let d = 0, p = 0; for (let i = 0; i < mAll.length; i++) { depth[i] = d; pdepth[i] = p; const c = mAll.charCodeAt(i); if (c === 123) d++; else if (c === 125) d--; else if (c === 40 || c === 91) p++; else if (c === 41 || c === 93) p--; } depth[mAll.length] = d; pdepth[mAll.length] = p; }
  const mk = o => {
    const s = ctx.newSym(f, o);
    s.doc = docAbove(f.lineArr, s.line - 1, 'c');
    s.complexity = 1 + (mAll.slice(o.startPos, o.endPos).match(/\b(?:if|for|while|case|catch)\b|&&|\|\||\?(?![.?])/g) || []).length;
    syms.push(s); if (o.nameStart != null) declPos.add(o.nameStart);
    return s;
  };
  const arrowEnd = from => { let bs = from; while (bs < mAll.length && /\s/.test(mAll[bs])) bs++; return mAll[bs] === '{' ? matchClose(mAll, bs, '{', '}') + 1 : exprEnd(mAll, bs); };
  function fnFromTok(tok, after) {
    if (tok.startsWith('function')) { const po = after - 1; const pc = matchClose(mAll, po, '(', ')'); const bs = findBody(mAll, pc + 1); if (bs < 0) return null; return { params: splitTop(text.slice(po + 1, pc)), sigEnd: bs, end: matchClose(mAll, bs, '{', '}') + 1 }; }
    if (/=>\s*$/.test(tok)) return { params: [tok.replace(/\s*=>\s*$/, '').trim()], sigEnd: after, end: arrowEnd(after) };
    const po = after - 1; const pc = matchClose(mAll, po, '(', ')');
    const am = /^\s*(?::[^=;{}]*?)?\s*=>/.exec(mAll.slice(pc + 1, pc + 240)); if (!am) return null;
    const from = pc + 1 + am[0].length; return { params: splitTop(text.slice(po + 1, pc)), sigEnd: from, end: arrowEnd(from) };
  }
  let m;

  /* --- imports / exports --- */
  const addImport = (spec, clause, pos, kind) => {
    const res = resolveJSSpec(ctx, spec, f);
    const imp = { spec, line: lineOf(pos), names: [], target: res.file ? res.file.id : null, external: res.ext || null, builtin: !!res.builtin, kind: kind || 'import' };
    if (clause) {
      const c = parseImportClause(clause);
      imp.names = c.names.map(n => n.imported).concat(c.def ? ['default'] : [], c.ns ? ['*'] : []);
      if (c.def) f.localNames.set(c.def, { imp, imported: 'default' });
      if (c.ns) f.localNames.set(c.ns, { imp, imported: '*' });
      for (const n of c.names) f.localNames.set(n.local, { imp, imported: n.imported });
    }
    f.imports.push(imp); return imp;
  };
  const reImp = /\bimport\s+(type\s+)?([^'";]*?)\s+from\s*(['"])([^'"\n]+)\3/g;
  while ((m = reImp.exec(mStr))) addImport(m[4], m[2], m.index);
  const reImpSide = /\bimport\s*(['"])([^'"\n]+)\1/g;
  while ((m = reImpSide.exec(mStr))) addImport(m[2], null, m.index, 'side-effect');
  const reReexp = /\bexport\s+(?:type\s+)?(\*(?:\s+as\s+([\w$]+))?|\{([^}]*)\})\s*from\s*(['"])([^'"\n]+)\4/g;
  while ((m = reReexp.exec(mStr))) {
    const imp = addImport(m[5], null, m.index, 'reexport'); imp.names = m[3] ? m[3].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : ['*'];
    if (imp.target) f.reexports.push({ target: imp.target, names: m[3] ? m[3].split(',').map(s => { const p = s.trim().split(/\s+as\s+/); return { imported: p[0], exported: p[1] || p[0] }; }).filter(x => x.imported) : null });
    if (m[3]) for (const s of m[3].split(',')) { const p = s.trim().split(/\s+as\s+/); if (p[0]) f.exports.push(p[1] || p[0]); }
  }
  const reReq = /(?:(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*)?\brequire\s*\(\s*(['"])([^'"\n]+)\2\s*\)/g;
  while ((m = reReq.exec(mStr))) addImport(m[3], m[1] ? m[1].replace(/:/g, ' as ') : null, m.index, 'require');
  const reDyn = /\bimport\s*\(\s*(['"`])([^'"`\n$]+)\1\s*\)/g;
  while ((m = reDyn.exec(mStr))) addImport(m[2], null, m.index, 'dynamic');

  /* --- types / interfaces / enums (also used to block false function matches inside them) --- */
  const blocked = [];
  { const re = /(^|[\s;{}])(export\s+)?(declare\s+)?(?:const\s+)?(interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
    while ((m = re.exec(mAll))) {
      const kw = m[4]; const start = m.index + m[1].length; let end, sigEnd;
      const after = m.index + m[0].length;
      if (kw === 'type') { const eq = mAll.indexOf('=', after); if (eq < 0 || /[;\n{(]/.test(mAll.slice(after, eq).replace(/<[^>]*>/g, ''))) continue; end = typeAliasEnd(mAll, eq + 1); sigEnd = eq; }
      else { const bo = mAll.indexOf('{', after); if (bo < 0 || mAll.slice(after, bo).includes(';')) continue; end = matchClose(mAll, bo, '{', '}') + 1; sigEnd = bo; }
      blocked.push([start, end]);
      mk({ name: m[5], kind: kw, startPos: start, endPos: end, sigStart: start, sigEnd, nameStart: after - m[5].length, exported: !!m[2] });
      re.lastIndex = Math.max(after, kw === 'type' ? after : after);
    } }
  const isBlocked = pos => blocked.some(b => pos >= b[0] && pos < b[1]);

  /* --- classes + methods --- */
  const classRanges = [];
  { const re = /(^|[\s;{}])(export\s+)?(default\s+)?(abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s*<[^{]*?>)?(?:\s+extends\s+([\w$.]+))?(?:\s*<[^{]*?>)?(?:\s+implements\s+([\w$.,\s<>]+?))?\s*\{/g;
    while ((m = re.exec(mAll))) {
      const start = m.index + m[1].length, bo = m.index + m[0].length - 1, be = matchClose(mAll, bo, '{', '}') + 1;
      const cls = mk({ name: m[5], kind: /(^|\.)(Pure)?Component$/.test(m[6] || '') ? 'component' : 'class', startPos: start, endPos: be, sigStart: start, sigEnd: bo, nameStart: mAll.indexOf(m[5], start + 5), exported: !!m[2], isDefault: !!m[3], superName: m[6] || null, implementsList: m[7] ? m[7].split(',').map(s => s.trim().replace(/<.*$/, '')).filter(Boolean) : [] });
      classRanges.push({ sym: cls, bo, be });
      const reM = /^[ \t]*((?:(?:public|private|protected|static|readonly|override|abstract|async|declare)\s+)*)(?:(?:get|set)\s+)?(\*?\s*)(#?[A-Za-z_$][\w$]*)\s*(?:<[^()\n]*>)?\s*\(/gm;
      reM.lastIndex = bo + 1; let mm;
      while ((mm = reM.exec(mAll)) && mm.index < be) {
        if (depth[mm.index] !== depth[bo] + 1 || pdepth[mm.index] !== 0) continue;
        const name = mm[3]; if (KEYWORDS.has(name) && name !== 'constructor') continue;
        const po = mm.index + mm[0].length - 1, pc = matchClose(mAll, po, '(', ')'); const bs = findBody(mAll, pc + 1); if (bs < 0) continue;
        const lead = mm[0].match(/^[ \t]*/)[0].length;
        mk({ name, kind: 'method', className: cls.name, startPos: mm.index + lead, endPos: matchClose(mAll, bs, '{', '}') + 1, sigStart: mm.index + lead, sigEnd: bs, nameStart: mm.index + mm[0].lastIndexOf(name), params: splitTop(text.slice(po + 1, pc)), async: /\basync\b/.test(mm[1]), visibility: /^#/.test(name) || /\bprivate\b/.test(mm[1]) ? 'private' : /\bprotected\b/.test(mm[1]) ? 'protected' : 'public', isStatic: /\bstatic\b/.test(mm[1]) });
      }
      const reP = /^[ \t]*((?:(?:public|private|protected|static|readonly)\s+)*)(#?[A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*(async\s+)?(\(|[A-Za-z_$][\w$]*\s*=>)/gm;
      reP.lastIndex = bo + 1;
      while ((mm = reP.exec(mAll)) && mm.index < be) {
        if (depth[mm.index] !== depth[bo] + 1 || pdepth[mm.index] !== 0) continue;
        const fn = fnFromTok(mm[4], mm.index + mm[0].length); if (!fn) continue;
        const lead = mm[0].match(/^[ \t]*/)[0].length;
        mk({ name: mm[2], kind: 'method', className: cls.name, startPos: mm.index + lead, endPos: fn.end, sigStart: mm.index + lead, sigEnd: fn.sigEnd, nameStart: mm.index + mm[0].indexOf(mm[2], lead), params: fn.params, async: !!mm[3], visibility: /^#/.test(mm[2]) || /\bprivate\b/.test(mm[1]) ? 'private' : 'public' });
      }
      re.lastIndex = bo + 1;
    } }
  const inClass = pos => classRanges.some(c => pos > c.bo && pos < c.be);

  /* --- function declarations --- */
  { const re = /(^|[\s;{}(,=])(export\s+)?(default\s+)?(async\s+)?function\s*(\*)?\s*([A-Za-z_$][\w$]*)?/g;
    while ((m = re.exec(mAll))) {
      const name = m[6] || (m[3] ? 'default' : null); if (!name) continue;
      const start = m.index + m[1].length; const after = m.index + m[0].length;
      const po = mAll.indexOf('(', after); if (po < 0 || po - after > 200) continue;
      const fn = fnFromTok('function', po + 1); if (!fn) continue;
      mk({ name, kind: 'function', startPos: start, endPos: fn.end, sigStart: start, sigEnd: fn.sigEnd, nameStart: m[6] ? after - m[6].length : null, exported: !!m[2], isDefault: !!m[3], async: !!m[4], params: fn.params });
      re.lastIndex = after;
    } }
  /* --- const x = () => {} / function expressions / memo(...) / useCallback(...) --- */
  { const re = /(^|[\s;{}])(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;\n]+?)?\s*=\s*(?:(?:React\.)?(?:memo|forwardRef|useCallback|observer)\s*(?:<[^>(]*>)?\s*\(\s*)?(async\s+)?(function\b\s*\*?\s*(?:[A-Za-z_$][\w$]*)?\s*\(|(?:<[^>()]*>\s*)?\(|[A-Za-z_$][\w$]*\s*=>)/g;
    while ((m = re.exec(mAll))) {
      const start = m.index + m[1].length; const after = m.index + m[0].length; const name = m[3];
      const fn = fnFromTok(m[5].replace(/^<[^>]*>\s*/, ''), after); if (!fn) continue;
      mk({ name, kind: 'function', startPos: start, endPos: fn.end, sigStart: start, sigEnd: fn.sigEnd, nameStart: mAll.indexOf(name, start + (m[2] ? m[2].length : 0)), exported: !!m[2], async: !!m[4], params: fn.params });
      re.lastIndex = after;
    } }
  /* --- object-literal methods / property functions / exports.x = / prototype methods --- */
  { const re = /(^|[\s,{])([A-Za-z_$][\w$]*)\s*:\s*(async\s+)?(function\b\s*\*?\s*[A-Za-z_$]*\s*\(|(?:<[^>()]*>\s*)?\(|[A-Za-z_$][\w$]*\s*=>)/g;
    while ((m = re.exec(mAll))) {
      const at = m.index + m[1].length; if (depth[at] < 1 || pdepth[at] !== 0 || isBlocked(at) || inClass(at)) continue;
      const after = m.index + m[0].length; const fn = fnFromTok(m[4].replace(/^<[^>]*>\s*/, ''), after); if (!fn) continue;
      mk({ name: m[2], kind: 'function', startPos: at, endPos: fn.end, sigStart: at, sigEnd: fn.sigEnd, nameStart: at, params: fn.params, async: !!m[3], prop: true });
      re.lastIndex = after;
    }
    const reM = /^[ \t]*(async\s+)?(\*?\s*)([A-Za-z_$][\w$]*)\s*\(/gm;
    while ((m = reM.exec(mAll))) {
      const at = m.index + m[0].match(/^[ \t]*/)[0].length; const name = m[3];
      if (KEYWORDS.has(name) || depth[at] < 1 || pdepth[at] !== 0 || isBlocked(at) || inClass(at) || declPos.has(m.index + m[0].lastIndexOf(name))) continue;
      const po = m.index + m[0].length - 1, pc = matchClose(mAll, po, '(', ')'); const ptxt = text.slice(po + 1, pc);
      if (/=>|\bfunction\b|['"`]/.test(ptxt) || /[+*]/.test(mAll.slice(po + 1, pc))) continue;
      const bs = findBody(mAll, pc + 1); if (bs < 0 || mAll.slice(pc + 1, bs).trim().replace(/^:[^{]*$/, '') !== '') continue;
      mk({ name, kind: 'function', startPos: at, endPos: matchClose(mAll, bs, '{', '}') + 1, sigStart: at, sigEnd: bs, nameStart: m.index + m[0].lastIndexOf(name), params: splitTop(ptxt), async: !!m[1], prop: true });
    }
    const reEx = /(?:^|[\s;])((?:module\.)?exports\.([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\.prototype\.([A-Za-z_$][\w$]*))\s*=\s*(async\s+)?(function\b\s*\*?\s*[A-Za-z_$]*\s*\(|(?:<[^>()]*>\s*)?\(|[A-Za-z_$][\w$]*\s*=>)/g;
    while ((m = reEx.exec(mAll))) {
      const at = m.index + m[0].indexOf(m[1]); const after = m.index + m[0].length; const fn = fnFromTok(m[6], after); if (!fn) continue;
      mk({ name: m[2] || m[4], kind: m[2] ? 'function' : 'method', className: m[3] || null, startPos: at, endPos: fn.end, sigStart: at, sigEnd: fn.sigEnd, nameStart: null, exported: !!m[2], params: fn.params, async: !!m[5] });
      if (m[2]) f.exports.push(m[2]);
      reEx.lastIndex = after;
    } }

  /* --- Express / Fastify style routes --- */
  { const re = /\b([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|delete|patch|head|options|all|use)\s*\(\s*(['"`])([^'"`\n]*)\3/g;
    while ((m = re.exec(mStr))) {
      if (!/^(app|router|server|api|route|routes|fastify|[\w$]*[Rr]outer|[\w$]*[Aa]pp)$/.test(m[1])) continue;
      const po = m.index + m[0].indexOf('('); const pc = matchClose(mAll, po, '(', ')');
      const method = m[2].toUpperCase(); const rpath = m[4];
      if (method === 'USE' && !rpath.startsWith('/')) continue;
      const s = mk({ name: method + ' ' + rpath, kind: 'route', startPos: m.index, endPos: pc + 1, sigStart: m.index, sigEnd: Math.min(pc, m.index + m[0].length), nameStart: null, exported: false, route: { method, path: rpath }, params: [] });
      ctx.routes.push({ sym: s.id, method, path: rpath });
      const args = splitTop(text.slice(po + 1, pc)).slice(1);
      for (const a of args) if (/^[A-Za-z_$][\w$.]*$/.test(a)) { const parts = a.split('.'); s.pendingRefs = (s.pendingRefs || []); s.pendingRefs.push({ name: parts.pop(), recv: parts.join('.') || null, type: 'call', line: lineOf(m.index), label: 'handler' }); }
    } }

  /* --- default export / export lists --- */
  { const re = /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm; while ((m = re.exec(mAll))) f.defaultName = m[1];
    const re2 = /\bexport\s*(?:type\s*)?\{([^}]*)\}(?!\s*from)/g;
    while ((m = re2.exec(mAll))) for (const s of m[1].split(',')) { const p = s.trim().split(/\s+as\s+/); if (!p[0]) continue; const ex = p[1] || p[0]; if (ex === 'default') f.defaultName = p[0]; else { f.exports.push(ex); if (p[1]) f.exportAlias[ex] = p[0]; } }
    const re3 = /\bmodule\.exports\s*=\s*(?:([A-Za-z_$][\w$]*)\s*;?\s*$|\{([^}]*)\})/gm;
    while ((m = re3.exec(mAll))) { if (m[1]) f.defaultName = m[1]; if (m[2]) for (const s of splitTop(m[2])) { const p = s.split(':'); const nm = p[0].trim(); if (/^[\w$]+$/.test(nm)) { f.exports.push(nm); if (p[1] && /^[\w$]+$/.test(p[1].trim())) f.exportAlias[nm] = p[1].trim(); } } }
  }

  /* --- Vue component symbol --- */
  let vueComp = null;
  if (f.kind === 'vue') {
    vueComp = mk({ name: pascal(stemOf(f.path)), kind: 'component', startPos: 0, endPos: text.length, sigStart: 0, sigEnd: 0, exported: true, isDefault: true, vue: true, params: [] });
    vueComp.signature = '<' + vueComp.name + '> — Vue ' + (vueMeta.setup ? '<script setup>' : 'SFC') + (vueMeta.ts ? ' (TypeScript)' : '');
    vueComp.doc = f.header || ''; vueComp.line = 1;
  }

  /* --- classify functions: React components & hooks --- */
  const jsxFile = /^(jsx|tsx)$/.test(ext) || f.imports.some(i => /^(react|preact|next|solid-js)(\/|$)/.test(i.spec));
  f.hasJSX = jsxFile;
  for (const s of syms) {
    if (s.kind === 'function' || s.kind === 'method') {
      if (/^use[A-Z0-9]/.test(s.name) && s.kind === 'function') s.kind = 'hook';
      else if (s.kind === 'function' && jsxFile && /^[A-Z]/.test(s.name) && /<\/?[A-Za-z][\w.]*[\s>\/]|<>/.test(mAll.slice(s.startPos, s.endPos))) s.kind = 'component';
    }
  }

  /* --- calls (and JSX renders, HTTP calls, env vars) --- */
  const items = [];
  { const re = /([A-Za-z_$#][\w$]*(?:\s*\??\.\s*#?[A-Za-z_$][\w$]*)*)\s*(?:<[^()<>;{}]*>)?\s*\(/g;
    while ((m = re.exec(mAll))) {
      const chain = m[1].replace(/\s+/g, '').replace(/\?\./g, '.'); const parts = chain.split('.'); const name = parts.pop(); let recv = parts.join('.') || null;
      if (!recv && KEYWORDS.has(name)) continue;
      if (recv && KEYWORDS.has(parts[0]) && parts[0] !== 'this' && parts[0] !== 'super') continue;
      if (declPos.has(m.index) || declPos.has(m.index + m[1].length - name.length)) continue;
      if (/(function\s*\*?|class)\s+$/.test(mAll.slice(Math.max(0, m.index - 12), m.index))) continue;
      if (!recv) { let k = m.index - 1; while (k >= 0 && /\s/.test(mAll[k])) k--; if (mAll[k] === '.') recv = '?'; }
      items.push({ pos: m.index, name, recv, type: 'call', line: lineOf(m.index) });
    } }
  if (jsxFile) { const re = /<([A-Z][\w$]*(?:\.[A-Z][\w$]*)*)(?=[\s/>])/g; while ((m = re.exec(mAll))) { const parts = m[1].split('.'); items.push({ pos: m.index, name: parts.pop(), recv: parts.join('.') || null, type: 'render', line: lineOf(m.index) }); } }
  { const re = /\b(fetch|axios(?:\.(?:get|post|put|delete|patch))?|\$fetch|ky(?:\.(?:get|post|put|delete|patch))?|(?:http|api|request|client)\.(?:get|post|put|delete|patch))\s*(?:<[^>()]*>)?\(\s*(['"`])((?:\/|https?:\/\/)[^'"`\n]*)\2/g;
    while ((m = re.exec(mStr))) {
      let method = (/\.(get|post|put|delete|patch)$/.exec(m[1]) || [])[1];
      if (!method) { const po = m.index + m[0].indexOf('('); const args = mStr.slice(po, matchClose(mAll, po, '(', ')') + 1); const mm = /method\s*:\s*['"](\w+)['"]/.exec(args); method = mm ? mm[1] : 'GET'; }
      items.push({ pos: m.index, name: normHttpPath(m[3]), recv: null, type: 'http', method: method.toUpperCase(), line: lineOf(m.index) });
    } }
  if (f.kind === 'vue' && tplText) {
    const toff = text.indexOf(tplText); const lineAt = i => lineOf(toff + i);
    const comp = vueComp; const seen = new Set();
    const reTag = /<([A-Z][\w]*|[a-z][\w]*(?:-[\w]+)+)(?=[\s/>])/g;
    while ((m = reTag.exec(tplText))) { const nm = /^[A-Z]/.test(m[1]) ? m[1] : pascal(m[1]); const key = 'r' + nm; if (seen.has(key)) continue; seen.add(key); comp.rawCalls.push({ name: nm, recv: null, type: 'render', line: lineAt(m.index), label: 'template' }); }
    const exprs = []; const reE1 = /\{\{([\s\S]*?)\}\}/g; while ((m = reE1.exec(tplText))) exprs.push([m[1], m.index]);
    const reE2 = /\s(?:@|:|v-)[\w:.\-]*\s*=\s*(?:"([^"]*)"|'([^']*)')/g; while ((m = reE2.exec(tplText))) exprs.push([m[1] != null ? m[1] : m[2], m.index]);
    for (const [ex, at] of exprs) {
      const maskedEx = ex.replace(/(['"`])(?:(?!\1)[^\\])*\1/g, '""');
      const reId = /(^|[^\w$.])([A-Za-z_$][\w$]*)/g; let mi;
      while ((mi = reId.exec(maskedEx))) { const key = 'c' + mi[2]; if (seen.has(key)) continue; seen.add(key); comp.rawCalls.push({ name: mi[2], recv: null, type: 'call', line: lineAt(at), label: 'template', localOnly: true }); }
    }
    // props / emits
    const topKeys = inner => { let d = 0, out = ''; for (const ch of inner) { if ('{[('.includes(ch)) { d++; out += ' '; continue; } if ('}])'.includes(ch)) { d--; out += ' '; continue; } out += d === 0 ? ch : ' '; } return [...out.matchAll(/([A-Za-z_$][\w$]*)\??\s*:/g)].map(x => x[1]); };
    const props = []; const dpi = text.indexOf('defineProps');
    if (dpi >= 0) { const seg = text.slice(dpi, dpi + 2500); const bm = /[[{]/.exec(seg.slice(11)); if (bm) { const o = 11 + bm.index; const close = matchClose(seg, o, seg[o], seg[o] === '{' ? '}' : ']'); const inner = seg.slice(o + 1, close); if (seg[o] === '[') for (const s2 of inner.matchAll(/['"]([\w$-]+)['"]/g)) props.push(s2[1]); else props.push(...topKeys(inner)); } }
    const emits = []; const de = /defineEmits\s*(?:<[\s\S]*?>)?\s*\(([\s\S]*?)\)/.exec(text); if (de) for (const s of de[0].matchAll(/['"]([\w:-]+)['"]/g)) emits.push(s[1]);
    const oe = /\bemits\s*:\s*\[([^\]]*)\]/.exec(text); if (oe) for (const s of oe[1].matchAll(/['"]([\w:-]+)['"]/g)) emits.push(s[1]);
    const op = /\bprops\s*:\s*\[([^\]]*)\]/.exec(mStr); if (op) for (const s of op[1].matchAll(/['"]([\w$-]+)['"]/g)) props.push(s[1]);
    if (props.length) vueComp.extra.push({ label: 'Props', items: uniq(props).slice(0, 40) });
    if (emits.length) vueComp.extra.push({ label: 'Emits events', items: uniq(emits).slice(0, 40) });
  }
  assignOwners(items, syms);
  const envVars = new Set();
  for (const it of items) {
    if (it.type === 'http') { const rec = { name: it.name, method: it.method, line: it.line, type: 'http' }; (it.owner ? it.owner.rawCalls : f.topCalls).push(rec); continue; }
    const rec = { name: it.name, recv: it.recv, type: it.type, line: it.line }; (it.owner ? it.owner.rawCalls : f.topCalls).push(rec);
  }
  for (const s of syms) if (s.pendingRefs) { s.rawCalls.push(...s.pendingRefs); delete s.pendingRefs; }
  { const re = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)|process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]|import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g; while ((m = re.exec(mStr))) envVars.add(m[1] || m[2] || m[3]); }
  f.env = [...envVars];

  /* --- export flags --- */
  for (const s of syms) {
    if (s.exported && s.kind !== 'method') { f.exports.push(s.name); }
    if (s.isDefault) f.defaultName = s.name;
  }
  f.exports = uniq(f.exports);
  if (vueComp) f.defaultName = vueComp.name;
  // Node / CommonJS hint
  f.cjs = /\brequire\s*\(|module\.exports|\bexports\./.test(mAll);
  f.usesProcess = /\bprocess\.(env|argv|exit|cwd)\b/.test(mAll);
  return syms;
}
