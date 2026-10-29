/* ===== Python ===== */
const PY_STDLIB = new Set(
  "os sys re json time datetime pathlib typing collections itertools functools math random subprocess threading asyncio logging argparse unittest dataclasses enum abc io csv shutil glob hashlib base64 copy uuid sqlite3 urllib http socket struct tempfile traceback contextlib inspect string textwrap platform signal queue heapq bisect statistics decimal fractions operator warnings weakref pickle gzip zipfile tarfile configparser pprint secrets select ssl email html xml multiprocessing concurrent importlib types codecs locale gettext getpass shlex zlib bz2 lzma array ast dis code cmd curses readline unicodedata __future__".split(
    " ",
  ),
);
const PY_KW = new Set(
  "if elif while for with return yield lambda not and or in is assert del raise except import from as global nonlocal pass break continue else try finally def class await async print match case".split(
    " ",
  ),
);
const commonPrefixLen = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

function resolvePyModule(ctx, f, level, dotted) {
  const segs = dotted ? dotted.split(".") : [];
  if (level > 0) {
    let base = f.dir;
    for (let i = 1; i < level; i++) base = dirName(base);
    const rel = joinPath(base, segs.join("/"));
    return (
      ctx.fileByPath.get(rel + ".py") ||
      ctx.fileByPath.get(rel + "/__init__.py") ||
      ctx.fileByPath.get(rel + ".pyi") ||
      null
    );
  }
  const cands = ctx.pyIndex.get(segs.join("."));
  if (!cands) return null;
  if (cands.length === 1) return cands[0];
  return cands
    .slice()
    .sort(
      (a, b) =>
        commonPrefixLen(b.path, f.path) - commonPrefixLen(a.path, f.path) ||
        a.path.length - b.path.length,
    )[0];
}

