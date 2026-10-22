const path = require('path');
const fs = require('fs/promises');
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');

app.disableHardwareAcceleration();

const DEFAULT_STATE = {
  accounts: [
    { id: 'checking', name: 'Checking', openingBalance: 2450.10, type: 'cash' },
    { id: 'savings', name: 'Savings', openingBalance: 900.50, type: 'cash' },
    { id: 'credit-card', name: 'Credit Card', openingBalance: -450.20, type: 'debt' }
  ],
  transactions: []
};

const dataPath = () => path.join(app.getPath('userData'), 'vault_data.json');
const isSafeState = value => value && Array.isArray(value.accounts) && Array.isArray(value.transactions);

ipcMain.handle('vault:load', async () => {
  try {
    const saved = JSON.parse(await fs.readFile(dataPath(), 'utf8'));
    // Supports data written by the earlier version, which saved only transactions.
    if (Array.isArray(saved)) return { ...DEFAULT_STATE, transactions: saved };
    return isSafeState(saved) ? saved : DEFAULT_STATE;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Unable to load vault data:', error.message);
    return DEFAULT_STATE;
  }
});

ipcMain.handle('vault:save', async (_event, state) => {
  if (!isSafeState(state)) throw new Error('Invalid vault data.');
  const target = dataPath();
  const temporary = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, target);
  return true;
});

ipcMain.handle('bank-file:select', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Bank files', extensions: ['csv', 'qfx', 'ofx'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return { name: path.basename(result.filePaths[0]), content: await fs.readFile(result.filePaths[0], 'utf8') };
});

function createApplicationMenu() {
  const sendToFocusedWindow = channel => BrowserWindow.getFocusedWindow()?.webContents.send(channel);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'close' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Tools', submenu: [{ label: 'Manage Categories…', click: () => sendToFocusedWindow('vault:open-category-manager') }] },
    { label: 'Help', submenu: [{ label: 'About VaultCompute', click: () => dialog.showMessageBox({ type: 'info', title: 'About VaultCompute', message: 'VaultCompute', detail: 'Personal banking and transaction reporting.' }) }] }
  ]));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(() => {
  createApplicationMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
