import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

type LicenseType = 'trial_2h' | 'lifetime'
type LicenseStatusCode =
  | 'licensed'
  | 'required'
  | 'expired'
  | 'device_bound'
  | 'offline'
  | 'storage_unavailable'

export interface LicenseStatus {
  status: LicenseStatusCode
  licenseType?: LicenseType
  expiresAt?: string | null
  remainingSeconds?: number | null
  message?: string
}

interface CachedLicense {
  token: string
  licenseType: LicenseType
  activatedAt?: string | null
  expiresAt?: string | null
}

const licenseApiUrl = (
  process.env.LICENSE_API_URL || 'https://abjad-licences.vercel.app'
).replace(/\/$/, '')
const cachePath = () => join(app.getPath('userData'), 'license.dat')
const devicePath = () => join(app.getPath('userData'), 'device.dat')

function storageIsUsable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    return false
  }
  return true
}

async function readCache(): Promise<CachedLicense | null> {
  if (!storageIsUsable()) return null
  try {
    const encoded = await fs.readFile(cachePath(), 'utf8')
    const decrypted = safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    const parsed = JSON.parse(decrypted) as CachedLicense
    if (!parsed.token || !['trial_2h', 'lifetime'].includes(parsed.licenseType)) return null
    return parsed
  } catch {
    return null
  }
}

async function writeCache(license: CachedLicense): Promise<void> {
  if (!storageIsUsable()) throw new Error('secure_storage_unavailable')
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  const encrypted = safeStorage.encryptString(JSON.stringify(license))
  await fs.writeFile(cachePath(), encrypted.toString('base64'), { mode: 0o600 })
}

async function getDeviceId(): Promise<string> {
  if (!storageIsUsable()) throw new Error('secure_storage_unavailable')
  try {
    const encoded = await fs.readFile(devicePath(), 'utf8')
    const deviceId = safeStorage.decryptString(Buffer.from(encoded, 'base64')).trim()
    if (deviceId) return deviceId
  } catch {
    // Generate an identity on first activation or after an unreadable cache.
  }

  const deviceId = randomUUID()
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  const encrypted = safeStorage.encryptString(deviceId)
  await fs.writeFile(devicePath(), encrypted.toString('base64'), { mode: 0o600 })
  return deviceId
}

async function clearCache(): Promise<void> {
  await fs.rm(cachePath(), { force: true }).catch(() => undefined)
}

async function validateOnline(token: string): Promise<LicenseStatus> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const deviceId = await getDeviceId()
    const response = await fetch(`${licenseApiUrl}/api/licenses/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, deviceId }),
      signal: controller.signal
    })
    const body = (await response.json()) as {
      authorized?: boolean
      reason?: string
      license?: {
        type?: LicenseType
        activatedAt?: string | null
        expiresAt?: string | null
        remainingSeconds?: number | null
      }
    }

    if (!response.ok || !body.authorized || !body.license?.type) {
      await clearCache()
      return {
        status:
          body.reason === 'invalid_token'
            ? 'required'
            : body.reason === 'device_bound'
              ? 'device_bound'
              : 'expired',
        message: body.reason || 'license_not_authorized'
      }
    }

    await writeCache({
      token,
      licenseType: body.license.type,
      activatedAt: body.license.activatedAt,
      expiresAt: body.license.expiresAt
    })

    return {
      status: 'licensed',
      licenseType: body.license.type,
      expiresAt: body.license.expiresAt,
      remainingSeconds: body.license.remainingSeconds
    }
  } catch {
    return { status: 'offline', message: 'online_validation_required' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  if (!storageIsUsable()) {
    return {
      status: 'storage_unavailable',
      message: 'Enable the operating system keyring before using licensing.'
    }
  }

  const cached = await readCache()
  if (!cached) return { status: 'required' }

  if (cached.licenseType === 'lifetime') {
    return { status: 'licensed', licenseType: 'lifetime', expiresAt: null, remainingSeconds: null }
  }

  // Trial keys deliberately revalidate online on every application launch.
  return validateOnline(cached.token)
}

export async function activateLicense(token: string): Promise<LicenseStatus> {
  if (!storageIsUsable()) return { status: 'storage_unavailable' }
  const normalizedToken = token.trim()
  if (!normalizedToken || normalizedToken.length > 200) return { status: 'required', message: 'token_required' }
  return validateOnline(normalizedToken)
}
