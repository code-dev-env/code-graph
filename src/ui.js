(() => {
  "use strict";
  const ORIGINAL_HTML =
    "<!DOCTYPE html>\n" + document.documentElement.outerHTML; // captured before any DOM changes, used for snapshot export
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const fmtSize = (b) =>
    b < 1024
      ? b + " B"
      : b < 1048576
        ? (b / 1024).toFixed(1) + " KB"
        : (b / 1048576).toFixed(1) + " MB";
  const clip = (s, n) =>
    s && s.length > n ? s.slice(0, n - 1) + "…" : s || "";
  const tick = () => new Promise((r) => setTimeout(r, 0));

  /* ---------- visual vocabulary ---------- */
  const CAT_COLORS = {
    JavaScript: "#eab308",
    TypeScript: "#3b82f6",
    React: "#22d3ee",
    Vue: "#22c55e",
    Node: "#84cc16",
    Python: "#a855f7",
    Rust: "#f97316",
    SQL: "#ec4899",
    Docker: "#6366f1",
    Bash: "#ef4444",
    Config: "#64748b",
  };
  const CAT_NAMES = {
    SQL: "PostgreSQL / SQL",
    Config: "Config files",
    Node: "Node.js",
  };
  const EDGE = {
    import: { c: "#7d8aa3", l: "Imports / includes / dependencies" },
    call: { c: "#f59e0b", l: "Function calls" },
    render: { c: "#22d3ee", l: "Renders component" },
    extends: { c: "#a78bfa", l: "Extends / implements" },
    uses: { c: "#34d399", l: "Uses a type" },
    sql: { c: "#f472b6", l: "Database access / foreign keys" },
    run: { c: "#fb7185", l: "Runs / executes" },
    copy: { c: "#38bdf8", l: "Copies / mounts" },
    depends: { c: "#818cf8", l: "Depends on / builds" },
    contains: { c: "#566178", l: "File contains function" },
  };
  const KIND_LABEL = {
    function: "function",
    method: "method",
    hook: "hook",
    component: "component",
    class: "class",
    route: "HTTP route",
    interface: "interface",
    type: "type alias",
    enum: "enum",
    struct: "struct",
    trait: "trait",
    table: "table",
    view: "view",
    sqlfunction: "SQL function",
    trigger: "trigger",
    sqltype: "SQL type",
    stage: "Docker stage",
    service: "Compose service",
    script: "npm script",
  };
  const KIND_SHAPE = {
    function: "circle",
    method: "circle",
    hook: "circle",
    component: "diamond",
    class: "square",
    route: "triangle",
    table: "hex",
    view: "hex",
    sqlfunction: "circle",
    trigger: "triangle",
    sqltype: "square",
    interface: "square",
    type: "square",
    enum: "square",
    struct: "square",
    trait: "square",
    stage: "round",
    service: "round",
    script: "triangle",
  };
  const KIND_GROUPS = [
    {
      key: "function",
      label: "Functions & methods",
      kinds: ["function", "method"],
      shape: "circle",
    },
    {
      key: "component",
      label: "Components",
      kinds: ["component"],
      shape: "diamond",
    },
    { key: "hook", label: "Hooks", kinds: ["hook"], shape: "circle" },
    { key: "class", label: "Classes", kinds: ["class"], shape: "square" },
    { key: "route", label: "HTTP routes", kinds: ["route"], shape: "triangle" },
    {
      key: "table",
      label: "DB tables & views",
      kinds: ["table", "view"],
      shape: "hex",
    },
    {
      key: "sqlfn",
      label: "SQL functions & triggers",
      kinds: ["sqlfunction", "trigger"],
      shape: "circle",
    },
    {
      key: "infra",
      label: "Docker stages & services",
      kinds: ["stage", "service"],
      shape: "round",
    },
    {
      key: "script",
      label: "npm scripts",
      kinds: ["script"],
      shape: "triangle",
    },
    {
      key: "type",
      label: "Types, structs, traits, enums",
      kinds: ["interface", "type", "enum", "struct", "trait", "sqltype"],
      shape: "square",
      off: true,
    },
  ];
  const KIND_GROUP = {};
  KIND_GROUPS.forEach((g) => g.kinds.forEach((k) => (KIND_GROUP[k] = g.key)));
  const THEMES = {
    dark: {
      bg: "#0e1117",
      text: "#d9e0ec",
      halo: "#0e1117",
      ring: "#ffffff",
      ext: "#64748b",
      card: "#1b2331",
      cardBorder: "#38445d",
      muted: "#8793a8",
    },
    light: {
      bg: "#f4f6fa",
      text: "#1d2533",
      halo: "#f4f6fa",
      ring: "#111827",
      ext: "#94a3b8",
      card: "#ffffff",
      cardBorder: "#c3cde0",
      muted: "#677489",
    },
  };

  /* ---------- state ---------- */
  const S = {
    mode: "files",
    cats: new Set(),
    kinds: new Set(KIND_GROUPS.filter((g) => !g.off).map((g) => g.key)),
    edgeTypes: new Set(Object.keys(EDGE).filter((k) => k !== "uses")),
    dirVis: new Map(),
    view: "graph",
    level: "files",
    flowDepth: 2,
    showExternals: false,
    hideTests: false,
    hideIsolated: false,
    arrows: true,
    labels: "auto",
    focus: false,
    focusDepth: 1,
    selected: null,
    selectedEdge: null,
    hover: null,
    hoverEdge: null,
    search: "",
    repel: 1,
    linkDist: 1,
    paused: false,
    theme: "dark",
    codeFull: new Set(),
    root: "",
  };
  let data = null,
    byId = new Map(),
    relOut = new Map(),
    relIn = new Map(),
    nameCount = new Map(),
    insights = null,
    linesCache = new Map(),
    pinned = new Set();
  let nodes = [],
    links = [],
    nodeIdx = new Map(),
    adj = new Map(),
    searchHits = null;
  const view = { x: 0, y: 0, k: 1 };
  let W = 0,
    H = 0,
    dpr = 1,
    needDraw = true,
    anim = null;
  const sim = { alpha: 0 };
  let graphNodes = null,
    flowNotes = [],
    lastDirHandle = null;
  const cv = $("#cv"),
    cx = cv.getContext("2d"),
    stage = $("#stage");

  /* ---------- data helpers ---------- */
  const fileOf = (id) => {
    const e = byId.get(id);
    return !e
      ? null
      : id[0] === "f"
        ? e
        : id[0] === "s"
          ? byId.get(e.file)
          : null;
  };
  const toFileId = (id) =>
    id[0] === "f" ? id : id[0] === "s" ? (byId.get(id) || {}).file : id;
  const fileLabel = (f) =>
    nameCount.get(f.name) > 1 && f.dir
      ? f.dir.split("/").slice(-1)[0] + "/" + f.name
      : f.name;
  const labelOf = (e) =>
    !e
      ? "?"
      : e.id[0] === "f"
        ? fileLabel(e)
        : e.id[0] === "s"
          ? e.label
          : e.name;
  const colorOf = (e) =>
    !e
      ? "#64748b"
      : e.id[0] === "f"
        ? CAT_COLORS[e.cat] || "#64748b"
        : e.id[0] === "s"
          ? CAT_COLORS[(byId.get(e.file) || {}).cat] || "#64748b"
          : e.id[0] === "d"
            ? CAT_COLORS[e.cat] || "#64748b"
            : THEMES[S.theme].ext;
  const dirHidden = (d) => {
    if (!S.dirVis.size) return false;
    if (d === "") return S.dirVis.get("/") === false;
    const p = d.split("/");
    for (let i = Math.min(p.length, 2); i >= 1; i--) {
      const v = S.dirVis.get(p.slice(0, i).join("/"));
      if (v !== undefined) return !v;
    }
    return false;
  };
  const srcLines = (f) => {
    let l = linesCache.get(f.id);
    if (!l) linesCache.set(f.id, (l = (f.text || "").split("\n")));
    return l;
  };

  /* ============================================================
   Loading
   ============================================================ */
  function loadData(d, how) {
    data = d;
    byId = new Map();
    relOut = new Map();
    relIn = new Map();
    nameCount = new Map();
    linesCache = new Map();
    pinned = new Set();
    d.files.forEach((f) => {
      byId.set(f.id, f);
      nameCount.set(f.name, (nameCount.get(f.name) || 0) + 1);
    });
    d.symbols.forEach((s) => byId.set(s.id, s));
    d.externals.forEach((x) => byId.set(x.id, x));
    d.rels.forEach((r) => {
      (relOut.get(r.from) || relOut.set(r.from, []).get(r.from)).push(r);
      (relIn.get(r.to) || relIn.set(r.to, []).get(r.to)).push(r);
    });
    S.cats = new Set(Object.keys(d.meta.langCounts));
    S.dirVis = new Map();
    graphNodes = null;
    S.selected = null;
    S.selectedEdge = null;
    S.focus = false;
    S.search = "";
    $("#search").value = "";
    S.root = d.root || "";
    insights = computeInsights();
    buildSidebar();
    $("#empty").hidden = true;
    $("#progress").hidden = true;
    S.mode =
      d.meta.fileCount > 600 || d.meta.symbolCount < 3 ? "files" : "files";
    syncMode();
    rebuild({ fresh: true });
    fitView(false);
    renderPanel();
    document.title = "Code Graph — " + (d.root || "project");
    applyHash();
  }

  function computeInsights() {
    const fout = new Map(),
      fin = new Map(),
      imp = new Map();
    const add = (m, a, b) => (m.get(a) || m.set(a, new Set()).get(a)).add(b);
    for (const r of data.rels) {
      const a = toFileId(r.from),
        b = toFileId(r.to);
      if (!a || !b || a === b || b[0] === "x" || a[0] === "x") continue;
      add(fout, a, b);
      add(fin, b, a);
      if (r.type === "import") add(imp, a, b);
    }
    const files = data.files;
    const degree = (f) =>
      (fout.get(f.id) || new Set()).size + (fin.get(f.id) || new Set()).size;
    const hubs = files
      .map((f) => [f, degree(f)])
      .filter((x) => x[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const entries = files
      .filter(
        (f) =>
          (fout.get(f.id) || { size: 0 }).size > 0 &&
          !(fin.get(f.id) || { size: 0 }).size &&
          !["package", "cargo", "tsconfig"].includes(f.kind),
      )
      .sort((a, b) => fout.get(b.id).size - fout.get(a.id).size)
      .slice(0, 8);
    const orphans = files.filter(
      (f) =>
        degree(f) === 0 &&
        !f.symbols.some(
          (id) => (relOut.get(id) || []).length || (relIn.get(id) || []).length,
        ),
    );
    // circular imports (Tarjan)
    let idx = 0;
    const index = new Map(),
      low = new Map(),
      onS = new Set(),
      st = [],
      cycles = [];
    const strong = (v) => {
      index.set(v, idx);
      low.set(v, idx);
      idx++;
      st.push(v);
      onS.add(v);
      for (const w of imp.get(v) || []) {
        if (!index.has(w)) {
          strong(w);
          low.set(v, Math.min(low.get(v), low.get(w)));
        } else if (onS.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
      }
      if (low.get(v) === index.get(v)) {
        const comp = [];
        let w;
        do {
          w = st.pop();
          onS.delete(w);
          comp.push(w);
        } while (w !== v);
        if (comp.length > 1) cycles.push(comp);
      }
    };
    try {
      for (const f of files) if (!index.has(f.id)) strong(f.id);
    } catch (e) {}
    const called = data.symbols
      .map((s) => [
        s,
        (relIn.get(s.id) || [])
          .filter((r) => r.type === "call" || r.type === "render")
          .reduce((n, r) => n + r.count, 0),
      ])
      .filter((x) => x[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const unresolved = data.files.reduce(
      (n, f) =>
        n +
        f.imports.filter(
          (i) => !i.target && !i.external && i.spec.startsWith("."),
        ).length,
      0,
    );
    return { hubs, entries, orphans, cycles, called, unresolved };
  }

  /* ============================================================
   Graph construction
   ============================================================ */
  function rebuild(opts) {
    opts = opts || {};
    if (S.view === "flow") return rebuildFlow(opts);
    const old = new Map(nodes.map((n) => [n.id, n]));
    const N = [];
    const idx = new Map();
    const addN = (id, type) => {
      if (idx.has(id)) return;
      const e = byId.get(id);
      const o = old.get(id);
      const n = o || { x: 0, y: 0, vx: 0, vy: 0, isNew: true };
      Object.assign(n, {
        id,
        e,
        type,
        idx: N.length,
        deg: 0,
        fixed: pinned.has(id),
      });
      idx.set(id, n);
      N.push(n);
    };
    const fileOk = (f) =>
      S.cats.has(f.cat) && !(S.hideTests && f.isTest) && !dirHidden(f.dir);
    const showFiles = S.mode !== "functions",
      showSyms = S.mode !== "files";
    if (showFiles)
      for (const f of data.files) if (fileOk(f)) addN(f.id, "file");
    if (showSyms)
      for (const s of data.symbols) {
        const f = byId.get(s.file);
        if (fileOk(f) && S.kinds.has(KIND_GROUP[s.kind])) addN(s.id, "sym");
      }
    if (showFiles && S.showExternals)
      for (const r of data.rels)
        if (r.to[0] === "x" && S.edgeTypes.has(r.type)) {
          const ff = toFileId(r.from);
          if (idx.has(ff)) addN(r.to, "ext");
        }
    const L = [];
    const lk = new Map();
    const addL = (a, b, type, rel) => {
      const key = a + ">" + b + ">" + type;
      let l = lk.get(key);
      if (!l) {
        l = { s: idx.get(a), t: idx.get(b), type, rels: [], count: 0 };
        lk.set(key, l);
        L.push(l);
      }
      l.rels.push(rel);
      l.count += rel.count || 1;
    };
    for (const r of data.rels) {
      if (!S.edgeTypes.has(r.type)) continue;
      let a = r.from,
        b = r.to;
      if (S.mode === "files") {
        a = toFileId(a);
        b = toFileId(b);
        if (a === b) continue;
      } else if (S.mode === "functions") {
        if (a[0] !== "s" || b[0] !== "s") continue;
      }
      if (!idx.has(a) || !idx.has(b)) continue;
      addL(a, b, r.type, r);
    }
    if (S.mode === "both" && S.edgeTypes.has("contains"))
      for (const n of N)
        if (n.type === "sym" && idx.has(n.e.file))
          addL(n.e.file, n.id, "contains", {
            from: n.e.file,
            to: n.id,
            count: 1,
            items: [],
          });
    // adjacency + degree
    const A = new Map();
    const link = (a, b) => {
      (A.get(a) || A.set(a, new Set()).get(a)).add(b);
    };
    for (const l of L) {
      link(l.s.id, l.t.id);
      link(l.t.id, l.s.id);
    }
    let keep = N;
    if (S.hideIsolated)
      keep = N.filter((n) => A.has(n.id) || n.id === S.selected);
    if (S.focus && S.selected && idx.has(S.selected)) {
      const seen = new Set([S.selected]);
      let fr = [S.selected];
      for (let d = 0; d < S.focusDepth; d++) {
        const nx = [];
        for (const id of fr)
          for (const w of A.get(id) || [])
            if (!seen.has(w)) {
              seen.add(w);
              nx.push(w);
            }
        fr = nx;
      }
      keep = keep.filter((n) => seen.has(n.id));
    }
    const keepSet = new Set(keep.map((n) => n.id));
    const L2 = L.filter((l) => keepSet.has(l.s.id) && keepSet.has(l.t.id));
    nodes = keep;
    nodes.forEach((n, i) => (n.idx = i));
    nodeIdx = new Map(nodes.map((n) => [n.id, n]));
    adj = new Map();
    for (const l of L2) {
      l.s.deg++;
      l.t.deg++;
      (adj.get(l.s.id) || adj.set(l.s.id, new Set()).get(l.s.id)).add(l.t.id);
      (adj.get(l.t.id) || adj.set(l.t.id, new Set()).get(l.t.id)).add(l.s.id);
    }
    links = L2;
    if (S.mode === "functions") {
      // invisible springs keep each file's functions together
      const first = new Map();
      for (const n of nodes) {
        if (n.type !== "sym") continue;
        const f = n.e.file;
        if (!first.has(f)) first.set(f, n);
        else
          links.push({
            s: first.get(f),
            t: n,
            type: "group",
            hidden: true,
            rels: [],
            count: 0,
          });
      }
    }
    for (const n of nodes) {
      n.color = colorOf(n.e);
      n.label = labelOf(n.e);
      n.shape =
        n.type === "file"
          ? "circle"
          : n.type === "ext"
            ? "round"
            : KIND_SHAPE[n.e.kind] || "circle";
      n.r =
        n.type === "file"
          ? Math.min(4.5 + Math.sqrt(n.deg) * 1.5, 16)
          : n.type === "ext"
            ? Math.min(4 + Math.sqrt(n.deg) * 1.2, 12)
            : Math.min(3.4 + Math.sqrt(n.deg) * 1.2, 11);
      if (S.mode === "both" && n.type === "file") n.r += 2;
    }
    // initial positions for newcomers
    const spread = Math.sqrt(nodes.length + 1) * 38;
    for (const n of nodes)
      if (n.isNew) {
        const nb = [...(adj.get(n.id) || [])]
          .map((id) => nodeIdx.get(id))
          .find((m) => m && !m.isNew);
        if (nb) {
          n.x = nb.x + (Math.random() - 0.5) * 40;
          n.y = nb.y + (Math.random() - 0.5) * 40;
        } else {
          const a = Math.random() * 6.283,
            r = Math.sqrt(Math.random()) * spread;
          n.x = Math.cos(a) * r;
          n.y = Math.sin(a) * r;
        }
        n.isNew = false;
      }
    for (const n of nodes) {
      n.cx = 0;
      n.cy = 0;
    }
    searchHits = computeSearchHits();
    sim.alpha = opts.fresh ? 1 : 0.7;
    if (opts.fresh || nodes.length < 700) {
      const t0 = performance.now();
      let it = 0;
      while (it < 140 && performance.now() - t0 < 220) {
        simTick();
        sim.alpha *= 0.985;
        it++;
      }
    }
    updateHud();
    needDraw = true;
  }

  /* ---------- physics ---------- */
  function simTick() {
    const N = nodes.length;
    if (!N) return;
    const a = sim.alpha,
      aa = 0.35 + 0.65 * a,
      rep =
        2300 *
        S.repel *
        (N > 150 ? 1 + Math.min(2, Math.log10(N / 150) * 2.2) : 1),
      dist = S.linkDist,
      cell = 120,
      g = new Map();
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      n.cx = Math.floor(n.x / cell);
      n.cy = Math.floor(n.y / cell);
      const key = n.cx * 100003 + n.cy;
      let b = g.get(key);
      if (!b) g.set(key, (b = []));
      b.push(n);
    }
    const R2 = cell * cell * 2.4;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const b = g.get((n.cx + dx) * 100003 + n.cy + dy);
          if (!b) continue;
          for (let j = 0; j < b.length; j++) {
            const m = b[j];
            if (m.idx <= n.idx) continue;
            let ddx = m.x - n.x,
              ddy = m.y - n.y,
              d2 = ddx * ddx + ddy * ddy;
            if (d2 > R2) continue;
            if (d2 < 0.01) {
              ddx = Math.random() - 0.5;
              ddy = Math.random() - 0.5;
              d2 = 0.5;
            }
            const d = Math.sqrt(d2),
              minD = n.r + m.r + 8;
            let f = (rep * aa) / (d2 + 160);
            if (d < minD) f += (minD - d) * 0.6;
            const fx = (ddx / d) * f,
              fy = (ddy / d) * f;
            n.vx -= fx;
            n.vy -= fy;
            m.vx += fx;
            m.vy += fy;
          }
        }
    }
    for (const l of links) {
      const s = l.s,
        t = l.t;
      let dx = t.x - s.x,
        dy = t.y - s.y,
        d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const len =
        (l.type === "contains"
          ? 26
          : l.type === "group"
            ? 55
            : S.mode === "files"
              ? 80
              : 62) *
          dist +
        s.r +
        t.r;
      const k =
        l.type === "group" ? 0.012 : l.type === "contains" ? 0.08 : 0.045;
      const f = (d - len) * k * aa;
      const ws = t.deg / (s.deg + t.deg + 0.01),
        wt = 1 - ws,
        fx = (dx / d) * f,
        fy = (dy / d) * f;
      s.vx += fx * (ws + 0.25);
      s.vy += fy * (ws + 0.25);
      t.vx -= fx * (wt + 0.25);
      t.vy -= fy * (wt + 0.25);
    }
    const grav = N > 600 ? 0.0016 : N > 300 ? 0.0026 : N > 120 ? 0.005 : 0.014;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      if (n.dragging || n.fixed) {
        n.vx = n.vy = 0;
        continue;
      }
      n.vx -= n.x * grav * aa;
      n.vy -= n.y * grav * aa;
      n.vx *= 0.76;
      n.vy *= 0.76;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > 45) {
        n.vx *= 45 / sp;
        n.vy *= 45 / sp;
      }
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  /* ============================================================
   Rendering
   ============================================================ */
  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = r.width;
    H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    needDraw = true;
  }
  function shapePath(c, shape, x, y, r) {
    c.beginPath();
    switch (shape) {
      case "square":
        c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
        break;
      case "round": {
        const w = r * 1.5,
          h = r * 1.05,
          rr = h * 0.5;
        c.moveTo(x - w + rr, y - h);
        c.arcTo(x + w, y - h, x + w, y + h, rr);
        c.arcTo(x + w, y + h, x - w, y + h, rr);
        c.arcTo(x - w, y + h, x - w, y - h, rr);
        c.arcTo(x - w, y - h, x + w, y - h, rr);
        c.closePath();
        break;
      }
      case "diamond":
        c.moveTo(x, y - r * 1.3);
        c.lineTo(x + r * 1.3, y);
        c.lineTo(x, y + r * 1.3);
        c.lineTo(x - r * 1.3, y);
        c.closePath();
        break;
      case "triangle":
        c.moveTo(x, y - r * 1.25);
        c.lineTo(x + r * 1.15, y + r * 0.85);
        c.lineTo(x - r * 1.15, y + r * 0.85);
        c.closePath();
        break;
      case "hex":
        for (let i = 0; i < 6; i++) {
          const an = (Math.PI / 3) * i + Math.PI / 6;
          const px = x + Math.cos(an) * r * 1.15,
            py = y + Math.sin(an) * r * 1.15;
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath();
        break;
      default:
        c.arc(x, y, r, 0, 6.2832);
    }
  }
  function draw() {
    const T = THEMES[S.theme];
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = T.bg;
    cx.fillRect(0, 0, W, H);
    if (!nodes.length) return;
    if (S.view === "flow") return drawFlow(T);
    cx.save();
    cx.translate(view.x, view.y);
    cx.scale(view.k, view.k);
    const k = view.k,
      sel = S.selected,
      hov = S.hover,
      focusId = hov || sel;
    const hl = focusId ? new Set([focusId, ...(adj.get(focusId) || [])]) : null;
    const searching =
      (searchHits && searchHits.size > 0) ||
      (S.search && searchHits && searchHits.size === 0);
    const dimA = 0.12,
      many = links.length > 4000;
    const vx0 = -view.x / k - 40,
      vy0 = -view.y / k - 40,
      vx1 = (W - view.x) / k + 40,
      vy1 = (H - view.y) / k + 40;
    for (const l of links) {
      if (l.hidden) continue;
      const s = l.s,
        t = l.t;
      if (
        (s.x < vx0 && t.x < vx0) ||
        (s.x > vx1 && t.x > vx1) ||
        (s.y < vy0 && t.y < vy0) ||
        (s.y > vy1 && t.y > vy1)
      )
        continue;
      const on = hl && (s.id === focusId || t.id === focusId);
      const selEdge = S.selectedEdge === l;
      let alpha = l.type === "contains" ? 0.28 : 0.42;
      if (hl) alpha = on ? 0.95 : dimA * 0.7;
      if (searching)
        alpha = Math.min(
          alpha,
          searchHits.has(s.id) && searchHits.has(t.id) ? alpha : 0.06,
        );
      if (selEdge || S.hoverEdge === l) alpha = 1;
      cx.globalAlpha = alpha;
      cx.strokeStyle = EDGE[l.type].c;
      cx.lineWidth =
        (selEdge
          ? 3
          : (on ? 1.9 : 1) + Math.min(1.6, Math.log2(l.count + 1) * 0.35)) /
        Math.max(0.6, Math.min(k, 1.6));
      cx.beginPath();
      cx.moveTo(s.x, s.y);
      cx.lineTo(t.x, t.y);
      cx.stroke();
      if (S.arrows && !many && l.type !== "contains" && k > 0.3) {
        const dx = t.x - s.x,
          dy = t.y - s.y,
          d = Math.hypot(dx, dy);
        if (d < 1) continue;
        const ux = dx / d,
          uy = dy / d,
          sz = Math.max(3.5, Math.min(9, 7 / Math.sqrt(k))),
          rr =
            t.r * (t.shape === "round" || t.shape === "diamond" ? 1.3 : 1.05) +
            1.5;
        const tx = t.x - ux * rr,
          ty = t.y - uy * rr;
        cx.fillStyle = EDGE[l.type].c;
        cx.beginPath();
        cx.moveTo(tx, ty);
        cx.lineTo(tx - ux * sz - uy * sz * 0.5, ty - uy * sz + ux * sz * 0.5);
        cx.lineTo(tx - ux * sz + uy * sz * 0.5, ty - uy * sz - ux * sz * 0.5);
        cx.closePath();
        cx.fill();
      }
    }
    cx.globalAlpha = 1;
    for (const n of nodes) {
      if (n.x < vx0 || n.x > vx1 || n.y < vy0 || n.y > vy1) continue;
      let alpha = 1;
      if (hl && !hl.has(n.id)) alpha = dimA;
      if (searching && !searchHits.has(n.id)) alpha = Math.min(alpha, 0.12);
      cx.globalAlpha = alpha;
      shapePath(cx, n.shape, n.x, n.y, n.r);
      if (n.type === "ext") {
        cx.fillStyle = T.bg;
        cx.fill();
        cx.setLineDash([3 / k, 2 / k]);
        cx.strokeStyle = n.color;
        cx.lineWidth = 1.5 / k;
        cx.stroke();
        cx.setLineDash([]);
      } else {
        cx.fillStyle = n.color;
        cx.fill();
        cx.lineWidth = (n.type === "file" ? 1.6 : 1) / k;
        cx.strokeStyle =
          n.type === "file" ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.35)";
        cx.stroke();
      }
      if (n.id === sel) {
        cx.globalAlpha = 1;
        shapePath(cx, n.shape, n.x, n.y, n.r + 3 / k);
        cx.lineWidth = 2.5 / k;
        cx.strokeStyle = T.ring;
        cx.stroke();
      } else if (n.id === hov) {
        cx.globalAlpha = 1;
        shapePath(cx, n.shape, n.x, n.y, n.r + 2 / k);
        cx.lineWidth = 1.8 / k;
        cx.strokeStyle = T.ring;
        cx.stroke();
      }
      if (n.fixed) {
        cx.globalAlpha = 1;
        cx.fillStyle = T.ring;
        cx.beginPath();
        cx.arc(n.x + n.r * 0.8, n.y - n.r * 0.8, 2.2 / k, 0, 6.2832);
        cx.fill();
      }
    }
    cx.globalAlpha = 1;
    // labels with simple collision avoidance
    const fs = 11.5;
    cx.font = fs / k + "px system-ui,Segoe UI,sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "top";
    cx.lineJoin = "round";
    const occ = [];
    const cand = [];
    for (const n of nodes) {
      if (n.x < vx0 || n.x > vx1 || n.y < vy0 || n.y > vy1) continue;
      const isHl = hl && hl.has(n.id),
        isSel = n.id === sel || n.id === hov;
      if (hl && !isHl) continue;
      if (searching && !searchHits.has(n.id)) continue;
      let show =
        S.labels === "all" ||
        isSel ||
        (S.labels === "auto" &&
          (n.r * k > 8 ||
            k > 1.25 ||
            (searching && searchHits.has(n.id)) ||
            (isHl && k > 0.45)));
      if (S.labels === "off" && !isSel) show = false;
      if (!show) continue;
      cand.push([isSel ? 3 : isHl ? 2 : 1, n.deg, n]);
    }
    cand.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let drawn = 0;
    for (const [pr, , n] of cand) {
      const text = clip(n.label, 34),
        w = cx.measureText(text).width,
        x = n.x - w / 2,
        y = n.y + n.r + 2 / k,
        h = fs / k + 2 / k;
      if (pr < 3 && S.labels !== "all") {
        if (drawn > 220) break;
        let hit = false;
        for (const o of occ)
          if (x < o[2] && x + w > o[0] && y < o[3] && y + h > o[1]) {
            hit = true;
            break;
          }
        if (hit) continue;
      }
      occ.push([x, y, x + w, y + h]);
      drawn++;
      cx.lineWidth = 3.2 / k;
      cx.strokeStyle = T.halo;
      cx.strokeText(text, n.x, y);
      cx.fillStyle = T.text;
      cx.fillText(text, n.x, y);
    }
    cx.restore();
  }
  function updateHud() {
    $("#hud").textContent =
      nodes.length +
      (S.view === "flow" && S.level === "folders"
        ? " folders · "
        : " nodes · ") +
      links.filter((l) => !l.hidden).length +
      " connections · zoom " +
      Math.round(view.k * 100) +
      "%" +
      (S.focus ? " · focus mode" : "") +
      (S.view === "flow"
        ? " · arrows go from a file to what it uses (left = entry points, right = foundations)"
        : "");
    renderFocusBar();
  }
  function loop() {
    requestAnimationFrame(loop);
    if (anim) {
      const t = Math.min(1, (performance.now() - anim.t0) / anim.dur),
        e = 1 - Math.pow(1 - t, 3);
      view.x = anim.x0 + (anim.x1 - anim.x0) * e;
      view.y = anim.y0 + (anim.y1 - anim.y0) * e;
      view.k = anim.k0 + (anim.k1 - anim.k0) * e;
      if (t >= 1) anim = null;
      needDraw = true;
      updateHud();
    }
    if (S.view === "graph" && sim.alpha > 0.004 && !S.paused && nodes.length) {
      const steps = nodes.length > 1800 ? 1 : 2;
      for (let i = 0; i < steps; i++) {
        simTick();
        sim.alpha *= 0.987;
      }
      needDraw = true;
    }
    if (needDraw) {
      needDraw = false;
      draw();
    }
  }
  function fitView(animate, only) {
    const ns = only || nodes;
    if (!ns.length || !W) {
      return;
    }
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1e9,
      y1 = -1e9;
    for (const n of ns) {
      const hw = n.w ? n.w / 2 : n.r,
        hh = n.h ? n.h / 2 : n.r;
      x0 = Math.min(x0, n.x - hw);
      y0 = Math.min(y0, n.y - hh);
      x1 = Math.max(x1, n.x + hw);
      y1 = Math.max(y1, n.y + hh + (n.w ? 0 : 14));
    }
    const pad = 60,
      k = Math.max(
        0.05,
        Math.min(
          S.view === "flow" ? 1.2 : 2.2,
          Math.min(
            (W - pad * 2) / Math.max(1, x1 - x0),
            (H - pad * 2) / Math.max(1, y1 - y0),
          ),
        ),
      );
    const t = {
      x: W / 2 - ((x0 + x1) / 2) * k,
      y: H / 2 - ((y0 + y1) / 2) * k,
      k,
    };
    if (animate === false) {
      Object.assign(view, t);
      needDraw = true;
      updateHud();
    } else
      anim = {
        t0: performance.now(),
        dur: 450,
        x0: view.x,
        y0: view.y,
        k0: view.k,
        x1: t.x,
        y1: t.y,
        k1: t.k,
      };
  }
  function centerOn(n, zoom) {
    const k = zoom || Math.max(view.k, 0.9);
    anim = {
      t0: performance.now(),
      dur: 450,
      x0: view.x,
      y0: view.y,
      k0: view.k,
      x1: W / 2 - n.x * k,
      y1: H / 2 - n.y * k,
      k1: k,
    };
  }

  /* ============================================================
   Flowchart view (layered diagram of files or folders)
   ============================================================ */
  function dirKeyOf(dir) {
    return dir ? dir.split("/").slice(0, S.flowDepth).join("/") : "";
  }
  function keyVisible(d) {
    if (d === "/") return S.dirVis.get("/") !== false;
    const p = d.split("/");
    for (let i = p.length; i >= 1; i--) {
      const v = S.dirVis.get(p.slice(0, i).join("/"));
      if (v !== undefined) return v;
    }
    return true;
  }
  function toggleDir(key) {
    const nv = !keyVisible(key);
    S.dirVis.set(key, nv);
    $$("#dirList [data-dir]").forEach((x) => {
      if (x.dataset.dir.startsWith(key + "/")) S.dirVis.set(x.dataset.dir, nv);
    });
  }
  function nodeFor(id) {
    if (!id) return null;
    if (nodeIdx.has(id)) return id;
    if (S.view !== "flow") return null;
    const f = fileOf(id);
    if (!f) return null;
    const k = S.level === "folders" ? "d:" + dirKeyOf(f.dir) : f.id;
    return nodeIdx.has(k) ? k : null;
  }
  function openPanelIfNarrow() {
    if (window.innerWidth <= 1040) document.body.classList.add("panelOpen");
  }
  function syncViewUi() {
    $$("#viewSeg button").forEach((b) =>
      b.classList.toggle("on", b.dataset.view === S.view),
    );
    $$("#levelSeg button").forEach((b) =>
      b.classList.toggle("on", b.dataset.level === S.level),
    );
    $("#modeSeg").hidden = S.view === "flow";
    $("#levelSeg").hidden = S.view !== "flow";
  }
  function syncView() {
    syncViewUi();
    if (!data) return;
    if (S.view === "graph") nodes = graphNodes || [];
    syncSidebar();
    rebuild({ fresh: S.view === "graph" && !graphNodes });
    fitView(false);
  }
  function setView(v) {
    if (v === S.view) return;
    if (S.view === "graph") graphNodes = nodes;
    S.view = v;
    if (v === "graph" && S.selected && S.selected[0] === "d") {
      S.selected = null;
      renderPanel();
    }
    syncView();
  }
  function buildDirEntities() {
    for (const k of [...byId.keys()]) if (k[0] === "d") byId.delete(k);
    const groups = new Map();
    for (const f of data.files) {
      const k = dirKeyOf(f.dir);
      (groups.get(k) || groups.set(k, []).get(k)).push(f);
    }
    for (const [k, fs] of groups) {
      const cats = {};
      let syms = 0,
        lines = 0;
      for (const f of fs) {
        cats[f.cat] = (cats[f.cat] || 0) + 1;
        syms += f.symbols.length;
        lines += f.lines;
      }
      const ranked = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      byId.set("d:" + k, {
        id: "d:" + k,
        key: k,
        name: k || "(root)",
        path: k,
        files: fs.map((f) => f.id),
        cats,
        cat: ranked[0][0],
        symbols: syms,
        lines,
        summarySource: "inferred",
        summary:
          "Folder with " +
          fs.length +
          " file" +
          (fs.length > 1 ? "s" : "") +
          " (" +
          ranked
            .slice(0, 3)
            .map(([c, n]) => n + " " + (CAT_NAMES[c] || c))
            .join(", ") +
          ") containing " +
          syms +
          " functions / symbols.",
      });
    }
  }
  function rebuildFlow() {
    buildDirEntities();
    const fileOk = (f) =>
      S.cats.has(f.cat) && !(S.hideTests && f.isTest) && !dirHidden(f.dir);
    const lvl = S.level,
      folders = lvl === "folders",
      hasFiles = lvl !== "functions",
      hasSyms = lvl === "functions" || lvl === "both",
      N = [],
      idx = new Map();
    const addN = (id, type, e) => {
      const n = {
        id,
        e,
        type,
        idx: N.length,
        deg: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      idx.set(id, n);
      N.push(n);
    };
    const mapId = (f) => (folders ? "d:" + dirKeyOf(f.dir) : f.id);
    if (folders) {
      const seen = new Set();
      for (const f of data.files)
        if (fileOk(f)) {
          const id = mapId(f);
          if (!seen.has(id)) {
            seen.add(id);
            addN(id, "dir", byId.get(id));
          }
        }
      N.sort((a, b) => (a.id < b.id ? -1 : 1));
      N.forEach((n, i) => (n.idx = i));
    } else if (hasFiles)
      for (const f of data.files) if (fileOk(f)) addN(f.id, "file", f);
    if (hasSyms)
      for (const s of data.symbols) {
        const sf = byId.get(s.file);
        if (fileOk(sf) && S.kinds.has(KIND_GROUP[s.kind])) addN(s.id, "sym", s);
      }
    const lk = new Map(),
      L = [];
    const pushLink = (a, b, r) => {
      const key = a + ">" + b;
      let l = lk.get(key);
      if (!l) {
        l = {
          s: idx.get(a),
          t: idx.get(b),
          type: r.type,
          rels: [],
          count: 0,
          types: new Map(),
        };
        lk.set(key, l);
        L.push(l);
      }
      l.rels.push(r);
      l.count += r.count;
      l.types.set(r.type, (l.types.get(r.type) || 0) + r.count);
    };
    for (const r of data.rels) {
      if (r.type === "contains" || !S.edgeTypes.has(r.type)) continue;
      if (hasSyms) {
        // function levels: connections are drawn between the exact functions / files involved
        const a = r.from,
          b = r.to;
        if (a === b) continue;
        if (
          b[0] === "x" &&
          lvl === "both" &&
          S.showExternals &&
          idx.has(a) &&
          !idx.has(b)
        )
          addN(b, "ext", byId.get(b));
        if (idx.has(a) && idx.has(b)) pushLink(a, b, r);
        continue;
      }
      const fa = fileOf(r.from);
      if (!fa || !fileOk(fa)) continue;
      let b;
      const tid = toFileId(r.to);
      if (tid && tid[0] === "x") {
        if (!S.showExternals) continue;
        b = tid;
        if (!idx.has(b)) addN(b, "ext", byId.get(b));
      } else {
        const fb = fileOf(r.to);
        if (!fb || !fileOk(fb)) continue;
        b = mapId(fb);
      }
      const a = mapId(fa);
      if (a === b || !idx.has(a) || !idx.has(b)) continue;
      pushLink(a, b, r);
    }
    // "Both": each file also points at the functions it contains
    if (lvl === "both" && S.edgeTypes.has("contains"))
      for (const n of N)
        if (n.type === "sym" && idx.has(n.e.file))
          pushLink(n.e.file, n.id, {
            from: n.e.file,
            to: n.id,
            type: "contains",
            count: 1,
            items: [],
          });
    for (const l of L)
      l.type = [...l.types.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const A = new Map();
    const link = (x, y) => (A.get(x) || A.set(x, new Set()).get(x)).add(y);
    for (const l of L) {
      link(l.s.id, l.t.id);
      link(l.t.id, l.s.id);
    }
    let selId = null;
    {
      const id = S.selected;
      if (id) {
        if (idx.has(id)) selId = id;
        else {
          const f = fileOf(id);
          if (f) {
            const k = mapId(f);
            if (idx.has(k)) selId = k;
          }
        }
      }
    }
    let keep = N;
    if (S.hideIsolated) keep = N.filter((n) => A.has(n.id) || n.id === selId);
    if (S.focus && selId) {
      const seen = new Set([selId]);
      let fr = [selId];
      for (let d = 0; d < S.focusDepth; d++) {
        const nx = [];
        for (const id of fr)
          for (const w of A.get(id) || [])
            if (!seen.has(w)) {
              seen.add(w);
              nx.push(w);
            }
        fr = nx;
      }
      keep = keep.filter((n) => seen.has(n.id));
    }
    const ks = new Set(keep.map((n) => n.id)),
      L2 = L.filter((l) => ks.has(l.s.id) && ks.has(l.t.id));
    nodes = keep;
    nodes.forEach((n, i) => (n.idx = i));
    nodeIdx = new Map(nodes.map((n) => [n.id, n]));
    adj = new Map();
    for (const l of L2) {
      l.s.deg++;
      l.t.deg++;
      (adj.get(l.s.id) || adj.set(l.s.id, new Set()).get(l.s.id)).add(l.t.id);
      (adj.get(l.t.id) || adj.set(l.t.id, new Set()).get(l.t.id)).add(l.s.id);
    }
    links = L2;
    for (const n of nodes) {
      n.color = colorOf(n.e);
      n.label = labelOf(n.e);
    }
    layoutFlow();
    searchHits = computeSearchHits();
    sim.alpha = 0;
    updateHud();
    needDraw = true;
  }
  function layoutFlow() {
    const N = nodes.length;
    flowNotes = [];
    if (!N) return;
    const F1 = "600 13px system-ui,Segoe UI,sans-serif",
      F2 = "11px system-ui,Segoe UI,sans-serif";
    const clipW = (txt, mx) => {
      if (cx.measureText(txt).width <= mx) return txt;
      let s = txt;
      while (s.length > 4 && cx.measureText(s + "…").width > mx)
        s = s.slice(0, -1);
      return s + "…";
    };
    for (const n of nodes) {
      const e = n.e;
      cx.font = F1;
      n.lbl = clipW(n.label, 250);
      cx.font = F2;
      n.sub = clipW(
        n.type === "dir"
          ? e.files.length +
              " file" +
              (e.files.length > 1 ? "s" : "") +
              " · " +
              e.symbols +
              " symbols"
          : n.type === "file"
            ? e.dir || "(root)"
            : n.type === "sym"
              ? ((byId.get(e.file) || {}).name || "") +
                " · " +
                (KIND_LABEL[e.kind] || e.kind)
              : e.kind,
        250,
      );
      cx.font = F1;
      const w1 = cx.measureText(n.lbl).width;
      cx.font = F2;
      n.w0 = Math.max(w1, cx.measureText(n.sub).width) + 34;
      n.h = 46;
      n.w = 0;
    }
    const out = nodes.map(() => []),
      inn = nodes.map(() => []);
    for (const l of links) {
      out[l.s.idx].push(l.t.idx);
      inn[l.t.idx].push(l.s.idx);
    }
    // Break cycles with the Eades-Lin-Smyth ordering: sources go first (left), sinks last (right), edges pointing "backwards" are the ones we reverse
    const outL = out.map((x) => x.length),
      inL = inn.map((x) => x.length),
      gone = new Uint8Array(N),
      front = [],
      backL = [];
    let left = N;
    const drop = (v) => {
      gone[v] = 1;
      left--;
      for (const w of out[v]) if (!gone[w]) inL[w]--;
      for (const w of inn[v]) if (!gone[w]) outL[w]--;
    };
    while (left > 0) {
      let moved = true;
      while (moved) {
        moved = false;
        for (let v = 0; v < N; v++)
          if (!gone[v] && outL[v] === 0) {
            backL.push(v);
            drop(v);
            moved = true;
          }
        for (let v = 0; v < N; v++)
          if (!gone[v] && inL[v] === 0) {
            front.push(v);
            drop(v);
            moved = true;
          }
      }
      if (left > 0) {
        let best = -1,
          bv = -1e9;
        for (let v = 0; v < N; v++)
          if (!gone[v] && outL[v] - inL[v] > bv) {
            bv = outL[v] - inL[v];
            best = v;
          }
        front.push(best);
        drop(best);
      }
    }
    const order = front.concat(backL.reverse()),
      posn = new Int32Array(N);
    order.forEach((v, i) => (posn[v] = i));
    const back = new Set();
    for (let v = 0; v < N; v++)
      for (const w of out[v]) if (posn[v] > posn[w]) back.add(v * N + w);
    const indeg = new Int32Array(N),
      fwd = nodes.map(() => []);
    for (let v = 0; v < N; v++)
      for (const w of out[v])
        if (!back.has(v * N + w)) {
          fwd[v].push(w);
          indeg[w]++;
        }
    const rank = new Int32Array(N),
      q = [];
    for (let v = 0; v < N; v++) if (!indeg[v]) q.push(v);
    for (let qi = 0; qi < q.length; qi++) {
      const v = q[qi];
      for (const w of fwd[v]) {
        if (rank[w] < rank[v] + 1) rank[w] = rank[v] + 1;
        if (--indeg[w] === 0) q.push(w);
      }
    }
    {
      // very deep dependency chains would make the diagram absurdly wide: squeeze the columns proportionally
      let maxR = 0;
      for (let v = 0; v < N; v++) maxR = Math.max(maxR, rank[v]);
      const R = Math.max(8, Math.ceil(Math.sqrt(N) * 1.1));
      if (maxR + 1 > R)
        for (let v = 0; v < N; v++)
          rank[v] = Math.floor((rank[v] * (R - 1)) / maxR);
    }
    for (let v = 0; v < N; v++)
      if (!inn[v].length && fwd[v].length)
        rank[v] = Math.max(0, Math.min(...fwd[v].map((w) => rank[w])) - 1);
    const iso = [],
      layers = [];
    for (let v = 0; v < N; v++) {
      if (!out[v].length && !inn[v].length) {
        iso.push(v);
        continue;
      }
      (layers[rank[v]] = layers[rank[v]] || []).push(v);
    }
    for (let i = 0; i < layers.length; i++) layers[i] = layers[i] || [];
    const keyOf = (v) => {
      const e = nodes[v].e;
      return (
        e.path ||
        (e.file
          ? ((byId.get(e.file) || {}).path || "") +
            ":" +
            String(e.line || 0).padStart(6, "0")
          : nodes[v].label) ||
        ""
      );
    };
    layers.forEach((Ls) => Ls.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1)));
    const pos = new Float64Array(N);
    const setPos = (Ls) =>
      Ls.forEach(
        (v, i) => (pos[v] = Ls.length > 1 ? i / (Ls.length - 1) : 0.5),
      );
    layers.forEach(setPos);
    for (let it = 0; it < 6; it++) {
      const down = it % 2 === 0,
        order = layers.map((_, i) => (down ? i : layers.length - 1 - i));
      for (const li of order) {
        const Ls = layers[li];
        if (Ls.length < 2) continue;
        const bary = new Map();
        for (const v of Ls) {
          let nb = (down ? inn[v] : out[v]).filter((w) => rank[w] !== li);
          if (!nb.length)
            nb = (down ? out[v] : inn[v]).filter((w) => rank[w] !== li);
          bary.set(
            v,
            nb.length ? nb.reduce((s, w) => s + pos[w], 0) / nb.length : pos[v],
          );
        }
        Ls.sort(
          (a, b) => bary.get(a) - bary.get(b) || (keyOf(a) < keyOf(b) ? -1 : 1),
        );
        setPos(Ls);
      }
    }
    const gapY = 18,
      gapX = 150;
    let xp = 0,
      maxY = 0;
    layers.forEach((Ls) => {
      const w = Math.min(300, Math.max(150, ...Ls.map((v) => nodes[v].w0))),
        total = Ls.length * (46 + gapY) - gapY;
      Ls.forEach((v, i) => {
        const n = nodes[v];
        n.w = w;
        n.x = xp + w / 2;
        n.y = i * (46 + gapY) - total / 2 + 23;
        maxY = Math.max(maxY, n.y + 23);
      });
      xp += w + gapX;
    });
    if (iso.length) {
      const cols = Math.max(
          1,
          Math.min(6, Math.ceil(Math.sqrt(iso.length * 1.6))),
        ),
        cw = 210,
        ch = 58,
        y0 = layers.length ? maxY + 110 : 0;
      flowNotes.push({
        x: 0,
        y: y0 - 34,
        text: "Not connected to anything shown (" + iso.length + ")",
      });
      iso.forEach((v, i) => {
        const n = nodes[v];
        n.w = cw - 16;
        n.x = (i % cols) * cw + n.w / 2;
        n.y = y0 + Math.floor(i / cols) * ch + 23;
      });
    }
  }
  function flowCurve(l) {
    const s = l.s,
      t = l.t,
      x0 = s.x + s.w / 2,
      y0 = s.y,
      x3 = t.x - t.w / 2,
      y3 = t.y;
    const dx =
      x3 < x0 + 10
        ? Math.max(90, Math.abs(x3 - x0) * 0.35 + 60)
        : Math.max(50, Math.abs(x3 - x0) * 0.5);
    return [x0, y0, x0 + dx, y0, x3 - dx, y3, x3, y3];
  }
  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function drawFlow(T) {
    cx.save();
    cx.translate(view.x, view.y);
    cx.scale(view.k, view.k);
    const k = view.k,
      sel = nodeFor(S.selected),
      hov = S.hover,
      focusId = hov || sel;
    const hl = focusId ? new Set([focusId, ...(adj.get(focusId) || [])]) : null;
    const searching =
      (searchHits && searchHits.size > 0) ||
      (S.search && searchHits && searchHits.size === 0);
    const vx0 = -view.x / k - 300,
      vy0 = -view.y / k - 100,
      vx1 = (W - view.x) / k + 300,
      vy1 = (H - view.y) / k + 100;
    const lw = 1 / Math.min(1, Math.max(0.45, k)),
      baseA = links.length > 400 ? 0.16 : links.length > 150 ? 0.3 : 0.55;
    for (const l of links) {
      const s = l.s,
        t = l.t;
      if (
        (s.x < vx0 && t.x < vx0) ||
        (s.x > vx1 && t.x > vx1) ||
        (s.y < vy0 && t.y < vy0) ||
        (s.y > vy1 && t.y > vy1)
      )
        continue;
      const on = hl && (s.id === focusId || t.id === focusId),
        selEdge = S.selectedEdge === l;
      let alpha = hl ? (on ? 0.95 : 0.06) : baseA;
      if (searching)
        alpha = Math.min(
          alpha,
          searchHits.has(s.id) && searchHits.has(t.id) ? alpha : 0.06,
        );
      if (selEdge || S.hoverEdge === l) alpha = 1;
      const c = flowCurve(l),
        col = EDGE[l.type].c;
      cx.globalAlpha = alpha;
      cx.strokeStyle = col;
      cx.lineWidth =
        (selEdge ? 3.4 : 1.3 + Math.min(3, Math.log2(l.count + 1) * 0.5)) * lw;
      cx.beginPath();
      cx.moveTo(c[0], c[1]);
      cx.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
      cx.stroke();
      const ang = Math.atan2(c[7] - c[5], c[6] - c[4]),
        sz = 9 * lw;
      cx.fillStyle = col;
      cx.beginPath();
      cx.moveTo(c[6], c[7]);
      cx.lineTo(
        c[6] - Math.cos(ang - 0.45) * sz,
        c[7] - Math.sin(ang - 0.45) * sz,
      );
      cx.lineTo(
        c[6] - Math.cos(ang + 0.45) * sz,
        c[7] - Math.sin(ang + 0.45) * sz,
      );
      cx.closePath();
      cx.fill();
      if (l.count > 1 && (on || k > 0.75)) {
        const mx = (c[0] + 3 * c[2] + 3 * c[4] + c[6]) / 8,
          my = (c[1] + 3 * c[3] + 3 * c[5] + c[7]) / 8,
          txt = String(l.count);
        cx.font = "600 " + 10.5 + "px system-ui";
        const tw = cx.measureText(txt).width + 8;
        cx.globalAlpha = Math.min(1, alpha + 0.2);
        cx.fillStyle = T.card;
        rrect(cx, mx - tw / 2, my - 8, tw, 16, 8);
        cx.fill();
        cx.lineWidth = 1;
        cx.strokeStyle = col;
        cx.stroke();
        cx.fillStyle = T.text;
        cx.textAlign = "center";
        cx.textBaseline = "middle";
        cx.fillText(txt, mx, my + 0.5);
      }
    }
    cx.globalAlpha = 1;
    cx.textAlign = "left";
    cx.textBaseline = "middle";
    for (const n of nodes) {
      if (
        n.x + n.w / 2 < vx0 ||
        n.x - n.w / 2 > vx1 ||
        n.y + 30 < vy0 ||
        n.y - 30 > vy1
      )
        continue;
      let alpha = 1;
      if (hl && !hl.has(n.id)) alpha = 0.16;
      if (searching && !searchHits.has(n.id)) alpha = Math.min(alpha, 0.16);
      cx.globalAlpha = alpha;
      const x = n.x - n.w / 2,
        y = n.y - n.h / 2;
      rrect(cx, x, y, n.w, n.h, 9);
      cx.fillStyle = T.card;
      cx.fill();
      if (n.type === "ext") cx.setLineDash([5, 3]);
      cx.lineWidth = n.id === sel ? 2.8 : n.id === hov ? 2.2 : 1.3;
      cx.strokeStyle =
        n.id === sel ? T.ring : n.id === hov ? n.color : T.cardBorder;
      cx.stroke();
      cx.setLineDash([]);
      cx.save();
      rrect(cx, x, y, n.w, n.h, 9);
      cx.clip();
      cx.fillStyle = n.color;
      cx.fillRect(x, y, n.type === "dir" ? 10 : 7, n.h);
      cx.restore();
      cx.fillStyle = T.text;
      cx.font = "600 13px system-ui,Segoe UI,sans-serif";
      cx.fillText(n.lbl, x + 18, n.y - 7);
      cx.fillStyle = T.muted;
      cx.font = "11px system-ui,Segoe UI,sans-serif";
      cx.fillText(n.sub, x + 18, n.y + 10);
    }
    cx.globalAlpha = 1;
    for (const nt of flowNotes) {
      cx.fillStyle = T.muted;
      cx.font = "600 14px system-ui,Segoe UI,sans-serif";
      cx.textAlign = "left";
      cx.textBaseline = "alphabetic";
      cx.fillText(nt.text, nt.x, nt.y);
    }
    cx.restore();
  }
  function dirConnections(d) {
    const fset = new Set(d.files),
      own = [];
    d.files.forEach((fid) => {
      own.push(fid);
      byId.get(fid).symbols.forEach((s) => own.push(s));
    });
    const out = new Map(),
      inn = new Map();
    const put = (m, key, rel) => {
      let o = m.get(key);
      if (!o) m.set(key, (o = { id: key, types: new Map(), rels: [] }));
      o.types.set(rel.type, (o.types.get(rel.type) || 0) + rel.count);
      o.rels.push(rel);
    };
    for (const id of own) {
      for (const r of relOut.get(id) || []) {
        if (r.type === "contains") continue;
        const t = toFileId(r.to);
        if (!t) continue;
        if (t[0] === "x") {
          put(out, t, r);
          continue;
        }
        if (fset.has(t)) continue;
        put(out, "d:" + dirKeyOf(byId.get(t).dir), r);
      }
      for (const r of relIn.get(id) || []) {
        const s = toFileId(r.from);
        if (!s || s[0] === "x" || fset.has(s)) continue;
        put(inn, "d:" + dirKeyOf(byId.get(s).dir), r);
      }
    }
    const byN = (a, b) => b.rels.length - a.rels.length;
    return {
      out: [...out.values()].sort(byN),
      inn: [...inn.values()].sort(byN),
    };
  }
  function panelDir(d) {
    const conn = dirConnections(d),
      files = d.files
        .map((id) => byId.get(id))
        .sort((a, b) => (a.path < b.path ? -1 : 1));
    const cats = Object.entries(d.cats).sort((a, b) => b[1] - a[1]),
      max = cats[0] ? cats[0][1] : 1;
    const deg = (f) =>
      [f.id, ...f.symbols].reduce(
        (n, id) =>
          n + (relOut.get(id) || []).length + (relIn.get(id) || []).length,
        0,
      );
    const top = files
      .slice()
      .sort((a, b) => deg(b) - deg(a))
      .slice(0, 3)
      .filter((f) => deg(f) > 0);
    let h =
      '<div class="ph"><div class="ttl"><span class="dot" style="background:' +
      colorOf(d) +
      '"></span>📁 ' +
      esc(d.name) +
      "</div>" +
      (d.path ? '<div class="path">' + esc(d.path) + "/</div>" : "");
    h +=
      '<div class="badges">' +
      badge("folder", "k") +
      badge(d.files.length + " files") +
      badge(d.symbols + " symbols") +
      badge(d.lines + " lines") +
      "</div>";
    h +=
      '<div class="acts"><button class="btn" data-act="focus">⌖ Focus neighbourhood</button></div></div>';
    h += sec(
      "What this folder holds",
      '<div class="sum"><span class="src inf">● inferred from its files</span><div>' +
        esc(d.summary) +
        (top.length
          ? " Most connected: " + esc(top.map((f) => f.name).join(", ")) + "."
          : "") +
        "</div></div>",
    );
    h += sec(
      "Languages",
      cats
        .map(
          ([c, n]) =>
            '<div class="ibar"><span class="lb">' +
            esc(CAT_NAMES[c] || c) +
            '</span><span class="bar" style="width:' +
            Math.max(6, (n / max) * 150) +
            "px;background:" +
            (CAT_COLORS[c] || "#64748b") +
            '"></span><span class="v">' +
            n +
            "</span></div>",
        )
        .join(""),
    );
    h += sec(
      "Depends on",
      conn.out.length
        ? conn.out.map(connRow).join("")
        : '<div class="empty-note">Nothing outside this folder.</div>',
      conn.out.length,
    );
    h += sec(
      "Used by",
      conn.inn.length
        ? conn.inn.map(connRow).join("")
        : '<div class="empty-note">Nothing outside this folder uses it.</div>',
      conn.inn.length,
    );
    h += sec(
      "Files in this folder",
      files
        .map(
          (f) =>
            '<div class="row sym" data-go="' +
            f.id +
            '"><span class="dot" style="background:' +
            colorOf(f) +
            '"></span><span class="nm">' +
            esc(f.name) +
            '</span><span class="meta">' +
            esc(f.lang) +
            " · " +
            f.lines +
            ' lines</span><div class="sdesc">' +
            esc(clip(f.summary || "", 140)) +
            "</div></div>",
        )
        .join(""),
      files.length,
    );
    return h;
  }

  /* ---------- interaction ---------- */
  const toWorld = (sx, sy) => [(sx - view.x) / view.k, (sy - view.y) / view.k];
  function hitNode(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    const pad = 4 / view.k;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.w) {
        if (
          Math.abs(wx - n.x) <= n.w / 2 + pad &&
          Math.abs(wy - n.y) <= n.h / 2 + pad
        )
          return n;
        continue;
      }
      const r =
        n.r * (n.shape === "round" || n.shape === "diamond" ? 1.4 : 1.1) + pad;
      if ((n.x - wx) ** 2 + (n.y - wy) ** 2 <= r * r) return n;
    }
    return null;
  }
  function hitEdge(sx, sy) {
    const [wx, wy] = toWorld(sx, sy),
      tol = 5 / view.k;
    let best = null,
      bd = tol;
    if (S.view === "flow") {
      for (const l of links) {
        const c = flowCurve(l);
        for (let i = 0; i <= 14; i++) {
          const u = i / 14,
            v = 1 - u;
          const x =
              v * v * v * c[0] +
              3 * v * v * u * c[2] +
              3 * v * u * u * c[4] +
              u * u * u * c[6],
            y =
              v * v * v * c[1] +
              3 * v * v * u * c[3] +
              3 * v * u * u * c[5] +
              u * u * u * c[7];
          const d = Math.hypot(wx - x, wy - y);
          if (d < bd) {
            bd = d;
            best = l;
          }
        }
      }
      return best;
    }
    for (const l of links) {
      if (l.hidden) continue;
      const ax = l.s.x,
        ay = l.s.y,
        bx = l.t.x,
        by = l.t.y,
        dx = bx - ax,
        dy = by - ay,
        len2 = dx * dx + dy * dy;
      let t = len2 ? ((wx - ax) * dx + (wy - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(wx - (ax + t * dx), wy - (ay + t * dy));
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }
  let drag = null,
    tipTimer = 0;
  cv.addEventListener("pointerdown", (e) => {
    document.body.classList.remove("sideOpen");
    cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect(),
      sx = e.clientX - r.left,
      sy = e.clientY - r.top,
      n = hitNode(sx, sy);
    drag = { n, sx, sy, vx: view.x, vy: view.y, moved: false, id: e.pointerId };
    if (n) {
      n.dragging = true;
    }
    cv.classList.add("drag");
  });
  cv.addEventListener("pointermove", (e) => {
    const r = cv.getBoundingClientRect(),
      sx = e.clientX - r.left,
      sy = e.clientY - r.top;
    if (drag) {
      const dx = sx - drag.sx,
        dy = sy - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 3) drag.moved = true;
      if (drag.moved) {
        if (drag.n) {
          const [wx, wy] = toWorld(sx, sy);
          drag.n.x = wx;
          drag.n.y = wy;
          drag.n.vx = drag.n.vy = 0;
          if (S.view === "graph") sim.alpha = Math.max(sim.alpha, 0.25);
        } else {
          view.x = drag.vx + dx;
          view.y = drag.vy + dy;
          updateHud();
        }
        needDraw = true;
        hideTip();
      }
      return;
    }
    const n = hitNode(sx, sy);
    let he = null;
    if (!n) he = hitEdge(sx, sy);
    const nid = n ? n.id : null;
    if (nid !== S.hover || he !== S.hoverEdge) {
      S.hover = nid;
      S.hoverEdge = he;
      needDraw = true;
    }
    cv.classList.toggle("pointer", !!(n || he));
    if (n) showTip(e.clientX, e.clientY, tipNode(n));
    else if (he) showTip(e.clientX, e.clientY, tipEdge(he));
    else hideTip();
  });
  cv.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    cv.classList.remove("drag");
    if (d.n) {
      d.n.dragging = false;
      if (d.moved && S.view === "graph") {
        d.n.fixed = true;
        pinned.add(d.n.id);
      }
    }
    if (!d.moved) {
      const r = cv.getBoundingClientRect(),
        sx = e.clientX - r.left,
        sy = e.clientY - r.top,
        n = hitNode(sx, sy);
      if (n) select(n.id);
      else {
        const he = hitEdge(sx, sy);
        if (he) {
          S.selectedEdge = he;
          S.selected = null;
          renderPanel();
          openPanelIfNarrow();
          needDraw = true;
        } else {
          clearSelection();
        }
      }
    }
  });
  cv.addEventListener("pointerleave", () => {
    if (!drag) {
      S.hover = null;
      S.hoverEdge = null;
      hideTip();
      needDraw = true;
    }
  });
  cv.addEventListener("dblclick", (e) => {
    const r = cv.getBoundingClientRect(),
      n = hitNode(e.clientX - r.left, e.clientY - r.top);
    if (n) {
      select(n.id, { noCenter: true });
      setFocus(!S.focus || S.selected !== n.id ? true : false);
    } else if (S.focus) setFocus(false);
  });
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(),
        sx = e.clientX - r.left,
        sy = e.clientY - r.top;
      anim = null;
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)),
        nk = Math.max(0.04, Math.min(6, view.k * f)),
        [wx, wy] = toWorld(sx, sy);
      view.k = nk;
      view.x = sx - wx * nk;
      view.y = sy - wy * nk;
      needDraw = true;
      updateHud();
    },
    { passive: false },
  );
  function tipNode(n) {
    const e = n.e;
    let h = "<b>" + esc(n.label) + '</b><div class="sub">';
    if (n.type === "dir")
      h += e.files.length + " files · " + e.symbols + " symbols";
    else if (n.type === "file") h += esc(e.lang) + " · " + e.lines + " lines";
    else if (n.type === "sym")
      h +=
        esc(KIND_LABEL[e.kind] || e.kind) +
        " · " +
        esc((byId.get(e.file) || {}).name) +
        ":" +
        e.line;
    else h += esc(e.kind) + " dependency";
    h += " · " + n.deg + " links</div>";
    if (e.summary)
      h += '<div class="tsum">' + esc(clip(e.summary, 170)) + "</div>";
    return h;
  }
  function tipEdge(l) {
    let h =
      "<b>" +
      esc(EDGE[l.type].l) +
      '</b><div class="sub">' +
      esc(labelOf(l.s.e)) +
      " → " +
      esc(labelOf(l.t.e)) +
      " · " +
      l.count +
      "×</div>";
    const items = edgeItems(l).slice(0, 4);
    if (items.length)
      h += '<div class="tsum">' + items.map(esc).join("<br>") + "</div>";
    return h;
  }
  function showTip(x, y, html) {
    const t = $("#tooltip");
    t.innerHTML = html;
    t.hidden = false;
    const r = stage.getBoundingClientRect();
    let lx = x - r.left + 14,
      ly = y - r.top + 14;
    if (lx + 350 > r.width) lx = x - r.left - 350;
    if (ly + t.offsetHeight > r.height) ly = y - r.top - t.offsetHeight - 10;
    t.style.left = Math.max(4, lx) + "px";
    t.style.top = Math.max(4, ly) + "px";
  }
  function hideTip() {
    $("#tooltip").hidden = true;
  }

  /* ---------- selection / navigation ---------- */
  function select(id, o) {
    o = o || {};
    S.selected = id;
    S.selectedEdge = null;
    if (S.focus) rebuild({});
    needDraw = true;
    renderPanel();
    openPanelIfNarrow();
    const n = nodeIdx.get(nodeFor(id) || id);
    if (n && !o.noCenter && !S.focus) {
      const [sx, sy] = [n.x * view.k + view.x, n.y * view.k + view.y];
      if (sx < 40 || sy < 40 || sx > W - 40 || sy > H - 40) centerOn(n, view.k);
    }
    if (n && S.focus && !o.noCenter) fitView(true);
    if (location.hash && !/^#?$/.test(location.hash))
      history.replaceState(null, "", "#sel=" + id + "&mode=" + S.mode);
  }
  function clearSelection() {
    document.body.classList.remove("panelOpen");
    S.selected = null;
    S.selectedEdge = null;
    if (S.focus) {
      S.focus = false;
      rebuild({});
    }
    needDraw = true;
    renderPanel();
    updateHud();
  }
  function setFocus(on) {
    S.focus = on && !!S.selected;
    rebuild({});
    if (S.focus) fitView(true);
    updateHud();
    renderPanel();
  }
  function renderFocusBar() {
    let b = $("#focusBar");
    if (!S.focus || !S.selected) {
      if (b) b.remove();
      return;
    }
    if (!b) {
      b = document.createElement("div");
      b.id = "focusBar";
      b.style.cssText =
        "position:absolute;top:10px;left:50%;transform:translateX(-50%);background:var(--panel);border:1px solid var(--accent);border-radius:999px;padding:4px 6px 4px 14px;display:flex;gap:8px;align-items:center;z-index:10;box-shadow:var(--shadow)";
      stage.appendChild(b);
    }
    b.innerHTML =
      "<span>Focus: <b>" +
      esc(labelOf(byId.get(S.selected))) +
      '</b></span><span class="sub">depth</span>' +
      [1, 2, 3]
        .map(
          (d) =>
            '<button class="btn' +
            (S.focusDepth === d ? " on" : "") +
            '" data-fd="' +
            d +
            '" style="padding:1px 9px">' +
            d +
            "</button>",
        )
        .join("") +
      '<button class="btn" data-fd="0" style="padding:1px 10px">✕ show all</button>';
    b.onclick = (e) => {
      const t = e.target.closest("[data-fd]");
      if (!t) return;
      const d = +t.dataset.fd;
      if (!d) setFocus(false);
      else {
        S.focusDepth = d;
        rebuild({});
        fitView(true);
      }
    };
  }
  function goTo(id) {
    const e = byId.get(id);
    if (!e) return;
    if (id[0] === "d" && (S.view !== "flow" || S.level !== "folders")) {
      S.level = "folders";
      if (S.view !== "flow") setView("flow");
      else syncView();
    }
    if (S.view === "graph" && id[0] === "s") {
      if (S.mode === "files") {
        S.mode = "both";
        syncMode();
      }
      S.kinds.add(KIND_GROUP[e.kind]);
    }
    if (S.view === "flow" && id[0] === "s") {
      S.kinds.add(KIND_GROUP[e.kind]);
      if (S.level === "files" || S.level === "folders") {
        S.level = "both";
        syncViewUi();
        rebuild({});
        syncSidebar();
      }
    }
    if (id[0] === "x") S.showExternals = true;
    const f = fileOf(id);
    if (f) {
      S.cats.add(f.cat);
      const pp = f.dir ? f.dir.split("/") : [];
      if (!pp.length) S.dirVis.delete("/");
      else
        for (let i = 1; i <= Math.min(2, pp.length); i++)
          S.dirVis.delete(pp.slice(0, i).join("/"));
    }
    if (S.hideTests && f && f.isTest) S.hideTests = false;
    if (
      !nodeFor(id) ||
      (S.view === "graph" && S.mode === "files" && id[0] === "s")
    ) {
      rebuild({});
      syncSidebar();
    }
    select(id, { noCenter: true });
    const n = nodeIdx.get(nodeFor(id) || id);
    if (n) centerOn(n, Math.max(view.k, S.view === "flow" ? 0.8 : 1));
  }
  function syncMode() {
    $$("#modeSeg button").forEach((b) =>
      b.classList.toggle("on", b.dataset.mode === S.mode),
    );
  }

  /* ---------- search ---------- */
  function computeSearchHits() {
    const q = S.search.trim().toLowerCase();
    if (!q) return null;
    const hits = new Set();
    for (const n of nodes) {
      const e = n.e;
      if (
        n.label.toLowerCase().includes(q) ||
        (n.type === "file" && e.path.toLowerCase().includes(q)) ||
        (n.type === "sym" && (e.signature || "").toLowerCase().includes(q))
      )
        hits.add(n.id);
    }
    return hits;
  }
  function searchResults(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    const score = (name, extra) => {
      const n = name.toLowerCase();
      if (n === q) return 0;
      if (n.startsWith(q)) return 1;
      if (n.includes(q)) return 2;
      if (extra && extra.toLowerCase().includes(q)) return 3;
      return -1;
    };
    for (const f of data.files) {
      const s = score(f.name, f.path);
      if (s >= 0) out.push([s, "file", f]);
    }
    for (const s of data.symbols) {
      const sc = score(s.label, s.signature);
      if (sc >= 0) out.push([sc + 0.5, "sym", s]);
    }
    for (const x of data.externals) {
      const sc = score(x.name);
      if (sc >= 0) out.push([sc + 1, "ext", x]);
    }
    return out.sort((a, b) => a[0] - b[0]).slice(0, 14);
  }

  /* ============================================================
   Sidebar
   ============================================================ */
  function shapeSvg(shape, color, size) {
    size = size || 14;
    const r = size / 2 - 1.5,
      c = size / 2;
    let d;
    switch (shape) {
      case "square":
        d =
          '<rect x="2" y="2" width="' +
          (size - 4) +
          '" height="' +
          (size - 4) +
          '"/>';
        break;
      case "diamond":
        d =
          '<polygon points="' +
          c +
          ",1 " +
          (size - 1) +
          "," +
          c +
          " " +
          c +
          "," +
          (size - 1) +
          " 1," +
          c +
          '"/>';
        break;
      case "triangle":
        d =
          '<polygon points="' +
          c +
          ",1.5 " +
          (size - 1.5) +
          "," +
          (size - 2) +
          " 1.5," +
          (size - 2) +
          '"/>';
        break;
      case "hex":
        d =
          '<polygon points="' +
          [0, 1, 2, 3, 4, 5]
            .map(
              (i) =>
                (
                  c +
                  Math.cos((Math.PI / 3) * i + Math.PI / 6) * r * 1.1
                ).toFixed(1) +
                "," +
                (
                  c +
                  Math.sin((Math.PI / 3) * i + Math.PI / 6) * r * 1.1
                ).toFixed(1),
            )
            .join(" ") +
          '"/>';
        break;
      case "round":
        d =
          '<rect x="0.5" y="3" width="' +
          (size - 1) +
          '" height="' +
          (size - 6) +
          '" rx="3"/>';
        break;
      default:
        d = '<circle cx="' + c + '" cy="' + c + '" r="' + r + '"/>';
    }
    return (
      '<svg width="' +
      size +
      '" height="' +
      size +
      '" fill="' +
      color +
      '">' +
      d +
      "</svg>"
    );
  }
  function buildSidebar() {
    const m = data.meta,
      sb = $("#sidebar");
    const cats = Object.keys(m.langCounts).sort(
      (a, b) => m.langCounts[b] - m.langCounts[a],
    );
    const dirs = new Map();
    let rootFiles = 0;
    for (const f of data.files) {
      if (!f.dir) {
        rootFiles++;
        continue;
      }
      const p = f.dir.split("/");
      for (let d = 1; d <= Math.min(2, p.length); d++) {
        const k = p.slice(0, d).join("/");
        dirs.set(k, (dirs.get(k) || 0) + 1);
      }
    }
    const segCmp = (x, y) => {
      const a = x.split("/"),
        b = y.split("/");
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) return a[i].localeCompare(b[i]);
      }
      return a.length - b.length;
    };
    const dirList = [...dirs.entries()].sort((a, b) => segCmp(a[0], b[0]));
    const kindCounts = {};
    for (const s of data.symbols)
      kindCounts[KIND_GROUP[s.kind]] =
        (kindCounts[KIND_GROUP[s.kind]] || 0) + 1;
    const edgeCounts = {};
    for (const r of data.rels)
      edgeCounts[r.type] = (edgeCounts[r.type] || 0) + r.count;
    sb.innerHTML = `
  <details class="sec" open><summary>Project</summary><div class="body">
    <div class="sub" style="margin-bottom:6px;word-break:break-all"><b style="color:var(--text)">${esc(data.root || "project")}</b></div>
    <div class="stat"><div><b>${m.fileCount}</b><span>files</span></div><div><b>${m.symbolCount}</b><span>symbols</span></div><div><b>${m.relCount}</b><span>links</span></div></div>
    ${m.frameworks.length ? '<div class="sub" style="margin-top:4px">Detected: ' + m.frameworks.map(esc).join(", ") + "</div>" : ""}
    ${data.skipped && data.skipped.length ? '<div class="warnbox">' + data.skipped.length + " file(s) skipped (too large)</div>" : ""}
  </div></details>
  <details class="sec" open><summary>Languages <span class="chips-act"><button class="linkbtn" data-act="cats-all">all</button> · <button class="linkbtn" data-act="cats-none">none</button></span></summary><div class="body"><div class="chips">
    ${cats.map((c) => `<span class="chip on" data-cat="${esc(c)}"><i class="dot" style="background:${CAT_COLORS[c] || "#64748b"}"></i>${esc(CAT_NAMES[c] || c)} <span class="ct">${m.langCounts[c]}</span></span>`).join("")}
  </div></div></details>
  <details class="sec" open><summary>Connections shown <span class="chips-act"><button class="linkbtn" data-act="ets-all">all</button> · <button class="linkbtn" data-act="ets-none">none</button></span></summary><div class="body"><div class="chips">
    ${Object.keys(EDGE)
      .map(
        (t) =>
          `<span class="chip on" data-et="${t}" title="${esc(EDGE[t].l)}"><i class="ln" style="background:${EDGE[t].c}"></i>${esc(EDGE[t].l)}${edgeCounts[t] ? ' <span class="ct">' + edgeCounts[t] + "</span>" : ""}</span>`,
      )
      .join("")}
  </div></div></details>
  <details class="sec"><summary>Symbol kinds <span class="chips-act"><button class="linkbtn" data-act="kinds-all">all</button> · <button class="linkbtn" data-act="kinds-none">none</button></span></summary><div class="body"><div class="sub" style="margin-bottom:6px">Used in <b>Functions</b> and <b>Both</b> views.</div><div class="chips">
    ${KIND_GROUPS.map((g) => `<span class="chip" data-kg="${g.key}">${shapeSvg(g.shape, "currentColor", 12)}${esc(g.label)} <span class="ct">${kindCounts[g.key] || 0}</span></span>`).join("")}
  </div></div></details>
  <details class="sec"><summary>Folders <span class="chips-act"><button class="linkbtn" data-act="dirs-all">all</button> · <button class="linkbtn" data-act="dirs-none">none</button></span></summary><div class="body" id="dirList">
    ${rootFiles ? `<label class="fld" data-dir="/"><input type="checkbox" checked>(project root files)<span class="ct">${rootFiles}</span></label>` : ""}
    ${dirList.map(([d, n]) => `<label class="fld" data-dir="${esc(d)}" style="padding-left:${(d.split("/").length - 1) * 14}px"><input type="checkbox" checked>${esc(d.split("/").pop())}<span class="ct">${n}</span></label>`).join("")}
  </div></details>
  <details class="sec" open><summary>Display</summary><div class="body">
    <label class="opt"><input type="checkbox" data-opt="showExternals"> Show external packages / images</label>
    <label class="opt"><input type="checkbox" data-opt="hideTests"> Hide test files</label>
    <label class="opt"><input type="checkbox" data-opt="hideIsolated"> Hide unconnected nodes</label>
    <label class="opt"><input type="checkbox" data-opt="arrows" checked> Arrow heads (direction)</label>
    <label class="opt" data-flowonly>Flowchart folder depth <select data-opt="flowDepth"><option value="1">1 level</option><option value="2">2 levels</option><option value="3">3 levels</option><option value="4">4 levels</option></select></label>
    <label class="opt">Labels <select data-opt="labels"><option value="auto">Automatic</option><option value="all">Always</option><option value="off">Hidden</option></select></label>
    <label class="opt" data-graphonly>Spread <input type="range" min="0.3" max="3" step="0.1" value="1" data-opt="repel"></label>
    <label class="opt" data-graphonly>Link length <input type="range" min="0.4" max="2.5" step="0.1" value="1" data-opt="linkDist"></label>
    <div class="acts" style="margin-top:6px"><button class="btn" data-act="unpin">Unpin all nodes</button><button class="btn" data-act="relayout">Re-run layout</button></div>
  </div></details>
  <details class="sec"><summary>Legend</summary><div class="body"><div class="legend">
    <span>${shapeSvg("circle", "#94a3b8")} file / function</span><span>${shapeSvg("diamond", "#94a3b8")} component</span><span>${shapeSvg("square", "#94a3b8")} class / type</span><span>${shapeSvg("triangle", "#94a3b8")} route / script</span><span>${shapeSvg("hex", "#94a3b8")} table / view</span><span>${shapeSvg("round", "#94a3b8")} Docker service</span>
  </div><div class="sub" style="margin-top:8px">Big nodes with a white ring are files. Bigger = more connections. Dashed = external dependency.</div></div></details>`;
    syncSidebar();
  }
  function syncSidebar() {
    $$("#sidebar [data-cat]").forEach((c) =>
      c.classList.toggle("on", S.cats.has(c.dataset.cat)),
    );
    $$("#sidebar [data-et]").forEach((c) =>
      c.classList.toggle("on", S.edgeTypes.has(c.dataset.et)),
    );
    $$("#sidebar [data-kg]").forEach((c) =>
      c.classList.toggle("on", S.kinds.has(c.dataset.kg)),
    );
    $$("#sidebar [data-dir]").forEach((c) => {
      const vis = keyVisible(c.dataset.dir);
      c.classList.toggle("off", !vis);
      const i = $("input", c);
      if (i) i.checked = vis;
    });
    $$("#sidebar [data-graphonly]").forEach(
      (el) => (el.style.display = S.view === "graph" ? "" : "none"),
    );
    $$("#sidebar [data-flowonly]").forEach(
      (el) =>
        (el.style.display =
          S.view === "flow" && S.level === "folders" ? "" : "none"),
    );
    $$("#sidebar [data-opt]").forEach((i) => {
      const k = i.dataset.opt;
      if (i.type === "checkbox") i.checked = !!S[k];
      else i.value = S[k];
    });
  }
  $("#sidebar").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"),
      act = e.target.closest("[data-act]");
    if (chip) {
      if (chip.dataset.cat) toggle(S.cats, chip.dataset.cat);
      else if (chip.dataset.et) toggle(S.edgeTypes, chip.dataset.et);
      else if (chip.dataset.kg) toggle(S.kinds, chip.dataset.kg);
      syncSidebar();
      rebuild({});
      return;
    }
    if (act) {
      e.preventDefault();
      const a = act.dataset.act;
      if (a === "cats-all") data.files.forEach((f) => S.cats.add(f.cat));
      else if (a === "cats-none") S.cats.clear();
      else if (a === "dirs-all") S.dirVis.clear();
      else if (a === "dirs-none")
        $$("#dirList [data-dir]").forEach((x) =>
          S.dirVis.set(x.dataset.dir, false),
        );
      else if (a === "ets-all")
        Object.keys(EDGE).forEach((x) => S.edgeTypes.add(x));
      else if (a === "ets-none") S.edgeTypes.clear();
      else if (a === "kinds-all")
        KIND_GROUPS.forEach((g) => S.kinds.add(g.key));
      else if (a === "kinds-none") S.kinds.clear();
      else if (a === "unpin") {
        pinned.clear();
        nodes.forEach((n) => (n.fixed = false));
      } else if (a === "relayout") {
        nodes.forEach((n) => {
          if (!n.fixed) {
            n.x *= 1.3;
            n.y *= 1.3;
          }
        });
        sim.alpha = 1;
      }
      syncSidebar();
      rebuild({});
      return;
    }
  });
  $("#sidebar").addEventListener("change", (e) => {
    const i = e.target.closest("[data-opt]"),
      d = e.target.closest("[data-dir]");
    if (i) {
      const k = i.dataset.opt;
      S[k] =
        i.type === "checkbox"
          ? i.checked
          : i.type === "range" || k === "flowDepth"
            ? +i.value
            : i.value;
      if (k === "repel" || k === "linkDist") {
        if (S.view === "graph") {
          sim.alpha = Math.max(sim.alpha, 0.6);
          needDraw = true;
        }
      } else rebuild({});
      return;
    }
    if (d) {
      toggleDir(d.dataset.dir);
      syncSidebar();
      rebuild({});
    }
  });
  function toggle(set, v) {
    set.has(v) ? set.delete(v) : set.add(v);
  }

  /* ============================================================
   Details panel
   ============================================================ */
  const KW = {
    js: "function const let var return if else for while switch case break continue class extends import from export default async await new try catch finally throw typeof instanceof in of this super static public private protected interface type enum implements readonly void null undefined true false yield get set as",
    py: "def class return if elif else for while in not and or is import from as with try except finally raise yield lambda pass break continue None True False self async await global nonlocal assert del",
    rs: "fn let mut pub struct enum impl trait use mod match loop while for in if else return where crate self Self super as ref move dyn unsafe async await const static type true false Some None Ok Err",
    sh: "if then else elif fi for while until do done case esac in function local export return exit source echo set unset shift read true false",
    sql: "select from where join left right inner outer on insert into values update set delete create or replace table view function trigger index alter add column primary key references foreign not null default unique check constraint and or as begin end returns language return declare for each row execute after before instead of when then else case if exists with order by group having limit union all distinct using cascade type enum extension schema grant revoke",
    docker:
      "from run cmd entrypoint copy add env arg workdir expose volume user label healthcheck as services image build ports environment depends_on command restart networks",
  };
  const KWSET = {};
  for (const k in KW) KWSET[k] = new Set(KW[k].split(" "));
  function highlight(code, f) {
    const g =
      {
        js: "js",
        ts: "js",
        vue: "js",
        py: "py",
        rs: "rs",
        sh: "sh",
        sql: "sql",
        dockerfile: "docker",
        compose: "docker",
        package: "js",
        cargo: "docker",
        tsconfig: "js",
      }[f.kind] || "js";
    const cm =
      g === "py" || g === "sh" || g === "docker"
        ? "#[^\\n]*"
        : g === "sql"
          ? "--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/"
          : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/";
    const re = new RegExp(
      "(" +
        cm +
        ")|(\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)|(\\b\\d[\\w.]*\\b)|([A-Za-z_$][\\w$]*)",
      "g",
    );
    const ci = g === "sql" || g === "docker";
    let out = "",
      last = 0,
      m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      last = m.index + m[0].length;
      const t = esc(m[0]);
      if (m[1]) out += '<span class="tk-c">' + t + "</span>";
      else if (m[2]) out += '<span class="tk-s">' + t + "</span>";
      else if (m[3]) out += '<span class="tk-n">' + t + "</span>";
      else if (KWSET[g].has(ci ? m[0].toLowerCase() : m[0]))
        out += '<span class="tk-k">' + t + "</span>";
      else if (code[last] === "(") out += '<span class="tk-f">' + t + "</span>";
      else out += t;
    }
    return out + esc(code.slice(last));
  }
  function codeBlock(f, from, to, id) {
    if (!f.text)
      return '<div class="empty-note">Source code was not included in this snapshot.</div>';
    const lines = srcLines(f);
    const total = to - from + 1;
    const full = S.codeFull.has(id);
    const max = full ? 2000 : 60;
    const shown = Math.min(total, max);
    const code = lines.slice(from - 1, from - 1 + shown).join("\n");
    const gut = Array.from({ length: shown }, (_, i) => from + i).join("\n");
    return (
      '<div class="codew"><pre class="gut">' +
      gut +
      "</pre><pre>" +
      highlight(code, f) +
      "</pre></div>" +
      (total > 60
        ? '<div class="acts"><button class="btn" data-act="codeall" data-id="' +
          id +
          '">' +
          (full ? "Show less" : "Show all " + total + " lines") +
          "</button></div>"
        : "")
    );
  }
  const badge = (t, c) =>
    '<span class="badge ' + (c || "") + '">' + esc(t) + "</span>";
  function row(id, meta, tags, title) {
    const e = byId.get(id);
    if (!e) return "";
    return (
      '<div class="row" data-go="' +
      id +
      '"' +
      (title ? ' title="' + esc(title) + '"' : "") +
      '><span class="dot" style="background:' +
      colorOf(e) +
      '"></span><span class="nm">' +
      esc(labelOf(e)) +
      '</span><span class="meta">' +
      esc(meta || "") +
      "</span>" +
      (tags ? '<span class="tags">' + tags + "</span>" : "") +
      "</div>"
    );
  }
  const typeTags = (types) =>
    [...types.entries()]
      .map(
        ([t, n]) =>
          '<span class="tg" style="color:' +
          EDGE[t].c +
          ";border-color:" +
          EDGE[t].c +
          '55" title="' +
          esc(EDGE[t].l) +
          '">' +
          t +
          (n > 1 ? " ×" + n : "") +
          "</span>",
      )
      .join("");
  const sec = (title, body, n) =>
    '<div class="ps"><h4>' +
    esc(title) +
    (n != null ? ' <span class="n">' + n + "</span>" : "") +
    "</h4>" +
    body +
    "</div>";
  function extraBlocks(list) {
    return (list || [])
      .map((x) => {
        if (x.rows)
          return sec(
            x.label,
            '<table class="tb"><tr>' +
              x.head.map((h) => "<th>" + esc(h) + "</th>").join("") +
              "</tr>" +
              x.rows
                .map(
                  (r) =>
                    "<tr>" +
                    r.map((c) => "<td>" + esc(c) + "</td>").join("") +
                    "</tr>",
                )
                .join("") +
              "</table>",
            x.rows.length,
          );
        return sec(
          x.label,
          x.items
            .map((i) => '<span class="pill">' + esc(i) + "</span>")
            .join(""),
          x.items.length,
        );
      })
      .join("");
  }
  function summaryBlock(e) {
    const inferred = e.summarySource !== "comment";
    let h =
      '<div class="sum"><span class="src ' +
      (inferred ? "inf" : "") +
      '">' +
      (inferred
        ? "● inferred from names & code structure"
        : "● from the code's own comments") +
      "</span><div>" +
      esc(e.summary || "No description available.") +
      "</div></div>";
    if (!inferred && e.auto && e.auto !== e.summary)
      h += '<div class="auto"><b>Structure:</b> ' + esc(e.auto) + "</div>";
    return h;
  }
  function fileConnections(fid) {
    const f = byId.get(fid),
      own = [fid, ...f.symbols],
      out = new Map(),
      inn = new Map();
    const put = (m, key, rel, type) => {
      let o = m.get(key);
      if (!o) m.set(key, (o = { id: key, types: new Map(), rels: [] }));
      o.types.set(type, (o.types.get(type) || 0) + rel.count);
      o.rels.push(rel);
    };
    for (const id of own) {
      for (const r of relOut.get(id) || []) {
        const t = toFileId(r.to);
        if (t && t !== fid) put(out, t, r, r.type);
      }
      for (const r of relIn.get(id) || []) {
        const s = toFileId(r.from);
        if (s && s !== fid) put(inn, s, r, r.type);
      }
    }
    return {
      out: [...out.values()].sort((a, b) => b.rels.length - a.rels.length),
      inn: [...inn.values()].sort((a, b) => b.rels.length - a.rels.length),
    };
  }
  function connRow(c) {
    const e = byId.get(c.id);
    const items = c.rels
      .flatMap((r) =>
        r.items.map(
          (i) =>
            labelOf(byId.get(r.from)) +
            " → " +
            labelOf(byId.get(r.to)) +
            ": " +
            i.l,
        ),
      )
      .slice(0, 8);
    const meta =
      e && e.id[0] === "d"
        ? e.files.length + " files"
        : e && e.id[0] === "f"
          ? e.dir
          : (e && e.kind) || "";
    return row(c.id, meta, typeTags(c.types), items.join("\n"));
  }
  function panelFile(f) {
    const conn = fileConnections(f.id);
    const syms = f.symbols
      .map((id) => byId.get(id))
      .sort((a, b) => a.line - b.line);
    const ext = f.imports.filter((i) => i.external && !i.builtin),
      builtins = f.imports.filter((i) => i.builtin),
      unres = f.imports.filter(
        (i) => !i.target && !i.external && !i.builtin && /^\./.test(i.spec),
      );
    let h =
      '<div class="ph"><div class="ttl"><span class="dot" style="background:' +
      colorOf(f) +
      '"></span>' +
      esc(fileLabel(f)) +
      '</div><div class="path" data-act="copy" data-text="' +
      esc(f.path) +
      '" title="Click to copy path">' +
      esc(f.path) +
      "</div>";
    h +=
      '<div class="badges">' +
      badge(CAT_NAMES[f.cat] || f.cat, "k") +
      badge(f.lang) +
      f.tags.map((t) => badge(t, t === "test" ? "warn" : "good")).join("") +
      badge(f.lines + " lines") +
      badge(fmtSize(f.size)) +
      badge(syms.length + " symbols") +
      "</div>";
    h +=
      '<div class="acts"><button class="btn" data-act="focus">⌖ Focus neighbourhood</button><button class="btn' +
      (pinned.has(f.id) ? " on" : "") +
      '" data-act="pin">📌 ' +
      (pinned.has(f.id) ? "Unpin" : "Pin") +
      "</button>" +
      ((S.view === "graph"
        ? S.mode === "files"
        : S.level === "files" || S.level === "folders") && syms.length
        ? '<button class="btn" data-act="showfuncs">ƒ Show functions inside</button>'
        : "") +
      "</div></div>";
    h += sec(
      "What this file does",
      summaryBlock(f) +
        (f.header && f.header.length > (f.summary || "").length + 20
          ? '<details style="margin-top:8px"><summary class="sub" style="cursor:pointer">Full header comment</summary><div class="doc">' +
            esc(f.header) +
            "</div></details>"
          : ""),
    );
    if (f.parseError)
      h +=
        '<div class="ps"><div class="warnbox">Parsing problem: ' +
        esc(f.parseError) +
        " — results for this file may be incomplete.</div></div>";
    h += extraBlocks(f.extra);
    h += sec(
      "Depends on",
      conn.out.length
        ? conn.out.map(connRow).join("")
        : '<div class="empty-note">Nothing in this project.</div>',
      conn.out.length,
    );
    if (ext.length || builtins.length)
      h += sec(
        "Libraries used",
        ext
          .map(
            (i) =>
              '<span class="pill" title="' +
              esc(i.names.join(", ")) +
              '">' +
              esc(i.external) +
              "</span>",
          )
          .join("") +
          builtins
            .map(
              (i) =>
                '<span class="pill" style="opacity:.6" title="built-in">' +
                esc(i.external) +
                "</span>",
            )
            .join(""),
        uniqCount(
          ext.map((i) => i.external).concat(builtins.map((i) => i.external)),
        ),
      );
    if (unres.length)
      h +=
        '<div class="ps"><div class="warnbox">Could not locate ' +
        unres.length +
        " imported file(s): " +
        unres
          .slice(0, 6)
          .map((i) => "<code>" + esc(i.spec) + "</code>")
          .join(", ") +
        "</div></div>";
    h += sec(
      "Used by",
      conn.inn.length
        ? conn.inn.map(connRow).join("")
        : '<div class="empty-note">Nothing in this project references this file' +
            (f.entry ? " (it looks like an entry point)." : ".") +
            "</div>",
      conn.inn.length,
    );
    if (syms.length)
      h += sec(
        "Inside this file",
        syms
          .map(
            (s) =>
              '<div class="row sym" data-go="' +
              s.id +
              '"><span class="dot" style="background:' +
              colorOf(s) +
              '"></span><span class="nm">' +
              esc(s.label) +
              '</span><span class="meta">' +
              esc(KIND_LABEL[s.kind] || s.kind) +
              " · line " +
              s.line +
              '</span><div class="sdesc">' +
              esc(clip(s.summary || "", 150)) +
              "</div></div>",
          )
          .join(""),
        syms.length,
      );
    if (f.exports.length)
      h += sec(
        "Exports",
        f.exports
          .map((x) => '<span class="pill">' + esc(x) + "</span>")
          .join(""),
        f.exports.length,
      );
    h += sec("Source", codeBlock(f, 1, f.lines, f.id));
    return h;
  }
  const uniqCount = (a) => new Set(a).size;
  function relGroup(title, rels, dir) {
    if (!rels.length) return "";
    const byT = new Map();
    for (const r of rels) {
      (byT.get(r.type) || byT.set(r.type, []).get(r.type)).push(r);
    }
    return [...byT.entries()]
      .map(([t, rs]) =>
        sec(
          title(t),
          rs
            .map((r) => {
              const id = dir === "out" ? r.to : r.from;
              const e = byId.get(id);
              const f = e && fileOf(id);
              const meta =
                (r.items[0] ? r.items[0].l : "") +
                (e && id[0] === "s" && f
                  ? "   · " + f.name + ":" + e.line
                  : "");
              return row(
                id,
                meta,
                r.count > 1 ? '<span class="tg">×' + r.count + "</span>" : "",
                r.items
                  .map((i) => i.l + (i.line ? " (line " + i.line + ")" : ""))
                  .join("\n"),
              );
            })
            .join(""),
          rs.length,
        ),
      )
      .join("");
  }
  function panelSym(s) {
    const f = byId.get(s.file);
    const outs = (relOut.get(s.id) || []).filter((r) => r.type !== "contains"),
      ins = (relIn.get(s.id) || []).filter((r) => r.type !== "contains");
    let h =
      '<div class="ph"><div class="ttl"><span class="dot" style="background:' +
      colorOf(s) +
      '"></span>' +
      esc(s.label) +
      '</div><div class="path" data-go="' +
      f.id +
      '" title="Open the file">' +
      esc(f.path) +
      ":" +
      s.line +
      (s.endLine > s.line ? "–" + s.endLine : "") +
      "</div>";
    h +=
      '<div class="badges">' +
      badge(KIND_LABEL[s.kind] || s.kind, "k") +
      badge(f.lang) +
      (s.exported ? badge("exported", "good") : "") +
      (s.async ? badge("async") : "") +
      (s.visibility && s.visibility !== "public" ? badge(s.visibility) : "") +
      (s.isStatic ? badge("static") : "") +
      (s.isTest ? badge("test", "warn") : "") +
      (s.recursive ? badge("recursive", "warn") : "") +
      (s.route ? badge(s.route.method + " " + s.route.path, "good") : "") +
      badge(s.loc + " lines") +
      (s.complexity > 1
        ? badge(
            "complexity " + s.complexity,
            s.complexity > 15 ? "bad" : s.complexity > 8 ? "warn" : "",
          )
        : "") +
      "</div>";
    h +=
      '<div class="acts"><button class="btn" data-act="focus">⌖ Focus neighbourhood</button><button class="btn' +
      (pinned.has(s.id) ? " on" : "") +
      '" data-act="pin">📌 ' +
      (pinned.has(s.id) ? "Unpin" : "Pin") +
      "</button></div></div>";
    h += sec(
      "What it does",
      summaryBlock(s) +
        (s.doc && s.doc.length > (s.summary || "").length + 10
          ? '<details style="margin-top:8px"><summary class="sub" style="cursor:pointer">Full doc comment</summary><div class="doc">' +
            esc(s.doc) +
            "</div></details>"
          : ""),
    );
    if (s.signature && !["table", "view"].includes(s.kind))
      h += sec(
        "Signature",
        '<pre class="mono" style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px">' +
          esc(s.signature) +
          "</pre>" +
          (s.returns
            ? '<div class="sub" style="margin-top:4px">returns <code>' +
              esc(s.returns) +
              "</code></div>"
            : ""),
      );
    if (
      s.params &&
      s.params.length &&
      !["table", "view", "stage", "service", "script"].includes(s.kind)
    )
      h += sec(
        "Parameters",
        s.params
          .map((p) => '<span class="pill">' + esc(clip(p, 80)) + "</span>")
          .join(""),
        s.params.length,
      );
    h += extraBlocks(s.extra);
    const T = {
      call: (n) => "Calls",
      render: (n) => "Renders",
      extends: (n) => "Extends / implements",
      uses: (n) => "Uses types",
      sql: (n) => "Database access",
      run: (n) => "Runs",
      copy: (n) => "Copies / mounts",
      depends: (n) => "Depends on",
      import: (n) => "Imports",
    };
    h += relGroup((t) => (T[t] || (() => t))(), outs, "out");
    const TI = {
      call: "Called by",
      render: "Rendered by",
      extends: "Extended / implemented by",
      uses: "Used as a type by",
      sql: "Accessed by",
      run: "Run by",
      copy: "Copied / mounted by",
      depends: "Required by",
      import: "Imported by",
    };
    h += relGroup((t) => TI[t] || t, ins, "in");
    if (!outs.length && !ins.length)
      h += sec(
        "Connections",
        '<div class="empty-note">No resolved connections to other parts of this project.</div>',
      );
    if (s.extCalls && s.extCalls.length)
      h += sec(
        "Other calls (libraries / built-ins)",
        s.extCalls
          .map((c) => '<span class="pill">' + esc(c) + "</span>")
          .join(""),
        s.extCalls.length,
      );
    if (s.httpOut && s.httpOut.length)
      h += sec(
        "HTTP requests with no matching route in the project",
        uniqArr(s.httpOut)
          .map((c) => '<span class="pill">' + esc(c) + "</span>")
          .join(""),
      );
    if (
      !["stage", "service", "table", "view", "script"].includes(s.kind) ||
      f.text
    )
      h += sec("Code", codeBlock(f, s.line, s.endLine, s.id));
    return h;
  }
  const uniqArr = (a) => [...new Set(a)];
  function panelExt(x) {
    const ins = relIn.get(x.id) || [];
    let h =
      '<div class="ph"><div class="ttl"><span class="dot" style="background:' +
      THEMES[S.theme].ext +
      '"></span>' +
      esc(x.name) +
      '</div><div class="badges">' +
      badge(
        "external " +
          ({
            package: "npm package",
            crate: "Rust crate",
            pypi: "Python package",
            image: "Docker image",
          }[x.kind] || x.kind),
        "k",
      ) +
      "</div></div>";
    h += sec(
      "Used by",
      ins
        .map((r) => row(r.from, r.items[0] ? r.items[0].l : "", ""))
        .join("") || '<div class="empty-note">—</div>',
      ins.length,
    );
    return h;
  }
  function edgeItems(l) {
    return l.rels.flatMap((r) =>
      (r.items.length ? r.items : [{ l: r.type, line: 0 }]).map(
        (i) =>
          labelOf(byId.get(r.from)) +
          " → " +
          labelOf(byId.get(r.to)) +
          " — " +
          i.l +
          (i.line ? " (line " + i.line + ")" : ""),
      ),
    );
  }
  function panelEdge(l) {
    let h =
      '<div class="ph"><div class="ttl"><span style="width:18px;height:4px;border-radius:2px;background:' +
      EDGE[l.type].c +
      ';display:inline-block"></span>' +
      esc(EDGE[l.type].l) +
      '</div><div class="badges">' +
      badge(l.count + " occurrence" + (l.count > 1 ? "s" : ""), "k") +
      (l.types
        ? [...l.types.entries()]
            .map(([ty, nn]) => badge(ty + " ×" + nn))
            .join("")
        : "") +
      "</div></div>";
    h += sec(
      "Connection",
      row(l.s.id, "", "") +
        '<div class="sub" style="padding:0 8px">↓ ' +
        esc(l.type) +
        "</div>" +
        row(l.t.id, "", ""),
    );
    h += sec(
      "Where it happens",
      edgeItems(l)
        .slice(0, 60)
        .map(
          (i) =>
            '<div class="row" style="cursor:default"><span class="meta" style="white-space:normal">' +
            esc(i) +
            "</span></div>",
        )
        .join(""),
      edgeItems(l).length,
    );
    return h;
  }
  function panelOverview() {
    const m = data.meta,
      I = insights;
    const cats = Object.entries(m.langCounts).sort((a, b) => b[1] - a[1]);
    const max = cats[0] ? cats[0][1] : 1;
    let h =
      '<div class="ph"><div class="ttl">Project overview</div><div class="sub" style="margin-top:4px">Click any node in the graph — or any item below — for details.</div></div>';
    h += sec(
      "Languages",
      cats
        .map(
          ([c, n]) =>
            '<div class="ibar"><span class="lb">' +
            esc(CAT_NAMES[c] || c) +
            '</span><span class="bar" style="width:' +
            Math.max(6, (n / max) * 150) +
            "px;background:" +
            (CAT_COLORS[c] || "#64748b") +
            '"></span><span class="v">' +
            n +
            "</span></div>",
        )
        .join(""),
    );
    if (m.frameworks.length)
      h += sec(
        "Frameworks & tools detected",
        m.frameworks
          .map((x) => '<span class="pill">' + esc(x) + "</span>")
          .join(""),
      );
    h += sec(
      "Most connected files",
      I.hubs
        .map(([f, d]) => row(f.id, d + " connections · " + f.dir, ""))
        .join("") || '<div class="empty-note">—</div>',
    );
    if (I.entries.length)
      h += sec(
        "Likely entry points",
        '<div class="sub" style="margin-bottom:4px">Files that use others but nothing uses them.</div>' +
          I.entries.map((f) => row(f.id, f.dir, "")).join(""),
      );
    if (I.called.length)
      h += sec(
        "Most-called functions",
        I.called
          .map(([s, n]) =>
            row(s.id, n + " callers · " + (byId.get(s.file) || {}).name, ""),
          )
          .join(""),
      );
    h += sec(
      "Circular imports",
      I.cycles.length
        ? I.cycles
            .slice(0, 6)
            .map(
              (c) =>
                '<div class="warnbox" style="margin-top:4px"><div class="sub" style="margin-bottom:3px">' +
                c.length +
                " files import each other:</div>" +
                c
                  .slice(0, 6)
                  .map((id) => row(id, "", ""))
                  .join("") +
                (c.length > 6
                  ? '<div class="sub">…and ' + (c.length - 6) + " more</div>"
                  : "") +
                "</div>",
            )
            .join("")
        : '<div class="empty-note">None found 👍</div>',
      I.cycles.length,
    );
    h += sec(
      "Unconnected files",
      I.orphans.length
        ? I.orphans
            .slice(0, 10)
            .map((f) => row(f.id, f.dir, ""))
            .join("") +
            (I.orphans.length > 10
              ? '<div class="sub">…and ' +
                (I.orphans.length - 10) +
                " more</div>"
              : "")
        : '<div class="empty-note">None.</div>',
      I.orphans.length,
    );
    if (I.unresolved)
      h +=
        '<div class="ps"><div class="warnbox">' +
        I.unresolved +
        " relative import(s) could not be matched to a scanned file.</div></div>";
    return h;
  }
  function renderPanel() {
    const p = $("#panel");
    if (!data) {
      p.innerHTML = "";
      return;
    }
    let h;
    const id = S.selected;
    if (S.selectedEdge) h = panelEdge(S.selectedEdge);
    else if (!id) h = panelOverview();
    else {
      const e = byId.get(id);
      h = !e
        ? panelOverview()
        : id[0] === "d"
          ? panelDir(e)
          : id[0] === "f"
            ? panelFile(e)
            : id[0] === "s"
              ? panelSym(e)
              : panelExt(e);
    }
    const st = p.scrollTop;
    p.innerHTML =
      '<div class="pbar2"><button class="btn" data-act="closepanel">✕ Close</button></div>' +
      h;
    p.scrollTop = id === p._last ? st : 0;
    p._last = id;
  }
  $("#panel").addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]"),
      g = e.target.closest("[data-go]");
    if (a) {
      const act = a.dataset.act;
      if (act === "closepanel") document.body.classList.remove("panelOpen");
      else if (act === "copy") {
        navigator.clipboard && navigator.clipboard.writeText(a.dataset.text);
        a.style.color = "var(--good)";
        setTimeout(() => (a.style.color = ""), 600);
      } else if (act === "focus") setFocus(!S.focus);
      else if (act === "pin") {
        const n = nodeIdx.get(S.selected);
        if (pinned.has(S.selected)) {
          pinned.delete(S.selected);
          if (n) n.fixed = false;
        } else {
          pinned.add(S.selected);
          if (n) n.fixed = true;
        }
        sim.alpha = Math.max(sim.alpha, 0.2);
        renderPanel();
        needDraw = true;
      } else if (act === "codeall") {
        const id = a.dataset.id;
        S.codeFull.has(id) ? S.codeFull.delete(id) : S.codeFull.add(id);
        renderPanel();
      } else if (act === "showfuncs") {
        if (S.view === "flow") {
          S.level = "both";
          syncViewUi();
        } else {
          S.mode = "both";
          syncMode();
        }
        S.focus = true;
        rebuild({});
        fitView(true);
        renderPanel();
      }
      return;
    }
    if (g) goTo(g.dataset.go);
  });

  /* ============================================================
   Scanning a folder
   ============================================================ */
  function progress(msg, a, b) {
    $("#progress").hidden = false;
    $("#pmsg").textContent = msg + (b ? "  " + a + " / " + b : "");
    $("#pfill").style.width = b ? Math.round((a / b) * 100) + "%" : "15%";
  }
  const ignoreSet = () =>
    new Set(
      $("#ignoreList")
        .value.split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  async function analyseItems(items, allPaths, root) {
    try {
      let list = items;
      let note = "";
      if (list.length > 7000) {
        list = list.slice(0, 7000);
        note = "Only the first 7000 code files were analysed.";
      }
      const input = [];
      let i = 0,
        done = 0;
      const worker = async () => {
        while (i < list.length) {
          const it = list[i++];
          try {
            const r = await it.read();
            if (r.text != null)
              input.push({ path: it.path, text: r.text, size: r.size });
          } catch (e) {}
          if (++done % 25 === 0) {
            progress("Reading files…", done, list.length);
            await tick();
          }
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      input.sort((a, b) => (a.path < b.path ? -1 : 1));
      if (!input.length) {
        $("#progress").hidden = true;
        alert(
          "No supported source files were found in that folder (JS, TS, Vue, Python, Rust, SQL, Docker, Bash).",
        );
        return;
      }
      const d = await Analyzer.analyze(input, {
        root,
        allPaths,
        onProgress: (m, a, b) => progress(m, a, b),
      });
      if (note) d.skipped = (d.skipped || []).concat([note]);
      await tick();
      loadData(d, "scan");
    } catch (err) {
      console.error(err);
      $("#progress").hidden = true;
      alert("Sorry — something went wrong while analysing:\n" + err.message);
    }
  }
  async function scanHandle(root) {
    const ign = ignoreSet(),
      items = [],
      allPaths = [];
    let n = 0;
    progress("Scanning folders…", 0, 0);
    const walk = async (dir, rel) => {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === "directory") {
          if (ign.has(name.toLowerCase())) continue;
          await walk(h, rel ? rel + "/" + name : name);
        } else {
          const p = rel ? rel + "/" + name : name;
          allPaths.push(p);
          if (Analyzer.kindOfFile(p))
            items.push({
              path: p,
              read: async () => {
                const f = await h.getFile();
                return {
                  text: f.size > 1500000 ? null : await f.text(),
                  size: f.size,
                };
              },
            });
        }
        if (++n % 300 === 0) {
          progress(
            "Scanning folders… " +
              n +
              " entries, " +
              items.length +
              " code files",
            0,
            0,
          );
          await tick();
        }
      }
    };
    await walk(root, "");
    await analyseItems(items, allPaths, root.name);
  }
  async function scanFileList(fl) {
    const ign = ignoreSet(),
      items = [],
      allPaths = [];
    let root = "";
    for (const f of fl) {
      const parts = (f.webkitRelativePath || f.name).split("/");
      if (!root) root = parts.length > 1 ? parts[0] : "";
      const rel = parts.length > 1 ? parts.slice(1) : parts;
      if (rel.slice(0, -1).some((s) => ign.has(s.toLowerCase()))) continue;
      const p = rel.join("/");
      allPaths.push(p);
      if (Analyzer.kindOfFile(p))
        items.push({
          path: p,
          read: async () => ({
            text: f.size > 1500000 ? null : await f.text(),
            size: f.size,
          }),
        });
    }
    await analyseItems(items, allPaths, root);
  }
  async function scanEntries(entries) {
    const ign = ignoreSet(),
      items = [],
      allPaths = [];
    let root = "";
    progress("Reading dropped folder…", 0, 0);
    const walk = async (entry, rel) => {
      if (entry.isFile) {
        allPaths.push(rel);
        if (Analyzer.kindOfFile(rel))
          items.push({
            path: rel,
            read: () =>
              new Promise((res, rej) =>
                entry.file(async (f) => {
                  try {
                    res({
                      text: f.size > 1500000 ? null : await f.text(),
                      size: f.size,
                    });
                  } catch (e) {
                    rej(e);
                  }
                }, rej),
              ),
          });
      } else if (entry.isDirectory) {
        if (rel && ign.has(entry.name.toLowerCase())) return;
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          for (const c of batch)
            await walk(c, rel ? rel + "/" + c.name : c.name);
        } while (batch.length);
      }
    };
    for (const e of entries) {
      if (e.isDirectory) {
        root = root || e.name;
        await walk(e, "");
      } else await walk(e, e.name);
    }
    await analyseItems(items, allPaths, root);
  }
  async function pickFolder() {
    if (window.showDirectoryPicker) {
      try {
        const opts = { mode: "read", id: "code-graph" };
        if (lastDirHandle) opts.startIn = lastDirHandle;
        const h = await window.showDirectoryPicker(opts);
        lastDirHandle = h;
        await scanHandle(h);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") {
          $("#progress").hidden = true;
          return;
        }
        console.warn("Directory picker unavailable, falling back", e);
        $("#progress").hidden = true;
      }
    }
    $("#fileInput").click();
  }
  $("#fileInput").addEventListener("change", async (e) => {
    const fl = [...e.target.files];
    e.target.value = "";
    if (fl.length) {
      progress("Reading folder…", 0, 0);
      await tick();
      await scanFileList(fl);
    }
  });
  ["#btnOpen", "#btnOpen2"].forEach((s) =>
    $(s).addEventListener("click", pickFolder),
  );
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    $("#dropHint").hidden = false;
  });
  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    if (--dragDepth <= 0) {
      dragDepth = 0;
      $("#dropHint").hidden = true;
    }
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragDepth = 0;
    $("#dropHint").hidden = true;
    const items = [...(e.dataTransfer.items || [])]
      .map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry())
      .filter(Boolean);
    if (items.length) await scanEntries(items);
    else if (e.dataTransfer.files.length)
      await scanFileList([...e.dataTransfer.files]);
  });

  /* ============================================================
   Export
   ============================================================ */
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }
  const safeName = () => (S.root || "project").replace(/[^\w.-]+/g, "_");
  function makeSnapshotHtml(withSrc) {
    const d = withSrc
      ? data
      : Object.assign({}, data, {
          files: data.files.map((f) => Object.assign({}, f, { text: "" })),
        });
    const json = JSON.stringify(d)
      .replace(/</g, "\\u003c")
      .replace(new RegExp("\\u2028", "g"), "\\u2028")
      .replace(new RegExp("\\u2029", "g"), "\\u2029");
    const html = ORIGINAL_HTML.replace(
      /<script id="preload" type="application\/json">[\s\S]*?<\/script>/,
      () =>
        '<script id="preload" type="application/json">' + json + "</script>",
    );
    return html;
  }
  function exportHtml() {
    if (data)
      download(
        "code-graph-" + safeName() + ".html",
        new Blob([makeSnapshotHtml($("#expSource").checked)], {
          type: "text/html",
        }),
      );
  }
  function exportPng() {
    needDraw = false;
    draw();
    cv.toBlob(
      (b) => b && download("code-graph-" + safeName() + ".png", b),
      "image/png",
    );
  }
  $("#exportMenu").addEventListener("click", (e) => {
    const b = e.target.closest("[data-exp]");
    if (!b) return;
    $("#exportMenu").classList.remove("show");
    const k = b.dataset.exp;
    if (k === "html") exportHtml();
    else if (k === "json")
      download(
        "code-graph-" + safeName() + ".json",
        new Blob([JSON.stringify(data)], { type: "application/json" }),
      );
    else if (k === "png") exportPng();
  });
  $("#btnExport").addEventListener("click", (e) => {
    e.stopPropagation();
    if (data) $("#exportMenu").classList.toggle("show");
  });

  /* ============================================================
   Top bar, keyboard, boot
   ============================================================ */
  $("#modeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !data) return;
    S.mode = b.dataset.mode;
    syncMode();
    rebuild({});
    fitView(true);
    if (S.selected && !nodeIdx.has(S.selected)) {
      /* keep panel but nothing highlighted */
    }
  });
  $("#btnFit").addEventListener("click", () => fitView(true));
  $("#btnFreeze").addEventListener("click", (e) => {
    S.paused = !S.paused;
    e.currentTarget.classList.toggle("on", S.paused);
    e.currentTarget.textContent = S.paused ? "▶" : "⏸";
  });
  $("#btnTheme").addEventListener("click", () => {
    S.theme = S.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = S.theme;
    try {
      localStorage.setItem("pg-theme", S.theme);
    } catch (e) {}
    if (data) {
      nodes.forEach((n) => (n.color = colorOf(n.e)));
      renderPanel();
    }
    needDraw = true;
  });
  $("#btnSide").addEventListener("click", () => {
    document.body.classList.toggle(
      window.innerWidth <= 720 ? "sideOpen" : "noSide",
    );
    setTimeout(resize, 30);
  });
  $("#btnPanel").addEventListener("click", () => {
    document.body.classList.toggle(
      window.innerWidth <= 1040 ? "panelOpen" : "noPanel",
    );
    setTimeout(resize, 30);
  });
  $("#viewSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b && data) setView(b.dataset.view);
  });
  $("#levelSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !data) return;
    S.level = b.dataset.level;
    if (S.selected && S.selected[0] === "d" && S.level !== "folders") {
      S.selected = null;
      renderPanel();
    }
    syncView();
  });
  $("#btnHelp").addEventListener("click", () => ($("#help").hidden = false));
  $("#helpClose").addEventListener("click", () => ($("#help").hidden = true));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".menu")) $("#exportMenu").classList.remove("show");
    if (!e.target.closest(".search"))
      $("#searchResults").classList.remove("show");
  });
  const si = $("#search");
  si.addEventListener("input", () => {
    S.search = si.value;
    if (!data) return;
    searchHits = computeSearchHits();
    needDraw = true;
    const res = searchResults(si.value),
      box = $("#searchResults");
    box.innerHTML =
      res
        .map(
          ([, t, e], i) =>
            '<button data-i="' +
            i +
            '"><div class="sr"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:' +
            colorOf(e) +
            '"></span><span class="nm">' +
            esc(t === "file" ? e.name : t === "sym" ? e.label : e.name) +
            '</span><span class="sub">' +
            esc(
              t === "file"
                ? e.dir || "(root)"
                : t === "sym"
                  ? (KIND_LABEL[e.kind] || e.kind) +
                    " · " +
                    (byId.get(e.file) || {}).name
                  : "external",
            ) +
            "</span></div></button>",
        )
        .join("") || '<div class="sub" style="padding:8px">No matches</div>';
    box.classList.toggle("show", !!si.value.trim());
    box._res = res;
  });
  $("#searchResults").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const r = $("#searchResults")._res[+b.dataset.i];
    $("#searchResults").classList.remove("show");
    goTo(r[2].id);
  });
  si.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const r = ($("#searchResults")._res || [])[0];
      if (r) {
        $("#searchResults").classList.remove("show");
        goTo(r[2].id);
      }
    } else if (e.key === "Escape") {
      si.value = "";
      S.search = "";
      searchHits = null;
      $("#searchResults").classList.remove("show");
      si.blur();
      needDraw = true;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,select,textarea")) return;
    if (e.key === "/") {
      e.preventDefault();
      si.focus();
      si.select();
    } else if (e.key === "Escape") {
      $("#help").hidden = true;
      if (data) clearSelection();
    } else if (e.key === "f" || e.key === "F") fitView(true);
    else if ((e.key === "p" || e.key === "P") && S.selected) {
      const a = $('#panel [data-act="pin"]');
      if (a) a.click();
    } else if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(0.8);
  });
  function zoomBy(f) {
    const nk = Math.max(0.04, Math.min(6, view.k * f));
    view.x = W / 2 - ((W / 2 - view.x) / view.k) * nk;
    view.y = H / 2 - ((H / 2 - view.y) / view.k) * nk;
    view.k = nk;
    needDraw = true;
    updateHud();
  }
  function applyHash() {
    const h = location.hash.replace(/^#/, "");
    if (!h || !data) return;
    const p = new URLSearchParams(h);
    if (
      p.get("mode") &&
      ["files", "functions", "both"].includes(p.get("mode"))
    ) {
      S.mode = p.get("mode");
      syncMode();
    }
    if (p.get("view") === "flow") S.view = "flow";
    if (["folders", "functions", "both"].includes(p.get("level")))
      S.level = p.get("level");
    if (p.get("depth")) S.flowDepth = +p.get("depth");
    syncViewUi();
    if (p.get("theme") === "light" && S.theme !== "light")
      $("#btnTheme").click();
    if (p.get("sel") && byId.has(p.get("sel"))) {
      S.focus = p.get("focus") === "1";
      if (p.get("depth")) S.focusDepth = +p.get("depth");
      S.selected = p.get("sel");
    }
    rebuild({ fresh: true });
    fitView(false);
    if (S.selected) {
      renderPanel();
    }
    if (p.get("rel") === "1") {
      /* reserved */
    }
  }
  window.addEventListener("hashchange", applyHash);
  window.addEventListener("beforeunload", () => {});
  new ResizeObserver(() => {
    resize();
  }).observe(stage);
  new ResizeObserver(() =>
    document.documentElement.style.setProperty(
      "--tb",
      $("#topbar").offsetHeight + "px",
    ),
  ).observe($("#topbar"));

  try {
    const t = localStorage.getItem("pg-theme");
    if (t === "light") {
      S.theme = "light";
      document.documentElement.dataset.theme = "light";
    }
  } catch (e) {}
  resize();
  requestAnimationFrame(loop);
  const pre = $("#preload").textContent.trim();
  if (pre) {
    try {
      loadData(JSON.parse(pre), "snapshot");
    } catch (e) {
      console.error("Could not read embedded data", e);
    }
  } else renderPanel();
  window.__PG = {
    S,
    sim,
    view,
    get W() {
      return W;
    },
    get H() {
      return H;
    },
    get nodes() {
      return nodes;
    },
    get links() {
      return links;
    },
    get data() {
      return data;
    },
    loadData,
    rebuild,
    select,
    goTo,
    setView,
    draw,
    scanFileList,
    fitView,
    simTick,
    makeSnapshotHtml,
  };
})();
