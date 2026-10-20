const { contextBridge, ipcRenderer } = require('electron')
const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
contextBridge.exposeInMainWorld('nebula', {
  open: () => ipcRenderer.invoke('document:open'),
  recent: () => ipcRenderer.invoke('document:recent'),
  openRecent: id => ipcRenderer.invoke('document:open-recent', id),
  save: (name, bytes) => ipcRenderer.invoke('document:save', name, bytes),
  copy: text => ipcRenderer.invoke('document:copy', text),
  print: html => ipcRenderer.invoke('document:print', html),
  onOpen: callback => subscribe('document:opened', callback),
  onCommand: callback => subscribe('app:command', callback),
  ready: () => ipcRenderer.send('app:ready'),
})
