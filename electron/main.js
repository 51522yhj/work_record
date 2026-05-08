const { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const DATA_FILE = 'work-records.json';
const SETTINGS_FILE = 'settings.json';
const DEFAULT_POPUP_SHORTCUT = 'CommandOrControl+Alt+W';
const MIN_WINDOW_WIDTH = 560;
const MIN_WINDOW_HEIGHT = 76;

let mainWindow;
let registeredPopupShortcut = null;

const defaultSettings = {
  dataDir: null,
  opacity: 0.92,
  alwaysOnTop: true,
  collapsed: false,
  popupShortcut: DEFAULT_POPUP_SHORTCUT
};

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function userDataDir() {
  return app.getPath('userData');
}

function settingsPath() {
  return path.join(userDataDir(), SETTINGS_FILE);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read JSON: ${filePath}`, error);
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function readSettings() {
  return { ...defaultSettings, ...readJson(settingsPath(), defaultSettings) };
}

function writeSettings(settings) {
  const nextSettings = { ...defaultSettings, ...settings };
  writeJson(settingsPath(), nextSettings);
  return nextSettings;
}

function shortcutLabel(shortcut) {
  return normalizeShortcut(shortcut)
    .replace('CommandOrControl', process.platform === 'darwin' ? 'Command' : 'Ctrl')
    .split('+')
    .join(' + ');
}

function normalizeShortcut(shortcut) {
  const aliasMap = {
    control: 'Ctrl',
    ctrl: 'Ctrl',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
    super: 'Super',
    win: 'Super',
    windows: 'Super',
    meta: 'Super',
    command: 'Command',
    cmd: 'Command',
    commandorcontrol: 'CommandOrControl',
    cmdorctrl: 'CommandOrControl',
    enter: 'Enter',
    return: 'Enter',
    esc: 'Esc',
    escape: 'Esc',
    tab: 'Tab',
    space: 'Space',
    delete: 'Delete',
    backspace: 'Backspace'
  };

  return String(shortcut || '')
    .replace(/＋/g, '+')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const key = part.toLowerCase();
      if (aliasMap[key]) return aliasMap[key];
      if (/^f\d{1,2}$/i.test(part)) return part.toUpperCase();
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('+');
}

function electronAccelerator(shortcut) {
  return normalizeShortcut(shortcut)
    .split('+')
    .map((part) => (part === 'Ctrl' ? 'CommandOrControl' : part))
    .join('+');
}

function publicSettings(settings = readSettings(), extra = {}) {
  return {
    ...settings,
    dataPath: dataPath(settings),
    popupShortcut: shortcutLabel(settings.popupShortcut),
    popupShortcutAccelerator: electronAccelerator(settings.popupShortcut),
    ...extra
  };
}

function getDataDir(settings = readSettings()) {
  return settings.dataDir || userDataDir();
}

function dataPath(settings = readSettings()) {
  return path.join(getDataDir(settings), DATA_FILE);
}

function emptyData() {
  return {
    version: 1,
    records: [],
    updatedAt: nowIso()
  };
}

function normalizeRecord(record) {
  return {
    id: record.id || uid('record'),
    content: record.content || '',
    status: record.status || 'todo',
    priority: record.priority || 'normal',
    tags: Array.isArray(record.tags) ? record.tags : [],
    startedAt: record.startedAt || '',
    endedAt: record.endedAt || '',
    note: record.note || '',
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    createdAt: record.createdAt || nowIso(),
    updatedAt: record.updatedAt || nowIso()
  };
}

function readData() {
  const data = readJson(dataPath(), emptyData());
  return {
    version: 1,
    records: Array.isArray(data.records) ? data.records.map(normalizeRecord) : [],
    updatedAt: data.updatedAt || nowIso()
  };
}

function writeData(data) {
  const nextData = {
    version: 1,
    records: Array.isArray(data.records) ? data.records.map(normalizeRecord) : [],
    updatedAt: nowIso()
  };
  writeJson(dataPath(), nextData);
  return nextData;
}

function listRecords() {
  return readData().records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function updateWindowState(settings = readSettings()) {
  if (!mainWindow) return;
  mainWindow.setAlwaysOnTop(Boolean(settings.alwaysOnTop), 'screen-saver');
  mainWindow.setOpacity(Number(settings.opacity) || defaultSettings.opacity);
}

function placeWindowAtTop(win, collapsed = false) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width } = display.workArea;
  const targetWidth = collapsed ? Math.min(980, width - 32) : Math.min(1360, width - 32);
  const targetHeight = collapsed ? 76 : 760;
  win.setSize(targetWidth, targetHeight, true);
  win.setPosition(Math.round(x + (width - targetWidth) / 2), y + 18, true);
}

function resizeWindowByDrag(edge, deltaX = 0, deltaY = 0) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const bounds = mainWindow.getBounds();
  const next = { ...bounds };
  const dx = Number(deltaX) || 0;
  const dy = Number(deltaY) || 0;

  if (edge.includes('e')) {
    next.width = Math.max(MIN_WINDOW_WIDTH, bounds.width + dx);
  }
  if (edge.includes('s')) {
    next.height = Math.max(MIN_WINDOW_HEIGHT, bounds.height + dy);
  }
  if (edge.includes('w')) {
    const width = Math.max(MIN_WINDOW_WIDTH, bounds.width - dx);
    next.x = bounds.x + (bounds.width - width);
    next.width = width;
  }
  if (edge.includes('n')) {
    const height = Math.max(MIN_WINDOW_HEIGHT, bounds.height - dy);
    next.y = bounds.y + (bounds.height - height);
    next.height = height;
  }

  mainWindow.setBounds(next, true);
  return next;
}

function resizeWindowToCursor(edge, startBounds, startPoint) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (!startBounds || !startPoint) return null;

  const cursor = screen.getCursorScreenPoint();
  const dx = cursor.x - Number(startPoint.x || 0);
  const dy = cursor.y - Number(startPoint.y || 0);
  const bounds = {
    x: Number(startBounds.x || 0),
    y: Number(startBounds.y || 0),
    width: Number(startBounds.width || MIN_WINDOW_WIDTH),
    height: Number(startBounds.height || MIN_WINDOW_HEIGHT)
  };
  const next = { ...bounds };

  if (edge.includes('e')) {
    next.width = Math.max(MIN_WINDOW_WIDTH, bounds.width + dx);
  }
  if (edge.includes('s')) {
    next.height = Math.max(MIN_WINDOW_HEIGHT, bounds.height + dy);
  }
  if (edge.includes('w')) {
    const width = Math.max(MIN_WINDOW_WIDTH, bounds.width - dx);
    next.x = bounds.x + (bounds.width - width);
    next.width = width;
  }
  if (edge.includes('n')) {
    const height = Math.max(MIN_WINDOW_HEIGHT, bounds.height - dy);
    next.y = bounds.y + (bounds.height - height);
    next.height = height;
  }

  mainWindow.setBounds(next, false);
  return next;
}

function createWindow() {
  const settings = readSettings();

  mainWindow = new BrowserWindow({
    width: settings.collapsed ? 980 : 1360,
    height: settings.collapsed ? 76 : 760,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    resizable: true,
    skipTaskbar: false,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    updateWindowState(settings);
    placeWindowAtTop(mainWindow, settings.collapsed);
    mainWindow.show();
  });

  const builtIndex = path.join(__dirname, '..', 'dist', 'index.html');
  if (!app.isPackaged && process.env.WORK_RECORD_DEV === '1') {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else if (fs.existsSync(builtIndex)) {
    mainWindow.loadFile(builtIndex);
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
  }
}

function togglePopupMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused()) {
    mainWindow.minimize();
    return;
  }

  const settings = writeSettings({ ...readSettings(), collapsed: false });
  if (mainWindow.isMinimized()) mainWindow.restore();
  placeWindowAtTop(mainWindow, false);
  updateWindowState(settings);
  mainWindow.show();
  mainWindow.focus();
}

function registerPopupShortcut(shortcut = readSettings().popupShortcut) {
  const normalizedShortcut = electronAccelerator(shortcut);
  if (!normalizedShortcut || !normalizedShortcut.includes('+')) {
    return { ok: false, shortcut: normalizedShortcut, error: '快捷键格式不正确' };
  }

  const previousShortcut = registeredPopupShortcut;
  if (previousShortcut) {
    globalShortcut.unregister(previousShortcut);
    registeredPopupShortcut = null;
  }

  const ok = globalShortcut.register(normalizedShortcut, togglePopupMainWindow);
  if (!ok) {
    if (previousShortcut) {
      const restored = globalShortcut.register(previousShortcut, togglePopupMainWindow);
      registeredPopupShortcut = restored ? previousShortcut : null;
    }
    console.warn(`Failed to register shortcut: ${normalizedShortcut}`);
    return { ok: false, shortcut: normalizedShortcut, error: '快捷键不可用或已被占用' };
  }

  registeredPopupShortcut = normalizedShortcut;
  return { ok: true, shortcut: normalizedShortcut };
}

function registerShortcuts() {
  registerPopupShortcut(readSettings().popupShortcut);
}

function registerIpc() {
  ipcMain.handle('records:list', () => listRecords());

  ipcMain.handle('records:create', (_event, payload = {}) => {
    const data = readData();
    const record = normalizeRecord({
      ...payload,
      id: uid('record'),
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    data.records.unshift(record);
    writeData(data);
    return record;
  });

  ipcMain.handle('records:update', (_event, id, patch = {}) => {
    const data = readData();
    const record = data.records.find((item) => item.id === id);
    if (!record) throw new Error('Record not found');
    Object.assign(record, patch, { id, updatedAt: nowIso() });
    writeData(data);
    return normalizeRecord(record);
  });

  ipcMain.handle('records:delete', (_event, id) => {
    const data = readData();
    const before = data.records.length;
    data.records = data.records.filter((item) => item.id !== id);
    writeData(data);
    return { deleted: before !== data.records.length };
  });

  ipcMain.handle('attachments:create', (_event, recordId, attachment = {}) => {
    const data = readData();
    const record = data.records.find((item) => item.id === recordId);
    if (!record) throw new Error('Record not found');
    const now = nowIso();
    const nextAttachment = {
      id: uid('attachment'),
      type: attachment.type || 'note',
      title: attachment.title || '',
      body: attachment.body || '',
      url: attachment.url || '',
      description: attachment.description || '',
      site: attachment.site || '',
      username: attachment.username || '',
      password: attachment.password || '',
      remark: attachment.remark || '',
      createdAt: now,
      updatedAt: now
    };
    record.attachments.push(nextAttachment);
    record.updatedAt = now;
    writeData(data);
    return nextAttachment;
  });

  ipcMain.handle('attachments:update', (_event, recordId, attachmentId, patch = {}) => {
    const data = readData();
    const record = data.records.find((item) => item.id === recordId);
    if (!record) throw new Error('Record not found');
    const attachment = record.attachments.find((item) => item.id === attachmentId);
    if (!attachment) throw new Error('Attachment not found');
    Object.assign(attachment, patch, { id: attachmentId, updatedAt: nowIso() });
    record.updatedAt = nowIso();
    writeData(data);
    return attachment;
  });

  ipcMain.handle('attachments:delete', (_event, recordId, attachmentId) => {
    const data = readData();
    const record = data.records.find((item) => item.id === recordId);
    if (!record) throw new Error('Record not found');
    const before = record.attachments.length;
    record.attachments = record.attachments.filter((item) => item.id !== attachmentId);
    record.updatedAt = nowIso();
    writeData(data);
    return { deleted: before !== record.attachments.length };
  });

  ipcMain.handle('settings:get', () => publicSettings());

  ipcMain.handle('settings:update', (_event, patch = {}) => {
    const currentSettings = readSettings();
    const nextPatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(nextPatch, 'popupShortcut')) {
      const result = registerPopupShortcut(nextPatch.popupShortcut);
      if (!result.ok) {
        return publicSettings(currentSettings, { popupShortcutError: result.error });
      }
      nextPatch.popupShortcut = result.shortcut;
    }

    const nextSettings = writeSettings({ ...currentSettings, ...nextPatch });
    updateWindowState(nextSettings);
    return publicSettings(nextSettings, { popupShortcutError: '' });
  });

  ipcMain.handle('settings:selectDataDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择工作记录存储目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, settings: publicSettings() };
    }

    const currentData = readData();
    const nextSettings = writeSettings({ ...readSettings(), dataDir: result.filePaths[0] });
    const nextDataPath = dataPath(nextSettings);
    if (!fs.existsSync(nextDataPath)) {
      writeJson(nextDataPath, currentData);
    }
    return { canceled: false, settings: publicSettings(nextSettings, { dataPath: nextDataPath }) };
  });

  ipcMain.handle('window:setOpacity', (_event, opacity) => {
    const value = Math.min(1, Math.max(0.45, Number(opacity) || defaultSettings.opacity));
    const nextSettings = writeSettings({ ...readSettings(), opacity: value });
    updateWindowState(nextSettings);
    return nextSettings.opacity;
  });

  ipcMain.handle('window:toggleAlwaysOnTop', () => {
    const settings = readSettings();
    const nextSettings = writeSettings({ ...settings, alwaysOnTop: !settings.alwaysOnTop });
    updateWindowState(nextSettings);
    return nextSettings.alwaysOnTop;
  });

  ipcMain.handle('window:collapse', () => {
    const nextSettings = writeSettings({ ...readSettings(), collapsed: true });
    placeWindowAtTop(mainWindow, true);
    return nextSettings.collapsed;
  });

  ipcMain.handle('window:expand', () => {
    const nextSettings = writeSettings({ ...readSettings(), collapsed: false });
    placeWindowAtTop(mainWindow, false);
    return nextSettings.collapsed;
  });

  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('window:popup', () => {
    togglePopupMainWindow();
  });

  ipcMain.handle('window:resizeByDrag', (_event, edge, deltaX, deltaY) => {
    return resizeWindowByDrag(String(edge || ''), deltaX, deltaY);
  });

  ipcMain.handle('window:getBounds', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    return mainWindow.getBounds();
  });

  ipcMain.handle('window:resizeToCursor', (_event, edge, startBounds, startPoint) => {
    return resizeWindowToCursor(String(edge || ''), startBounds, startPoint);
  });

  ipcMain.handle('window:close', () => {
    mainWindow.close();
  });

  ipcMain.handle('shell:openExternal', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  ensureDir(userDataDir());
  registerIpc();
  createWindow();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