function parsePy(f, ctx) {
  const text = f.text,
    m = maskPy(text, false),
    mS = maskPy(text, true);
  const lines = f.lineArr,
    mLines = m.split("\n"),
    li = lineIndex(text),
    starts = li.starts,
    lineOf = f.lineOf;
  const syms = [],
    declPos = new Set();
  const indentOf = (s) => {
    let n = 0;
    for (const ch of s) {
      if (ch === " ") n++;
      else if (ch === "\t") n += 4;
      else break;
    }
    return n;
  };
  /* imports */
  const impByTarget = new Map();
  const addImp = (target, ext, builtin, spec, line, name) => {
    const key = target || "x:" + ext;
    let imp = impByTarget.get(key);
    if (!imp) {
      imp = {
        spec,
        line,
        names: [],
        target: target || null,
        external: target ? null : ext,
        builtin: !!builtin,
        kind: "import",
      };
      impByTarget.set(key, imp);
      f.imports.push(imp);
    }
    if (name && !imp.names.includes(name)) imp.names.push(name);
    return imp;
  };
  let mt;
  const reImp = /^[ \t]*import\s+([^\n;]+)/gm;
  while ((mt = reImp.exec(m))) {
    for (const part of mt[1].split(",")) {
      const p = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
      if (!p) continue;
      const file = resolvePyModule(ctx, f, 0, p[1]);
      const top = p[1].split(".")[0];
      const imp = file
        ? addImp(file.id, null, false, p[1], lineOf(mt.index), null)
        : addImp(null, top, PY_STDLIB.has(top), top, lineOf(mt.index), null);
      f.localNames.set(p[2] || top, { imp, imported: "*" });
    }
  }
  const reFrom = /^[ \t]*from\s+(\.*)([\w.]*)\s+import\s+(\([^)]*\)|[^\n;]+)/gm;
  while ((mt = reFrom.exec(m))) {
    const level = mt[1].length,
      mod = mt[2];
    let list = mt[3].replace(/[()]/g, "").replace(/\\\s*\n/g, " ");
    const base = mod || level ? resolvePyModule(ctx, f, level, mod) : null;
    const top = mod.split(".")[0];
    if (!base && level === 0 && mod === "__future__") continue;
    for (const part of list.split(",")) {
      const p = /^\s*([\w*]+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
      if (!p) continue;
      const sub =
        p[1] !== "*"
          ? resolvePyModule(ctx, f, level, mod ? mod + "." + p[1] : p[1])
          : null;
      const line = lineOf(mt.index);
      if (sub) {
        const imp = addImp(sub.id, null, false, mod + "." + p[1], line, null);
        f.localNames.set(p[2] || p[1], { imp, imported: "*" });
      } else if (base) {
        const imp = addImp(base.id, null, false, mod, line, p[1]);
        if (p[1] !== "*")
          f.localNames.set(p[2] || p[1], { imp, imported: p[1] });
      } else if (level === 0) {
        const imp = addImp(null, top, PY_STDLIB.has(top), top, line, null);
        if (p[1] !== "*")
          f.localNames.set(p[2] || p[1], { imp, imported: p[1] });
      }
    }
  }
  /* defs and classes */
  const stack = [];
  let pd = 0;
  const n = mLines.length;
  const blockEnd = (hdrEnd, ind) => {
    let last = hdrEnd;
    for (let j = hdrEnd + 1; j < n; j++) {
      const l = mLines[j];
      if (!l.trim()) continue;
      if (indentOf(l) <= ind) break;
      last = j;
    }
    return last;
  };
  for (let i = 0; i < n; i++) {
    const ln = mLines[i];
    if (ln.trim() && pd <= 0) {
      const ind = indentOf(ln);
      while (stack.length && stack[stack.length - 1].indent >= ind) stack.pop();
      const dm =
        /^(\s*)(async\s+)?def\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(/.exec(ln);
      const cm = !dm && /^(\s*)class\s+([A-Za-z_]\w*)/.exec(ln);
      if (dm || cm) {
        const lead = (dm || cm)[1].length,
          startPos = starts[i] + lead,
          name = dm ? dm[3] : cm[2];
        const decos = [];
        for (let k = i - 1; k >= 0 && /^\s*@/.test(mLines[k]); k--)
          decos.unshift(lines[k].trim());
        let po,
          pc,
          hdrEndPos,
          params = [],
          bases = [];
        const nameAt = starts[i] + ln.indexOf(name, lead);
        if (dm) {
          po = starts[i] + dm[0].length - 1;
          pc = matchClose(m, po, "(", ")");
          params = splitTop(text.slice(po + 1, pc));
        } else {
          const after = nameAt + name.length;
          let p2 = after;
          while (m[p2] === " ") p2++;
          if (m[p2] === "(") {
            pc = matchClose(m, p2, "(", ")");
            bases = splitTop(text.slice(p2 + 1, pc)).filter(
              (b) => !/=/.test(b),
            );
          } else pc = after;
        }
        let q = pc + 1,
          d = 0;
        for (; q < m.length; q++) {
          const c = m[q];
          if ("([{".includes(c)) d++;
          else if (")]}".includes(c)) d--;
          else if (c === ":" && d === 0) break;
        }
        hdrEndPos = q;
        const hdrEndLine = lineOf(hdrEndPos) - 1;
        const inlineBody =
          m
            .slice(
              hdrEndPos + 1,
              starts[hdrEndLine + 1] != null
                ? starts[hdrEndLine + 1]
                : m.length,
            )
            .trim().length > 0;
        const endLine = inlineBody ? hdrEndLine : blockEnd(hdrEndLine, ind);
        const endPos =
          starts[endLine + 1] != null ? starts[endLine + 1] : text.length;
        const top = stack[stack.length - 1];
        let kind = dm
          ? top && top.kind === "class"
            ? "method"
            : "function"
          : "class";
        const dm2 =
          /^\s*[rRuUbB]*("""|''')([\s\S]*?)\1|^\s*[rRuU]*(["'])(.*?)\3/.exec(
            text.slice(hdrEndPos + 1, hdrEndPos + 1800),
          );
        let doc = dm2 ? (dm2[2] != null ? dm2[2] : dm2[4]) : "";
        doc = doc
          .split("\n")
          .map((l) => l.trim())
          .join("\n")
          .trim();
        if (!doc) doc = docAbove(lines, i, "hash");
        let route = null;
        for (const dc of decos) {
          const rm =
            /^@\s*([\w.]+)\.(get|post|put|delete|patch|head|options|route|websocket|api_route)\(\s*['"]([^'"]*)['"]([^)]*)/.exec(
              dc,
            );
          if (rm) {
            let method = rm[2].toUpperCase();
            if (method === "ROUTE" || method === "API_ROUTE") {
              const ms = /methods\s*=\s*\[([^\]]*)\]/.exec(rm[4]);
              method = ms
                ? ms[1]
                    .replace(/['"\s]/g, "")
                    .toUpperCase()
                    .split(",")
                    .join("|")
                : "GET";
            }
            route = { method, path: rm[3] };
          }
        }
        if (route && dm) kind = "route";
        const s = ctx.newSym(f, {
          name,
          kind,
          className: top && top.kind === "class" ? top.name : null,
          startPos,
          endPos,
          sigStart: startPos,
          sigEnd: Math.min(hdrEndPos + 1, endPos),
          nameStart: nameAt,
          exported: !stack.length && !name.startsWith("_"),
          async: !!(dm && dm[2]),
          params,
          decorators: decos,
          route,
          superName: bases[0] ? bases[0].replace(/\(.*$/, "") : null,
          implementsList: bases.slice(1).map((b) => b.replace(/\(.*$/, "")),
          parentName: top ? top.name : null,
        });
        s.doc = doc;
        s.complexity =
          1 +
          (
            m
              .slice(startPos, endPos)
              .match(/\b(?:if|elif|for|while|except|and|or|case)\b/g) || []
          ).length;
        if (route) {
          s.label = route.method + " " + route.path + " · " + name;
          ctx.routes.push({
            sym: s.id,
            method: route.method,
            path: route.path,
          });
        }
        if (decos.some((x) => /dataclass/.test(x))) s.dataclass = true;
        syms.push(s);
        declPos.add(nameAt);
        stack.push({ indent: ind, name, kind: dm ? "def" : "class", sym: s });
      }
    }
    for (const ch of ln) {
      if ("([{".includes(ch)) pd++;
      else if (")]}".includes(ch)) pd--;
    }
    if (pd < 0) pd = 0;
  }
  /* calls */
  const items = [];
  {
    const re = /([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*\(/g;
    let c;
    while ((c = re.exec(m))) {
      const parts = c[1].replace(/\s+/g, "").split(".");
      const name = parts.pop();
      const recv = parts.join(".") || null;
      if (!recv && PY_KW.has(name)) continue;
      if (declPos.has(c.index + c[1].length - name.length)) continue;
      if (/\b(def|class)\s+$/.test(m.slice(Math.max(0, c.index - 8), c.index)))
        continue;
      if (!recv) {
        let k = c.index - 1;
        while (k >= 0 && (m[k] === " " || m[k] === "\t")) k--;
        if (m[k] === ".")
          items.push({
            pos: c.index,
            name,
            recv: "?",
            type: "call",
            line: lineOf(c.index),
          });
        else
          items.push({
            pos: c.index,
            name,
            recv: null,
            type: "call",
            line: lineOf(c.index),
          });
      } else
        items.push({
          pos: c.index,
          name,
          recv,
          type: "call",
          line: lineOf(c.index),
        });
    }
  }
  assignOwners(items, syms);
  for (const it of items)
    (it.owner ? it.owner.rawCalls : f.topCalls).push({
      name: it.name,
      recv: it.recv,
      type: it.type,
      line: it.line,
    });
  const env = new Set();
  {
    const re =
      /(?:os\.environ(?:\.get)?\s*[\[(]\s*|os\.getenv\s*\(\s*|\bgetenv\s*\(\s*)['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g;
    let c;
    while ((c = re.exec(mS))) env.add(c[1]);
  }
  f.env = [...env];
  f.isScript = /^if\s+__name__\s*==\s*['"]__main__['"]/m.test(m);
  f.exports = syms
    .filter((s) => s.exported && !stack.length)
    .map((s) => s.name);
  const all = /__all__\s*=\s*[\[(]([^\])]*)[\])]/.exec(mS);
  if (all) f.exports = [...all[1].matchAll(/['"](\w+)['"]/g)].map((x) => x[1]);
  return syms;
}

/* ===== Rust ===== */
function expandUse(s, prefix) {
  prefix = prefix || [];
  s = s.trim();
  const out = [];
  const bi = s.indexOf("{");
  if (bi < 0) {
    const mm = /^(.*?)(?:\s+as\s+(\w+))?$/.exec(s);
    const segs = mm[1]
      .split("::")
      .map((x) => x.trim())
      .filter(Boolean);
    out.push({ path: prefix.concat(segs), alias: mm[2] || null });
    return out;
  }
  const pre = s
    .slice(0, bi)
    .split("::")
    .map((x) => x.trim())
    .filter(Boolean);
  const be = matchClose(s, bi, "{", "}");
  for (const part of splitTop(s.slice(bi + 1, be), ","))
    out.push(...expandUse(part, prefix.concat(pre)));
  return out;
}
function resolveRustPath(ctx, f, segs) {
  const crate = f.crate;
  if (!crate) return null;
  let root = crate,
    base = [],
    rest = segs.slice();
  const first = rest[0];
  if (first === "crate") {
    rest.shift();
  } else if (first === "self") {
    base = f.modPath.slice();
    rest.shift();
  } else if (first === "super") {
    base = f.modPath.slice();
    while (rest[0] === "super") {
      base.pop();
      rest.shift();
    }
  } else if (
    crate.mods.has(f.modPath.concat(first).join("::")) &&
    f.modPath.length >= 0 &&
    !ctx.crates.has(first)
  ) {
    base = f.modPath.slice();
  } else if (["std", "core", "alloc"].includes(first))
    return { skip: true, ext: first };
  else {
    const c = ctx.crates.get(first.replace(/-/g, "_"));
    if (c && c !== crate) {
      root = c;
      rest.shift();
    } else if (c === crate) {
      rest.shift();
    } else return { ext: first };
  }
  let cur = base,
    file = root.mods.get(cur.join("::")) || null,
    used = 0;
  for (const seg of rest) {
    const cand = cur.concat(seg);
    if (root.mods.has(cand.join("::"))) {
      cur = cand;
      file = root.mods.get(cand.join("::"));
      used++;
    } else break;
  }
  if (!file) return null;
  return {
    file,
    item: rest[used] && rest[used] !== "*" ? rest[used] : null,
    glob: rest[used] === "*",
    moduleOnly: used === rest.length,
  };
}
function attrsAbove(lines, idx) {
  const out = [];
  for (let i = idx - 1; i >= 0; i--) {
    const l = lines[i];
    if (/^\s*#\[/.test(l)) out.unshift(l.trim());
    else if (/^\s*\/\/\//.test(l)) continue;
    else break;
  }
  return out;
}

function parseRust(f, ctx) {
  const text = f.text,
    mAll = maskRust(text, false),
    mStr = maskRust(text, true),
    lineOf = f.lineOf,
    lines = f.lineArr;
  const syms = [],
    declPos = new Set();
  let m;
  const mk = (o) => {
    const s = ctx.newSym(f, o);
    s.doc = docAbove(lines, s.line - 1, "rust");
    s.complexity =
      1 +
      (
        mAll
          .slice(o.startPos, o.endPos)
          .match(/\b(?:if|for|while|match|loop)\b|&&|\|\||\?(?!\w)/g) || []
      ).length;
    syms.push(s);
    if (o.nameStart != null) declPos.add(o.nameStart);
    return s;
  };
  /* uses / mods */
  const impByTarget = new Map();
  const addImp = (target, ext, spec, line, name, kind) => {
    const key = target || "x:" + ext;
    let imp = impByTarget.get(key);
    if (!imp) {
      imp = {
        spec,
        line,
        names: [],
        target: target || null,
        external: target ? null : ext,
        builtin: false,
        kind: kind || "use",
      };
      impByTarget.set(key, imp);
      f.imports.push(imp);
    }
    if (name && !imp.names.includes(name)) imp.names.push(name);
    return imp;
  };
  const reMod = /(^|[\s;{}])(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/g;
  while ((m = reMod.exec(mAll))) {
    const key = f.modPath.concat(m[2]).join("::");
    const t = f.crate && f.crate.mods.get(key);
    if (t) addImp(t.id, null, "mod " + m[2], lineOf(m.index), m[2], "mod");
  }
  const reUse = /(^|[\s;{}])(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);/g;
  while ((m = reUse.exec(mAll))) {
    const line = lineOf(m.index);
    for (const u of expandUse(m[2])) {
      let segs = u.path.slice();
      if (segs[segs.length - 1] === "self") segs.pop();
      if (!segs.length) continue;
      const r = resolveRustPath(ctx, f, segs);
      if (!r || r.skip) continue;
      const spec = segs.join("::");
      if (r.file) {
        const imp = addImp(
          r.file.id,
          null,
          spec,
          line,
          r.item || (r.glob ? "*" : null),
        );
        const last = segs[segs.length - 1];
        const local = u.alias || (last === "*" ? null : last);
        if (local)
          f.localNames.set(local, {
            imp,
            imported: r.moduleOnly ? "*" : r.item || "*",
          });
      } else if (r.ext) {
        const imp = addImp(null, r.ext, r.ext, line, null);
        const last = segs[segs.length - 1];
        if (last !== "*")
          f.localNames.set(u.alias || last, { imp, imported: last });
      }
    }
  }
  /* containers */
  const containers = [];
  {
    const re =
      /(^|[\s;{}])(?:unsafe\s+)?impl\b\s*(?:<[^{}]*?>)?\s*(?:(!?[\w:]+(?:<[^{}]*?>)?)\s+for\s+)?([\w:]+)(?:<[^{}]*?>)?\s*(?:where[^{]*)?\{/g;
    while ((m = re.exec(mAll))) {
      const bo = m.index + m[0].length - 1;
      const type = m[3].split("::").pop();
      const trait = m[2] ? m[2].replace(/<.*$/, "").split("::").pop() : null;
      containers.push({
        kind: "impl",
        name: type,
        trait,
        bo,
        be: matchClose(mAll, bo, "{", "}") + 1,
      });
      if (trait)
        ctx.rawRefs.push({
          file: f.id,
          from: type,
          to: trait,
          type: "extends",
          label: "impl " + trait + " for " + type,
          line: lineOf(m.index),
        });
    }
    const reTr =
      /(^|[\s;{}])(pub(?:\([^)]*\))?\s+)?(?:unsafe\s+)?trait\s+([A-Za-z_]\w*)[^{;]*\{/g;
    while ((m = reTr.exec(mAll))) {
      const bo = m.index + m[0].length - 1,
        be = matchClose(mAll, bo, "{", "}") + 1;
      const start = m.index + m[1].length;
      const s = mk({
        name: m[3],
        kind: "trait",
        startPos: start,
        endPos: be,
        sigStart: start,
        sigEnd: bo,
        nameStart: mAll.indexOf(m[3], start),
        exported: !!m[2],
      });
      containers.push({ kind: "trait", name: m[3], bo, be, sym: s });
    }
    const reMo =
      /(^|[\s;{}])(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*\{/g;
    while ((m = reMo.exec(mAll))) {
      const bo = m.index + m[0].length - 1;
      containers.push({
        kind: "mod",
        name: m[2],
        bo,
        be: matchClose(mAll, bo, "{", "}") + 1,
      });
    }
  }
  const containerAt = (pos) => {
    let best = null;
    for (const c of containers)
      if (pos > c.bo && pos < c.be && (!best || c.bo > best.bo)) best = c;
    return best;
  };
  /* structs / enums */
  {
    const re =
      /(^|[\s;{}])(pub(?:\([^)]*\))?\s+)?(struct|enum|union)\s+([A-Za-z_]\w*)/g;
    while ((m = re.exec(mAll))) {
      const start = m.index + m[1].length,
        after = m.index + m[0].length;
      let q = after;
      let end,
        fields = [];
      while (q < mAll.length && !"{(;".includes(mAll[q])) q++;
      if (mAll[q] === "{") {
        end = matchClose(mAll, q, "{", "}") + 1;
        const inner = text.slice(q + 1, end - 1);
        fields = splitTop(inner, ",")
          .map((x) =>
            x
              .replace(/^\s*(?:\/\/.*\n\s*)*/, "")
              .replace(/#\[[^\]]*\]\s*/g, "")
              .replace(/^pub(\([^)]*\))?\s+/, "")
              .trim(),
          )
          .filter(Boolean);
      } else if (mAll[q] === "(") {
        end = matchClose(mAll, q, "(", ")") + 1;
        fields = splitTop(text.slice(q + 1, end - 1), ",").map((x) =>
          x.replace(/^pub(\([^)]*\))?\s+/, "").trim(),
        );
        while (end < mAll.length && mAll[end] !== ";" && mAll[end] !== "\n")
          end++;
        end++;
      } else end = q + 1;
      const kind = m[3] === "enum" ? "enum" : "struct";
      const attrs = attrsAbove(lines, lineOf(start) - 1);
      const s = mk({
        name: m[4],
        kind,
        startPos: start,
        endPos: end,
        sigStart: start,
        sigEnd: Math.min(end, q),
        nameStart: after - m[4].length,
        exported: !!m[2],
      });
      if (kind === "enum")
        s.extra.push({
          label: "Variants",
          items: fields
            .map((x) => x.replace(/\s*[({=].*$/s, "").trim())
            .filter(Boolean)
            .slice(0, 60),
        });
      else if (fields.length)
        s.extra.push({
          label: "Fields",
          items: fields.slice(0, 60).map((x) => x.replace(/\s+/g, " ")),
        });
      const der = attrs
        .map((a) => /derive\(([^)]*)\)/.exec(a))
        .filter(Boolean)
        .map((x) => x[1].trim())
        .join(", ");
      if (der)
        s.extra.push({
          label: "Derives",
          items: der
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        });
      re.lastIndex = after;
    }
    const reTy =
      /(^|[\s;{}])(pub(?:\([^)]*\))?\s+)?type\s+([A-Za-z_]\w*)[^=;{]*=[^;]*;/g;
    while ((m = reTy.exec(mAll))) {
      const start = m.index + m[1].length;
      mk({
        name: m[3],
        kind: "type",
        startPos: start,
        endPos: m.index + m[0].length,
        sigStart: start,
        sigEnd: m.index + m[0].length,
        nameStart: mAll.indexOf(m[3], start),
        exported: !!m[2],
      });
    }
  }
  /* functions */
  {
    const re =
      /(^|[\s;{}])(pub(?:\([^)]*\))?\s+)?(?:const\s+)?(async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/g;
    while ((m = re.exec(mAll))) {
      const start = m.index + m[1].length,
        after = m.index + m[0].length,
        name = m[4];
      const po = mAll.indexOf("(", after);
      if (po < 0) continue;
      const pc = matchClose(mAll, po, "(", ")");
      let q = pc + 1;
      while (q < mAll.length && mAll[q] !== "{" && mAll[q] !== ";") q++;
      const hasBody = mAll[q] === "{";
      const end = hasBody ? matchClose(mAll, q, "{", "}") + 1 : q + 1;
      const cont = containerAt(start);
      const params = splitTop(text.slice(po + 1, pc), ",").filter(Boolean);
      const attrs = attrsAbove(lines, lineOf(start) - 1);
      let route = null;
      for (const a of attrs) {
        const rm =
          /^#\[\s*(get|post|put|delete|patch|head|options)\s*\(\s*"([^"]*)"/.exec(
            a,
          );
        if (rm) route = { method: rm[1].toUpperCase(), path: rm[2] };
      }
      const isTest = attrs.some((a) => /^#\[\s*(\w+::)?test\b/.test(a));
      const className =
        cont && (cont.kind === "impl" || cont.kind === "trait")
          ? cont.name
          : null;
      const modPrefix = (() => {
        const parts = [];
        for (const c of containers)
          if (c.kind === "mod" && start > c.bo && start < c.be)
            parts.push(c.name);
        return parts;
      })();
      const kind = route ? "route" : className ? "method" : "function";
      const sig = text
        .slice(start, hasBody ? q : q)
        .replace(/\s+/g, " ")
        .trim();
      const s = mk({
        name,
        kind,
        className,
        startPos: start,
        endPos: end,
        sigStart: start,
        sigEnd: q,
        nameStart: after - name.length,
        exported: !!m[2],
        async: !!m[3],
        params,
        route,
        isTest,
        isStatic: className ? !params.some((p) => /\bself\b/.test(p)) : false,
        traitImpl: cont && cont.kind === "impl" ? cont.trait : null,
        noBody: !hasBody,
        modPrefix,
      });
      if (route) {
        s.label = route.method + " " + route.path + " · " + name;
        ctx.routes.push({ sym: s.id, method: route.method, path: route.path });
      }
      if (name === "main" && !className) f.hasMain = true;
      re.lastIndex = after;
    }
  }
  /* calls */
  const items = [];
  const SKIP = new Set([
    "Some",
    "Ok",
    "Err",
    "Box",
    "Vec",
    "String",
    "Arc",
    "Rc",
    "Mutex",
    "RefCell",
    "Cell",
    "Option",
    "Result",
  ]);
  {
    const re =
      /([A-Za-z_]\w*(?:\s*(?:::\s*(?:<[^<>()]*>\s*::\s*)?|\.\s*)[A-Za-z_]\w*)*)\s*(?:::\s*<[^()]*?>)?\s*\(/g;
    let c;
    while ((c = re.exec(mAll))) {
      const raw = c[1].replace(/\s+/g, "");
      const nm = /([A-Za-z_]\w*)$/.exec(raw)[1];
      const pre = raw.slice(0, raw.length - nm.length);
      const member = pre.endsWith(".");
      const recvParts = pre
        .replace(/(::|\.)$/, "")
        .split(/::|\./)
        .filter(Boolean);
      if (!recvParts.length && (KEYWORDS.has(nm) || SKIP.has(nm))) continue;
      if (
        recvParts.length &&
        KEYWORDS.has(recvParts[0]) &&
        recvParts[0] !== "Self" &&
        recvParts[0] !== "self"
      )
        continue;
      if (declPos.has(c.index + c[1].length - nm.length)) continue;
      if (/\bfn\s+$/.test(mAll.slice(Math.max(0, c.index - 6), c.index)))
        continue;
      let recv = recvParts.length ? recvParts.join("::") : null;
      if (!recv) {
        let k = c.index - 1;
        while (k >= 0 && /\s/.test(mAll[k])) k--;
        if (mAll[k] === ".") recv = "?";
      }
      items.push({
        pos: c.index,
        name: nm,
        recv,
        member,
        type: "call",
        line: lineOf(c.index),
      });
    }
  }
  assignOwners(items, syms);
  for (const it of items)
    (it.owner ? it.owner.rawCalls : f.topCalls).push({
      name: it.name,
      recv: it.recv,
      member: it.member,
      type: it.type,
      line: it.line,
    });
  const env = new Set();
  {
    const re =
      /env::var(?:_os)?\(\s*"([A-Za-z0-9_]+)"|env!\(\s*"([A-Za-z0-9_]+)"/g;
    while ((m = re.exec(mStr))) env.add(m[1] || m[2]);
  }
  f.env = [...env];
  f.exports = syms
    .filter((s) => s.exported && s.kind !== "method")
    .map((s) => s.name);
  return syms;
}

/* ===== Bash ===== */
const SH_BUILTINS = new Set(
  "echo cd local export return exit read printf test set shift source true false break continue case esac fi done in then do else elif if while until for function select eval exec trap unset declare readonly typeset getopts wait kill umask alias unalias type command builtin pwd pushd popd let time ulimit hash help history jobs fg bg bind complete shopt".split(
    " ",
  ),
);
const SH_TOOLS = new Set(
  "docker docker-compose podman psql pg_dump pg_restore pg_isready createdb dropdb npm npx yarn pnpm node deno bun python python3 pip pip3 poetry cargo rustc rustup git curl wget make ssh scp rsync kubectl helm terraform aws gcloud az sed awk grep tar zip unzip jq openssl systemctl service sudo apt apt-get yum brew chmod chown mkdir cp mv rm ln find xargs tee cat ls".split(
    " ",
  ),
);

function parseSh(f, ctx) {
  const text = f.text,
    m = maskSh(text, false),
    mS = maskSh(text, true),
    lineOf = f.lineOf,
    lines = f.lineArr;
  const syms = [],
    declPos = new Set();
  let mt;
  const defs = [];
  const re1 =
      /^[ \t]*function\s+([A-Za-z_][\w:.-]*)\s*(?:\(\s*\))?[ \t]*(\{)?/gm,
    re2 = /^[ \t]*([A-Za-z_][\w:.-]*)\s*\(\s*\)[ \t]*(\{)?/gm;
  for (const re of [re1, re2])
    while ((mt = re.exec(m)))
      defs.push({
        name: mt[1],
        idx: mt.index,
        len: mt[0].length,
        brace: !!mt[2],
      });
  for (const d of defs) {
    let bo = d.brace ? d.idx + d.len - 1 : -1;
    if (bo < 0) {
      let k = d.idx + d.len;
      while (k < m.length && /\s/.test(m[k])) k++;
      if (m[k] === "{") bo = k;
    }
    if (bo < 0) continue;
    const end = matchClose(m, bo, "{", "}") + 1;
    const lead = m.slice(d.idx).match(/^[ \t]*/)[0].length;
    const start = d.idx + lead;
    const params = [];
    const body = text.slice(bo, end);
    const usage = new Set(
      (body.match(/\$\{?[1-9]\b/g) || []).map((x) => x.replace(/[${}]/g, "")),
    );
    for (const u of [...usage].sort()) params.push("$" + u);
    const s = ctx.newSym(f, {
      name: d.name,
      kind: "function",
      startPos: start,
      endPos: end,
      sigStart: start,
      sigEnd: bo,
      nameStart:
        start +
        (m.slice(start, start + 12).startsWith("function")
          ? m.slice(start).search(/\s/) + 1
          : 0),
      exported: true,
      params,
    });
    s.nameStart = m.indexOf(d.name, start);
    s.doc = docAbove(lines, s.line - 1, "hash");
    s.complexity =
      1 +
      (
        m
          .slice(start, end)
          .match(/\b(?:if|elif|for|while|until|case)\b|&&|\|\|/g) || []
      ).length;
    syms.push(s);
    declPos.add(s.nameStart);
  }
  /* sourcing + script references */
  const tools = new Map();
  const reSrc = /(?:^|[;&|(\s])(?:source|\.)[ \t]+["']?([^\s"';&|)]+)/gm;
  while ((mt = reSrc.exec(mS))) {
    if (mt[1] === "/dev/stdin") continue;
    const t = ctx.resolveLoose(mt[1], f);
    const imp = {
      spec: mt[1],
      line: lineOf(mt.index),
      names: [],
      target: t && t.path ? t.id : null,
      external: t && t.path ? null : null,
      kind: "source",
    };
    if (imp.target) {
      f.imports.push(imp);
      f.sources.push(imp.target);
    }
  }
  const reRun =
    /(?:^|[\s"'=(])((?:\.{0,2}\/)?[\w.${}\-\/]+\.(?:sh|bash|py|js|mjs|cjs|ts|sql|rs|ya?ml)|(?:\.{0,2}\/)?[\w.${}\/-]*[Dd]ockerfile[\w.-]*)(?=$|[\s"';&|)])/gm;
  const seenRun = new Set();
  while ((mt = reRun.exec(mS))) {
    const t = ctx.resolveLoose(mt[1], f);
    if (!t || !t.path || t.id === f.id || seenRun.has(t.id)) continue;
    seenRun.add(t.id);
    if (f.imports.some((i) => i.target === t.id && i.kind === "source"))
      continue;
    ctx.addRel(f.id, t.id, "run", "runs " + mt[1], lineOf(mt.index));
  }
  /* command-position words -> potential function calls; tool usage */
  const items = [];
  const reCmd =
    /(?:^|&&|\|\||[;|(]|\$\(|`|\bthen\b|\bdo\b|\belse\b|\bif\b|\bwhile\b|\buntil\b|!)[ \t]*([A-Za-z_][\w:.-]*)/gm;
  while ((mt = reCmd.exec(m))) {
    const w = mt[1];
    const pos = mt.index + mt[0].length - w.length;
    if (SH_TOOLS.has(w)) tools.set(w, (tools.get(w) || 0) + 1);
    if (SH_BUILTINS.has(w) || declPos.has(pos)) continue;
    items.push({ pos, name: w, recv: null, type: "call", line: lineOf(pos) });
  }
  assignOwners(items, syms);
  for (const it of items)
    (it.owner ? it.owner.rawCalls : f.topCalls).push({
      name: it.name,
      recv: null,
      type: "call",
      line: it.line,
      cmd: true,
    });
  f.tools = [...tools.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  f.exports = syms.map((s) => s.name);
  f.env = [];
  return syms;
}
