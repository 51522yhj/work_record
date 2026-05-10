const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workRecord', {
  records: {
    list: () => ipcRenderer.invoke('records:list'),
    create: (payload) => ipcRenderer.invoke('records:create', payload),
    update: (id, patch) => ipcRenderer.invoke('records:update', id, patch),
    delete: (id) => ipcRenderer.invoke('records:delete', id)
  },
  attachments: {
    create: (recordId, attachment) => ipcRenderer.invoke('attachments:create', recordId, attachment),
    update: (recordId, attachmentId, patch) => ipcRenderer.invoke('attachments:update', recordId, attachmentId, patch),
    delete: (recordId, attachmentId) => ipcRenderer.invoke('attachments:delete', recordId, attachmentId)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    selectDataDir: () => ipcRenderer.invoke('settings:selectDataDir')
  },
  auth: {
    get: () => ipcRenderer.invoke('auth:get'),
    configure: (payload) => ipcRenderer.invoke('auth:configure', payload),
    signIn: (payload) => ipcRenderer.invoke('auth:signIn', payload),
    signUp: (payload) => ipcRenderer.invoke('auth:signUp', payload),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
    migrateLocalToSupabase: () => ipcRenderer.invoke('auth:migrateLocalToSupabase')
  },
  window: {
    setOpacity: (opacity) => ipcRenderer.invoke('window:setOpacity', opacity),
    toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
    collapse: () => ipcRenderer.invoke('window:collapse'),
    expand: () => ipcRenderer.invoke('window:expand'),
    popup: () => ipcRenderer.invoke('window:popup'),
    getBounds: () => ipcRenderer.invoke('window:getBounds'),
    resizeByDrag: (edge, deltaX, deltaY) => ipcRenderer.invoke('window:resizeByDrag', edge, deltaX, deltaY),
    resizeToCursor: (edge, startBounds, startPoint) => ipcRenderer.invoke('window:resizeToCursor', edge, startBounds, startPoint),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  }
});
