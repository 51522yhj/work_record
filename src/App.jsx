import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Lock,
  Minus,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Trash2,
  X
} from 'lucide-react';

const statusOptions = [
  { value: 'todo', label: '待处理' },
  { value: 'doing', label: '进行中' },
  { value: 'blocked', label: '阻塞' },
  { value: 'done', label: '已完成' }
];

const priorityOptions = [
  { value: 'low', label: '低' },
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' }
];

const attachmentTypes = [
  { value: 'note', label: '笔记', icon: FileText },
  { value: 'link', label: '网址', icon: Globe },
  { value: 'secret', label: '账号密码', icon: Lock }
];

const api = window.workRecord || createBrowserFallbackApi();

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function createBrowserFallbackApi() {
  const dataKey = 'work-record-preview-data';
  const settingsKey = 'work-record-preview-settings';
  const defaultSettings = {
    dataPath: '浏览器预览 localStorage',
    opacity: 0.92,
    alwaysOnTop: false,
    collapsed: false,
    popupShortcut: 'Ctrl + Alt + W',
    popupShortcutAccelerator: 'CommandOrControl+Alt+W'
  };

  const readData = () => {
    try {
      return JSON.parse(localStorage.getItem(dataKey)) || { records: [] };
    } catch {
      return { records: [] };
    }
  };
  const writeData = (data) => localStorage.setItem(dataKey, JSON.stringify(data));
  const readSettings = () => {
    try {
      return { ...defaultSettings, ...(JSON.parse(localStorage.getItem(settingsKey)) || {}) };
    } catch {
      return defaultSettings;
    }
  };
  const writeSettings = (settings) => {
    const next = { ...readSettings(), ...settings };
    if (settings.popupShortcut) {
      next.popupShortcut = shortcutLabel(settings.popupShortcut);
      next.popupShortcutAccelerator = shortcutAccelerator(settings.popupShortcut);
      next.popupShortcutError = '';
    }
    localStorage.setItem(settingsKey, JSON.stringify(next));
    return next;
  };

  return {
    records: {
      list: async () => readData().records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      create: async (payload) => {
        const data = readData();
        const record = {
          id: uid('record'),
          content: '',
          status: 'todo',
          priority: 'normal',
          tags: [],
          startedAt: '',
          endedAt: '',
          note: '',
          attachments: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
          ...payload
        };
        data.records = [record, ...(data.records || [])];
        writeData(data);
        return record;
      },
      update: async (id, patch) => {
        const data = readData();
        data.records = data.records.map((record) => (
          record.id === id ? { ...record, ...patch, id, updatedAt: nowIso() } : record
        ));
        writeData(data);
        return data.records.find((record) => record.id === id);
      },
      delete: async (id) => {
        const data = readData();
        data.records = data.records.filter((record) => record.id !== id);
        writeData(data);
        return { deleted: true };
      }
    },
    attachments: {
      create: async (recordId, attachment) => {
        const data = readData();
        const nextAttachment = {
          id: uid('attachment'),
          createdAt: nowIso(),
          updatedAt: nowIso(),
          ...attachment
        };
        data.records = data.records.map((record) => (
          record.id === recordId
            ? { ...record, attachments: [...(record.attachments || []), nextAttachment], updatedAt: nowIso() }
            : record
        ));
        writeData(data);
        return nextAttachment;
      },
      update: async (recordId, attachmentId, patch) => {
        const data = readData();
        data.records = data.records.map((record) => (
          record.id === recordId
            ? {
                ...record,
                attachments: record.attachments.map((item) => (
                  item.id === attachmentId ? { ...item, ...patch, updatedAt: nowIso() } : item
                )),
                updatedAt: nowIso()
              }
            : record
        ));
        writeData(data);
      },
      delete: async (recordId, attachmentId) => {
        const data = readData();
        data.records = data.records.map((record) => (
          record.id === recordId
            ? {
                ...record,
                attachments: record.attachments.filter((item) => item.id !== attachmentId),
                updatedAt: nowIso()
              }
            : record
        ));
        writeData(data);
        return { deleted: true };
      }
    },
    settings: {
      get: async () => readSettings(),
      update: async (patch) => writeSettings(patch),
      selectDataDir: async () => ({ canceled: true, settings: readSettings() })
    },
    window: {
      setOpacity: async (opacity) => writeSettings({ opacity }).opacity,
      toggleAlwaysOnTop: async () => writeSettings({ alwaysOnTop: !readSettings().alwaysOnTop }).alwaysOnTop,
      collapse: async () => writeSettings({ collapsed: true }).collapsed,
      expand: async () => writeSettings({ collapsed: false }).collapsed,
      popup: async () => writeSettings({ collapsed: false }).collapsed,
      getBounds: async () => null,
      resizeByDrag: async () => null,
      resizeToCursor: async () => null,
      minimize: async () => undefined,
      close: async () => undefined
    },
    shell: {
      openExternal: async (url) => window.open(url, '_blank', 'noopener,noreferrer')
    }
  };
}

