/* ===== Code Graph analyzer: shared utilities, comment/string masking, doc extraction, mini YAML ===== */

const NODE_BUILTINS = new Set(
  "assert async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns domain events fs http http2 https inspector module net os path perf_hooks process punycode querystring readline repl stream string_decoder sys timers tls trace_events tty url util v8 vm wasi worker_threads zlib".split(
    " ",
  ),
);
const NODE_WEB_PKGS = new Set(
  "express koa fastify hapi restify nestjs @nestjs/core next nuxt socket.io ws body-parser cors helmet morgan dotenv nodemon pm2 mongoose sequelize typeorm prisma @prisma/client pg knex".split(
    " ",
  ),
);
const COMMON = new Set(
  "Set Map WeakMap WeakSet Error TypeError Promise Date Array Object String Number Boolean RegExp Symbol Proxy Buffer URL URLSearchParams Function map filter forEach reduce push pop shift unshift slice splice join split get set has add delete then catch finally log error warn info debug toString valueOf keys values entries includes indexOf find findIndex some every sort concat replace match test exec trim now parse stringify assign create call apply bind send json end status use listen on off emit once next resolve reject all new from default clone len unwrap expect to_string into iter collect append extend update items read write open close format print range str int float list dict tuple bool isinstance super type min max sum abs round enumerate zip sorted reversed any map_err ok_or unwrap_or expect_err is_some is_none some none ok err lock borrow borrow_mut as_ref as_mut to_owned to_vec insert remove contains_key get_mut entry or_insert query run exit init start stop setup main load save".split(
    " ",
  ),
);
const KEYWORDS = new Set(
  "if for while switch catch function return typeof await new super this import export require delete void yield in of do else try with elif lambda not and or is assert print exec match loop fn mod use let const var def class sizeof async static await where impl pub struct enum trait type".split(
    " ",
  ),
);
const PY_BUILTINS = new Set(
  "print len range open str int float list dict set tuple bool isinstance issubclass super type min max sum abs round enumerate zip sorted reversed any all map filter iter next input id hash repr format getattr setattr hasattr callable vars dir property staticmethod classmethod object Exception ValueError TypeError KeyError".split(
    " ",
  ),
);

const baseName = (p) => p.slice(p.lastIndexOf("/") + 1);
const dirName = (p) => {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
};
const stemOf = (p) => baseName(p).replace(/\.[^.]*$/, "");
const extOf = (p) => {
  const b = baseName(p);
  const i = b.lastIndexOf(".");
  return i < 0 ? "" : b.slice(i + 1).toLowerCase();
};
function joinPath(a, b) {
  const parts = b.startsWith("/") ? [] : a ? a.split("/") : [];
  for (const seg of b.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}
function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++)
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  const lineOf = (pos) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  return { lineOf, starts, count: starts.length };
}
const pascal = (s) =>
  s.replace(/(^|[-_\s.]+)(\w)/g, (_, a, c) => c.toUpperCase());
const uniq = (a) => [...new Set(a)];
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const blankKeepNL = (s) => s.replace(/[^\n\r]/g, " ");
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function kindOfFile(path) {
  const b = baseName(path).toLowerCase(),
    e = extOf(path);
  if (/^dockerfile(\..+)?$/.test(b) || e === "dockerfile") return "dockerfile";
  if (/^(docker-)?compose(\..+)?\.ya?ml$/.test(b)) return "compose";
  if (b === "package.json") return "package";
  if (b === "cargo.toml") return "cargo";
  if (/^(ts|js)config(\..+)?\.json$/.test(b)) return "tsconfig";
  switch (e) {
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
      return "js";
    case "ts":
    case "mts":
    case "cts":
    case "tsx":
      return "ts";
    case "vue":
      return "vue";
    case "py":
    case "pyi":
      return "py";
    case "rs":
      return "rs";
    case "sql":
    case "psql":
    case "pgsql":
      return "sql";
    case "sh":
    case "bash":
    case "zsh":
      return "sh";
  }
  return null;
}

