const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 840,
    minHeight: 600,
    backgroundColor: "#f3f5f9",
    title: "直播分档榜",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

ipcMain.handle("save-board-image", async (_event, rect) => {
  if (!mainWindow || !rect) return { ok: false, reason: "窗口不可用" };

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "保存榜单图片",
    defaultPath: `直播分档榜-${new Date().toISOString().slice(0, 10)}.png`,
    filters: [{ name: "PNG 图片", extensions: ["png"] }],
  });

  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  const image = await mainWindow.webContents.capturePage({
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  });
  await fs.writeFile(result.filePath, image.toPNG());
  return { ok: true, filePath: result.filePath };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