function emptyAttachment(type = 'note') {
  return {
    type,
    title: '',
    body: '',
    url: '',
    description: '',
    site: '',
    username: '',
    password: '',
    remark: ''
  };
}

function tagsFromInput(value) {
  return value
    .split(/[,\s，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTime(value) {
  if (!value) return '未设置';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDate(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

function StatusIcon({ status }) {
  if (status === 'done') return <CheckCircle2 size={16} />;
  if (status === 'doing') return <Circle size={16} className="pulse-icon" />;
  return <Circle size={16} />;
}

function normalizeShortcutInput(shortcut) {
  return String(shortcut || '')
    .replace(/＋/g, '+')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('+');
}

function shortcutLabel(shortcut) {
  return normalizeShortcutInput(shortcut)
    .replace('CommandOrControl', navigator.platform.toLowerCase().includes('mac') ? 'Command' : 'Ctrl')
    .split('+')
    .join(' + ');
}

function shortcutAccelerator(shortcut) {
  return normalizeShortcutInput(shortcut)
    .split('+')
    .map((part) => (part === 'Ctrl' ? 'CommandOrControl' : part))
    .join('+');
}

function shortcutFromKeyboardEvent(event) {
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push(navigator.platform.toLowerCase().includes('mac') ? 'Command' : 'Super');

  const ignoredKeys = new Set(['Control', 'Alt', 'Shift', 'Meta', 'Process']);
  if (!ignoredKeys.has(event.key)) {
    parts.push(normalizeShortcutKey(event.key));
  }

  return parts.join('+');
}

function eventMatchesShortcut(event, shortcut) {
  const accelerator = shortcutAccelerator(shortcut);
  if (!accelerator) return false;
  return shortcutAccelerator(shortcutFromKeyboardEvent(event)) === accelerator;
}

function normalizeShortcutKey(key) {
  const keyMap = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc'
  };
  if (keyMap[key]) return keyMap[key];
  if (/^f\d{1,2}$/i.test(key)) return key.toUpperCase();
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function statusPatch(record, status) {
  if (status === 'done' && record.status !== 'done' && !record.endedAt) {
    return { status, endedAt: nowIso() };
  }
  return { status };
}

function SelectMenu({ value, options, onChange, compact = false, label, tone = 'default' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];
  const isStatusTone = tone === 'status';
  const isPriorityTone = tone === 'priority';
  const toneClass = isStatusTone ? `status-select status-${value}` : isPriorityTone ? `priority-select priority-${value}` : '';

  return (
    <div className={`select-menu ${compact ? 'compact' : ''} ${toneClass}`}>
      <button
        type="button"
        className="select-trigger"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        aria-label={label}
        aria-expanded={open}
      >
        <span className="select-label">
          {(isStatusTone || isPriorityTone) && <i aria-hidden="true" />}
          {selected?.label}
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className={`select-options ${isStatusTone ? 'status-options' : ''} ${isPriorityTone ? 'priority-options' : ''}`}>
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`${option.value === value ? 'selected' : ''} ${isStatusTone ? `status-option status-${option.value}` : ''} ${isPriorityTone ? `priority-option priority-${option.value}` : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{(isStatusTone || isPriorityTone) && <i aria-hidden="true" />}{option.label}</span>
              {option.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [createdDate, setCreatedDate] = useState('');
  const [draft, setDraft] = useState({ content: '', status: 'todo', priority: 'normal' });
  const [attachmentDraft, setAttachmentDraft] = useState(emptyAttachment());
  const [visibleSecrets, setVisibleSecrets] = useState({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [shortcutDraft, setShortcutDraft] = useState('Ctrl + Alt + W');
  const [shortcutSaving, setShortcutSaving] = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const isBrowserPreview = !window.workRecord;

  async function refresh() {
    const [nextRecords, nextSettings] = await Promise.all([api.records.list(), api.settings.get()]);
    setRecords(nextRecords);
    setSettings(nextSettings);
    setSelectedId((current) => current || nextRecords[0]?.id || null);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (settings?.popupShortcut) {
      setShortcutDraft(settings.popupShortcut);
    }
  }, [settings?.popupShortcut]);

  useEffect(() => {
    if (!settings?.popupShortcut) return undefined;
    const onKeyDown = (event) => {
      const target = event.target;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;
      if (!eventMatchesShortcut(event, settings.popupShortcut)) return;

      event.preventDefault();
      if (settings.collapsed) {
        toggleCollapsed();
      } else {
        setSettings((current) => ({ ...current, collapsed: true }));
        api.window.collapse?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settings?.popupShortcut, settings?.collapsed]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesStatus = filter === 'all' || record.status === filter;
      const recordCreatedDate = formatDate(record.createdAt);
      const createdTimeText = `${recordCreatedDate} ${formatTime(record.createdAt)}`;
      const haystack = `${record.content} ${record.note} ${(record.tags || []).join(' ')} ${createdTimeText}`.toLowerCase();
      const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
      const matchesCreatedDate = !createdDate || recordCreatedDate === createdDate;
      return matchesStatus && matchesQuery && matchesCreatedDate;
    });
  }, [records, filter, query, createdDate]);

  const selected = filteredRecords.find((record) => record.id === selectedId) || filteredRecords[0] || null;

  async function addRecord(event) {
    event.preventDefault();
    if (!draft.content.trim()) return;
    setBusy(true);
    try {
      const record = await api.records.create({
        content: draft.content.trim(),
        status: draft.status,
        priority: draft.priority,
        startedAt: nowIso(),
        endedAt: draft.status === 'done' ? nowIso() : ''
      });
      setDraft({ content: '', status: 'todo', priority: 'normal' });
      await refresh();
      setSelectedId(record.id);
      setToast('已新增记录');
    } finally {
      setBusy(false);
    }
  }

  async function updateRecord(id, patch) {
    await api.records.update(id, patch);
    await refresh();
    setSelectedId(id);
  }

  async function deleteRecord(id) {
    await api.records.delete(id);
    setSelectedId(null);
    await refresh();
    setToast('已删除记录');
  }

  async function createAttachment(event) {
    event.preventDefault();
    if (!selected) {
      setToast('请先选择一条记录');
      return;
    }
    const hasContent = Object.entries(attachmentDraft)
      .filter(([key]) => key !== 'type')
      .some(([, value]) => String(value || '').trim());
    if (!hasContent) {
      setToast('先填写附件内容');
      return;
    }

    await api.attachments.create(selected.id, attachmentDraft);
    setAttachmentDraft(emptyAttachment(attachmentDraft.type));
    await refresh();
    setSelectedId(selected.id);
    setToast('附件已添加');
  }

  async function removeAttachment(attachmentId) {
    if (!selected) return;
    await api.attachments.delete(selected.id, attachmentId);
    await refresh();
    setSelectedId(selected.id);
    setToast('附件已删除');
  }

  async function setOpacity(value) {
    const opacity = Number(value);
    const nextOpacity = await api.window.setOpacity(opacity);
    setSettings((current) => ({ ...current, opacity: nextOpacity }));
  }

  async function toggleAlwaysOnTop() {
    const alwaysOnTop = await api.window.toggleAlwaysOnTop();
    setSettings((current) => ({ ...current, alwaysOnTop }));
  }

  async function selectDataDir() {
    const result = await api.settings.selectDataDir();
    if (!result.canceled) {
      await refresh();
      setToast('存储目录已更新');
    }
  }

  async function toggleCollapsed() {
    if (settings?.collapsed) {
      await api.window.expand();
      setSettings((current) => ({ ...current, collapsed: false }));
    } else {
      await api.window.collapse();
      setSettings((current) => ({ ...current, collapsed: true }));
    }
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text || '');
    setToast('已复制');
  }

  async function savePopupShortcut(event) {
    event.preventDefault();
    await persistPopupShortcut(shortcutDraft);
  }

  async function persistPopupShortcut(value) {
    const normalized = normalizeShortcutInput(value);
    if (!normalized || !normalized.includes('+')) {
      setToast('快捷键格式不正确');
      return;
    }

    setShortcutSaving(true);
    try {
      const nextSettings = await api.settings.update({ popupShortcut: shortcutAccelerator(normalized) });
      setSettings(nextSettings);
      setShortcutDraft(nextSettings.popupShortcut || shortcutLabel(normalized));
      setToast(nextSettings.popupShortcutError || '快捷键已保存');
    } finally {
      setShortcutSaving(false);
    }
  }

  async function capturePopupShortcut(event) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Backspace' || event.key === 'Delete') {
      setShortcutDraft('');
      return;
    }

    const nextShortcut = shortcutFromKeyboardEvent(event);
    setShortcutDraft(shortcutLabel(nextShortcut));

    if (nextShortcut.includes('+')) {
      await persistPopupShortcut(nextShortcut);
    } else {
      setToast('请按组合键，例如 Ctrl + Alt + W');
    }
  }

  if (!settings) {
    return <div className="loading-shell">正在载入工作记录...</div>;
  }

  const completedCount = records.filter((record) => record.status === 'done').length;
  const activeCount = records.length - completedCount;
  const shellStyle = isBrowserPreview
    ? {
        width: settings.collapsed ? Math.min(previewSize.width, window.innerWidth) : previewSize.width,
        height: settings.collapsed ? 76 : previewSize.height
      }
    : undefined;

  return (
    <main className={`app-shell ${settings.collapsed ? 'is-collapsed' : ''}`} style={shellStyle}>
      {toast && <div className="toast">{toast}</div>}
      <ResizeHandles
        collapsed={settings.collapsed}
        isBrowserPreview={isBrowserPreview}
        previewSize={previewSize}
        setPreviewSize={setPreviewSize}
      />

      <header className="topbar drag-region">
        <div className="brand">
          <div className="brand-mark">WR</div>
          <div>
            <h1>工作记录</h1>
            <p>{activeCount} 个未完成 · {completedCount} 个已完成</p>
          </div>
        </div>

        <form className="quick-add no-drag" onSubmit={addRecord}>
          <input
            value={draft.content}
            onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
            placeholder="记录当前工作内容"
          />
          <SelectMenu
            compact
            label="任务状态"
            value={draft.status}
            options={statusOptions}
            tone="status"
            onChange={(status) => setDraft((current) => ({ ...current, status }))}
          />
          <SelectMenu
            compact
            label="优先级"
            value={draft.priority}
            options={priorityOptions}
            tone="priority"
            onChange={(priority) => setDraft((current) => ({ ...current, priority }))}
          />
          <button className="primary-button" type="submit" disabled={busy} title="新增记录">
            <Plus size={18} />
          </button>
        </form>

        <div className="window-actions no-drag">
          <button onClick={toggleAlwaysOnTop} title={settings.alwaysOnTop ? '取消置顶' : '始终置顶'}>
            {settings.alwaysOnTop ? <Pin size={17} /> : <PinOff size={17} />}
          </button>
          <button onClick={toggleCollapsed} title={settings.collapsed ? '展开' : '收起'}>
            {settings.collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
          <button onClick={() => api.window.minimize()} title="最小化">
            <Minus size={17} />
          </button>
          <button onClick={() => api.window.close()} title="关闭">
            <X size={17} />
          </button>
        </div>
      </header>

      {!settings.collapsed && (
        <>
          <section className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索内容、备注、标签、创建时间" />
            </div>
            <label className="date-filter">
              <span>创建日期</span>
              <input value={createdDate} onChange={(event) => setCreatedDate(event.target.value)} type="date" />
              {createdDate && <button type="button" onClick={() => setCreatedDate('')} title="清除创建日期">清除</button>}
            </label>
            <div className="segmented">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  className={filter === option.value ? 'active' : ''}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="opacity-control">
              <Settings size={16} />
              <input
                type="range"
                min="0.45"
                max="1"
                step="0.01"
                value={settings.opacity}
                onChange={(event) => setOpacity(event.target.value)}
                aria-label="透明度"
              />
            </div>
          </section>

          <section className="workspace">
            <aside className="record-list">
              {filteredRecords.length === 0 ? (
                <div className="empty-state">
                  <Clipboard size={26} />
                  <span>暂无匹配记录</span>
                </div>
              ) : filteredRecords.map((record) => (
                <button
                  key={record.id}
                  className={`record-row ${selected?.id === record.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(record.id)}
                >
                  <span className={`status-dot ${record.status}`}><StatusIcon status={record.status} /></span>
                  <span className="record-main">
                    <strong>{record.content}</strong>
                    <small>创建 {formatTime(record.createdAt)} · {(record.attachments || []).length} 个附件</small>
                  </span>
                  <span className={`priority ${record.priority}`}>{priorityOptions.find((item) => item.value === record.priority)?.label}</span>
                </button>
              ))}
            </aside>

            <section className="detail-pane">
              {selected ? (
                <RecordDetail
                  record={selected}
                  onUpdate={updateRecord}
                  onDelete={deleteRecord}
                  attachmentDraft={attachmentDraft}
                  setAttachmentDraft={setAttachmentDraft}
                  onCreateAttachment={createAttachment}
                  onRemoveAttachment={removeAttachment}
                  visibleSecrets={visibleSecrets}
                  setVisibleSecrets={setVisibleSecrets}
                  copyText={copyText}
                />
              ) : (
                <div className="empty-detail">选择一条记录查看详情</div>
              )}
            </section>
          </section>

          <footer className="storage-bar">
            <span title={settings.dataPath}>{settings.dataPath}</span>
            <form className="shortcut-editor" onSubmit={savePopupShortcut}>
              <label htmlFor="popupShortcut">弹出快捷键</label>
              <input
                id="popupShortcut"
                value={shortcutDraft}
                onKeyDown={capturePopupShortcut}
                onChange={() => undefined}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="点击后按组合键"
                title="点击后直接按组合键，例如 Ctrl + Alt + W"
                readOnly
              />
              <button type="submit" disabled={shortcutSaving}>保存</button>
            </form>
            <button onClick={selectDataDir}>更换存储目录</button>
          </footer>
        </>
      )}
    </main>
  );
}

