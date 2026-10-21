const { contextBridge, ipcRenderer } = require("electron");

// Only the chooser screen uses this -- the real app (cloud or local) is just the normal web app,
// which never needs a native bridge, same as graktor-desktop/graktor-offline.
contextBridge.exposeInMainWorld("suiteApi", {
  chooseMode: (mode) => ipcRenderer.send("suite-choose-mode", mode),
});