/* ---------- masking: replace comments (and optionally string bodies) with spaces, keeping offsets & newlines ---------- */
function regexAllowed(src, i) {
  let k = i - 1;
  while (k >= 0 && (src[k] === " " || src[k] === "\t")) k--;
  if (k < 0) return true;
  const p = src[k];
  if ("(,=:[!&|?{};+-*%~^\n".includes(p)) return true;
  if (/[\w$)\]]/.test(p)) {
    const m = /([A-Za-z_$][\w$]*)$/.exec(src.slice(Math.max(0, k - 10), k + 1));
    return (
      !!m &&
      /^(return|typeof|case|in|of|void|delete|throw|new|else|do)$/.test(m[1])
    );
  }
  return false;
}
function maskJS(src, keepStrings) {
  const out = src.split(""),
    n = src.length;
  let i = 0;
  const blank = (a, b) => {
    for (let k = a; k < b; k++) {
      const c = out[k];
      if (c !== "\n" && c !== "\r") out[k] = " ";
    }
  };
  while (i < n) {
    const c = src[i],
      d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      blank(i, j);
      i = j;
    } else if (c === "/" && d === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      blank(i, j);
      i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, n);
      if (!keepStrings) blank(i + 1, j - 1);
      i = j;
    } else if (c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== "`") {
        if (src[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, n);
      if (!keepStrings) blank(i + 1, j - 1);
      i = j;
    } else if (c === "/" && regexAllowed(src, i)) {
      let j = i + 1,
        cls = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") cls = true;
        else if (src[j] === "]") cls = false;
        else if (src[j] === "/" && !cls) break;
        j++;
      }
      if (j < n && src[j] === "/") {
        blank(i + 1, j);
        i = j + 1;
      } else i++;
    } else i++;
  }
  return out.join("");
}
function maskPy(src, keepStrings) {
  const out = src.split(""),
    n = src.length;
  let i = 0;
  const blank = (a, b) => {
    for (let k = a; k < b; k++) {
      const c = out[k];
      if (c !== "\n" && c !== "\r") out[k] = " ";
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === "#") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      blank(i, j);
      i = j;
    } else if (c === '"' || c === "'") {
      if (src.substr(i, 3) === c.repeat(3)) {
        const j = src.indexOf(c.repeat(3), i + 3);
        const end = j < 0 ? n : j;
        if (!keepStrings) blank(i + 3, end);
        i = j < 0 ? n : j + 3;
      } else {
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== "\n") {
          if (src[j] === "\\") j++;
          j++;
        }
        j = Math.min(j + 1, n);
        if (!keepStrings) blank(i + 1, j - 1);
        i = j;
      }
    } else i++;
  }
  return out.join("");
}
function maskRust(src, keepStrings) {
  const out = src.split(""),
    n = src.length;
  let i = 0;
  const blank = (a, b) => {
    for (let k = a; k < b; k++) {
      const c = out[k];
      if (c !== "\n" && c !== "\r") out[k] = " ";
    }
  };
  while (i < n) {
    const c = src[i],
      d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      blank(i, j);
      i = j;
    } else if (c === "/" && d === "*") {
      let depth = 1,
        j = i + 2;
      while (j < n && depth > 0) {
        if (src[j] === "/" && src[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (src[j] === "*" && src[j + 1] === "/") {
          depth--;
          j += 2;
        } else j++;
      }
      blank(i, j);
      i = j;
    } else if (
      c === "r" &&
      (d === '"' || d === "#") &&
      !/\w/.test(src[i - 1] || "")
    ) {
      let k = i + 1,
        h = 0;
      while (src[k] === "#") {
        h++;
        k++;
      }
      if (src[k] === '"') {
        const close = '"' + "#".repeat(h);
        let j = src.indexOf(close, k + 1);
        j = j < 0 ? n : j + close.length;
        if (!keepStrings) blank(k + 1, Math.max(k + 1, j - close.length));
        i = j;
      } else i++;
    } else if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') {
        if (src[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, n);
      if (!keepStrings) blank(i + 1, j - 1);
      i = j;
    } else if (c === "'") {
      if (d === "\\") {
        const j = src.indexOf("'", i + 2);
        if (j > 0 && j - i < 12) {
          if (!keepStrings) blank(i + 1, j);
          i = j + 1;
        } else i++;
      } else if (src[i + 2] === "'") {
        if (!keepStrings) blank(i + 1, i + 2);
        i += 3;
      } else i++;
    } else i++;
  }
  return out.join("");
}
function maskSh(src, keepStrings) {
  const out = src.split(""),
    n = src.length;
  let i = 0;
  const blank = (a, b) => {
    for (let k = a; k < b; k++) {
      const c = out[k];
      if (c !== "\n" && c !== "\r") out[k] = " ";
    }
  };
  while (i < n) {
    const c = src[i];
    if (
      c === "#" &&
      (i === 0 || /[\s;&|(]/.test(src[i - 1])) &&
      src[i - 1] !== "$"
    ) {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      blank(i, j);
      i = j;
    } else if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
      const m = /^<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(src.slice(i, i + 60));
      if (m) {
        const eol = src.indexOf("\n", i);
        if (eol < 0) {
          i = n;
          continue;
        }
        const re = new RegExp("^[ \\t]*" + m[2] + "[ \\t]*$", "m");
        const rest = src.slice(eol + 1);
        const em = re.exec(rest);
        const end = em ? eol + 1 + em.index : n;
        blank(eol + 1, end);
        i = em ? end + em[0].length : n;
      } else i += 2;
    } else if (c === "'") {
      let j = src.indexOf("'", i + 1);
      j = j < 0 ? n : j + 1;
      if (!keepStrings) blank(i + 1, j - 1);
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') {
        if (src[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, n);
      if (!keepStrings) blank(i + 1, j - 1);
      i = j;
    } else if (c === "\\") i += 2;
    else i++;
  }
  return out.join("");
}
function maskSql(src, keepStrings) {
  const out = src.split(""),
    n = src.length;
  let i = 0;
  const blank = (a, b) => {
    for (let k = a; k < b; k++) {
      const c = out[k];
      if (c !== "\n" && c !== "\r") out[k] = " ";
    }
  };
  while (i < n) {
    const c = src[i],
      d = src[i + 1];
    if (c === "-" && d === "-") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      blank(i, j);
      i = j;
    } else if (c === "/" && d === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      blank(i, j);
      i = j;
    } else if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      j = Math.min(j + 1, n);
      if (!keepStrings) blank(i + 1, j - 1);
      i = j;
    } else i++;
  }
  return out.join("");
}

