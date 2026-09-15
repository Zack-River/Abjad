import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import bundledFfmpegPath from 'ffmpeg-static'
import icon from '../../resources/icon.png?asset'
import { activateLicense, getLicenseStatus, requireLicensed } from './license'

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
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

interface ExportStreamRequest {
  exportId: string
  format: MediaFormat
  width: number
  height: number
  fps: number
  videoBitrate?: number
  directory: string
  filename: string
  endHoldDurationSeconds?: number
}

interface ActiveExportStream {
  process: ReturnType<typeof spawn>
  outputPath: string
  format: MediaFormat
  completionPromise: Promise<void>
  resolveCompletion: () => void
  rejectCompletion: (err: Error) => void
  startupPromise: Promise<void>
  resolveStartup: () => void
  rejectStartup: (err: Error) => void
  stderr: string
  frameWriteQueue: Promise<void>
  failureError?: Error
  closed: boolean
  cancelled: boolean
}

const activeMediaProcesses = new Map<string, ReturnType<typeof spawn>>()
const activeExportStreams = new Map<string, ActiveExportStream>()
const EXPORT_START_TIMEOUT_MS = 10_000
const EXPORT_FRAME_TIMEOUT_MS = 15_000
const EXPORT_CANCEL_TIMEOUT_MS = 2_000

function waitForProcessClose(process: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> {
  if (process.exitCode !== null) return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      process.removeListener('close', finish)
      resolve()
    }
    const timeout = setTimeout(finish, timeoutMs)
    process.once('close', finish)
  })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

ipcMain.handle('load-font', async () => {
  await requireLicensed()
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
  const width = Math.max(
    160,
    Math.min(2560, Math.round(settings.width || (format === 'gif' ? 640 : 800)))
  )
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
  await requireLicensed()
  if (!request || !['gif', 'mp4'].includes(request.format)) {
    throw new Error('Unsupported media export format.')
  }

  const bytes =
    request.data instanceof ArrayBuffer
      ? Buffer.from(new Uint8Array(request.data))
      : Buffer.from(request.data)
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
    await Promise.allSettled([
      fs.rm(inputPath, { force: true }),
      fs.rm(outputPath, { force: true })
    ])
  }
})

