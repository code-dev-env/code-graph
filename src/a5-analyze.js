
/* ===== Orchestration: indexing, resolution, relationships, categories, summaries ===== */
const CALLABLE = new Set(['function', 'method', 'class', 'component', 'hook', 'sqlfunction']);
const GROUP_OF = { js: 'js', ts: 'js', vue: 'js', py: 'py', rs: 'rs', sh: 'sh', sql: 'sql', dockerfile: 'docker', compose: 'docker', package: 'cfg', cargo: 'cfg', tsconfig: 'cfg' };
const LANG_OF = { js: 'JavaScript', ts: 'TypeScript', vue: 'Vue', py: 'Python', rs: 'Rust', sql: 'PostgreSQL / SQL', sh: 'Bash', dockerfile: 'Dockerfile', compose: 'Docker Compose', package: 'package.json', cargo: 'Cargo.toml', tsconfig: 'tsconfig' };
const FRAMEWORKS = {
  react: 'React', 'react-dom': 'React', next: 'Next.js', preact: 'Preact', vue: 'Vue', 'vue-router': 'Vue Router', pinia: 'Pinia', vuex: 'Vuex', nuxt: 'Nuxt', express: 'Express', koa: 'Koa', fastify: 'Fastify', '@nestjs/core': 'NestJS', 'socket.io': 'Socket.IO', ws: 'WebSocket', axios: 'Axios', pg: 'PostgreSQL client', postgres: 'PostgreSQL client', prisma: 'Prisma', '@prisma/client': 'Prisma', typeorm: 'TypeORM', sequelize: 'Sequelize', knex: 'Knex', mongoose: 'MongoDB', redux: 'Redux', '@reduxjs/toolkit': 'Redux Toolkit', zustand: 'Zustand', 'react-router-dom': 'React Router', '@tanstack/react-query': 'React Query', vite: 'Vite', webpack: 'Webpack', jest: 'Jest', vitest: 'Vitest', mocha: 'Mocha', tailwindcss: 'Tailwind',
  flask: 'Flask', fastapi: 'FastAPI', django: 'Django', sqlalchemy: 'SQLAlchemy', psycopg2: 'PostgreSQL client', psycopg: 'PostgreSQL client', asyncpg: 'PostgreSQL client', pytest: 'pytest', pydantic: 'Pydantic', celery: 'Celery', numpy: 'NumPy', pandas: 'pandas', torch: 'PyTorch', tensorflow: 'TensorFlow', requests: 'requests', aiohttp: 'aiohttp', uvicorn: 'Uvicorn',
  actix_web: 'Actix Web', axum: 'Axum', rocket: 'Rocket', tokio: 'Tokio', serde: 'Serde', sqlx: 'SQLx', diesel: 'Diesel', clap: 'clap (CLI)', reqwest: 'reqwest', warp: 'Warp', tracing: 'tracing', anyhow: 'anyhow'
};
const VERBS = { get: 'Gets', fetch: 'Fetches', load: 'Loads', save: 'Saves', store: 'Stores', create: 'Creates', make: 'Creates', build: 'Builds', update: 'Updates', delete: 'Deletes', remove: 'Removes', add: 'Adds', set: 'Sets', is: 'Checks whether', has: 'Checks whether it has', can: 'Checks whether it can', should: 'Decides whether to', validate: 'Validates', verify: 'Verifies', parse: 'Parses', format: 'Formats', render: 'Renders', handle: 'Handles', on: 'Handles the', init: 'Initialises', initialize: 'Initialises', setup: 'Sets up', start: 'Starts', stop: 'Stops', run: 'Runs', execute: 'Executes', exec: 'Executes', send: 'Sends', read: 'Reads', write: 'Writes', open: 'Opens', close: 'Closes', connect: 'Connects to', disconnect: 'Disconnects from', find: 'Finds', search: 'Searches', filter: 'Filters', sort: 'Sorts', map: 'Maps', convert: 'Converts', to: 'Converts to', from: 'Builds from', check: 'Checks', calculate: 'Calculates', calc: 'Calculates', compute: 'Computes', register: 'Registers', login: 'Logs in', logout: 'Logs out', authenticate: 'Authenticates', authorize: 'Authorizes', process: 'Processes', generate: 'Generates', transform: 'Transforms', apply: 'Applies', reset: 'Resets', clear: 'Clears', toggle: 'Toggles', show: 'Shows', hide: 'Hides', print: 'Prints', log: 'Logs', test: 'Tests', ensure: 'Ensures', resolve: 'Resolves', merge: 'Merges', copy: 'Copies', install: 'Installs', deploy: 'Deploys', clean: 'Cleans up', download: 'Downloads', upload: 'Uploads', list: 'Lists', count: 'Counts', select: 'Selects', insert: 'Inserts', post: 'Posts', put: 'Puts', use: 'Provides', wrap: 'Wraps', new: 'Creates a new', emit: 'Emits', dispatch: 'Dispatches', subscribe: 'Subscribes to', notify: 'Notifies', sync: 'Synchronises', refresh: 'Refreshes', reload: 'Reloads', navigate: 'Navigates to', redirect: 'Redirects to', watch: 'Watches', wait: 'Waits for', retry: 'Retries', schedule: 'Schedules', serialize: 'Serialises', deserialize: 'Deserialises', encode: 'Encodes', decode: 'Decodes', encrypt: 'Encrypts', decrypt: 'Decrypts', hash: 'Hashes', sanitize: 'Sanitises', normalize: 'Normalises', extract: 'Extracts', collect: 'Collects', push: 'Pushes', pop: 'Pops', mount: 'Mounts', migrate: 'Migrates', seed: 'Seeds', drop: 'Drops', truncate: 'Truncates', cleanup: 'Cleans up', teardown: 'Tears down', do: 'Does' };
const splitWords = n => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_\-.:$]+/g, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean);
function describeName(name, kind) {
  if (/^(main|__main__)$/.test(name)) return 'Program entry point';
  if (name === 'constructor' || name === '__init__' || name === 'new') return 'Constructs / initialises the object';
  if (/^__\w+__$/.test(name)) return 'Special method ' + name;
  const w = splitWords(name.replace(/^test_?/i, m => m ? 'test ' : ''));
  if (!w.length) return '';
  if (w[0] === 'test' && /^test/i.test(name)) return 'Test: ' + (w.slice(1).join(' ') || 'checks behaviour');
  const v = VERBS[w[0]];
  if (v && w.length > 1) return v + ' ' + w.slice(1).join(' ');
  if (v) return w[0][0].toUpperCase() + w[0].slice(1) + ' operation';
  if (kind === 'class' || kind === 'struct') return 'Represents ' + w.join(' ');
  return 'Works with ' + w.join(' ');
}
const listText = (arr, n) => { n = n || 6; return arr.slice(0, n).join(', ') + (arr.length > n ? ' and ' + (arr.length - n) + ' more' : ''); };

