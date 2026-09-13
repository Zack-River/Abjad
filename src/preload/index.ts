import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  loadFont: () => ipcRenderer.invoke('load-font'),
  getLicenseStatus: () => ipcRenderer.invoke('license-status'),
  activateLicense: (token: string) => ipcRenderer.invoke('activate-license', token),
  convertMedia: (
    data: ArrayBuffer | Uint8Array,
    format: 'gif' | 'mp4',
    durationMs?: number,
    exportId?: string,
    settings?: { fps?: number; width?: number; height?: number }
  ) => ipcRenderer.invoke('convert-media', { data, format, durationMs, exportId, settings }),
  selectExportDirectory: () => ipcRenderer.invoke('select-export-directory'),
  saveExportFile: (
    data: ArrayBuffer | Uint8Array,
    directory: string,
    filename: string,
    format: 'gif' | 'mp4'
  ) => ipcRenderer.invoke('save-export-file', { data, directory, filename, format }),
  cancelMediaExport: (exportId: string) => ipcRenderer.invoke('cancel-media-export', exportId),
  onMediaProgress: (listener: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) => listener(progress)
    ipcRenderer.on('media-conversion-progress', handler)
    return () => ipcRenderer.removeListener('media-conversion-progress', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose application API:', error)
  }
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error('Failed to expose Electron toolkit API:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