ipcMain.handle('select-export-directory', async () => {
  await requireLicensed()
  const result = await dialog.showOpenDialog({
    title: 'اختيار مجلد التصدير',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? '' : result.filePaths[0] || ''
})

ipcMain.handle(
  'save-export-file',
  async (
    _event,
    request: {
      data: ArrayBuffer | Uint8Array
      directory: string
      filename: string
      format: MediaFormat
    }
  ) => {
    await requireLicensed()
    if (!request?.directory || !request?.filename || !['gif', 'mp4'].includes(request.format)) {
      throw new Error('بيانات ملف التصدير غير صالحة.')
    }
    const safeFilename =
      (request.filename.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'arabic-calligraphy').replace(
        new RegExp(`\\.${request.format}$`, 'i'),
        ''
      ) || 'arabic-calligraphy'
    const outputPath = join(request.directory, `${safeFilename}.${request.format}`)
    const bytes =
      request.data instanceof ArrayBuffer
        ? Buffer.from(new Uint8Array(request.data))
        : Buffer.from(request.data)
    await fs.writeFile(outputPath, bytes)
    return outputPath
  }
)

function writeExportFrameToStream(
  stream: ActiveExportStream,
  frameData: ArrayBuffer | Uint8Array
): Promise<void> {
  const buffer =
    frameData instanceof ArrayBuffer
      ? Buffer.from(frameData)
      : Buffer.from(frameData.buffer, frameData.byteOffset, frameData.byteLength)

  const proc = stream.process
  return new Promise<void>((resolve, reject) => {
    if (stream.failureError) {
      reject(stream.failureError)
      return
    }
    if (stream.cancelled || stream.closed || proc.stdin?.destroyed || !proc.stdin?.writable) {
      reject(new Error('FFmpeg stream input is no longer writable.'))
      return
    }

    const stdin = proc.stdin
    let settled = false
    let canAcceptMore = true
    const timeout = setTimeout(() => {
      settle(new Error(`FFmpeg did not acknowledge a frame within ${EXPORT_FRAME_TIMEOUT_MS}ms.`))
    }, EXPORT_FRAME_TIMEOUT_MS)

    const cleanup = (): void => {
      clearTimeout(timeout)
      stdin.removeListener('drain', onDrain)
      stdin.removeListener('error', onStdinError)
      proc.removeListener('error', onProcessError)
      proc.removeListener('close', onProcessClose)
    }
    const settle = (error?: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const onDrain = (): void => settle()
    const onStdinError = (error: Error): void => settle(error)
    const onProcessError = (error: Error): void => settle(error)
    const onProcessClose = (code: number | null): void => {
      settle(new Error(`FFmpeg closed before the frame was written (code ${code ?? 'unknown'}).`))
    }

    stdin.once('drain', onDrain)
    stdin.once('error', onStdinError)
    proc.once('error', onProcessError)
    proc.once('close', onProcessClose)

    try {
      canAcceptMore = stdin.write(buffer, (error) => {
        if (error) {
          settle(error)
        } else if (canAcceptMore) {
          settle()
        }
      })
      if (canAcceptMore) {
        // The callback is still required because the write can fail after the
        // boolean return value. It will resolve this operation asynchronously.
      }
    } catch (error) {
      settle(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

ipcMain.handle('start-export-stream', async (_event, request: ExportStreamRequest) => {
  await requireLicensed()
  if (!request?.directory || !request?.filename || !['gif', 'mp4'].includes(request.format)) {
    throw new Error('بيانات تصدير غير صالحة.')
  }
  const safeFilename =
    (request.filename.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'arabic-calligraphy').replace(
      new RegExp(`\\.${request.format}$`, 'i'),
      ''
    ) || 'arabic-calligraphy'
  const outputPath = join(request.directory, `${safeFilename}.${request.format}`)

  await fs.access(request.directory)
  const ffmpegPath = resolveFfmpegPath()
  await fs.access(ffmpegPath)

  const width = Math.round(Math.max(160, Math.min(2560, request.width)) / 2) * 2
  const height = Math.round(Math.max(160, Math.min(2560, request.height)) / 2) * 2
  const fps = Math.max(
    1,
    Math.min(60, Math.round(request.fps || (request.format === 'gif' ? 15 : 30)))
  )
  const videoBitrate = Math.max(
    2_000_000,
    Math.min(
      40_000_000,
      Math.round(
        request.videoBitrate ||
          (height >= 1080 ? 20_000_000 : height >= 720 ? 12_000_000 : 6_000_000)
      )
    )
  )
  const endHoldSec =
    request.endHoldDurationSeconds !== undefined ? Math.max(0, request.endHoldDurationSeconds) : 1.5

  const args =
    request.format === 'gif'
      ? [
          '-y',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgba',
          '-s',
          `${width}x${height}`,
          '-r',
          String(fps),
          '-i',
          'pipe:0',
          '-filter_complex',
          endHoldSec > 0
            ? `[0:v]tpad=stop_duration=${endHoldSec}:stop_mode=clone,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=sierra2_4a`
            : `[0:v]split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=sierra2_4a`,
          '-loop',
          '0',
          '-nostats',
          outputPath
        ]
      : [
          '-y',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgba',
          '-s',
          `${width}x${height}`,
          '-r',
          String(fps),
          '-i',
          'pipe:0',
          ...(endHoldSec > 0 ? ['-vf', `tpad=stop_duration=${endHoldSec}:stop_mode=clone`] : []),
          '-c:v',
          'libx264',
          // Keep memory bounded for long FHD streams. Quality remains high
          // through the bitrate/CRF settings while medium avoids slow-preset
          // lookahead retaining substantially more encoder state.
          '-preset',
          'medium',
          '-b:v',
          String(videoBitrate),
          '-maxrate',
          String(Math.round(videoBitrate * 1.2)),
          '-bufsize',
          String(videoBitrate * 2),
          '-crf',
          '17',
          '-profile:v',
          'high',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          '-nostats',
          outputPath
        ]

  let resolveCompletion!: () => void
  let rejectCompletion!: (err: Error) => void
  let completionSettled = false
  const completionPromise = new Promise<void>((resolve, reject) => {
    resolveCompletion = () => {
      if (completionSettled) return
      completionSettled = true
      resolve()
    }
    rejectCompletion = (error) => {
      if (completionSettled) return
      completionSettled = true
      reject(error)
    }
  })

  let resolveStartup!: () => void
  let rejectStartup!: (err: Error) => void
  const startupPromise = new Promise<void>((resolve, reject) => {
    resolveStartup = resolve
    rejectStartup = reject
  })

  const proc = spawn(ffmpegPath, args)
  const streamInfo: ActiveExportStream = {
    process: proc,
    outputPath,
    format: request.format,
    completionPromise,
    resolveCompletion,
    rejectCompletion,
    startupPromise,
    resolveStartup,
    rejectStartup,
    stderr: '',
    frameWriteQueue: Promise.resolve(),
    closed: false,
    cancelled: false
  }

  // Prevent a startup/process failure from becoming an unhandled rejection
  // when the renderer is canceled before it reaches finalization.
  void completionPromise.catch(() => {})

  activeExportStreams.set(request.exportId, streamInfo)
  activeMediaProcesses.set(request.exportId, proc)

  proc.once('spawn', () => {
    streamInfo.resolveStartup()
  })

  proc.stderr?.on('data', (chunk) => {
    streamInfo.stderr += String(chunk)
  })

  proc.once('error', (err) => {
    streamInfo.failureError = err
    streamInfo.rejectStartup(err)
    rejectCompletion(err)
  })

  proc.once('close', (code) => {
    streamInfo.closed = true
    activeMediaProcesses.delete(request.exportId)
    if (code === 0) {
      resolveCompletion()
    } else {
      const error = new Error(
        `FFmpeg ${request.format} conversion failed (${code}): ${streamInfo.stderr.slice(-2000)}`
      )
      streamInfo.failureError ||= error
      streamInfo.rejectStartup(error)
      rejectCompletion(error)
    }
  })

  await withTimeout(
    startupPromise,
    EXPORT_START_TIMEOUT_MS,
    'FFmpeg did not start within the export startup timeout.'
  ).catch(async (error) => {
    streamInfo.failureError = error instanceof Error ? error : new Error(String(error))
    streamInfo.cancelled = true
    streamInfo.process.stdin?.destroy()
    streamInfo.process.kill('SIGTERM')
    await waitForProcessClose(streamInfo.process, EXPORT_CANCEL_TIMEOUT_MS)
    activeExportStreams.delete(request.exportId)
    activeMediaProcesses.delete(request.exportId)
    await fs.rm(outputPath, { force: true }).catch(() => {})
    throw streamInfo.failureError
  })

  return { outputPath }
})

ipcMain.handle(
  'write-export-frame',
  async (_event, request: { exportId: string; frameData: ArrayBuffer | Uint8Array }) => {
    await requireLicensed()
    const stream = activeExportStreams.get(request.exportId)
    if (!stream) throw new Error(`Active export stream not found: ${request.exportId}`)
    return writeExportFrameToStream(stream, request.frameData)
  }
)

ipcMain.handle('finish-export-stream', async (_event, request: { exportId: string }) => {
  await requireLicensed()
  const stream = activeExportStreams.get(request.exportId)
  if (!stream) throw new Error(`Active export stream not found: ${request.exportId}`)

  if (!stream.process.stdin?.destroyed && stream.process.stdin?.writable) {
    await stream.frameWriteQueue
    stream.process.stdin.end()
  }

  try {
    await stream.completionPromise
    const stat = await fs.stat(stream.outputPath)
    activeExportStreams.delete(request.exportId)
    return {
      outputPath: stream.outputPath,
      size: stat.size
    }
  } catch (error) {
    await fs.rm(stream.outputPath, { force: true }).catch(() => {})
    activeExportStreams.delete(request.exportId)
    throw error
  }
})

async function cancelActiveExportStream(exportId: string): Promise<boolean> {
  const stream = activeExportStreams.get(exportId)
  if (stream) {
    stream.cancelled = true
    const error = new Error('Export canceled by the user.')
    stream.failureError = error
    stream.rejectCompletion(error)
    stream.process.stdin?.destroy()
    if (!stream.process.killed) stream.process.kill('SIGTERM')
    await waitForProcessClose(stream.process, EXPORT_CANCEL_TIMEOUT_MS)
    if (stream.process.exitCode === null) {
      stream.process.kill('SIGKILL')
      await waitForProcessClose(stream.process, EXPORT_CANCEL_TIMEOUT_MS)
    }
    activeExportStreams.delete(exportId)
    activeMediaProcesses.delete(exportId)
    await fs.rm(stream.outputPath, { force: true }).catch(() => {})
    return true
  }

  const process = activeMediaProcesses.get(exportId)
  if (!process) return false
  process.stdin?.destroy()
  if (!process.killed) process.kill('SIGTERM')
  await waitForProcessClose(process, EXPORT_CANCEL_TIMEOUT_MS)
  activeMediaProcesses.delete(exportId)
  return true
}

ipcMain.handle('cancel-export-stream', async (_event, exportId: string) => {
  return cancelActiveExportStream(exportId)
})

ipcMain.handle('cancel-media-export', async (_event, exportId: string) => {
  return cancelActiveExportStream(exportId)
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
