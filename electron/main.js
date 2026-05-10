const { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell, screen } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const DATA_FILE = 'work-records.json';
const SETTINGS_FILE = 'settings.json';
const DEFAULT_POPUP_SHORTCUT = 'CommandOrControl+Alt+W';
const DEFAULT_SUPABASE_URL = 'https://mwuvkyjynsvsfcqfyeks.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5yTjz0oR3Dc4MCS5Cjhkzg_5aoqHXoM';
const MIN_WINDOW_WIDTH = 560;
const MIN_WINDOW_HEIGHT = 76;

let mainWindow;
let registeredPopupShortcut = null;

const defaultSettings = {
  dataDir: null,
  opacity: 0.92,
  alwaysOnTop: true,
  collapsed: false,
  popupShortcut: DEFAULT_POPUP_SHORTCUT,
  storageMode: 'local',
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseAnonKey: DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  supabaseSession: null
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
  const savedSettings = readJson(settingsPath(), {});
  return {
    ...defaultSettings,
    ...savedSettings,
    supabaseUrl: savedSettings.supabaseUrl || defaultSettings.supabaseUrl,
    supabaseAnonKey: savedSettings.supabaseAnonKey || defaultSettings.supabaseAnonKey
  };
}

function writeSettings(settings) {
  const nextSettings = { ...defaultSettings, ...settings };
  writeJson(settingsPath(), nextSettings);
  return nextSettings;
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
    .replace(/[，＋]/g, '+')
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

function shortcutLabel(shortcut) {
  return normalizeShortcut(shortcut)
    .replace('CommandOrControl', process.platform === 'darwin' ? 'Command' : 'Ctrl')
    .split('+')
    .join(' + ');
}

function getDataDir(settings = readSettings()) {
  return settings.dataDir || userDataDir();
}

function dataPath(settings = readSettings()) {
  return path.join(getDataDir(settings), DATA_FILE);
}

function publicSettings(settings = readSettings(), extra = {}) {
  const { supabaseSession, ...safeSettings } = settings;
  return {
    ...safeSettings,
    dataPath: dataPath(settings),
    popupShortcut: shortcutLabel(settings.popupShortcut),
    popupShortcutAccelerator: electronAccelerator(settings.popupShortcut),
    supabaseConfigured: isSupabaseConfigured(settings),
    ...extra
  };
}

function settingsToRow(settings, userId) {
  return {
    user_id: userId,
    opacity: Number(settings.opacity) || defaultSettings.opacity,
    always_on_top: Boolean(settings.alwaysOnTop),
    collapsed: Boolean(settings.collapsed),
    popup_shortcut: settings.popupShortcut || DEFAULT_POPUP_SHORTCUT,
    storage_mode: settings.storageMode || 'supabase',
    data_dir: settings.dataDir || null,
    updated_at: nowIso()
  };
}

function rowToSettingsPatch(row) {
  if (!row) return {};
  return {
    opacity: Number(row.opacity) || defaultSettings.opacity,
    alwaysOnTop: Boolean(row.always_on_top),
    collapsed: Boolean(row.collapsed),
    popupShortcut: row.popup_shortcut || DEFAULT_POPUP_SHORTCUT,
    storageMode: row.storage_mode || 'supabase',
    dataDir: row.data_dir || null
  };
}

function emptyData() {
  return {
    version: 1,
    records: [],
    updatedAt: nowIso()
  };
}

function normalizeRecord(record = {}) {
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

function readData(settings = readSettings()) {
  const data = readJson(dataPath(settings), emptyData());
  return {
    version: 1,
    records: Array.isArray(data.records) ? data.records.map(normalizeRecord) : [],
    updatedAt: data.updatedAt || nowIso()
  };
}

function writeData(data, settings = readSettings()) {
  const nextData = {
    version: 1,
    records: Array.isArray(data.records) ? data.records.map(normalizeRecord) : [],
    updatedAt: nowIso()
  };
  writeJson(dataPath(settings), nextData);
  return nextData;
}

function listLocalRecords(settings = readSettings()) {
  return readData(settings).records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function isSupabaseConfigured(settings = readSettings()) {
  return Boolean(settings.supabaseUrl && settings.supabaseAnonKey);
}

function canUseSupabase(settings = readSettings()) {
  return settings.storageMode === 'supabase' && isSupabaseConfigured(settings) && Boolean(settings.supabaseSession?.access_token);
}

async function makeSupabaseClient(settings = readSettings(), session = settings.supabaseSession) {
  if (!isSupabaseConfigured(settings)) {
    throw new Error('请先配置 Supabase URL 和 anon key');
  }

  const client = createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  if (session?.access_token && session?.refresh_token) {
    const { data, error } = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
    if (error) throw error;
    if (data.session) {
      writeSettings({ ...settings, supabaseSession: data.session, storageMode: 'supabase' });
    }
  }

  return client;
}

async function getSupabaseUser(client) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('请先登录');
  return data.user;
}

async function upsertUserProfile(client, user) {
  const { error } = await client
    .from('user_profiles')
    .upsert({
      user_id: user.id,
      email: user.email || '',
      last_login_at: nowIso(),
      updated_at: nowIso()
    }, { onConflict: 'user_id' });
  if (error) throw error;
}

async function getOrCreateRemoteSettings(client, userId, localSettings = readSettings()) {
  const { data, error } = await client
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return rowToSettingsPatch(data);

  const row = settingsToRow({ ...localSettings, storageMode: 'supabase' }, userId);
  const { data: inserted, error: insertError } = await client
    .from('user_settings')
    .insert(row)
    .select('*')
    .single();
  if (insertError) throw insertError;
  return rowToSettingsPatch(inserted);
}

async function syncRemoteSettings(settings = readSettings()) {
  if (!canUseSupabase(settings)) return null;
  try {
    const client = await makeSupabaseClient(settings);
    const user = await getSupabaseUser(client);
    const { error } = await client
      .from('user_settings')
      .upsert(settingsToRow(settings, user.id), { onConflict: 'user_id' });
    if (error) throw error;
    return settings;
  } catch (error) {
    console.warn('Failed to sync remote settings:', error.message);
    return null;
  }
}

async function getSettingsForClient() {
  const settings = readSettings();
  if (!canUseSupabase(settings)) return publicSettings(settings);

  try {
    const client = await makeSupabaseClient(settings);
    const user = await getSupabaseUser(client);
    const remotePatch = await getOrCreateRemoteSettings(client, user.id, settings);
    const mergedSettings = writeSettings({
      ...settings,
      ...remotePatch,
      supabaseUrl: settings.supabaseUrl,
      supabaseAnonKey: settings.supabaseAnonKey,
      supabaseSession: settings.supabaseSession,
      storageMode: 'supabase'
    });
    updateWindowState(mergedSettings);
    return publicSettings(mergedSettings);
  } catch (error) {
    console.warn('Failed to load remote settings:', error.message);
    return publicSettings(settings, { settingsSyncError: error.message });
  }
}

async function authState(settings = readSettings()) {
  const configured = isSupabaseConfigured(settings);
  if (!configured || !settings.supabaseSession?.access_token) {
    return {
      configured,
      authenticated: false,
      user: null,
      storageMode: settings.storageMode || 'local'
    };
  }

  try {
    const client = await makeSupabaseClient(settings);
    const user = await getSupabaseUser(client);
    try {
      await upsertUserProfile(client, user);
    } catch (profileError) {
      console.warn('Failed to sync user profile:', profileError.message);
    }
    return {
      configured: true,
      authenticated: true,
      user: { id: user.id, email: user.email },
      storageMode: 'supabase'
    };
  } catch (error) {
    writeSettings({ ...settings, supabaseSession: null, storageMode: 'local' });
    return {
      configured: true,
      authenticated: false,
      user: null,
      storageMode: 'local',
      error: error.message
    };
  }
}

function recordToRow(record, userId) {
  const normalized = normalizeRecord(record);
  return {
    id: normalized.id,
    user_id: userId,
    content: normalized.content,
    status: normalized.status,
    priority: normalized.priority,
    tags: normalized.tags,
    started_at: normalized.startedAt || null,
    ended_at: normalized.endedAt || null,
    note: normalized.note,
    attachments: normalized.attachments,
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt
  };
}

function rowToRecord(row) {
  return normalizeRecord({
    id: row.id,
    content: row.content,
    status: row.status,
    priority: row.priority,
    tags: row.tags,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    note: row.note,
    attachments: row.attachments,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

async function listSupabaseRecords(settings = readSettings()) {
  const client = await makeSupabaseClient(settings);
  const user = await getSupabaseUser(client);
  const { data, error } = await client
    .from('work_records')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToRecord);
}

async function getSupabaseRecord(client, userId, id) {
  const { data, error } = await client
    .from('work_records')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Record not found');
  return rowToRecord(data);
}

async function createSupabaseRecord(payload = {}, settings = readSettings()) {
  const client = await makeSupabaseClient(settings);
  const user = await getSupabaseUser(client);
  const record = normalizeRecord({
    ...payload,
    id: uid('record'),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  const { data, error } = await client
    .from('work_records')
    .insert(recordToRow(record, user.id))
    .select('*')
    .single();
  if (error) throw error;
  return rowToRecord(data);
}

async function updateSupabaseRecord(id, patch = {}, settings = readSettings()) {
  const client = await makeSupabaseClient(settings);
  const user = await getSupabaseUser(client);
  const updateRow = {
    updated_at: nowIso()
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'content')) updateRow.content = patch.content || '';
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) updateRow.status = patch.status || 'todo';
  if (Object.prototype.hasOwnProperty.call(patch, 'priority')) updateRow.priority = patch.priority || 'normal';
  if (Object.prototype.hasOwnProperty.call(patch, 'tags')) updateRow.tags = Array.isArray(patch.tags) ? patch.tags : [];
  if (Object.prototype.hasOwnProperty.call(patch, 'startedAt')) updateRow.started_at = patch.startedAt || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'endedAt')) updateRow.ended_at = patch.endedAt || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'note')) updateRow.note = patch.note || '';
  if (Object.prototype.hasOwnProperty.call(patch, 'attachments')) updateRow.attachments = Array.isArray(patch.attachments) ? patch.attachments : [];

  const { data, error } = await client
    .from('work_records')
    .update(updateRow)
    .eq('user_id', user.id)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRecord(data);
}