function ResizeHandles({ collapsed, isBrowserPreview, previewSize, setPreviewSize }) {
  const edges = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];

  function startResize(edge, event) {
    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = previewSize;
    event.currentTarget.setPointerCapture?.(pointerId);

    let startBoundsPromise = Promise.resolve(null);
    if (!isBrowserPreview) {
      startBoundsPromise = api.window.getBounds();
    }

    const onMove = async (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (isBrowserPreview) {
        const nextSize = nextPreviewSize(edge, startSize.width, startSize.height, dx, dy);
        setPreviewSize({
          width: nextSize.width,
          height: collapsed ? 76 : nextSize.height
        });
        return;
      }

      const startBounds = await startBoundsPromise;
      await api.window.resizeToCursor(edge, startBounds, { x: event.screenX, y: event.screenY });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  return (
    <div className="resize-layer no-drag" aria-hidden="true">
      {edges.map((edge) => (
        <div
          key={edge}
          className={`resize-handle resize-${edge}`}
          onPointerDown={(event) => startResize(edge, event)}
        />
      ))}
      <div className="resize-grip grip-e" onPointerDown={(event) => startResize('e', event)} />
      <div className="resize-grip grip-s" onPointerDown={(event) => startResize('s', event)} />
      <div className="resize-grip grip-w" onPointerDown={(event) => startResize('w', event)} />
      <div className="resize-grip grip-n" onPointerDown={(event) => startResize('n', event)} />
      <div className="resize-grip grip-se" onPointerDown={(event) => startResize('se', event)} />
    </div>
  );
}

function nextPreviewSize(edge, width, height, dx, dy) {
  let nextWidth = width;
  let nextHeight = height;
  if (edge.includes('e')) nextWidth = width + dx;
  if (edge.includes('w')) nextWidth = width - dx;
  if (edge.includes('s')) nextHeight = height + dy;
  if (edge.includes('n')) nextHeight = height - dy;
  return {
    width: Math.max(560, Math.min(window.innerWidth * 1.4, nextWidth)),
    height: Math.max(76, Math.min(window.innerHeight * 1.4, nextHeight))
  };
}

function RecordDetail({
  record,
  onUpdate,
  onDelete,
  attachmentDraft,
  setAttachmentDraft,
  onCreateAttachment,
  onRemoveAttachment,
  visibleSecrets,
  setVisibleSecrets,
  copyText
}) {
  const [tagText, setTagText] = useState((record.tags || []).join(' '));

  useEffect(() => {
    setTagText((record.tags || []).join(' '));
  }, [record.id, record.tags]);

  return (
    <div className="detail-grid">
      <div className="detail-header">
        <textarea
          value={record.content}
          onChange={(event) => onUpdate(record.id, { content: event.target.value })}
          rows={2}
        />
        <button className="danger-button" onClick={() => onDelete(record.id)} title="删除记录">
          <Trash2 size={17} />
        </button>
      </div>

      <div className="field-grid">
        <label>
          <span>状态</span>
          <SelectMenu value={record.status} options={statusOptions} tone="status" onChange={(status) => onUpdate(record.id, statusPatch(record, status))} label="状态" />
        </label>
        <label>
          <span>优先级</span>
          <SelectMenu value={record.priority} options={priorityOptions} tone="priority" onChange={(priority) => onUpdate(record.id, { priority })} label="优先级" />
        </label>
        <label className="time-field">
          <span>开始时间</span>
          <input type="datetime-local" value={toLocalInput(record.startedAt)} onChange={(event) => onUpdate(record.id, { startedAt: fromLocalInput(event.target.value) })} />
        </label>
        <label className="time-field">
          <span>结束时间</span>
          <input type="datetime-local" value={toLocalInput(record.endedAt)} onChange={(event) => onUpdate(record.id, { endedAt: fromLocalInput(event.target.value) })} />
        </label>
      </div>

      <label className="wide-field">
        <span>标签</span>
        <input
          value={tagText}
          onChange={(event) => setTagText(event.target.value)}
          onBlur={() => onUpdate(record.id, { tags: tagsFromInput(tagText) })}
          placeholder="项目名 客户名 关键字"
        />
      </label>

      <label className="wide-field">
        <span>备注</span>
        <textarea value={record.note} onChange={(event) => onUpdate(record.id, { note: event.target.value })} rows={3} placeholder="补充背景、阻塞点或下一步" />
      </label>

      <div className="attachments">
        <div className="section-title">
          <strong>笔记附件</strong>
          <span>{(record.attachments || []).length}</span>
        </div>

        <form className="attachment-form" onSubmit={onCreateAttachment}>
          <div className="attachment-type">
            {attachmentTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  type="button"
                  key={type.value}
                  className={attachmentDraft.type === type.value ? 'active' : ''}
                  onClick={() => setAttachmentDraft(emptyAttachment(type.value))}
                >
                  <Icon size={15} />
                  {type.label}
                </button>
              );
            })}
          </div>
          <AttachmentFields draft={attachmentDraft} setDraft={setAttachmentDraft} />
          <button className="secondary-button" type="submit">
            <Plus size={16} />
            添加附件
          </button>
        </form>

        <div className="attachment-list">
          {(record.attachments || []).map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              attachment={attachment}
              onRemove={() => onRemoveAttachment(attachment.id)}
              visible={Boolean(visibleSecrets[attachment.id])}
              onToggleVisible={() => setVisibleSecrets((current) => ({ ...current, [attachment.id]: !current[attachment.id] }))}
              copyText={copyText}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AttachmentFields({ draft, setDraft }) {
  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));

  if (draft.type === 'link') {
    return (
      <div className="attachment-fields two-column">
        <input value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="标题" />
        <input value={draft.url} onChange={(event) => update({ url: event.target.value })} placeholder="https://example.com" />
        <input className="span-two" value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="说明" />
      </div>
    );
  }

  if (draft.type === 'secret') {
    return (
      <div className="attachment-fields two-column">
        <input value={draft.site} onChange={(event) => update({ site: event.target.value })} placeholder="站点" />
        <input value={draft.username} onChange={(event) => update({ username: event.target.value })} placeholder="账号" />
        <input value={draft.password} onChange={(event) => update({ password: event.target.value })} placeholder="密码" type="password" />
        <input value={draft.remark} onChange={(event) => update({ remark: event.target.value })} placeholder="备注" />
      </div>
    );
  }

  return (
    <div className="attachment-fields">
      <input value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="标题" />
      <textarea value={draft.body} onChange={(event) => update({ body: event.target.value })} rows={2} placeholder="正文" />
      <input value={draft.remark} onChange={(event) => update({ remark: event.target.value })} placeholder="备注" />
    </div>
  );
}

