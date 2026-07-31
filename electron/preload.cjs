const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  saveBoardImage: (rect) => ipcRenderer.invoke("save-board-image", rect),
  platform: process.platform,
});
