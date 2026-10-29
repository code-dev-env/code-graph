// Bundles src/* into code-graph.html (single self-contained file) and build/analyzer.js (for tests)
const fs = require("fs"),
  path = require("path");
const src = (f) => fs.readFileSync(path.join(__dirname, "src", f), "utf8");
// The parts share one closure; the IIFE wrapper lives here so each part is valid JS on its own (Prettier-friendly)
const analyzer =
  "const Analyzer = (function () {\n'use strict';\n" +
  ["a1-util.js", "a2-js.js", "a3-py-rs-sh.js", "a4-infra.js", "a5-analyze.js"]
    .map(src)
    .join("\n") +
  "\nreturn { analyze, kindOfFile };\n})();\nif (typeof module !== 'undefined') module.exports = Analyzer;\n";
fs.mkdirSync(path.join(__dirname, "build"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "build", "analyzer.js"), analyzer);
if (fs.existsSync(path.join(__dirname, "src", "template.html"))) {
  let html = src("template.html").replace("/*__FAVICON__*/", () =>
    fs
      .readFileSync(path.join(__dirname, "launcher", "favicon.b64"), "utf8")
      .trim(),
  );
  html = html
    .replace("/*__CSS__*/", () => src("style.css"))
    .replace("/*__ANALYZER__*/", () =>
      analyzer.replace(/<\/script/gi, "<\\/script"),
    )
    .replace("/*__UI__*/", () =>
      src("ui.js").replace(/<\/script/gi, "<\\/script"),
    );
  fs.writeFileSync(path.join(__dirname, "code-graph.html"), html);
  console.log("built code-graph.html", (html.length / 1024).toFixed(0) + " KB");
}