async function deleteSupabaseRecord(id, settings = readSettings()) {
  const client = await makeSupabaseClient(settings);
  const user = await getSupabaseUser(client);
  const { error } = await client
    .from('work_records')
    .delete()
    .eq('user_id', user.id)
    .eq('id', id);
  if (error) throw error;
  return { deleted: true };
}

function normalizeAttachment(attachment = {}) {
  const now = nowIso();
  return {
    id: attachment.id || uid('attachment'),
    type: attachment.type || 'note',
    title: attachment.title || '',
    body: attachment.body || '',
    url: attachment.url || '',
    description: attachment.description || '',
    site: attachment.site || '',
    username: attachment.username || '',
    password: attachment.password || '',
    remark: attachment.remark || '',
    createdAt: attachment.createdAt || now,
    updatedAt: attachment.updatedAt || now
  };
}

async function mutateSupabaseAttachments(recordId, mutator, settings = readSettings()) {
  const client = await makeSupabaseClient(settings);
  const user = await getSupabaseUser(client);
  const record = await getSupabaseRecord(client, user.id, recordId);
  const attachments = Array.isArray(record.attachments) ? record.attachments.map(normalizeAttachment) : [];
  const result = mutator(attachments);
  const nextAttachments = result.attachments || attachments;
  const updatedAt = nowIso();
  const { error } = await client
    .from('work_records')
    .update({ attachments: nextAttachments, updated_at: updatedAt })
    .eq('user_id', user.id)
    .eq('id', recordId);
  if (error) throw error;
  return result.value;
}

