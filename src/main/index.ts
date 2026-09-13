import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import bundledFfmpegPath from 'ffmpeg-static'
import icon from '../../resources/icon.png?asset'
import { activateLicense, getLicenseStatus } from './license'

function resolveFfmpegPath(): string {
  if (app.isPackaged) {
    return join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'ffmpeg-static',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    )
  }

  if (!bundledFfmpegPath) throw new Error('Bundled FFmpeg executable is unavailable.')
  return bundledFfmpegPath
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    center: true,
    fullscreen: true,
    fullscreenable: true,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.setMenuBarVisibility(false)
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(details.url)) {
      return { action: 'deny' }
    }
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    const blocked =
      key === 'f12' ||
      (input.control && input.shift && ['i', 'j', 'c'].includes(key)) ||
      (input.control && ['r', 'u', 'l', 'p'].includes(key)) ||
      (input.meta && ['r', 'u', 'l', 'p'].includes(key))
    if (blocked) event.preventDefault()
  })

  if (!is.dev) {
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('file://')) event.preventDefault()
    })
  }

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

type MediaFormat = 'gif' | 'mp4'

interface MediaConversionRequest {
  data: ArrayBuffer | Uint8Array
  format: MediaFormat
  durationMs?: number
  exportId?: string
  settings?: {
    fps?: number
    width?: number
    height?: number
  }
}

const activeMediaProcesses = new Map<string, ReturnType<typeof spawn>>()

ipcMain.handle('load-font', async () => {
  const bundledFontPath = join(__dirname, '../renderer/fonts/NotoSansArabic-Regular.ttf')
  return await fs.readFile(bundledFontPath)
})

ipcMain.handle('license-status', () => getLicenseStatus())
ipcMain.handle('activate-license', (_event, token: string) => activateLicense(token))

function runFfmpeg(
  inputPath: string,
  outputPath: string,
  format: MediaFormat,
  durationMs: number,
  onProgress: (progress: number) => void,
  exportId?: string,
  settings: MediaConversionRequest['settings'] = {}
): Promise<void> {
  const fps = Math.max(1, Math.min(60, Math.round(settings.fps || (format === 'gif' ? 8 : 12))))
  const width = Math.max(160, Math.min(2560, Math.round(settings.width || (format === 'gif' ? 640 : 800))))
  const args =
    format === 'gif'
      ? [
          '-y',
          '-i',
          inputPath,
          '-vf',
          `fps=${fps},scale=${width}:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=sierra2_4a`,
          '-loop',
          '0',
          '-progress',
          'pipe:1',
          '-nostats',
          outputPath
        ]
      : [
          '-y',
          '-i',
          inputPath,
          '-r',
          String(fps),
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          '-progress',
          'pipe:1',
          '-nostats',
          outputPath
        ]

  return new Promise((resolve, reject) => {
    const process = spawn(resolveFfmpegPath(), args)
    if (exportId) activeMediaProcesses.set(exportId, process)
    let stderr = ''
    let stdout = ''
    process.stdout.on('data', (chunk) => {
      stdout += String(chunk)
      const lines = stdout.split('\n')
      stdout = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('out_time_ms=')) continue
        const outputTimeMs = Number(line.slice('out_time_ms='.length)) / 1000
        if (Number.isFinite(outputTimeMs) && durationMs > 0) {
          onProgress(Math.max(0, Math.min(1, outputTimeMs / durationMs)))
        }
      }
    })
    process.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    process.once('error', reject)
    process.once('close', (code) => {
      if (exportId) activeMediaProcesses.delete(exportId)
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg ${format} conversion failed (${code}): ${stderr.slice(-2000)}`))
    })
  })
}

ipcMain.handle('convert-media', async (event, request: MediaConversionRequest) => {
  if (!request || !['gif', 'mp4'].includes(request.format)) {
    throw new Error('Unsupported media export format.')
  }

  const bytes =
    request.data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(request.data)) : Buffer.from(request.data)
  const basePath = join(tmpdir(), `abjad-${randomUUID()}`)
  const inputPath = `${basePath}.webm`
  const outputPath = `${basePath}.${request.format}`

  try {
    await fs.writeFile(inputPath, bytes)
    await runFfmpeg(
      inputPath,
      outputPath,
      request.format,
      request.durationMs || 0,
      (progress) => event.sender.send('media-conversion-progress', progress),
      request.exportId,
      request.settings
    )
    return await fs.readFile(outputPath)
  } finally {
    await Promise.allSettled([fs.rm(inputPath, { force: true }), fs.rm(outputPath, { force: true })])
  }
})

ipcMain.handle('select-export-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'اختيار مجلد التصدير',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? '' : result.filePaths[0] || ''
})

ipcMain.handle(
  'save-export-file',
  async (_event, request: { data: ArrayBuffer | Uint8Array; directory: string; filename: string; format: MediaFormat }) => {
    if (!request?.directory || !request?.filename || !['gif', 'mp4'].includes(request.format)) {
      throw new Error('بيانات ملف التصدير غير صالحة.')
    }
    const safeFilename =
      (request.filename.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'arabic-calligraphy').replace(
        new RegExp(`\\.${request.format}$`, 'i'),
        ''
      ) || 'arabic-calligraphy'
    const outputPath = join(request.directory, `${safeFilename}.${request.format}`)
    const bytes = request.data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(request.data)) : Buffer.from(request.data)
    await fs.writeFile(outputPath, bytes)
    return outputPath
  }
)

ipcMain.handle('cancel-media-export', async (_event, exportId: string) => {
  const process = activeMediaProcesses.get(exportId)
  if (!process) return false
  process.kill('SIGTERM')
  return true
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
