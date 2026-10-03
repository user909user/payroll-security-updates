const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let mainWindow = null;
let devServerProcess = null;

function isDev() {
  return !app.isPackaged;
}

function createWindow() {
  return new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 640,
    title: "Payroll",
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
}

function resourceCandidates() {
  if (isDev()) return [path.join(__dirname, "resources")];
  return [
    path.join(process.resourcesPath, "app-server"),
    path.join(process.resourcesPath, "resources"),
    process.resourcesPath,
  ];
}

function readBackendUrl() {
  const attempts = [];
  for (const root of resourceCandidates()) {
    const configPath = path.join(root, "backend-config.json");
    attempts.push(configPath);
    if (!fs.existsSync(configPath)) continue;
    try {
      const { backendUrl } = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const url = new URL(backendUrl);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("backendUrl must be an HTTPS URL without credentials");
      }
      return url.toString();
    } catch (error) {
      throw new Error(`Invalid desktop backend configuration at ${configPath}: ${error.message}`);
    }
  }
  throw new Error(`Desktop backend configuration not found. Checked:\n${attempts.join("\n")}`);
}

async function localDevUrl() {
  const url = "http://127.0.0.1:3000";
  try {
    await fetch(url, { signal: AbortSignal.timeout(800) });
    return url;
  } catch {
    devServerProcess = spawn("npm", ["run", "dev"], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      stdio: "inherit",
      env: { ...process.env, BROWSER: "none" },
    });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      try {
        await fetch(url, { signal: AbortSignal.timeout(800) });
        return url;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    throw new Error("Development server did not start on port 3000");
  }
}

function restrictNavigation(win, appUrl) {
  const allowedOrigin = new URL(appUrl).origin;
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const destination = new URL(url);
      if (destination.protocol === "https:") shell.openExternal(destination.toString());
    } catch {
      // Ignore malformed destinations.
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== allowedOrigin) event.preventDefault();
  });
}

function showFatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox("Payroll", message);
}

app.whenReady().then(async () => {
  mainWindow = createWindow();
  try {
    const url = isDev() ? await localDevUrl() : readBackendUrl();
    restrictNavigation(mainWindow, url);
    await mainWindow.loadURL(url);
  } catch (error) {
    showFatal(error);
  }
});

app.on("window-all-closed", () => {
  if (devServerProcess && !devServerProcess.killed) devServerProcess.kill();
  app.quit();
});

app.on("before-quit", () => {
  if (devServerProcess && !devServerProcess.killed) devServerProcess.kill();
});
