const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');

let mainWindow;
let backendProcess;
let dynamicPort = 8000;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
  });

  // Load a simple loading state
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURI(`
    <html>
      <body style="background-color: #1a1a1a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
        <h2 style="margin-bottom: 10px;">Initializing Vuducom Outreach...</h2>
        <p style="color: #888;">Starting backend services on port ${dynamicPort}...</p>
        <div style="margin-top: 20px; width: 40px; height: 40px; border: 4px solid #333; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      </body>
    </html>
  `));

  let attempts = 0;
  const maxAttempts = 60; // 30 seconds

  const checkServer = () => {
    http.get(`http://127.0.0.1:${dynamicPort}/api/health`, (res) => {
      if (res.statusCode === 200) {
        console.log('Backend is ready, loading app...');
        mainWindow.loadURL(`http://127.0.0.1:${dynamicPort}`);
      } else {
        retry();
      }
    }).on('error', () => {
      retry();
    });
  };

  const retry = () => {
    attempts++;
    if (attempts >= maxAttempts) {
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURI(`
        <html>
          <body style="background-color: #1a1a1a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; text-align: center; padding: 20px;">
            <h2 style="color: #ef4444;">Backend Failed to Start</h2>
            <p>The application could not connect to the local server.</p>
            <p style="font-size: 14px; color: #888; margin-top: 20px;">Try restarting the application. Internal port assignment failed.</p>
          </body>
        </html>
      `));
      return;
    }
    setTimeout(checkServer, 500);
  };

  checkServer();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const isPackaged = app.isPackaged;

  // Load environment variables
  const dotenvPath = isPackaged
    ? path.join(process.resourcesPath, 'backend', '.env')
    : path.join(__dirname, 'backend', '.env');
  
  require('dotenv').config({ path: dotenvPath });

  // Assign a dynamic free port
  try {
    dynamicPort = await findFreePort();
  } catch (err) {
    console.error("Failed to find free port, using fallback:", err);
    dynamicPort = 8000;
  }
  process.env.PORT = dynamicPort.toString();

  createWindow();

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      try {
        const backendPath = isPackaged 
          ? path.join(process.resourcesPath, 'backend', 'dist', 'index.js')
          : path.join(__dirname, 'backend', 'dist', 'index.js');
        
        // Pass the frontend path so the backend knows where to serve static files from
        process.env.FRONTEND_PATH = isPackaged
          ? path.join(process.resourcesPath, 'app.asar', 'frontend', 'out')
          : path.join(__dirname, 'frontend', 'out');

        console.log('Loading backend from:', backendPath, 'on port:', dynamicPort);
        require(backendPath);
      } catch (err) {
        console.error('CRITICAL: Failed to load backend script:', err);
        if (mainWindow) {
          mainWindow.webContents.executeJavaScript(`
            document.body.innerHTML = \`
              <div style="padding: 20px; font-family: monospace; color: #ff6b6b; background: #1a1a1a; height: 100vh; overflow: auto;">
                <h2>Backend Crash Report</h2>
                <pre style="white-space: pre-wrap;">\${${JSON.stringify(err.stack || err.message || String(err))}}</pre>
              </div>
            \`;
          `);
        }
      }
    }, 500);
  });

  app.on('activate', function () {
    if (mainWindow === null) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Make sure to kill backend when app closes
app.on('quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

// Authentication Persistence Handlers
const getAuthPath = () => path.join(app.getPath('userData'), 'vudu_auth.json');

ipcMain.on('save-auth', (event, data) => {
  try {
    fs.writeFileSync(getAuthPath(), JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save auth:', err);
  }
});

ipcMain.handle('get-auth', () => {
  try {
    const authPath = getAuthPath();
    if (fs.existsSync(authPath)) {
      return JSON.parse(fs.readFileSync(authPath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to get auth:', err);
  }
  return null;
});

ipcMain.on('clear-auth', () => {
  try {
    const authPath = getAuthPath();
    if (fs.existsSync(authPath)) {
      fs.unlinkSync(authPath);
    }
  } catch (err) {
    console.error('Failed to clear auth:', err);
  }
});