async function listRecords() {
  const settings = readSettings();
  if (canUseSupabase(settings)) return listSupabaseRecords(settings);
  return listLocalRecords(settings);
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

  if (edge.includes('e')) next.width = Math.max(MIN_WINDOW_WIDTH, bounds.width + dx);
  if (edge.includes('s')) next.height = Math.max(MIN_WINDOW_HEIGHT, bounds.height + dy);
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

  if (edge.includes('e')) next.width = Math.max(MIN_WINDOW_WIDTH, bounds.width + dx);
  if (edge.includes('s')) next.height = Math.max(MIN_WINDOW_HEIGHT, bounds.height + dy);
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

  ipcMain.handle('records:create', async (_event, payload = {}) => {
    const settings = readSettings();
    if (canUseSupabase(settings)) return createSupabaseRecord(payload, settings);

    const data = readData(settings);
    const record = normalizeRecord({
      ...payload,
      id: uid('record'),
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    data.records.unshift(record);
    writeData(data, settings);
    return record;
  });

  ipcMain.handle('records:update', async (_event, id, patch = {}) => {
    const settings = readSettings();
    if (canUseSupabase(settings)) return updateSupabaseRecord(id, patch, settings);

    const data = readData(settings);
    const record = data.records.find((item) => item.id === id);
    if (!record) throw new Error('Record not found');
    Object.assign(record, patch, { id, updatedAt: nowIso() });
    writeData(data, settings);
    return normalizeRecord(record);
  });

  ipcMain.handle('records:delete', async (_event, id) => {
    const settings = readSettings();
    if (canUseSupabase(settings)) return deleteSupabaseRecord(id, settings);

    const data = readData(settings);
    const before = data.records.length;
    data.records = data.records.filter((item) => item.id !== id);
    writeData(data, settings);
    return { deleted: before !== data.records.length };
  });

  ipcMain.handle('attachments:create', async (_event, recordId, attachment = {}) => {
    const settings = readSettings();
    const nextAttachment = normalizeAttachment(attachment);
    if (canUseSupabase(settings)) {
      return mutateSupabaseAttachments(recordId, (attachments) => ({
        attachments: [...attachments, nextAttachment],
        value: nextAttachment
      }), settings);
    }

    const data = readData(settings);
    const record = data.records.find((item) => item.id === recordId);
    if (!record) throw new Error('Record not found');
    record.attachments.push(nextAttachment);
    record.updatedAt = nowIso();
    writeData(data, settings);
    return nextAttachment;
  });

  ipcMain.handle('attachments:update', async (_event, recordId, attachmentId, patch = {}) => {
    const settings = readSettings();
    if (canUseSupabase(settings)) {
      return mutateSupabaseAttachments(recordId, (attachments) => {
        let updated = null;
        const nextAttachments = attachments.map((item) => {
          if (item.id !== attachmentId) return item;
          updated = normalizeAttachment({ ...item, ...patch, id: attachmentId, updatedAt: nowIso() });
          return updated;
        });
        if (!updated) throw new Error('Attachment not found');
        return { attachments: nextAttachments, value: updated };
      }, settings);
    }

    const data = readData(settings);
    const record = data.records.find((item) => item.id === recordId);
    if (!record) throw new Error('Record not found');
    const attachment = record.attachments.find((item) => item.id === attachmentId);
    if (!attachment) throw new Error('Attachment not found');
    Object.assign(attachment, patch, { id: attachmentId, updatedAt: nowIso() });
    record.updatedAt = nowIso();
    writeData(data, settings);
    return attachment;
  });

  ipcMain.handle('attachments:delete', async (_event, recordId, attachmentId) => {
    const settings = readSettings();
    if (canUseSupabase(settings)) {
      return mutateSupabaseAttachments(recordId, (attachments) => ({
        attachments: attachments.filter((item) => item.id !== attachmentId),
        value: { deleted: attachments.some((item) => item.id === attachmentId) }
      }), settings);
    }

    const data = readData(settings);
    const record = data.records.find((item) => item.id === recordId);
    if (!record) throw new Error('Record not found');
    const before = record.attachments.length;
    record.attachments = record.attachments.filter((item) => item.id !== attachmentId);
    record.updatedAt = nowIso();
    writeData(data, settings);
    return { deleted: before !== record.attachments.length };
  });

  ipcMain.handle('auth:get', () => authState());

  ipcMain.handle('auth:configure', async (_event, payload = {}) => {
    const current = readSettings();
    const supabaseUrl = String(payload.supabaseUrl || '').trim();
    const supabaseAnonKey = String(payload.supabaseAnonKey || '').trim();
    const changed = supabaseUrl !== current.supabaseUrl || supabaseAnonKey !== current.supabaseAnonKey;
    const nextSettings = writeSettings({
      ...current,
      supabaseUrl,
      supabaseAnonKey,
      supabaseSession: changed ? null : current.supabaseSession,
      storageMode: changed ? 'local' : current.storageMode
    });
    return { settings: publicSettings(nextSettings), auth: await authState(nextSettings) };
  });

  ipcMain.handle('auth:signIn', async (_event, payload = {}) => {
    const current = readSettings();
    const nextConfig = {
      ...current,
      supabaseUrl: String(payload.supabaseUrl || current.supabaseUrl || '').trim(),
      supabaseAnonKey: String(payload.supabaseAnonKey || current.supabaseAnonKey || '').trim()
    };
    const client = await makeSupabaseClient(nextConfig, null);
    const { data, error } = await client.auth.signInWithPassword({
      email: String(payload.email || '').trim(),
      password: String(payload.password || '')
    });
    if (error) throw error;
    const nextSettings = writeSettings({
      ...nextConfig,
      supabaseSession: data.session,
      storageMode: 'supabase'
    });
    let syncedSettings = nextSettings;
    let settingsSyncError = '';
    try {
      const authedClient = await makeSupabaseClient(nextSettings);
      const user = await getSupabaseUser(authedClient);
      await upsertUserProfile(authedClient, user);
      const remotePatch = await getOrCreateRemoteSettings(authedClient, user.id, nextSettings);
      syncedSettings = writeSettings({
        ...nextSettings,
        ...remotePatch,
        supabaseUrl: nextSettings.supabaseUrl,
        supabaseAnonKey: nextSettings.supabaseAnonKey,
        supabaseSession: nextSettings.supabaseSession,
        storageMode: 'supabase'
      });
    } catch (error) {
      settingsSyncError = error.message;
      console.warn('Failed to sync user profile/settings:', error.message);
    }
    updateWindowState(syncedSettings);
    return { settings: publicSettings(syncedSettings, { settingsSyncError }), auth: await authState(syncedSettings) };
  });

  ipcMain.handle('auth:signUp', async (_event, payload = {}) => {
    const current = readSettings();
    const nextConfig = {
      ...current,
      supabaseUrl: String(payload.supabaseUrl || current.supabaseUrl || '').trim(),
      supabaseAnonKey: String(payload.supabaseAnonKey || current.supabaseAnonKey || '').trim()
    };
    const client = await makeSupabaseClient(nextConfig, null);
    const { data, error } = await client.auth.signUp({
      email: String(payload.email || '').trim(),
      password: String(payload.password || '')
    });
    if (error) throw error;

    const nextSettings = writeSettings({
      ...nextConfig,
      supabaseSession: data.session || null,
      storageMode: data.session ? 'supabase' : 'local'
    });
    let syncedSettings = nextSettings;
    let settingsSyncError = '';
    if (data.session) {
      try {
        const authedClient = await makeSupabaseClient(nextSettings);
        const user = await getSupabaseUser(authedClient);
        await upsertUserProfile(authedClient, user);
        const remotePatch = await getOrCreateRemoteSettings(authedClient, user.id, nextSettings);
        syncedSettings = writeSettings({
          ...nextSettings,
          ...remotePatch,
          supabaseUrl: nextSettings.supabaseUrl,
          supabaseAnonKey: nextSettings.supabaseAnonKey,
          supabaseSession: nextSettings.supabaseSession,
          storageMode: 'supabase'
        });
      } catch (error) {
        settingsSyncError = error.message;
        console.warn('Failed to sync user profile/settings:', error.message);
      }
      updateWindowState(syncedSettings);
    }
    return {
      settings: publicSettings(syncedSettings, { settingsSyncError }),
      auth: await authState(syncedSettings),
      needsConfirmation: !data.session
    };
  });

  ipcMain.handle('auth:signOut', async () => {
    const current = readSettings();
    if (isSupabaseConfigured(current) && current.supabaseSession) {
      try {
        const client = await makeSupabaseClient(current);
        await client.auth.signOut();
      } catch (error) {
        console.warn('Supabase sign out failed:', error.message);
      }
    }
    const nextSettings = writeSettings({ ...current, supabaseSession: null, storageMode: 'local' });
    return { settings: publicSettings(nextSettings), auth: await authState(nextSettings) };
  });

  ipcMain.handle('auth:migrateLocalToSupabase', async () => {
    const settings = readSettings();
    const client = await makeSupabaseClient(settings);
    const user = await getSupabaseUser(client);
    const localRecords = listLocalRecords(settings);
    if (localRecords.length === 0) return { migrated: 0 };

    const { error } = await client
      .from('work_records')
      .upsert(localRecords.map((record) => recordToRow(record, user.id)), { onConflict: 'id' });
    if (error) throw error;

    writeSettings({ ...settings, storageMode: 'supabase' });
    return { migrated: localRecords.length };
  });

  ipcMain.handle('settings:get', () => getSettingsForClient());

  ipcMain.handle('settings:update', async (_event, patch = {}) => {
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
    await syncRemoteSettings(nextSettings);
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

    const currentSettings = readSettings();
    const currentData = readData(currentSettings);
    const nextSettings = writeSettings({ ...currentSettings, dataDir: result.filePaths[0] });
    const nextDataPath = dataPath(nextSettings);
    if (!fs.existsSync(nextDataPath)) {
      writeJson(nextDataPath, currentData);
    }
    await syncRemoteSettings(nextSettings);
    return { canceled: false, settings: publicSettings(nextSettings, { dataPath: nextDataPath }) };
  });

  ipcMain.handle('window:setOpacity', async (_event, opacity) => {
    const value = Math.min(1, Math.max(0.45, Number(opacity) || defaultSettings.opacity));
    const nextSettings = writeSettings({ ...readSettings(), opacity: value });
    updateWindowState(nextSettings);
    await syncRemoteSettings(nextSettings);
    return nextSettings.opacity;
  });

  ipcMain.handle('window:toggleAlwaysOnTop', async () => {
    const settings = readSettings();
    const nextSettings = writeSettings({ ...settings, alwaysOnTop: !settings.alwaysOnTop });
    updateWindowState(nextSettings);
    await syncRemoteSettings(nextSettings);
    return nextSettings.alwaysOnTop;
  });

  ipcMain.handle('window:collapse', async () => {
    const nextSettings = writeSettings({ ...readSettings(), collapsed: true });
    placeWindowAtTop(mainWindow, true);
    await syncRemoteSettings(nextSettings);
    return nextSettings.collapsed;
  });

  ipcMain.handle('window:expand', async () => {
    const nextSettings = writeSettings({ ...readSettings(), collapsed: false });
    placeWindowAtTop(mainWindow, false);
    await syncRemoteSettings(nextSettings);
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