function matchClose(m, openIdx, open, close) {
  let d = 0;
  for (let i = openIdx; i < m.length; i++) {
    const c = m[i];
    if (c === open) d++;
    else if (c === close) {
      d--;
      if (d === 0) return i;
    }
  }
  return m.length - 1;
}
function splitTop(s, sep) {
  sep = sep || ",";
  const out = [];
  let d = 0,
    cur = "",
    q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === q && s[i - 1] !== "\\") q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      q = c;
      cur += c;
      continue;
    }
    if ("([{<".includes(c) && !(c === "<" && s[i - 1] === "=")) d++;
    else if (")]}>".includes(c) && !(c === ">" && s[i - 1] === "=")) d--;
    if (c === sep && d <= 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/* ---------- comments / docs ---------- */
const DIRECTIVE =
  /^\s*(eslint|prettier|@ts-|istanbul|tslint|noqa|type:|pylint|region|endregion|nolint|#\s*region|<reference)/i;
function cleanDoc(raw) {
  return raw
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*(\/\*\*?|\*\/|\*(?!\w+\*)|\/\/\/?!?|#+|--+)\s?/, "")
        .replace(/\s*\*\/\s*$/, "")
        .replace(/^\s*\/\*\*?\s*/, "")
        .trimEnd(),
    )
    .filter((l) => !DIRECTIVE.test(l))
    .join("\n")
    .replace(/^\s+|\s+$/g, "");
}
function docAbove(lines, idx, style) {
  let i = idx - 1;
  while (i >= 0 && /^\s*(@[\w.]+(\(.*\))?|#\[.*\]|#!\[.*\])\s*$/.test(lines[i]))
    i--;
  const out = [];
  if (i < 0) return "";
  if (style === "c" || style === "rust") {
    if (/\*\/\s*$/.test(lines[i])) {
      let j = i;
      while (j >= 0 && !/\/\*/.test(lines[j])) j--;
      if (j >= 0) return cleanDoc(lines.slice(j, i + 1).join("\n"));
      return "";
    }
    while (
      i >= 0 &&
      /^\s*\/\/(?!\/\/)/.test(lines[i]) &&
      !/^\s*\/\/!/.test(lines[i])
    ) {
      out.unshift(lines[i]);
      i--;
    }
  } else if (style === "hash") {
    while (i >= 0 && /^\s*#(?!!)/.test(lines[i])) {
      out.unshift(lines[i]);
      i--;
    }
  } else if (style === "sql") {
    while (i >= 0 && /^\s*--/.test(lines[i])) {
      out.unshift(lines[i]);
      i--;
    }
  }
  return out.length ? cleanDoc(out.join("\n")) : "";
}
function docSummary(doc) {
  if (!doc) return "";
  const paras = [];
  for (const l of doc.split("\n")) {
    if (/^\s*@\w+/.test(l)) break;
    if (!l.trim()) {
      if (paras.length) break;
      else continue;
    }
    paras.push(l.trim());
  }
  return paras.join(" ");
}
function firstSentence(s, max) {
  max = max || 170;
  if (!s) return "";
  const m = /^(.+?[.!?])(\s|$)/.exec(s);
  const t = m ? m[1] : s;
  return clip(t, max);
}
function headerComment(text, lang) {
  const lines = text.replace(/^﻿/, "").split("\n").slice(0, 140);
  let i = 0;
  if (lines[0] && lines[0].startsWith("#!")) i++;
  while (
    i < lines.length &&
    (/^\s*$/.test(lines[i]) ||
      /^\s*['"]use (strict|client|server)['"];?\s*$/.test(lines[i]) ||
      /^#.*coding[:=]/.test(lines[i]))
  )
    i++;
  let raw = "";
  const rest = lines.slice(i);
  if (lang === "vue" && /^\s*<!--/.test(rest[0] || "")) {
    const j = rest.findIndex((l) => /-->/.test(l));
    raw = rest
      .slice(0, j + 1)
      .join("\n")
      .replace(/<!--|-->/g, "");
  } else if (lang === "py") {
    const m = /^\s*[rRuU]?("""|''')([\s\S]*?)\1/.exec(
      rest.slice(0, 80).join("\n"),
    );
    if (m) raw = m[2];
    else {
      const run = [];
      for (const l of rest) {
        if (/^\s*#/.test(l)) run.push(l);
        else break;
      }
      raw = run.join("\n");
    }
  } else if (
    lang === "sh" ||
    lang === "dockerfile" ||
    lang === "compose" ||
    lang === "toml"
  ) {
    const run = [];
    for (const l of rest) {
      if (/^\s*#/.test(l)) run.push(l);
      else break;
    }
    raw = run.join("\n");
  } else if (lang === "sql") {
    const run = [];
    for (const l of rest) {
      if (/^\s*--/.test(l)) run.push(l);
      else break;
    }
    raw = run.length
      ? run.join("\n")
      : /^\s*\/\*/.test(rest[0] || "")
        ? rest.slice(0, rest.findIndex((l) => /\*\//.test(l)) + 1).join("\n")
        : "";
  } else {
    if (/^\s*\/\*/.test(rest[0] || "")) {
      const j = rest.findIndex((l) => /\*\//.test(l));
      raw = rest.slice(0, j < 0 ? 0 : j + 1).join("\n");
    } else {
      const run = [];
      for (const l of rest) {
        if (
          /^\s*\/\/(?!\/\/)/.test(l) ||
          (lang === "rs" && /^\s*\/\/!/.test(l))
        )
          run.push(l);
        else break;
      }
      raw = run.join("\n");
    }
  }
  const doc = cleanDoc(raw);
  if (
    !doc ||
    /copyright|licen[sc]e|SPDX|all rights reserved|permission is hereby/i.test(
      doc,
    )
  )
    return "";
  return doc;
}

/* ---------- tiny YAML subset parser (enough for docker-compose) ---------- */
function parseYaml(text) {
  const lines = [];
  for (let raw of text.replace(/\r/g, "").split("\n")) {
    let s = raw,
      q = null,
      cut = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) {
        cut = i;
        break;
      }
    }
    if (cut >= 0) s = s.slice(0, cut);
    if (!s.trim() || /^---|^\.\.\./.test(s.trim())) continue;
    lines.push({ indent: s.length - s.trimStart().length, t: s.trim() });
  }
  let i = 0;
  const scalar = (v) => {
    v = v.trim();
    if (v === "" || v === "~" || v === "null") return null;
    if (/^&\w+\s*/.test(v)) v = v.replace(/^&\w+\s*/, "");
    if (/^\*/.test(v)) return v;
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))
      return v.slice(1, -1);
    if (v[0] === "[")
      return splitTop(v.slice(1, v.lastIndexOf("]")), ",").map(scalar);
    if (v[0] === "{") {
      const o = {};
      for (const kv of splitTop(v.slice(1, v.lastIndexOf("}")), ",")) {
        const k = kv.indexOf(":");
        if (k > 0) o[kv.slice(0, k).trim()] = scalar(kv.slice(k + 1));
      }
      return o;
    }
    return v;
  };
  const KV = /^("[^"]*"|'[^']*'|[^\s:][^:]*?)\s*:(?:\s+(.*))?$/;
  function block(ind) {
    if (i >= lines.length) return null;
    const first = lines[i];
    if (first.t === "-" || first.t.startsWith("- ")) return list(first.indent);
    return map(first.indent);
  }
  function map(ind) {
    const o = {};
    while (
      i < lines.length &&
      lines[i].indent === ind &&
      !(lines[i].t === "-" || lines[i].t.startsWith("- "))
    ) {
      const m = KV.exec(lines[i].t);
      if (!m) {
        i++;
        continue;
      }
      const key = m[1].replace(/^["']|["']$/g, "");
      let val = m[2];
      i++;
      if (val === undefined || val.trim() === "" || /^&\w+$/.test(val.trim())) {
        const nx = lines[i];
        if (
          nx &&
          (nx.indent > ind ||
            (nx.indent === ind && (nx.t === "-" || nx.t.startsWith("- "))))
        )
          o[key] = block(nx.indent);
        else o[key] = null;
      } else if (/^[|>][+-]?$/.test(val.trim())) {
        const buf = [];
        while (i < lines.length && lines[i].indent > ind) {
          buf.push(lines[i].t);
          i++;
        }
        o[key] = buf.join("\n");
      } else o[key] = scalar(val);
    }
    return o;
  }
  function list(ind) {
    const a = [];
    while (
      i < lines.length &&
      lines[i].indent === ind &&
      (lines[i].t === "-" || lines[i].t.startsWith("- "))
    ) {
      const item = lines[i].t.slice(1).trim();
      const off = lines[i].t.length - item.length;
      if (!item) {
        i++;
        const nx = lines[i];
        a.push(nx && nx.indent > ind ? block(nx.indent) : null);
        continue;
      }
      if (KV.test(item) && !/^["'\[{]/.test(item) && !/^https?:/.test(item)) {
        lines[i] = { indent: ind + off, t: item };
        a.push(map(ind + off));
      } else {
        a.push(scalar(item));
        i++;
      }
    }
    return a;
  }
  try {
    return block(0) || {};
  } catch (e) {
    return {};
  }
}
