import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      loadFont: () => Promise<Uint8Array>
      getLicenseStatus: () => Promise<{
        status:
          'licensed' | 'required' | 'expired' | 'device_bound' | 'offline' | 'storage_unavailable'
        licenseType?: 'trial_2h' | 'lifetime'
        expiresAt?: string | null
        remainingSeconds?: number | null
        message?: string
      }>
      activateLicense: (token: string) => Promise<{
        status:
          'licensed' | 'required' | 'expired' | 'device_bound' | 'offline' | 'storage_unavailable'
        licenseType?: 'trial_2h' | 'lifetime'
        expiresAt?: string | null
        remainingSeconds?: number | null
        message?: string
      }>
      convertMedia: (
        data: ArrayBuffer | Uint8Array,
        format: 'gif' | 'mp4',
        durationMs?: number,
        exportId?: string,
        settings?: { fps?: number; width?: number; height?: number }
      ) => Promise<Uint8Array>
      selectExportDirectory: () => Promise<string>
      saveExportFile: (
        data: ArrayBuffer | Uint8Array,
        directory: string,
        filename: string,
        format: 'gif' | 'mp4'
      ) => Promise<string>
      startExportStream: (request: {
        exportId: string
        format: 'gif' | 'mp4'
        width: number
        height: number
        fps: number
        videoBitrate?: number
        directory: string
        filename: string
        endHoldDurationSeconds?: number
      }) => Promise<{ outputPath: string }>
      writeExportFrame: (request: {
        exportId: string
        frameData: ArrayBuffer | Uint8Array
      }) => Promise<void>
      finishExportStream: (request: {
        exportId: string
      }) => Promise<{ outputPath: string; size: number }>
      cancelExportStream: (exportId: string) => Promise<boolean>
      cancelMediaExport: (exportId: string) => Promise<boolean>
      onMediaProgress: (listener: (progress: number) => void) => () => void
    }
  }
}