function AttachmentItem({ attachment, onRemove, visible, onToggleVisible, copyText }) {
  const typeMeta = attachmentTypes.find((item) => item.value === attachment.type) || attachmentTypes[0];
  const Icon = typeMeta.icon;

  return (
    <article className="attachment-item">
      <div className="attachment-heading">
        <span><Icon size={15} /> {typeMeta.label}</span>
        <button onClick={onRemove} title="删除附件"><Trash2 size={15} /></button>
      </div>

      {attachment.type === 'secret' ? (
        <div className="secret-grid">
          <span>站点</span><strong>{attachment.site || '-'}</strong>
          <span>账号</span><strong>{attachment.username || '-'}</strong>
          <span>密码</span>
          <strong className="password-line">
            {visible ? attachment.password || '-' : maskSecret(attachment.password)}
            <button onClick={onToggleVisible} title={visible ? '隐藏密码' : '显示密码'}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            <button onClick={() => copyText(attachment.password)} title="复制密码"><Copy size={15} /></button>
          </strong>
          {attachment.remark && <><span>备注</span><strong>{attachment.remark}</strong></>}
        </div>
      ) : attachment.type === 'link' ? (
        <div className="link-body">
          <button onClick={() => api.shell.openExternal(attachment.url)}>{attachment.title || attachment.url || '打开网址'}</button>
          <small>{attachment.url}</small>
          {attachment.description && <p>{attachment.description}</p>}
        </div>
      ) : (
        <div className="note-body">
          <strong>{attachment.title || '未命名笔记'}</strong>
          {attachment.body && <p>{attachment.body}</p>}
          {attachment.remark && <small>{attachment.remark}</small>}
        </div>
      )}
    </article>
  );
}

function maskSecret(value) {
  if (!value) return '-';
  return '•'.repeat(Math.min(12, Math.max(6, value.length)));
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : '';
}
