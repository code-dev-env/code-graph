
/* ===== PostgreSQL / SQL ===== */
const unq = s => s ? s.replace(/^"|"$/g, '').replace(/""/g, '"') : s;
const sqlKey = s => unq(s).toLowerCase();
const SQL_TABLE_REF = /\b(from|join|into|update|delete\s+from|truncate(?:\s+table)?|references|table|only|using)\s+(?:only\s+)?("(?:[^"]|"")+"|[A-Za-z_][\w$]*)(?:\s*\.\s*("(?:[^"]|"")+"|[A-Za-z_][\w$]*))?/gi;

function sqlRefs(masked) {
  const out = [];
  let mt; SQL_TABLE_REF.lastIndex = 0;
  while ((mt = SQL_TABLE_REF.exec(masked))) {
    const kw = mt[1].toLowerCase().replace(/\s+/g, ' ');
    const write = /^(into|update|delete from|truncate|truncate table)$/.test(kw);
    out.push({ name: sqlKey(mt[3] || mt[2]), mode: write ? 'writes' : 'reads', pos: mt.index });
  }
  return out;
}

function parseSql(f, ctx) {
  const text = f.text, m = maskSql(text, false), lineOf = f.lineOf, lines = f.lineArr, n = m.length;
  const syms = [];
  const stmts = []; let start = 0, i = 0;
  while (i < n) {
    const c = m[i];
    if (c === '$') { const tm = /^\$([A-Za-z_]\w*)?\$/.exec(m.slice(i, i + 40)); if (tm) { const close = m.indexOf(tm[0], i + tm[0].length); i = close < 0 ? n : close + tm[0].length; continue; } }
    if (c === ';') { stmts.push([start, i + 1]); start = i + 1; }
    i++;
  }
  if (m.slice(start).trim()) stmts.push([start, n]);
  const misc = [];
  const NAME = '("(?:[^"]|"")+"|[\\w$]+)(?:\\s*\\.\\s*("(?:[^"]|"")+"|[\\w$]+))?';
  const reHead = new RegExp('^\\s*create\\s+(?:or\\s+replace\\s+)?(?:unique\\s+)?(?:(?:global|local)\\s+)?(?:(?:temp|temporary|unlogged|recursive)\\s+)*(table|materialized\\s+view|view|function|procedure|trigger|index|type|domain|schema|extension|sequence|aggregate|policy|role)\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?' + NAME, 'i');
  for (const [a, b] of stmts) {
    const seg = m.slice(a, b), raw = text.slice(a, b); const lead = seg.search(/\S/); if (lead < 0) continue; const sStart = a + lead;
    const hm = reHead.exec(seg);
    if (!hm) {
      const am = /^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?("(?:[^"]|"")+"|[\w$]+)(?:\s*\.\s*("(?:[^"]|"")+"|[\w$]+))?/i.exec(seg);
      if (am) { const tname = sqlKey(am[2] || am[1]); const re = /\breferences\s+("(?:[^"]|"")+"|[\w$]+)(?:\s*\.\s*("(?:[^"]|"")+"|[\w$]+))?/gi; let r; while ((r = re.exec(seg))) ctx.rawRefs.push({ file: f.id, fromName: tname, toName: sqlKey(r[2] || r[1]), type: 'sql', label: 'foreign key (ALTER TABLE)', line: lineOf(a + r.index) }); continue; }
      const cm = /^\s*comment\s+on\s+(table|view|function|column|materialized\s+view)\s+([\w."$]+(?:\([^)]*\))?)\s+is\s+'((?:[^']|'')*)'/is.exec(raw);
      if (cm) { ctx.sqlComments.push({ kind: cm[1].toLowerCase(), name: sqlKey(cm[2].split('.').slice(-1)[0].replace(/\(.*$/, '')), text: cm[3].replace(/''/g, "'") }); continue; }
      if (/^\s*(insert|update|delete|select|with|copy|truncate|merge)\b/i.test(seg)) { for (const r of sqlRefs(seg)) ctx.rawRefs.push({ file: f.id, fromFile: f.id, toName: r.name, type: 'sql', label: r.mode + ' (' + seg.trim().split(/\s+/)[0].toUpperCase() + ')', line: lineOf(a + r.pos) }); }
      continue;
    }
    const kind0 = hm[1].toLowerCase().replace(/\s+/g, ' '); const name = unq(hm[3] || hm[2]); const schema = hm[3] ? unq(hm[2]) : null;
    if (!name) continue;
    const key = name.toLowerCase();
    const doc = docAbove(lines, lineOf(sStart) - 1, 'sql');
    const afterName = hm[0].length;
    if (kind0 === 'index') { const im = /\bon\s+(?:only\s+)?("(?:[^"]|"")+"|[\w$]+)(?:\s*\.\s*("(?:[^"]|"")+"|[\w$]+))?\s*(?:using\s+\w+\s*)?\(([^)]*)\)/i.exec(seg); if (im) ctx.sqlIndexes.push({ table: sqlKey(im[2] || im[1]), text: name + ' (' + im[3].replace(/\s+/g, ' ').trim() + ')' + (/\bunique\b/i.test(seg.slice(0, 40)) ? ' UNIQUE' : '') }); continue; }
    if (['schema', 'extension', 'sequence', 'role', 'policy', 'aggregate'].includes(kind0)) { misc.push(kind0 + ' ' + name); continue; }
    const base = { startPos: sStart, endPos: b, sigStart: sStart, sigEnd: Math.min(b, sStart + 300), nameStart: null, exported: true, schema };
    if (kind0 === 'table') {
      const po = seg.indexOf('(', afterName); let cols = [], pk = new Set();
      const s = ctx.newSym(f, Object.assign({}, base, { name, kind: 'table' })); s.doc = doc; s.complexity = 1; syms.push(s); ctx.registerSql(key, s);
      if (po >= 0 && !/^\s*(as|partition\s+of)\b/i.test(seg.slice(afterName, po))) {
        const pc = matchClose(seg, po, '(', ')'); const inner = raw.slice(po + 1, pc);
        for (const part of splitTop(inner, ',')) {
          const cons = /^(?:constraint\s+("[^"]+"|\w+)\s+)?(primary\s+key|foreign\s+key|unique|check|exclude)\b/i.exec(part);
          if (cons) {
            const t = cons[2].toLowerCase().replace(/\s+/g, ' ');
            if (t === 'primary key') { const pm = /\(([^)]*)\)/.exec(part); if (pm) pm[1].split(',').forEach(c => pk.add(unq(c.trim()))); }
            else if (t === 'foreign key') { const fm = /foreign\s+key\s*\(([^)]*)\)\s*references\s+("(?:[^"]|"")+"|[\w$]+)(?:\s*\.\s*("(?:[^"]|"")+"|[\w$]+))?\s*(?:\(([^)]*)\))?/i.exec(part); if (fm) { const to = sqlKey(fm[3] || fm[2]); ctx.rawRefs.push({ file: f.id, fromSym: s.id, toName: to, type: 'sql', label: 'FK ' + fm[1].trim() + ' → ' + to + (fm[4] ? '(' + fm[4].trim() + ')' : ''), line: lineOf(a + po) }); s.fks = (s.fks || []).concat([fm[1].trim() + ' → ' + to]); } }
            continue;
          }
          const cm2 = /^("(?:[^"]|"")+"|[\w$]+)\s+([\s\S]+)$/.exec(part); if (!cm2) continue;
          const cname = unq(cm2[1]); const rest = cm2[2];
          const tm = /^([\s\S]*?)(?=\s+(?:not\s+null|null|default|primary\s+key|references|unique|check|generated|constraint|collate)\b|$)/i.exec(rest);
          const flags = []; if (/primary\s+key/i.test(rest)) { flags.push('PK'); pk.add(cname); } if (/not\s+null/i.test(rest)) flags.push('NOT NULL'); if (/\bunique\b/i.test(rest)) flags.push('UNIQUE');
          const dflt = /\bdefault\s+([\s\S]+?)(?=\s+(?:not\s+null|null|primary|references|unique|check|constraint|generated)\b|$)/i.exec(rest); if (dflt) flags.push('DEFAULT ' + dflt[1].trim().slice(0, 30));
          const rf = /\breferences\s+("(?:[^"]|"")+"|[\w$]+)(?:\s*\.\s*("(?:[^"]|"")+"|[\w$]+))?\s*(?:\(\s*([^)]*)\s*\))?/i.exec(rest);
          if (rf) { const to = sqlKey(rf[2] || rf[1]); flags.push('FK → ' + to + (rf[3] ? '.' + rf[3].trim() : '')); ctx.rawRefs.push({ file: f.id, fromSym: s.id, toName: to, type: 'sql', label: 'FK ' + cname + ' → ' + to, line: lineOf(a + po) }); }
          cols.push([cname, (tm ? tm[1] : rest).trim().replace(/\s+/g, ' ').slice(0, 40), flags]);
        }
        cols.forEach(c => { if (pk.has(c[0]) && !c[2].includes('PK')) c[2].unshift('PK'); });
        s.columns = cols; s.extra.push({ label: 'Columns', head: ['Column', 'Type', 'Constraints'], rows: cols.map(c => [c[0], c[1], c[2].join(', ')]) });
      }
      for (const r of seg.matchAll(/\b(?:inherits\s*\(|partition\s+of\s+)\s*("(?:[^"]|"")+"|[\w$]+)/gi)) ctx.rawRefs.push({ file: f.id, fromSym: s.id, toName: sqlKey(r[1]), type: 'extends', label: 'inherits / partition of', line: lineOf(a) });
      continue;
    }
    if (kind0 === 'view' || kind0 === 'materialized view') {
      const s = ctx.newSym(f, Object.assign({}, base, { name, kind: 'view', materialized: kind0 !== 'view' })); s.doc = doc; syms.push(s); ctx.registerSql(key, s);
      const am = /\bas\b/i.exec(seg.slice(afterName)); const body = am ? seg.slice(afterName + am.index + 2) : seg;
      for (const r of sqlRefs(body)) if (r.name !== key) s.rawRefs.push({ name: r.name, mode: r.mode, line: lineOf(a + afterName + (am ? am.index + 2 : 0) + r.pos) });
      s.complexity = 1 + (body.match(/\b(join|union|where|group\s+by|having)\b/gi) || []).length; continue;
    }
    if (kind0 === 'function' || kind0 === 'procedure') {
      const po = seg.indexOf('(', afterName); const pc = po < 0 ? -1 : matchClose(seg, po, '(', ')');
      const params = pc > 0 ? splitTop(raw.slice(po + 1, pc), ',') : [];
      const tail = pc > 0 ? raw.slice(pc + 1, pc + 500) : '';
      const rm = /^\s*returns\s+((?:setof\s+)?(?:table\s*\([^)]*\)|[\w.\[\]"]+(?:\s*\([^)]*\))?))/i.exec(tail); const lm = /\blanguage\s+(\w+)/i.exec(raw);
      const s = ctx.newSym(f, Object.assign({}, base, { name, kind: 'sqlfunction', params, returns: rm ? rm[1].replace(/\s+/g, ' ') : null, lang: lm ? lm[1] : null, isProcedure: kind0 === 'procedure' })); s.doc = doc; syms.push(s); ctx.registerSql(key, s);
      const dq = /\$([A-Za-z_]\w*)?\$/.exec(seg.slice(pc > 0 ? pc : 0)); let body = '', bodyOff = 0;
      if (dq) { const o = (pc > 0 ? pc : 0) + dq.index + dq[0].length; const e = seg.indexOf(dq[0], o); body = seg.slice(o, e < 0 ? seg.length : e); bodyOff = o; }
      else { const sq = /\bas\s+'([\s\S]*)'/i.exec(raw); if (sq) { body = maskSql(sq[1].replace(/''/g, "'"), false); } }
      for (const r of sqlRefs(body)) s.rawRefs.push({ name: r.name, mode: r.mode, line: lineOf(a + bodyOff + r.pos) });
      for (const c of body.matchAll(/(?:^|[^\w$.])([A-Za-z_][\w$]*)\s*\(/g)) s.rawCalls.push({ name: c[1].toLowerCase(), recv: null, type: 'call', line: lineOf(a + bodyOff + c.index), sql: true });
      s.complexity = 1 + (body.match(/\b(if|elsif|case|loop|while|for|exception)\b/gi) || []).length; continue;
    }
    if (kind0 === 'trigger') {
      const s = ctx.newSym(f, Object.assign({}, base, { name, kind: 'trigger' })); s.doc = doc; syms.push(s); ctx.registerSql(key, s);
      const tm = /\bon\s+("(?:[^"]|"")+"|[\w$]+)(?:\s*\.\s*("(?:[^"]|"")+"|[\w$]+))?/i.exec(seg); if (tm) s.rawRefs.push({ name: sqlKey(tm[2] || tm[1]), mode: 'on', line: lineOf(a) });
      const ev = /\b(before|after|instead\s+of)\s+((?:insert|update|delete|truncate)(?:\s+of\s+[\w,\s]+?)?(?:\s+or\s+(?:insert|update|delete|truncate))*)/i.exec(seg); if (ev) s.extra.push({ label: 'Fires', items: [(ev[1] + ' ' + ev[2]).replace(/\s+/g, ' ').toUpperCase()] });
      const ex = /execute\s+(?:function|procedure)\s+("(?:[^"]|"")+"|[\w$]+)(?:\s*\.\s*("(?:[^"]|"")+"|[\w$]+))?/i.exec(seg); if (ex) s.rawCalls.push({ name: sqlKey(ex[2] || ex[1]), recv: null, type: 'call', line: lineOf(a), sql: true, label: 'executes' });
      continue;
    }
    if (kind0 === 'type' || kind0 === 'domain') {
      const s = ctx.newSym(f, Object.assign({}, base, { name, kind: 'sqltype' })); s.doc = doc; syms.push(s); ctx.registerSql(key, s);
      const em = /\bas\s+enum\s*\(([^)]*)\)/i.exec(raw); if (em) s.extra.push({ label: 'Enum values', items: [...em[1].matchAll(/'([^']*)'/g)].map(x => x[1]) });
      continue;
    }
  }
  f.sqlMisc = misc; f.exports = syms.map(s => s.name); f.env = [];
  return syms;
}

/* ===== Dockerfile ===== */
function parseDockerfile(f, ctx) {
  const lines = f.lineArr, starts = f.lineStarts, text = f.text;
  const ins = []; let i = 0;
  while (i < lines.length) {
    let l = lines[i]; const sl = i;
    if (/^\s*(#|$)/.test(l)) { i++; continue; }
    while (/\\\s*$/.test(l) && i + 1 < lines.length) { i++; l = l.replace(/\\\s*$/, ' ') + lines[i].replace(/^\s*#.*$/, ''); }
    const mm = /^\s*([A-Za-z]+)\s*(.*)$/.exec(l); if (mm) ins.push({ line: sl + 1, op: mm[1].toUpperCase(), args: mm[2].trim() });
    i++;
  }
  const stages = [];
  ins.forEach((x, idx) => { if (x.op === 'FROM') { const fm = /^(?:--platform=\S+\s+)?(\S+)(?:\s+as\s+(\S+))?/i.exec(x.args); if (fm) stages.push({ idx: stages.length, image: fm[1], alias: fm[2] || null, line: x.line, ins: [] }); } else if (stages.length) stages[stages.length - 1].ins.push(x); });
  stages.forEach((st, k) => { st.endLine = k + 1 < stages.length ? stages[k + 1].line - 1 : lines.length; while (st.endLine > st.line && !lines[st.endLine - 1].trim()) st.endLine--; });
  const syms = [];
  for (const st of stages) {
    const name = st.alias || ('stage-' + st.idx);
    const s = ctx.newSym(f, { name, kind: 'stage', startPos: starts[st.line - 1], endPos: starts[st.endLine] != null ? starts[st.endLine] : text.length, sigStart: starts[st.line - 1], sigEnd: starts[st.line - 1] + lines[st.line - 1].length, exported: true, params: [], image: st.image });
    s.signature = lines[st.line - 1].trim(); s.doc = docAbove(lines, st.line - 1, 'hash'); s.complexity = st.ins.length; st.sym = s; syms.push(s);
    const ports = [], envs = [], copies = [], cmds = []; let workdir = '';
    const isStage = nm => stages.find(x => x.alias === nm || String(x.idx) === nm);
    const prev = isStage(st.image);
    if (prev && prev !== st) ctx.addRel(s.id, prev.sym.id, 'depends', 'FROM ' + st.image, st.line);
    else if (st.image.toLowerCase() !== 'scratch' && !st.image.startsWith('$')) ctx.addRel(s.id, ctx.ext(st.image, 'image'), 'depends', 'base image', st.line);
    for (const x of st.ins) {
      if (x.op === 'WORKDIR') workdir = x.args;
      else if (x.op === 'EXPOSE') ports.push(...x.args.split(/\s+/));
      else if (x.op === 'ENV' || x.op === 'ARG') envs.push(x.args.split(/[\s=]/)[0]);
      else if (x.op === 'USER') s.extra.push({ label: 'Runs as user', items: [x.args] });
      else if (x.op === 'HEALTHCHECK') s.extra.push({ label: 'Health check', items: [x.args.slice(0, 120)] });
      else if (x.op === 'COPY' || x.op === 'ADD') {
        let a = x.args; let from = null; a = a.replace(/--from=(\S+)/, (_, v) => { from = v; return ''; }).replace(/--\w[\w-]*(=\S+)?/g, '').trim();
        let parts; if (a.startsWith('[')) { try { parts = JSON.parse(a); } catch (e) { parts = a.split(/\s+/); } } else parts = a.split(/\s+/);
        const dest = parts.pop(); const srcs = parts;
        if (from) { const ps = isStage(from); if (ps) ctx.addRel(s.id, ps.sym.id, 'copy', 'COPY --from=' + from + ' ' + srcs.join(' '), x.line); else ctx.addRel(s.id, ctx.ext(from, 'image'), 'copy', 'COPY --from=' + from, x.line); copies.push(srcs.join(' ') + ' ← ' + from + ' → ' + dest); }
        else for (const src of srcs) {
          if (/^https?:/.test(src)) continue; copies.push(src + ' → ' + dest);
          if (src === '.' || src === './' || /[*?]/.test(src) || src.endsWith('/')) continue;
          const t = ctx.resolveLoose(src, f, [workdir]); if (t && t.path) ctx.addRel(s.id, t.id, 'copy', x.op + ' ' + src + ' → ' + dest, x.line);
        }
      } else if (x.op === 'RUN' || x.op === 'CMD' || x.op === 'ENTRYPOINT') {
        let a = x.args; if (a.startsWith('[')) { try { a = JSON.parse(a).join(' '); } catch (e) { } }
        if (x.op !== 'RUN') cmds.push(x.op + ' ' + a.slice(0, 140));
        const re = /(?:^|[\s"'=(])((?:\.{0,2}\/)?[\w.${}\-\/]+\.(?:sh|bash|py|js|mjs|cjs|ts|sql|rs)|(?:\.{0,2}\/)?[\w.${}\/-]*[Dd]ockerfile[\w.-]*)(?=$|[\s"';&|)])/g; let r; const seen = new Set();
        while ((r = re.exec(a))) { const t = ctx.resolveLoose(r[1], f, [workdir]); if (t && t.path && !seen.has(t.id)) { seen.add(t.id); ctx.addRel(s.id, t.id, 'run', x.op + ' ' + r[1], x.line); } }
      }
    }
    if (ports.length) s.extra.push({ label: 'Exposed ports', items: ports });
    if (workdir) s.extra.push({ label: 'Working directory', items: [workdir] });
    if (cmds.length) s.extra.push({ label: 'Start command', items: cmds });
    if (copies.length) s.extra.push({ label: 'Copies', items: copies.slice(0, 30) });
    if (envs.length) s.extra.push({ label: 'ENV / ARG', items: uniq(envs).slice(0, 30) });
  }
  f.stages = stages.map(s => ({ name: s.sym.name, image: s.image }));
  f.exports = syms.map(s => s.name); f.env = [];
  return syms;
}

/* ===== docker-compose ===== */
function parseCompose(f, ctx) {
  const y = parseYaml(f.text), syms = [], lines = f.lineArr, starts = f.lineStarts, text = f.text;
  const svcs = y && y.services && typeof y.services === 'object' ? y.services : {};
  const names = Object.keys(svcs);
  let sl = lines.findIndex(l => /^services\s*:/.test(l)); const pos = {};
  if (sl >= 0) { let ci = -1; for (let i = sl + 1; i < lines.length; i++) { const l = lines[i]; if (!l.trim() || /^\s*#/.test(l)) continue; const ind = l.length - l.trimStart().length; if (ci < 0) ci = ind; if (ind < ci) break; const km = /^\s*["']?([\w.-]+)["']?\s*:/.exec(l); if (ind === ci && km && names.includes(km[1])) pos[km[1]] = i; } }
  const order = names.filter(n => pos[n] != null).sort((a, b) => pos[a] - pos[b]);
  const asList = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v) : (v ? [v] : []));
  const byName = {};
  for (const nm of names) {
    const sv = svcs[nm] || {}; const li0 = pos[nm] != null ? pos[nm] : 0; const k = order.indexOf(nm);
    let endLine = k >= 0 && k + 1 < order.length ? pos[order[k + 1]] : lines.length; while (endLine > li0 + 1 && !lines[endLine - 1].trim()) endLine--;
    const s = ctx.newSym(f, { name: nm, kind: 'service', startPos: starts[li0], endPos: starts[endLine] != null ? starts[endLine] : text.length, sigStart: starts[li0], sigEnd: starts[li0] + (lines[li0] || '').length, exported: true, params: [] });
    s.signature = sv.image ? 'image: ' + sv.image : (sv.build ? 'build: ' + (typeof sv.build === 'string' ? sv.build : (sv.build && sv.build.context) || '.') : nm);
    s.doc = docAbove(lines, li0, 'hash'); s.complexity = Object.keys(sv).length; syms.push(s); byName[nm] = s;
    const ex = (label, items) => { items = items.filter(Boolean).map(String); if (items.length) s.extra.push({ label, items: items.slice(0, 40) }); };
    ex('Image', sv.image ? [sv.image] : []); ex('Ports', asList(sv.ports).map(p => typeof p === 'object' ? (p.published || '') + ':' + (p.target || '') : p));
    ex('Environment', asList(sv.environment).map(e => typeof e === 'string' ? e.split('=')[0] : e)); ex('Env files', asList(sv.env_file));
    ex('Volumes', asList(sv.volumes).map(v => typeof v === 'object' ? (v.source || '') + ' → ' + (v.target || '') : v)); ex('Command', sv.command ? [Array.isArray(sv.command) ? sv.command.join(' ') : String(sv.command)] : []);
    ex('Restart policy', sv.restart ? [sv.restart] : []); ex('Networks', asList(sv.networks)); ex('Profiles', asList(sv.profiles)); if (sv.healthcheck) ex('Health check', [Array.isArray(sv.healthcheck.test) ? sv.healthcheck.test.join(' ') : String(sv.healthcheck.test || '')]);
    for (const d of asList(sv.depends_on)) ctx.rawRefs.push({ file: f.id, fromSym: s.id, toSvc: [f.id, d], type: 'depends', label: 'depends_on', line: li0 + 1 });
    for (const d of asList(sv.links)) ctx.rawRefs.push({ file: f.id, fromSym: s.id, toSvc: [f.id, String(d).split(':')[0]], type: 'depends', label: 'links', line: li0 + 1 });
    if (typeof sv.network_mode === 'string' && sv.network_mode.startsWith('service:')) ctx.rawRefs.push({ file: f.id, fromSym: s.id, toSvc: [f.id, sv.network_mode.slice(8)], type: 'depends', label: 'network_mode', line: li0 + 1 });
    if (sv.build) {
      const b = typeof sv.build === 'string' ? { context: sv.build } : sv.build; const dfn = b.dockerfile || 'Dockerfile'; const cdir = joinPath(f.dir, b.context || '.');
      const cand = joinPath(cdir, dfn); const t = ctx.fileByPath.get(cand) || ctx.fileByPath.get(joinPath(f.dir, dfn));
      if (t) ctx.rawRefs.push({ file: f.id, fromSym: s.id, toFile: t.id, toStage: b.target || null, type: 'depends', label: 'build', line: li0 + 1 }); else ex('Build', [cand + ' (not in scanned folder)']);
      if (b.target) ex('Build target', [b.target]);
    }
    if (sv.image) ctx.addRel(s.id, ctx.ext(String(sv.image), 'image'), 'depends', 'image', li0 + 1);
    for (const v of asList(sv.volumes)) {
      const src = typeof v === 'object' ? v.source : String(v).split(':')[0]; if (!src || !/^[./~]/.test(src)) continue;
      const t = ctx.resolveLoose(src, f); if (t && t.path) ctx.addRel(s.id, t.id, 'copy', 'mounts ' + src, li0 + 1);
    }
    const cmd = Array.isArray(sv.command) ? sv.command.join(' ') : String(sv.command || ''); const ent = Array.isArray(sv.entrypoint) ? sv.entrypoint.join(' ') : String(sv.entrypoint || '');
    const re = /(?:^|[\s"'=(])((?:\.{0,2}\/)?[\w.${}\-\/]+\.(?:sh|bash|py|js|mjs|ts|sql|rs))(?=$|[\s"';&|)])/g; let r;
    while ((r = re.exec(cmd + ' ' + ent))) { const t = ctx.resolveLoose(r[1], f); if (t && t.path) ctx.addRel(s.id, t.id, 'run', 'command ' + r[1], li0 + 1); }
  }
  f.services = names; f.exports = names;
  const top = []; for (const k of ['volumes', 'networks', 'secrets', 'configs']) if (y && y[k] && typeof y[k] === 'object') top.push(k + ': ' + Object.keys(y[k]).join(', '));
  f.composeTop = top; f.env = [];
  return syms;
}

/* ===== package.json / Cargo.toml / tsconfig ===== */
function loadJsonc(text) {
  try { return JSON.parse(maskJS(text, true).replace(/,(\s*[}\]])/g, '$1')); } catch (e) { return null; }
}
function globToRe(g) { return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replace(/§§/g, '.*') + '$'); }

function parsePackage(f, ctx) {
  const pkg = loadJsonc(f.text) || {}; f.pkg = pkg; const syms = [];
  const ex = (label, items) => { items = items.filter(Boolean).map(String); if (items.length) f.extra.push({ label, items: items.slice(0, 60) }); };
  ex('Package', [pkg.name && (pkg.name + (pkg.version ? ' @ ' + pkg.version : ''))]); ex('Description', [pkg.description]); ex('Module type', [pkg.type]);
  const deps = pkg.dependencies || {}, dev = pkg.devDependencies || {}, peer = pkg.peerDependencies || {};
  ex('Dependencies', Object.keys(deps).map(k => k + ' ' + deps[k])); ex('Dev dependencies', Object.keys(dev).map(k => k + ' ' + dev[k])); ex('Peer dependencies', Object.keys(peer));
  for (const [nm, ver] of Object.entries(Object.assign({}, deps, dev, peer))) {
    const ws = ctx.pkgNames.get(nm);
    if (ws && ws.file && ws.file !== f.id) ctx.addRel(f.id, ws.file, 'import', 'workspace dependency ' + nm, 0);
    else if (/^(file|link):/.test(String(ver))) { const t = ctx.fileByPath.get(joinPath(f.dir, String(ver).replace(/^(file|link):/, '')) + '/package.json'); if (t) ctx.addRel(f.id, t.id, 'import', 'local dependency ' + nm, 0); }
    else ctx.addRel(f.id, ctx.ext(nm, 'package'), 'import', (deps[nm] ? 'dependency ' : 'dev dependency ') + nm, 0);
    ctx.projectTags.add(nm);
  }
  const entries = [pkg.main, pkg.module, typeof pkg.bin === 'string' ? pkg.bin : null, ...(pkg.bin && typeof pkg.bin === 'object' ? Object.values(pkg.bin) : [])].filter(Boolean);
  for (const e of entries) { const t = ctx.fileByPath.get(joinPath(f.dir, e)) || tryJSFile(ctx, joinPath(f.dir, e)); if (t) ctx.addRel(f.id, t.id, 'import', 'entry point', 0); }
  if (pkg.workspaces) { const pats = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces.packages || []); for (const p of pats) { const re = globToRe(joinPath(f.dir, p) + '/package.json'); for (const [path, t] of ctx.fileByPath) if (re.test(path) && t.id !== f.id) ctx.addRel(f.id, t.id, 'import', 'workspace member', 0); } }
  const scripts = pkg.scripts || {}; const sp = f.text.indexOf('"scripts"');
  for (const [nm, cmd] of Object.entries(scripts)) {
    const at = sp >= 0 ? f.text.indexOf('"' + nm + '"', sp) : 0; const li = f.lineOf(Math.max(0, at));
    const s = ctx.newSym(f, { name: nm, kind: 'script', startPos: f.lineStarts[li - 1], endPos: f.lineStarts[li] != null ? f.lineStarts[li] : f.text.length, sigStart: f.lineStarts[li - 1], sigEnd: f.lineStarts[li] != null ? f.lineStarts[li] : f.text.length, exported: true, params: [] });
    s.signature = 'npm run ' + nm + '  →  ' + String(cmd); s.doc = ''; s.complexity = 1; syms.push(s);
    const re = /(?:^|[\s"'=(])((?:\.{0,2}\/)?[\w.${}\-\/]+\.(?:sh|bash|py|js|mjs|cjs|ts|sql|rs))(?=$|[\s"';&|)])/g; let r; const seen = new Set();
    while ((r = re.exec(String(cmd)))) { const t = ctx.resolveLoose(r[1], f); if (t && t.path && !seen.has(t.id)) { seen.add(t.id); ctx.addRel(s.id, t.id, 'run', 'npm run ' + nm, li); } }
    for (const sub of String(cmd).matchAll(/\bnpm run ([\w:-]+)/g)) ctx.rawRefs.push({ file: f.id, fromSym: s.id, toSymName: [f.id, sub[1]], type: 'call', label: 'npm run ' + sub[1], line: li });
  }
  f.exports = []; f.env = [];
  return syms;
}

function parseCargo(f, ctx) {
  const t = parseToml(f.text); f.cargo = t; const syms = [];
  const ex = (label, items) => { items = items.filter(Boolean).map(String); if (items.length) f.extra.push({ label, items: items.slice(0, 60) }); };
  const pk = t.package || {}; ex('Crate', [pk.name && (pk.name + (pk.version ? ' @ ' + pk.version : ''))]); ex('Description', [pk.description]); ex('Edition', [pk.edition]);
  for (const sect of ['dependencies', 'dev-dependencies', 'build-dependencies']) {
    const d = t[sect] || {}; ex(sect === 'dependencies' ? 'Dependencies' : sect === 'dev-dependencies' ? 'Dev dependencies' : 'Build dependencies', Object.keys(d).map(k => k + (typeof d[k] === 'string' ? ' ' + d[k] : (d[k] && d[k].version ? ' ' + d[k].version : (d[k] && d[k].path ? ' (path ' + d[k].path + ')' : '')))));
    for (const [nm, v] of Object.entries(d)) {
      if (v && typeof v === 'object' && v.path) { const tt = ctx.fileByPath.get(joinPath(f.dir, v.path) + '/Cargo.toml'); if (tt) { ctx.addRel(f.id, tt.id, 'import', 'path dependency ' + nm, 0); continue; } }
      const cr = ctx.crates.get(nm.replace(/-/g, '_')); if (cr && cr.file && cr.file !== f.id) ctx.addRel(f.id, cr.file, 'import', 'workspace crate ' + nm, 0); else ctx.addRel(f.id, ctx.ext(nm, 'crate'), 'import', 'dependency ' + nm, 0);
    }
  }
  const members = (t.workspace && t.workspace.members) || [];
  for (const p of members) { const re = globToRe(joinPath(f.dir, p) + '/Cargo.toml'); for (const [path, tt] of ctx.fileByPath) if (re.test(path) && tt.id !== f.id) ctx.addRel(f.id, tt.id, 'import', 'workspace member', 0); }
  for (const rel of ['src/main.rs', 'src/lib.rs']) { const tt = ctx.fileByPath.get(joinPath(f.dir, rel)); if (tt) ctx.addRel(f.id, tt.id, 'import', rel === 'src/main.rs' ? 'binary entry' : 'library root', 0); }
  for (const b of (t.bin || [])) { if (b.path) { const tt = ctx.fileByPath.get(joinPath(f.dir, b.path)); if (tt) ctx.addRel(f.id, tt.id, 'import', 'bin ' + (b.name || ''), 0); } }
  f.exports = []; f.env = [];
  return syms;
}
// minimal TOML: [sections], [[arrays]], key = "str" | number | [..] | { inline }
function parseToml(text) {
  const root = {}; let cur = root; const lines = text.replace(/\r/g, '').split('\n');
  const val = v => {
    v = v.trim();
    if (v.startsWith('"') || v.startsWith("'")) return v.replace(/^["']|["']\s*(#.*)?$/g, '');
    if (v.startsWith('[')) return splitTop(v.slice(1, v.lastIndexOf(']')), ',').map(val);
    if (v.startsWith('{')) { const o = {}; for (const kv of splitTop(v.slice(1, v.lastIndexOf('}')), ',')) { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i).trim()] = val(kv.slice(i + 1)); } return o; }
    return v.replace(/\s+#.*$/, '');
  };
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i].trim(); if (!l || l.startsWith('#')) continue;
    let sm = /^\[\[([^\]]+)\]\]$/.exec(l);
    if (sm) { const k = sm[1].trim(); (root[k] = root[k] || []).push(cur = {}); continue; }
    sm = /^\[([^\]]+)\]$/.exec(l);
    if (sm) { const parts = sm[1].split('.').map(x => x.trim().replace(/^"|"$/g, '')); cur = root; for (const p of parts) cur = cur[p] = cur[p] || {}; continue; }
    const eq = l.indexOf('='); if (eq < 0) continue; const key = l.slice(0, eq).trim().replace(/^"|"$/g, ''); let v = l.slice(eq + 1).trim();
    if (v.startsWith('[') && !v.includes(']')) { while (i + 1 < lines.length && !v.includes(']')) v += ' ' + lines[++i].trim(); }
    if (v.startsWith('{') && !v.includes('}')) { while (i + 1 < lines.length && !v.includes('}')) v += ' ' + lines[++i].trim(); }
    if (key.includes('.')) { const [a, ...b] = key.split('.'); const o = cur[a] = cur[a] || {}; o[b.join('.')] = val(v); } else cur[key] = val(v);
  }
  return root;
}

function parseTsconfig(f, ctx) {
  const t = loadJsonc(f.text) || {}; f.tsconfig = t; const co = t.compilerOptions || {};
  const ex = (label, items) => { items = items.filter(Boolean).map(String); if (items.length) f.extra.push({ label, items }); };
  ex('Target / module', [co.target && 'target: ' + co.target, co.module && 'module: ' + co.module, co.jsx && 'jsx: ' + co.jsx, co.strict != null && 'strict: ' + co.strict]);
  ex('Path aliases', Object.entries(co.paths || {}).map(([k, v]) => k + ' → ' + [].concat(v).join(', ')));
  if (typeof t.extends === 'string') { let p = joinPath(f.dir, t.extends); if (!/\.json$/.test(p)) p += '.json'; const tt = ctx.fileByPath.get(p); if (tt) ctx.addRel(f.id, tt.id, 'import', 'extends', 0); }
  for (const r of (t.references || [])) { let p = joinPath(f.dir, r.path); const tt = ctx.fileByPath.get(p) || ctx.fileByPath.get(p + '/tsconfig.json'); if (tt) ctx.addRel(f.id, tt.id, 'import', 'project reference', 0); }
  f.exports = []; f.env = [];
  return [];
}