async function analyze(input, opts) {
  opts = opts || {}; const progress = opts.onProgress || (() => { }); const tick = () => new Promise(r => setTimeout(r, 0));
  const ctx = { files: [], symbols: [], rels: [], externals: new Map(), routes: [], rawRefs: [], fileByPath: new Map(), byBase: new Map(), dirSet: new Set(), aliases: [], baseUrls: [], pkgNames: new Map(), crates: new Map(), pyIndex: new Map(), sqlObjects: new Map(), sqlComments: [], sqlIndexes: [], projectTags: new Set() };
  const skipped = [];
  ctx.newSym = (f, o) => {
    const s = Object.assign({ id: 's' + ctx.symbols.length, file: f.id, group: f.group, kind: 'function', name: '', exported: false, className: null, params: [], rawCalls: [], rawRefs: [], extra: [], doc: '', complexity: 1 }, o);
    s.line = f.lineOf(o.startPos); s.endLine = f.lineOf(Math.max(o.startPos, o.endPos - 1));
    if (o.sigStart != null) s.signature = clip(f.text.slice(o.sigStart, o.sigEnd).replace(/\s+/g, ' ').trim(), 240);
    ctx.symbols.push(s); f.symbols.push(s.id); return s;
  };
  ctx.addRel = (from, to, type, label, line) => { if (from && to && from !== to) ctx.rels.push({ from, to, type, label, line: line || 0 }); };
  ctx.ext = (name, kind) => { const id = 'x:' + kind + ':' + name; if (!ctx.externals.has(id)) ctx.externals.set(id, { id, name, kind }); return id; };
  ctx.registerSql = (key, sym) => { let a = ctx.sqlObjects.get(key); if (!a) ctx.sqlObjects.set(key, a = []); a.push(sym); };
  ctx.resolveLoose = (tok, f, extraBases) => {
    let t = String(tok).replace(/^["'=(]+|["',;)]+$/g, '').replace(/\$\{[^}]*\}\/?|\$[A-Za-z_]\w*\/?/g, '').replace(/^\.\//, '');
    if (!t || /[*?]/.test(t) || /^[a-z][\w+.-]*:\/\//i.test(t)) return null;
    const abs = t.startsWith('/'); const tt = t.replace(/^\/+/, ''); if (!tt) return null;
    const bases = [f.dir]; for (const b of (extraBases || [])) if (b) bases.push(b.replace(/^\/+/, '')); bases.push(''); let d = f.dir; while (d) { d = dirName(d); bases.push(d); }
    if (!abs) for (const b of bases) { const p = joinPath(b, tt); if (ctx.fileByPath.has(p)) return ctx.fileByPath.get(p); }
    const cands = ctx.byBase.get(baseName(tt));
    if (cands) { const suf = cands.filter(c => c.path === tt || c.path.endsWith('/' + tt)); if (suf.length === 1) return suf[0]; if (cands.length === 1 && !tt.includes('/')) return cands[0]; }
    for (const b of bases) { const p = joinPath(b, tt); if (ctx.dirSet.has(p)) return { dir: p }; }
    return null;
  };

  /* --- create file records --- */
  let n = 0;
  for (const inp of input) {
    const kind = kindOfFile(inp.path); if (!kind) continue;
    if (inp.text.length > 1500000) { skipped.push(inp.path + ' (too large)'); continue; }
    const text = inp.text.replace(/\r\n?/g, '\n'); const li = lineIndex(text);
    const f = { id: 'f' + (n++), path: inp.path, name: baseName(inp.path), dir: dirName(inp.path), kind, group: GROUP_OF[kind], lang: LANG_OF[kind], size: inp.size != null ? inp.size : text.length, text, lineArr: text.split('\n'), lineStarts: li.starts, lineOf: li.lineOf, lines: li.count, symbols: [], imports: [], reexports: [], exports: [], exportAlias: {}, extra: [], tags: [], localNames: new Map(), sources: [], topCalls: [], env: [] };
    ctx.files.push(f); ctx.fileByPath.set(f.path, f);
    (ctx.byBase.get(f.name) || ctx.byBase.set(f.name, []).get(f.name)).push(f);
  }
  const byId = new Map(ctx.files.map(f => [f.id, f]));
  for (const f of ctx.files) { let d = f.dir; while (d) { ctx.dirSet.add(d); d = dirName(d); } }
  for (const p of (opts.allPaths || [])) { let d = dirName(p); while (d) { ctx.dirSet.add(d); d = dirName(d); } }
  progress('Indexing project…', 0, ctx.files.length);

  /* --- phase 0: configuration that affects resolution --- */
  const pkgDirs = [];
  for (const f of ctx.files) {
    if (f.kind === 'tsconfig') {
      const t = loadJsonc(f.text) || {}; const co = t.compilerOptions || {}; const baseUrl = co.baseUrl ? joinPath(f.dir, co.baseUrl) : null;
      if (baseUrl != null) ctx.baseUrls.push(baseUrl);
      for (const [k, vals] of Object.entries(co.paths || {})) {
        const arr = [].concat(vals);
        if (k.endsWith('/*')) ctx.aliases.push({ prefix: k.slice(0, -1), exact: false, targets: arr.map(v => joinPath(baseUrl != null ? baseUrl : f.dir, v.replace(/\/\*$/, ''))) });
        else ctx.aliases.push({ prefix: k, exact: true, targets: arr.map(v => joinPath(baseUrl != null ? baseUrl : f.dir, v)) });
      }
    } else if (f.kind === 'package') {
      const p = loadJsonc(f.text) || {}; pkgDirs.push(f.dir);
      if (p.name) ctx.pkgNames.set(p.name, { dir: f.dir, main: p.module || p.main || null, file: f.id });
    } else if (f.kind === 'cargo') {
      const t = parseToml(f.text); const nm = t.package && t.package.name;
      if (nm) { const crate = { name: nm, dir: f.dir, srcRoot: joinPath(f.dir, 'src'), mods: new Map(), file: f.id }; ctx.crates.set(nm.replace(/-/g, '_'), crate); }
    }
  }
  for (const d of uniq(pkgDirs.concat(['']))) for (const pre of ['@/', '~/']) ctx.aliases.push({ prefix: pre, exact: false, targets: [joinPath(d, 'src'), d] });
  for (const f of ctx.files) {
    if (f.kind === 'py') {
      const p = f.path.replace(/\.pyi?$/, '').replace(/\/__init__$/, ''); const segs = p.split('/');
      for (let k = 0; k < segs.length; k++) { const key = segs.slice(k).join('.'); if (!key) continue; (ctx.pyIndex.get(key) || ctx.pyIndex.set(key, []).get(key)).push(f); }
    } else if (f.kind === 'rs') {
      let crate = null; for (const c of ctx.crates.values()) if (f.path.startsWith(c.srcRoot + '/') && (!crate || c.srcRoot.length > crate.srcRoot.length)) crate = c;
      if (!crate) { const m = /^(.*?\/?src)\//.exec(f.path); const root = m ? m[1] : f.dir; const key = '§' + root; crate = ctx.crates.get(key) || (ctx.crates.set(key, { name: root, dir: dirName(root), srcRoot: root, mods: new Map(), file: null }), ctx.crates.get(key)); }
      f.crate = crate; const rel = f.path.slice(crate.srcRoot.length + 1).replace(/\.rs$/, ''); let segs = rel.split('/');
      if (segs[0] === 'bin' && segs.length > 1) segs = ['§bin', ...segs.slice(1)];
      if (segs.length === 1 && (segs[0] === 'lib' || segs[0] === 'main')) segs = []; else if (segs[segs.length - 1] === 'mod') segs.pop();
      f.modPath = segs;
      const key = segs.join('::'); if (!crate.mods.has(key) || /lib\.rs$/.test(f.path)) crate.mods.set(key, f);
    }
  }

  /* --- phase 1: per-file parsing --- */
  let done = 0;
  for (const f of ctx.files) {
    const hl = { js: 'c', ts: 'c', vue: 'vue', py: 'py', rs: 'rs', sh: 'sh', sql: 'sql', dockerfile: 'dockerfile', compose: 'compose', cargo: 'toml' }[f.kind];
    f.header = hl ? headerComment(f.text, hl) : '';
    try {
      switch (f.kind) {
        case 'js': case 'ts': case 'vue': parseJS(f, ctx); break;
        case 'py': parsePy(f, ctx); break;
        case 'rs': parseRust(f, ctx); break;
        case 'sh': parseSh(f, ctx); break;
        case 'sql': parseSql(f, ctx); break;
        case 'dockerfile': parseDockerfile(f, ctx); break;
        case 'compose': parseCompose(f, ctx); break;
        case 'package': parsePackage(f, ctx); break;
        case 'cargo': parseCargo(f, ctx); break;
        case 'tsconfig': parseTsconfig(f, ctx); break;
      }
    } catch (e) { f.parseError = String(e && e.message || e); }
    if (++done % 25 === 0) { progress('Parsing files…', done, ctx.files.length); await tick(); }
  }
  progress('Linking symbols…', ctx.files.length, ctx.files.length); await tick();

  /* --- phase 2: indexes --- */
  const symById = new Map(ctx.symbols.map(s => [s.id, s]));
  const fileSyms = new Map(); const symsByName = new Map();
  for (const f of ctx.files) fileSyms.set(f.id, new Map());
  for (const s of ctx.symbols) {
    const fm = fileSyms.get(s.file); (fm.get(s.name) || fm.set(s.name, []).get(s.name)).push(s);
    (symsByName.get(s.name) || symsByName.set(s.name, []).get(s.name)).push(s);
  }
  const pickBest = arr => arr && (arr.find(s => !s.className && s.exported) || arr.find(s => !s.className) || arr[0]);
  function findInFile(fid, name, pred) { const a = fileSyms.get(fid).get(name); if (!a) return null; const b = pred ? a.filter(pred) : a; return pickBest(b) || null; }
  function findExport(fid, name, depth, pred) {
    depth = depth || 0; if (depth > 5) return null; const fl = byId.get(fid); if (!fl) return null;
    if (name === 'default' || name === '*default*') {
      if (fl.defaultName) { const r = findInFile(fid, fl.defaultName, pred); if (r) return r; }
      const cands = fl.symbols.map(id => symById.get(id)).filter(s => s.isDefault || s.vue); if (cands.length) return cands[0];
      const rx = fl.reexports.find(x => x.names && x.names.some(n => n.exported === 'default')); if (rx) return findExport(rx.target, 'default', depth + 1, pred);
      const exp = fl.symbols.map(id => symById.get(id)).filter(s => s.exported && CALLABLE.has(s.kind)); return exp.length === 1 ? exp[0] : null;
    }
    const target = fl.exportAlias[name] || name; const r = findInFile(fid, target, pred); if (r) return r;
    for (const rx of fl.reexports) {
      if (rx.names) { const nm = rx.names.find(n => n.exported === name); if (!nm) continue; const rr = findExport(rx.target, nm.imported, depth + 1, pred); if (rr) return rr; }
      else { const rr = findExport(rx.target, name, depth + 1, pred); if (rr) return rr; }
    }
    return null;
  }
  const moduleName = file => { const s = stemOf(file.path); return /^(mod|lib|main|index|__init__)$/.test(s) ? baseName(file.dir) : s; };
  const lastSeg = r => r.split(/\.|::/).pop(), firstSeg = r => r.split(/\.|::/)[0];

  function resolveCall(f, owner, c) {
    const grp = f.group, name = c.name, recv = c.recv && c.recv !== '?' ? c.recv : null, anon = c.recv === '?';
    if (grp === 'sql') { const a = (ctx.sqlObjects.get(name) || []).filter(s => s.kind === 'sqlfunction'); return a.find(s => s.file === f.id) || a[0] || null; }
    const render = c.type === 'render';
    const kindOk = render ? (s => s.kind === 'component' || s.kind === 'class') : (s => CALLABLE.has(s.kind));
    const pred = s => s.group === grp && kindOk(s);
    const own = fileSyms.get(f.id);
    if (!recv && !anon) {
      const loc = f.localNames.get(name);
      if (loc && loc.imp) { if (loc.imp.target) { const r = findExport(loc.imp.target, loc.imported === '*' ? name : loc.imported, 0, pred); if (r) return r; } else if (loc.imp.external) return null; }
      const a = (own.get(name) || []).filter(s => pred(s) && !s.className); if (a.length) return pickBest(a);
      for (const imp of f.imports) if (imp.target && (imp.kind === 'source' || imp.names.includes('*'))) { const r = findInFile(imp.target, name, pred) || findExport(imp.target, name, 0, pred); if (r && (imp.kind === 'source' || r.exported)) return r; }
      if (c.localOnly) return null;
      const g = (symsByName.get(name) || []).filter(s => pred(s) && !s.className);
      if (g.length === 1 && !COMMON.has(name) && name.length > 2 && !(grp === 'py' && PY_BUILTINS.has(name)) && !(grp === 'sh' && !c.cmd)) return g[0];
      return null;
    }
    if (recv) {
      const first = firstSeg(recv), last = lastSeg(recv);
      if (/^(this|self|Self|cls|super)$/.test(first) && (first === recv || first === 'super')) {
        let cls = owner && (owner.className || (owner.kind === 'class' ? owner.name : null)); if (cls === 'Self') cls = null;
        if (first === 'Self' && owner) cls = owner.className;
        if (cls) { const a = (symsByName.get(name) || []).filter(s => pred(s) && s.className === cls && s.file === f.id); if (a.length) return a[0]; const cs = (symsByName.get(cls) || []).find(s => s.kind === 'class' && s.superName); if (cs && cs.superName) { const b = (symsByName.get(name) || []).filter(s => pred(s) && s.className === cs.superName); if (b.length) return b[0]; } const gg = (symsByName.get(name) || []).filter(s => pred(s) && s.className === cls); if (gg.length) return gg[0]; }
        const a2 = (own.get(name) || []).filter(pred); if (a2.length) return a2[0];
      }
      const loc = f.localNames.get(first);
      if (loc && loc.imp) {
        if (loc.imp.target) {
          const clsName = loc.imported === 'default' ? (byId.get(loc.imp.target).defaultName || null) : (loc.imported === '*' ? null : loc.imported);
          if (clsName) { const a = (symsByName.get(name) || []).filter(s => pred(s) && s.className === clsName); if (a.length) return a[0]; }
          const r = findExport(loc.imp.target, name, 0, pred) || findInFile(loc.imp.target, name, pred); if (r) return r;
        } else if (loc.imp.external) return null;
      }
      const cands = (symsByName.get(name) || []).filter(pred);
      if (/^[A-Z]/.test(last)) { const a = cands.filter(s => s.className === last); if (a.length) return a.find(s => s.file === f.id) || a[0]; }
      if (grp === 'rs' || grp === 'py') { const a = cands.filter(s => !s.className && moduleName(byId.get(s.file)) === last); if (a.length) return a[0]; }
    }
    // receiver of unknown type: only link when unambiguous
    const cands = (symsByName.get(name) || []).filter(pred);
    if (COMMON.has(name) || name.length < 3) return null;
    const same = cands.filter(s => s.file === f.id); if (same.length === 1) return same[0];
    if (cands.length === 1) return cands[0];
    return null;
  }

  const routeMatch = (rp, up, rm, um) => {
    if (rm !== 'ALL' && rm !== 'USE' && !rm.split('|').includes(um)) return false;
    const rs = rp.split('/').filter(Boolean), us = up.split('/').filter(Boolean); const k = rs.length;
    if (!k || us.length < k) return false; let lit = 0;
    for (let i = 0; i < k; i++) { const r = rs[k - 1 - i], u = us[us.length - 1 - i]; const w = /^[:<{*]/.test(r); if (!w) lit++; if (!(w || u === ':p' || r === u)) return false; }
    return lit > 0;
  };

  /* --- phase 3: relationships --- */
  for (const f of ctx.files) for (const imp of f.imports) {
    if (imp.target) ctx.addRel(f.id, imp.target, 'import', imp.kind === 'reexport' ? 're-exports ' + imp.names.join(', ') : (imp.names.length ? imp.names.join(', ') : imp.spec), imp.line);
    else if (imp.external && !imp.builtin && f.kind !== 'package') ctx.addRel(f.id, ctx.ext(imp.external, f.group === 'rs' ? 'crate' : f.group === 'py' ? 'pypi' : 'package'), 'import', imp.names.length ? imp.names.join(', ') : imp.spec, imp.line);
  }
  const httpCalls = [];
  for (const f of ctx.files) {
    const lists = [{ owner: null, calls: f.topCalls }].concat(f.symbols.map(id => ({ owner: symById.get(id), calls: symById.get(id).rawCalls })));
    for (const L of lists) {
      const unresolved = new Set();
      for (const c of L.calls) {
        if (c.type === 'http') { httpCalls.push({ f, owner: L.owner, c }); continue; }
        const t = resolveCall(f, L.owner, c); const from = L.owner ? L.owner.id : f.id;
        if (t) { if (t.id === from) { if (L.owner) L.owner.recursive = true; continue; } ctx.addRel(from, t.id, c.type === 'render' ? 'render' : 'call', c.label ? (c.label + ': ' + c.name + '()') : (c.name + (c.type === 'render' ? ' (rendered)' : '()')), c.line); }
        else if (L.owner && !(!c.recv && (KEYWORDS.has(c.name) || c.cmd)) ) unresolved.add((c.recv && c.recv !== '?' ? c.recv.replace(/::/g, '.') + '.' : '') + c.name);
      }
      if (L.owner) L.owner.extCalls = [...unresolved].slice(0, 40);
    }
  }
  for (const h of httpCalls) {
    const best = ctx.routes.filter(r => routeMatch(r.path, h.c.name, r.method, h.c.method)).sort((a, b) => b.path.length - a.path.length)[0];
    if (best) ctx.addRel(h.owner ? h.owner.id : h.f.id, best.sym, 'call', 'HTTP ' + h.c.method + ' ' + h.c.name, h.c.line);
    else if (h.owner) (h.owner.httpOut = h.owner.httpOut || []).push(h.c.method + ' ' + h.c.name);
  }
  // inheritance
  const typeKinds = new Set(['class', 'interface', 'struct', 'trait', 'component', 'enum']);
  const findType = (f, name) => {
    name = name.replace(/<.*$/, '').split('.').pop(); const loc = f.localNames.get(name);
    if (loc && loc.imp && loc.imp.target) { const r = findExport(loc.imp.target, loc.imported === 'default' ? 'default' : loc.imported, 0, s => typeKinds.has(s.kind)); if (r) return r; }
    const a = (fileSyms.get(f.id).get(name) || []).filter(s => typeKinds.has(s.kind)); if (a.length) return a[0];
    const g = (symsByName.get(name) || []).filter(s => typeKinds.has(s.kind) && s.group === f.group); return g.length === 1 ? g[0] : null;
  };
  for (const s of ctx.symbols) {
    const f = byId.get(s.file);
    if (s.superName) { const t = findType(f, s.superName); if (t && t.id !== s.id) ctx.addRel(s.id, t.id, 'extends', 'extends ' + s.superName, s.line); }
    for (const nm of (s.implementsList || [])) { const t = findType(f, nm); if (t && t.id !== s.id) ctx.addRel(s.id, t.id, 'extends', 'implements ' + nm, s.line); }
  }
  // type usage (TypeScript / Rust)
  { const typeSyms = ctx.symbols.filter(s => ['interface', 'type', 'enum', 'struct', 'trait'].includes(s.kind));
    const byTypeName = new Map(); for (const t of typeSyms) (byTypeName.get(t.name) || byTypeName.set(t.name, []).get(t.name)).push(t);
    if (byTypeName.size) for (const s of ctx.symbols) {
      if (!CALLABLE.has(s.kind) && s.kind !== 'route') continue; const f = byId.get(s.file); if (f.group !== 'js' && f.group !== 'rs') continue;
      const body = f.text.slice(s.startPos, Math.min(s.endPos, s.startPos + 6000)); const seen = new Set();
      for (const mt of body.matchAll(/[:<(,|&]\s*&?(?:mut\s+)?([A-Z][A-Za-z0-9_]*)\b|->\s*&?([A-Z][A-Za-z0-9_]*)\b|\bas\s+([A-Z]\w*)\b/g)) {
        const nm = mt[1] || mt[2] || mt[3]; if (seen.has(nm) || nm === s.name) continue; const cands = byTypeName.get(nm); if (!cands) continue;
        const loc = f.localNames.get(nm); let t = null;
        if (loc && loc.imp && loc.imp.target) t = findExport(loc.imp.target, loc.imported, 0, x => cands.includes(x));
        if (!t) t = cands.find(x => x.file === f.id) || (cands.length === 1 && cands[0].group === f.group ? cands[0] : null);
        if (t && t.id !== s.id) { seen.add(nm); ctx.addRel(s.id, t.id, 'uses', 'uses type ' + nm, s.line); }
      }
    } }
  // explicit refs (rust impl, SQL foreign keys, compose depends_on, ...)
  const sqlTarget = (name, from) => { const a = (ctx.sqlObjects.get(name) || []).filter(s => s.kind === 'table' || s.kind === 'view' || s.kind === 'sqltype'); return a.find(s => s.id !== from) || null; };
  for (const r of ctx.rawRefs) {
    const f = byId.get(r.file);
    if (r.from && r.to) { const a = (symsByName.get(r.from) || []).filter(s => s.group === f.group && typeKinds.has(s.kind)); const b = (symsByName.get(r.to) || []).filter(s => s.group === f.group && s.kind === 'trait'); const A = a.find(s => s.file === f.id) || a[0], B = b.find(s => s.file === f.id) || b[0]; if (A && B) ctx.addRel(A.id, B.id, r.type, r.label, r.line); continue; }
    let from = r.fromSym || (r.fromName && (sqlTarget(r.fromName, null) || {}).id) || r.fromFile || null; if (!from) continue;
    let to = null;
    if (r.toName) { const t = sqlTarget(r.toName, from); to = t && t.id; }
    else if (r.toSvc) { const tf = byId.get(r.toSvc[0]); const sid = tf && tf.symbols.find(id => symById.get(id).name === r.toSvc[1] && symById.get(id).kind === 'service'); to = sid || null; }
    else if (r.toFile) { const tf = byId.get(r.toFile); const stages = tf.symbols.map(id => symById.get(id)).filter(s => s.kind === 'stage'); const st = (r.toStage && stages.find(s => s.name === r.toStage)) || stages[stages.length - 1]; to = st ? st.id : tf.id; }
    else if (r.toSymName) { const tf = byId.get(r.toSymName[0]); const sid = tf && tf.symbols.find(id => symById.get(id).name === r.toSymName[1]); to = sid || null; }
    if (to) ctx.addRel(from, to, r.type, r.label, r.line);
  }
  for (const s of ctx.symbols) {
    for (const r of s.rawRefs) { const t = sqlTarget(r.name, s.id); if (t) ctx.addRel(s.id, t.id, 'sql', r.mode === 'on' ? 'on table' : r.mode, r.line); }
  }
  // code that embeds SQL text referencing known tables
  if (ctx.sqlObjects.size) {
    const innermost = (f, pos) => { let best = null; for (const id of f.symbols) { const s = symById.get(id); if (s.startPos <= pos && pos < s.endPos && !TYPE_KINDS.has(s.kind) && (!best || s.endPos - s.startPos < best.endPos - best.startPos)) best = s; } return best; };
    for (const f of ctx.files) {
      if (!['js', 'ts', 'vue', 'py', 'rs', 'sh'].includes(f.kind)) continue;
      const mk = f.kind === 'py' ? maskPy(f.text, true) : f.kind === 'rs' ? maskRust(f.text, true) : f.kind === 'sh' ? maskSh(f.text, true) : maskJS(f.text, true);
      const re = /\b(?:select\b[\s\S]{0,300}?\bfrom|insert\s+into|delete\s+from|update|join|truncate(?:\s+table)?)\s+("?[A-Za-z_][\w$]*"?)(?:\s*\.\s*("?[A-Za-z_][\w$]*"?))?/gi; let mt; const seen = new Set();
      while ((mt = re.exec(mk))) {
        const nm = sqlKey(mt[2] || mt[1]); const t = sqlTarget(nm, null); if (!t) continue;
        const kw = /^(insert|update|delete|truncate)/i.test(mt[0]) ? 'writes' : 'reads'; const o = innermost(f, mt.index); const key = (o ? o.id : f.id) + '>' + t.id + kw; if (seen.has(key)) continue; seen.add(key);
        ctx.addRel(o ? o.id : f.id, t.id, 'sql', kw + ' (embedded SQL)', f.lineOf(mt.index));
      }
    }
  }
  for (const cm of ctx.sqlComments) { const t = sqlTarget(cm.name, null) || (ctx.sqlObjects.get(cm.name) || [])[0]; if (t && !t.doc && cm.kind !== 'column') t.doc = cm.text; }
  for (const ix of ctx.sqlIndexes) { const t = sqlTarget(ix.table, null); if (t) { const e = t.extra.find(x => x.label === 'Indexes'); if (e) e.items.push(ix.text); else t.extra.push({ label: 'Indexes', items: [ix.text] }); } }

  /* --- aggregate relations --- */
  const agg = new Map();
  for (const r of ctx.rels) { const k = r.from + '>' + r.to + '>' + r.type; let a = agg.get(k); if (!a) agg.set(k, a = { from: r.from, to: r.to, type: r.type, count: 0, items: [] }); a.count++; if (a.items.length < 40 && !a.items.some(i => i.l === r.label)) a.items.push({ l: r.label, line: r.line }); }
  const rels = [...agg.values()];
  const out = new Map(), inc = new Map();
  for (const r of rels) { (out.get(r.from) || out.set(r.from, []).get(r.from)).push(r); (inc.get(r.to) || inc.set(r.to, []).get(r.to)).push(r); }

  /* --- phase 4: categories, tags, summaries --- */
  const label = s => s.label || (s.className ? s.className + (s.group === 'rs' ? '::' : '.') + s.name : (s.parentName && s.group === 'py' ? s.parentName + '.' + s.name : s.name));
  for (const f of ctx.files) {
    const ext = extOf(f.path); const ex = f.imports.map(i => i.external).filter(Boolean);
    const hasImp = re => f.imports.some(i => re.test(i.spec));
    let cat;
    switch (f.kind) {
      case 'vue': cat = 'Vue'; break; case 'py': cat = 'Python'; break; case 'rs': case 'cargo': cat = 'Rust'; break; case 'sql': cat = 'SQL'; break; case 'sh': cat = 'Bash'; break; case 'dockerfile': case 'compose': cat = 'Docker'; break; case 'package': cat = 'Node'; break; case 'tsconfig': cat = 'Config'; break;
      default:
        if (hasImp(/^(vue|pinia|vue-router|vuex|nuxt)(\/|$)/)) cat = 'Vue';
        else if (/^(jsx|tsx)$/.test(ext) || hasImp(/^(react|preact|next|solid-js)(\/|$)/)) cat = 'React';
        else if (f.imports.some(i => i.builtin || NODE_WEB_PKGS.has(i.external)) || f.cjs || f.usesProcess) cat = 'Node';
        else cat = f.kind === 'ts' ? 'TypeScript' : 'JavaScript';
    }
    f.cat = cat;
    const tags = new Set(); for (const e of ex) { const t = FRAMEWORKS[e] || FRAMEWORKS[e.replace(/-/g, '_')]; if (t) tags.add(t); }
    if (f.kind === 'ts') tags.add('TypeScript'); if (f.kind === 'js' && /^(jsx)$/.test(ext)) tags.add('JSX'); if (ext === 'tsx') tags.add('TSX'); if (f.kind === 'sql') tags.add('PostgreSQL');
    if (/(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|rs|go)$/.test(f.path) || (f.kind === 'rs' && f.symbols.some(id => symById.get(id).isTest))) { tags.add('test'); f.isTest = true; }
    if (f.symbols.some(id => symById.get(id).kind === 'route')) tags.add('HTTP routes');
    if (f.isScript) tags.add('script'); if (f.hasMain) tags.add('entry point');
    f.tags = [...tags];
  }
  for (const f of ctx.files) {
    const syms = f.symbols.map(id => symById.get(id)); const of = out.get(f.id) || [], inf = inc.get(f.id) || [];
    const names = k => syms.filter(s => s.kind === k).map(s => s.name);
    const parts = [];
    const nImp = f.imports.filter(i => i.target).length;
    switch (f.kind) {
      case 'vue': { const comp = syms.find(s => s.vue); const kids = comp ? (out.get(comp.id) || []).filter(r => r.type === 'render').map(r => label(symById.get(r.to))) : []; const fns = syms.filter(s => !s.vue && CALLABLE.has(s.kind)).map(s => s.name); const pe = comp ? comp.extra.filter(e => e.label === 'Props' || e.label === 'Emits events') : [];
        parts.push('Vue single-file component ' + (comp ? comp.name : '') + (f.vue && f.vue.setup ? ' (<script setup>)' : '') + '.'); const pr = pe.find(e => e.label === 'Props'); if (pr) parts.push('Props: ' + listText(pr.items) + '.'); const em = pe.find(e => e.label === 'Emits events'); if (em) parts.push('Emits: ' + listText(em.items) + '.'); if (kids.length) parts.push('Renders child components ' + listText(uniq(kids)) + '.'); if (fns.length) parts.push('Defines ' + fns.length + ' function' + (fns.length > 1 ? 's' : '') + ' (' + listText(fns) + ').'); break; }
      case 'js': case 'ts': {
        const comps = names('component'), hooks = names('hook'), routes = syms.filter(s => s.kind === 'route'), classes = names('class'), fns = syms.filter(s => s.kind === 'function' || s.kind === 'method'), types = syms.filter(s => TYPE_KINDS.has(s.kind));
        if (/\.(test|spec)\./.test(f.name) || f.isTest) parts.push('Test file for ' + (f.name.replace(/\.(test|spec)\..*$/, '')) + '.');
        else if (/\.config\.[jt]s$|^(vite|webpack|rollup|jest|vitest|babel|eslint|prettier|tailwind|postcss)[.\w-]*\.[cm]?[jt]s$/.test(f.name)) parts.push('Build / tool configuration (' + f.name.replace(/\.[^.]+$/, '') + ').');
        if (routes.length) parts.push('Defines ' + routes.length + ' HTTP route' + (routes.length > 1 ? 's' : '') + ' (' + listText(routes.map(s => s.name), 4) + ').');
        if (comps.length) parts.push('Defines React component' + (comps.length > 1 ? 's' : '') + ' ' + listText(comps) + '.');
        if (hooks.length) parts.push('Provides hook' + (hooks.length > 1 ? 's' : '') + ' ' + listText(hooks) + '.');
        if (classes.length) parts.push('Defines class' + (classes.length > 1 ? 'es' : '') + ' ' + listText(classes) + '.');
        if (!comps.length && !routes.length && fns.length) parts.push('Contains ' + fns.length + ' function' + (fns.length > 1 ? 's' : '') + ' (' + listText(fns.map(s => label(s)), 5) + ').');
        if (types.length) parts.push('Declares ' + types.length + ' type' + (types.length > 1 ? 's' : '') + ' (' + listText(types.map(s => s.name), 4) + ').');
        if (!syms.length && f.reexports.length) parts.push('Barrel module re-exporting from ' + listText(uniq(f.imports.filter(i => i.kind === 'reexport').map(i => i.spec)), 4) + '.');
        else if (/^index\.[jt]sx?$/.test(f.name) && f.reexports.length) parts.push('Acts as a barrel / entry file re-exporting other modules.');
        if (!parts.length) parts.push('Script with top-level code' + (f.imports.length ? ' that imports ' + listText(uniq(f.imports.map(i => i.spec)), 4) : '') + '.');
        break; }
      case 'py': { const cl = names('class'), fns = syms.filter(s => s.kind === 'function' || s.kind === 'route'), rts = syms.filter(s => s.kind === 'route');
        if (f.isTest) parts.push('Test module.'); parts.push('Python module' + (f.isScript ? ' (runnable script)' : '') + '.');
        if (cl.length) parts.push('Defines class' + (cl.length > 1 ? 'es' : '') + ' ' + listText(cl) + '.'); if (rts.length) parts.push('Exposes ' + rts.length + ' HTTP route' + (rts.length > 1 ? 's' : '') + '.');
        if (fns.length) parts.push('Has ' + fns.length + ' function' + (fns.length > 1 ? 's' : '') + ' (' + listText(fns.map(s => s.name), 5) + ').'); break; }
      case 'rs': { const st = names('struct'), en = names('enum'), tr = names('trait'), fns = syms.filter(s => s.kind === 'function' || s.kind === 'method' || s.kind === 'route');
        parts.push(f.hasMain ? 'Rust binary entry point.' : /(^|\/)lib\.rs$/.test(f.path) ? 'Rust library crate root.' : /(^|\/)mod\.rs$/.test(f.path) ? 'Rust module root.' : 'Rust module.');
        if (st.length) parts.push('Structs: ' + listText(st) + '.'); if (en.length) parts.push('Enums: ' + listText(en) + '.'); if (tr.length) parts.push('Traits: ' + listText(tr) + '.');
        if (fns.length) parts.push(fns.length + ' function' + (fns.length > 1 ? 's' : '') + '/methods (' + listText(fns.map(s => label(s)), 5) + ').'); break; }
      case 'sql': { const t = names('table'), v = names('view'), fn = names('sqlfunction'), tg = names('trigger'), ty = names('sqltype');
        const bits = []; if (t.length) bits.push(t.length + ' table' + (t.length > 1 ? 's' : '') + ' (' + listText(t, 5) + ')'); if (v.length) bits.push(v.length + ' view' + (v.length > 1 ? 's' : '') + ' (' + listText(v, 4) + ')'); if (fn.length) bits.push(fn.length + ' function' + (fn.length > 1 ? 's' : '') + ' (' + listText(fn, 4) + ')'); if (tg.length) bits.push(tg.length + ' trigger' + (tg.length > 1 ? 's' : '')); if (ty.length) bits.push(ty.length + ' type' + (ty.length > 1 ? 's' : ''));
        if (bits.length) parts.push('PostgreSQL script that creates ' + bits.join(', ') + '.'); else { const tt = uniq(of.filter(r => r.type === 'sql').map(r => (symById.get(r.to) || {}).name).filter(Boolean)); parts.push('SQL script (queries / data changes)' + (tt.length ? ' touching tables ' + listText(tt) : '') + '.'); }
        if (f.sqlMisc && f.sqlMisc.length) parts.push('Also sets up: ' + listText(f.sqlMisc, 4) + '.'); break; }
      case 'dockerfile': { const st = f.stages || []; parts.push('Docker image build with ' + st.length + ' stage' + (st.length === 1 ? '' : 's') + (st.length ? ' (' + listText(st.map(s => s.name + ' ← ' + s.image), 3) + ')' : '') + '.'); const ps = uniq(syms.flatMap(s => (s.extra.find(e => e.label === 'Exposed ports') || { items: [] }).items)); if (ps.length) parts.push('Exposes port ' + ps.join(', ') + '.'); const cmd = syms.flatMap(s => (s.extra.find(e => e.label === 'Start command') || { items: [] }).items).pop(); if (cmd) parts.push('Starts with ' + cmd + '.'); break; }
      case 'compose': { const sv = syms; parts.push('Docker Compose stack with ' + sv.length + ' service' + (sv.length === 1 ? '' : 's') + (sv.length ? ': ' + listText(sv.map(s => s.name + (s.signature ? ' (' + s.signature.replace(/^(image|build): /, '$1 ') + ')' : '')), 5) : '') + '.'); if (f.composeTop && f.composeTop.length) parts.push('Defines ' + f.composeTop.join('; ') + '.'); break; }
      case 'sh': { const fns = names('function'); parts.push('Shell script' + (fns.length ? ' defining ' + fns.length + ' function' + (fns.length > 1 ? 's' : '') + ' (' + listText(fns, 5) + ')' : '') + '.'); if (f.tools && f.tools.length) parts.push('Uses ' + listText(f.tools.filter(t => !['cat', 'ls', 'rm', 'cp', 'mv', 'mkdir', 'chmod'].includes(t)).slice(0, 6), 6) + '.'); const ru = of.filter(r => r.type === 'run').map(r => (byId.get(r.to) || {}).name).filter(Boolean); if (ru.length) parts.push('Runs ' + listText(ru, 4) + '.'); break; }
      case 'package': { const p = f.pkg || {}; parts.push('Node package' + (p.name ? ' "' + p.name + '"' : '') + (p.version ? ' v' + p.version : '') + (p.description ? ' — ' + p.description : '') + '.'); const nd = Object.keys(p.dependencies || {}).length, nv = Object.keys(p.devDependencies || {}).length; parts.push(nd + ' dependencies, ' + nv + ' dev dependencies.'); const sc = Object.keys(p.scripts || {}); if (sc.length) parts.push('Scripts: ' + listText(sc, 8) + '.'); break; }
      case 'cargo': { const t = f.cargo || {}, p = t.package || {}; parts.push(t.workspace && !p.name ? 'Cargo workspace manifest.' : 'Rust crate' + (p.name ? ' "' + p.name + '"' : '') + (p.version ? ' v' + p.version : '') + (p.description ? ' — ' + p.description : '') + '.'); parts.push(Object.keys(t.dependencies || {}).length + ' dependencies.'); break; }
      case 'tsconfig': { const co = (f.tsconfig && f.tsconfig.compilerOptions) || {}; parts.push('TypeScript / JavaScript compiler configuration' + (co.target ? ' (target ' + co.target + (co.strict ? ', strict' : '') + ')' : '') + '.'); break; }
    }
    const fact = []; if (inf.length) fact.push('Used by ' + inf.filter(r => byId.has(r.from) || symById.has(r.from)).length + ' other place' + (inf.length > 1 ? 's' : '')); if (nImp) fact.push('depends on ' + nImp + ' project file' + (nImp > 1 ? 's' : ''));
    f.auto = (parts.join(' ') + (fact.length ? ' ' + fact.join(', ') + '.' : '')).replace(/\.\./g, '.');
    if (f.header) { f.summary = clip(docSummary(f.header) || f.header, 420); f.summarySource = 'comment'; } else { f.summary = f.auto; f.summarySource = 'inferred'; }
  }
  for (const s of ctx.symbols) {
    const f = byId.get(s.file); const o = out.get(s.id) || [], inc2 = inc.get(s.id) || [];
    const callees = uniq(o.filter(r => r.type === 'call' || r.type === 'render').map(r => symById.get(r.to)).filter(Boolean).map(label)); const callers = inc2.filter(r => r.type === 'call' || r.type === 'render');
    const pnames = (s.params || []).map(p => p.replace(/^[*&]+|^mut\s+/, '').replace(/[:=].*$/s, '').replace(/^\{|\}$/g, '').trim()).filter(p => p && !/^(self|cls|&self|&mut self|this)$/.test(p) && !/^&?(mut\s+)?self$/.test(p));
    let t = '';
    switch (s.kind) {
      case 'function': case 'method': case 'hook': { t = describeName(s.name, s.kind) + '.'; if (pnames.length) t += ' Takes ' + listText(pnames, 5) + '.'; if (s.async) t += ' Async.'; if (callees.length) t += ' Calls ' + listText(callees, 4) + '.'; if (s.isTest) t = 'Test: ' + splitWords(s.name).join(' ') + '.'; break; }
      case 'component': { const kids = uniq(o.filter(r => r.type === 'render').map(r => label(symById.get(r.to)))); const hooks = uniq((s.rawCalls || []).filter(c => /^use[A-Z]/.test(c.name)).map(c => c.name)); const fp = (s.params[0] || '').match(/\{([^}]*)\}/); const props = fp ? fp[1].split(',').map(x => x.trim().replace(/[:=].*$/s, '')).filter(Boolean) : []; t = (s.vue ? 'Vue' : 'React') + ' component' + (props.length ? ' with props ' + listText(props, 6) : '') + '.' + (kids.length ? ' Renders ' + listText(kids, 5) + '.' : '') + (hooks.length ? ' Uses ' + listText(hooks, 5) + '.' : ''); if (props.length) s.extra.push({ label: 'Props', items: props.slice(0, 30) }); if (hooks.length && !s.vue) s.extra.push({ label: 'Hooks used', items: hooks }); break; }
      case 'class': t = 'Class ' + s.name + (s.superName ? ' extending ' + s.superName : '') + (s.dataclass ? ' (dataclass)' : '') + '. Methods: ' + (listText(f.symbols.map(id => symById.get(id)).filter(x => x.className === s.name).map(x => x.name), 6) || 'none') + '.'; break;
      case 'route': { const r = s.route; t = r ? 'HTTP ' + r.method + ' endpoint at ' + r.path + '.' : 'HTTP endpoint.'; const tb = uniq(o.filter(x => x.type === 'sql').map(x => (symById.get(x.to) || {}).name)); if (callees.length) t += ' Handled via ' + listText(callees, 3) + '.'; if (tb.length) t += ' Touches tables ' + listText(tb) + '.'; if (callers.length) t += ' Called from ' + callers.length + ' client location' + (callers.length > 1 ? 's' : '') + '.'; break; }
      case 'table': { const refs = o.filter(x => x.type === 'sql').map(x => (symById.get(x.to) || {}).name), by = uniq(inc2.filter(x => x.type === 'sql').map(x => (symById.get(x.from) || byId.get(x.from) || {}).name || (byId.get(x.from) || {}).name)).filter(Boolean); const pk = (s.columns || []).filter(c => c[2].includes('PK')).map(c => c[0]); t = 'Table with ' + (s.columns || []).length + ' columns (' + listText((s.columns || []).map(c => c[0]), 5) + ').' + (pk.length ? ' Primary key: ' + pk.join(', ') + '.' : '') + (refs.length ? ' References ' + listText(uniq(refs)) + '.' : '') + (by.length ? ' Used by ' + listText(by, 4) + '.' : ''); break; }
      case 'view': t = (s.materialized ? 'Materialized view' : 'View') + ' over ' + (listText(uniq(o.filter(x => x.type === 'sql').map(x => (symById.get(x.to) || {}).name).filter(Boolean))) || 'its source query') + '.'; break;
      case 'sqlfunction': { const rd = uniq(o.filter(x => x.type === 'sql' && /reads/.test((x.items[0] || {}).l)).map(x => (symById.get(x.to) || {}).name)), wr = uniq(o.filter(x => x.type === 'sql' && /writes/.test((x.items[0] || {}).l)).map(x => (symById.get(x.to) || {}).name)); t = (s.isProcedure ? 'Stored procedure' : 'SQL function') + (s.returns ? ' returning ' + s.returns : '') + (s.lang ? ' (' + s.lang + ')' : '') + '. ' + describeName(s.name, 'function') + '.' + (rd.length ? ' Reads ' + listText(rd) + '.' : '') + (wr.length ? ' Writes ' + listText(wr) + '.' : ''); break; }
      case 'trigger': { const tb = o.find(x => x.type === 'sql'), fn = o.find(x => x.type === 'call'); t = 'Trigger' + (tb ? ' on table ' + (symById.get(tb.to) || {}).name : '') + (fn ? ' that runs ' + (symById.get(fn.to) || {}).name + '()' : '') + '.'; break; }
      case 'sqltype': t = 'Custom PostgreSQL type / domain ' + s.name + '.'; break;
      case 'stage': t = 'Docker build stage "' + s.name + '" based on ' + s.image + '.' + (callees.length ? '' : '') + (o.filter(x => x.type === 'copy').length ? ' Copies files from ' + o.filter(x => x.type === 'copy').length + ' source' + (o.filter(x => x.type === 'copy').length > 1 ? 's' : '') + '.' : '') + ((s.extra.find(e => e.label === 'Start command') || { items: [] }).items[0] ? ' ' + s.extra.find(e => e.label === 'Start command').items[0] + '.' : ''); break;
      case 'service': { const dep = o.filter(x => x.type === 'depends' && symById.has(x.to) && symById.get(x.to).kind === 'service').map(x => symById.get(x.to).name); t = 'Compose service ' + s.name + (s.signature ? ' (' + s.signature + ')' : '') + '.' + (dep.length ? ' Depends on ' + listText(dep) + '.' : '') + ((s.extra.find(e => e.label === 'Ports') || { items: [] }).items.length ? ' Ports ' + s.extra.find(e => e.label === 'Ports').items.join(', ') + '.' : ''); break; }
      case 'script': t = 'npm script that runs: ' + s.signature.split('→')[1].trim() + '.'; break;
      case 'struct': case 'enum': case 'trait': case 'interface': case 'type': { const fl = s.extra.find(e => e.label === 'Fields' || e.label === 'Variants'); const impls = inc2.filter(x => x.type === 'extends').map(x => (symById.get(x.from) || {}).name).filter(Boolean); t = (s.kind === 'interface' ? 'TypeScript interface' : s.kind === 'type' ? 'Type alias' : s.kind[0].toUpperCase() + s.kind.slice(1)) + ' ' + s.name + (fl ? ' with ' + fl.items.length + ' ' + (fl.label === 'Fields' ? 'field' : 'variant') + (fl.items.length > 1 ? 's' : '') + ' (' + listText(fl.items.map(x => x.split(':')[0]), 5) + ')' : '') + '.' + (impls.length ? ' Implemented/extended by ' + listText(impls, 4) + '.' : '') + (inc2.filter(x => x.type === 'uses').length ? ' Used by ' + inc2.filter(x => x.type === 'uses').length + ' functions.' : ''); break; }
      default: t = describeName(s.name, s.kind) + '.';
    }
    if (callers.length && (s.kind === 'function' || s.kind === 'method' || s.kind === 'hook' || s.kind === 'component')) t += ' Called from ' + callers.length + ' place' + (callers.length > 1 ? 's' : '') + '.';
    s.auto = t.replace(/\s+/g, ' ').replace(/\.\./g, '.').trim();
    if (s.doc && f.header && s.doc.trim() === f.header.trim()) s.doc = '';   // file header comment sitting right above the first symbol
    const ds = docSummary(s.doc);
    if (ds) { s.summary = clip(ds, 360); s.summarySource = 'comment'; } else { s.summary = s.auto; s.summarySource = 'inferred'; }
    s.label = label(s);
  }

  /* --- output --- */
  const fileOut = ctx.files.map(f => ({
    id: f.id, path: f.path, name: f.name, dir: f.dir, kind: f.kind, cat: f.cat, lang: f.lang, size: f.size, lines: f.lines, tags: f.tags, header: clip(f.header || '', 1500),
    summary: f.summary, summarySource: f.summarySource, auto: f.auto, extra: f.extra.concat(f.env && f.env.length ? [{ label: 'Environment variables read', items: f.env.slice(0, 40) }] : [], f.tools && f.tools.length ? [{ label: 'Command-line tools used', items: f.tools.slice(0, 30) }] : [], f.sqlMisc && f.sqlMisc.length ? [{ label: 'Also defines', items: f.sqlMisc.slice(0, 30) }] : []),
    imports: f.imports.map(i => ({ spec: i.spec, target: i.target, external: i.external, builtin: i.builtin, names: i.names.slice(0, 30), line: i.line, kind: i.kind })),
    exports: f.exports.slice(0, 80), symbols: f.symbols, text: f.text, isTest: !!f.isTest, parseError: f.parseError || null, entry: !!(f.hasMain || f.isScript)
  }));
  const symOut = ctx.symbols.map(s => ({
    id: s.id, file: s.file, name: s.name, label: s.label, kind: s.kind, className: s.className, line: s.line, endLine: s.endLine, signature: s.signature || '', params: (s.params || []).slice(0, 20), exported: !!s.exported, async: !!s.async, visibility: s.visibility || null, isStatic: !!s.isStatic,
    doc: clip(s.doc || '', 1500), summary: s.summary, summarySource: s.summarySource, auto: s.auto, extra: s.extra, complexity: s.complexity, loc: s.endLine - s.line + 1, route: s.route || null, returns: s.returns || null, lang: s.lang || null, extCalls: s.extCalls || [], httpOut: s.httpOut || [], recursive: !!s.recursive, superName: s.superName || null, decorators: s.decorators || [], isTest: !!s.isTest, materialized: !!s.materialized
  }));
  const langCounts = {}; for (const f of ctx.files) langCounts[f.cat] = (langCounts[f.cat] || 0) + 1;
  const fw = new Set(); for (const f of ctx.files) for (const t of f.tags) if (t !== 'test' && t !== 'TypeScript' && t !== 'script' && t !== 'entry point' && t !== 'HTTP routes') fw.add(t);
  progress('Done', ctx.files.length, ctx.files.length);
  return { version: 1, generated: new Date().toISOString(), root: opts.root || '', files: fileOut, symbols: symOut, externals: [...ctx.externals.values()], rels, skipped, meta: { langCounts, frameworks: [...fw].sort(), fileCount: fileOut.length, symbolCount: symOut.length, relCount: rels.length } };
}

return { analyze, kindOfFile };
})();
if (typeof module !== 'undefined') module.exports = Analyzer;
