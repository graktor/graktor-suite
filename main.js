// Graktor Complete Suite -- one installer that merges graktor-desktop (thin window around the
// live cloud app) and graktor-offline (spawns a bundled local host, license-key activated) into
// a single app. On first launch it asks which one you want; after that it just behaves as
// whichever was chosen, every time, until you switch (Ctrl+Shift+M).
const { app, BrowserWindow, Menu, shell, session, ipcMain, dialog, globalShortcut } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const CLOUD_URL = "https://app.graktor.com";
const PORT = 5257;
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const STATE_FILE = path.join(app.getPath("userData"), "window-state.json");
const MODE_FILE = path.join(app.getPath("userData"), "suite-mode.json");

function loadMode() {
  try {
    return JSON.parse(fs.readFileSync(MODE_FILE, "utf-8")).mode;
  } catch {
    return null;
  }
}

function saveMode(mode) {
  fs.writeFileSync(MODE_FILE, JSON.stringify({ mode }));
}

function clearMode() {
  try {
    fs.unlinkSync(MODE_FILE);
  } catch {
    // Already gone -- fine.
  }
}

// Same bundling convention as graktor-offline: a packaged build ships the host exe under
// resources/host (see package.json's extraResources); in dev it's read from the sibling
// offline/ZendoriaOfflineHost/publish folder instead.
function hostExecutablePath() {
  const exeName = process.platform === "win32" ? "Zendoria.Api.exe" : "Zendoria.Api";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "host", exeName);
  }
  const rid = process.platform === "win32" ? "win-x64" : process.platform === "darwin" ? (process.arch === "arm64" ? "osx-arm64" : "osx-x64") : "linux-x64";
  return path.join(__dirname, "..", "..", "offline", "ZendoriaOfflineHost", "publish", rid, exeName);
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { width: 1400, height: 900 };
  }
}

function saveWindowState(win) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(win.getBounds()));
  } catch {
    // Not remembering window position/size next launch is harmless -- never worth crashing over.
  }
}

/** Same reasoning as graktor-offline's own version: first-run schema creation can take ~25-30s. */
function waitForHost(timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      const req = http.get(LOCAL_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) return reject(new Error("Graktor didn't start in time."));
        setTimeout(poll, 300);
      });
    })();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;
  let hostProcess = null;

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function stopHost() {
    if (hostProcess) {
      hostProcess.kill();
      hostProcess = null;
    }
  }

  function startHost() {
    const exe = hostExecutablePath();
    if (!fs.existsSync(exe)) {
      throw new Error(`Graktor's local server wasn't found at ${exe}. Reinstall the app.`);
    }
    hostProcess = spawn(exe, [], { cwd: path.dirname(exe), stdio: "ignore", windowsHide: true });
    hostProcess.on("exit", async () => {
      hostProcess = null;
      if (!mainWindow) return; // null only on a deliberate quit (see before-quit below)
      // Any other exit -- a real crash, or a deliberate one after a cloud-backup restore stages a
      // new database file -- gets the same response: try bringing the host back up. See
      // graktor-offline's own main.js for the full reasoning; identical here.
      try {
        startHost();
        await waitForHost();
        mainWindow.loadURL(LOCAL_URL);
      } catch {
        mainWindow.loadFile(path.join(__dirname, "crashed.html"));
      }
    });
  }

  async function runOffline() {
    mainWindow.loadFile(path.join(__dirname, "starting.html"));
    try {
      startHost();
      await waitForHost();
      mainWindow.loadURL(LOCAL_URL);
    } catch {
      mainWindow.loadFile(path.join(__dirname, "crashed.html"));
    }
  }

  function runCloud() {
    stopHost();
    mainWindow.loadURL(CLOUD_URL);
  }

  function runMode(mode) {
    if (mode === "offline") runOffline();
    else runCloud();
  }

  function showChooser() {
    stopHost();
    mainWindow.loadFile(path.join(__dirname, "chooser.html"));
  }

  ipcMain.on("suite-choose-mode", (_event, mode) => {
    saveMode(mode);
    runMode(mode);
  });

  function createWindow() {
    const state = loadWindowState();
    mainWindow = new BrowserWindow({
      ...state,
      minWidth: 900,
      minHeight: 600,
      title: "Graktor",
      backgroundColor: "#111318",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: false,
    });

    mainWindow.once("ready-to-show", () => mainWindow.show());
    mainWindow.on("resize", () => saveWindowState(mainWindow));
    mainWindow.on("move", () => saveWindowState(mainWindow));

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });

    // Cloud mode only -- a failed navigation (connection dropped) shows a friendlier offline
    // screen instead of Chromium's own error page. Offline mode's own failures are handled by
    // runOffline/startHost's try/catch above, not this.
    mainWindow.webContents.on("did-fail-load", (_event, errorCode) => {
      if (errorCode === -3) return; // ERR_ABORTED -- a normal in-page navigation, not a real failure
      if (loadMode() === "cloud") mainWindow.loadFile(path.join(__dirname, "offline.html"));
    });

    mainWindow.setMenu(null);
  }

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

    createWindow();

    const mode = loadMode();
    if (mode) runMode(mode);
    else showChooser();

    Menu.setApplicationMenu(null);

    globalShortcut.register("CommandOrControl+R", () => {
      const mode = loadMode();
      if (mode === "offline") mainWindow?.loadURL(LOCAL_URL);
      else if (mode === "cloud") mainWindow?.loadURL(CLOUD_URL);
    });
    globalShortcut.register("CommandOrControl+Shift+I", () => mainWindow?.webContents.toggleDevTools());
    // The one way to go back and pick a different mode -- intentionally not in any visible menu
    // (there is none, by design, same as the other desktop apps), but discoverable from the
    // in-app "About/Switch mode" help text, same shortcut on every platform.
    globalShortcut.register("CommandOrControl+Shift+M", async () => {
      const choice = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["Cancel", "Switch"],
        defaultId: 0,
        cancelId: 0,
        title: "Switch mode",
        message: "Switch between a cloud account and a license key?",
        detail: "Your data in the mode you're leaving isn't touched -- you can always switch back.",
      });
      if (choice.response === 1) {
        clearMode();
        showChooser();
      }
    });
  });

  app.on("before-quit", () => {
    mainWindow = null; // so the host's own "exit" handler above doesn't show a crash screen on a normal quit
    stopHost();
  });

  app.on("window-all-closed", () => app.quit());
}
