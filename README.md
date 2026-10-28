# Code Graph

Code Graph turns a project folder into an interactive map of how its code connects: files, functions, components, routes, SQL tables and Docker services, and the calls and imports between them.

Everything runs locally in the browser. Your code is never uploaded and no internet connection is required.

## Features

- **Two views**: a force-directed graph, or a flowchart with entry points on the left and their dependencies to the right.
- **Adjustable detail**: show files, folders, functions, or a combination.
- **Filtering**: narrow the graph by language, connection type, symbol kind and folder.
- **Search**: quickly find files, functions and tables (`/`).
- **Details panel**: select a node to see its description, signature and relationships. Descriptions come from comments and docstrings where present, and are otherwise inferred from names and structure (marked as inferred).
- **Export**: save the graph as a self-contained interactive HTML snapshot, a JSON file, or a PNG image.
- **Light and dark themes**.

## Supported languages and technologies

JavaScript, TypeScript, React, Vue 3, Node.js, Python, Rust, PostgreSQL / SQL, Docker (Dockerfile and Compose) and Bash.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/)
- Windows, to build the standalone launcher (the C# compiler ships with Windows)

### Build

```bat
build.bat
```

This produces:

- `code-graph.html`: the complete application as a single self-contained file. Open it in a Chromium-based browser (Edge or Chrome).
- `CodeGraph.exe`: a portable launcher that embeds the application and opens it in its own app window. No installation or administrator rights needed.

To build only the HTML file on any platform:

```sh
node build.js
```

### Usage

1. Open `code-graph.html` or run `CodeGraph.exe`.
2. Select a project folder, or drag and drop one onto the page.
3. Explore the graph.

| Action | Result |
| --- | --- |
| Click a node | Show its details |
| Double-click a node | Focus on its neighbourhood |
| Drag a node | Move and pin it |
| Drag background / scroll | Pan / zoom |
| `/` | Search |
| `F` | Fit graph to screen |
| `P` | Pin or unpin the selected node |
| `Esc` | Clear selection |

## Project structure

```
build.js        Bundles src/ into a single HTML file
build.bat       Runs build.js and compiles the Windows launcher
src/            Analyzer modules, UI, template and styles
launcher/       Windows launcher source and icon
```

## License

Released under the terms of the [LICENSE](LICENSE) file.
