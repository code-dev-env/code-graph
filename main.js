const { app, BrowserWindow, nativeTheme } = require("electron");
const path = require("path");

// Code Graph is a single self-contained page (code-graph.html). It runs fully offline, so the window
// is locked to that page: no navigation away, no pop-ups, no network permissions.
function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b1220" : "#ffffff",
    title: "Code Graph",
    icon: path.join(__dirname, "launcher", "icon.ico"),
  });
  win.removeMenu();
  win.loadFile("code-graph.html");
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  // keep the window title fixed (the page's <title> would otherwise replace it)
  win.on("page-title-updated", (e) => e.preventDefault());
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
