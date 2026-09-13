import { useState } from 'react'
import { KeyRound, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'

export default function LicenseGate({ status, onLicensed }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (!token.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await window.api.activateLicense(token)
      if (result.status === 'licensed') {
        onLicensed(result)
      } else if (result.status === 'offline') {
        setError('يجب الاتصال بخادم الترخيص للتحقق من المفتاح.')
      } else if (result.status === 'storage_unavailable') {
        setError('التخزين الآمن غير متاح. فعّل مدير مفاتيح النظام ثم أعد المحاولة.')
      } else if (result.status === 'device_bound') {
        setError('مفتاح الترخيص مرتبط بجهاز آخر.')
      } else {
        setError('مفتاح الترخيص غير صالح أو منتهي الصلاحية.')
      }
    } catch {
      setError('تعذر الوصول إلى خدمة الترخيص.')
    } finally {
      setBusy(false)
    }
  }

  const retry = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await window.api.getLicenseStatus()
      if (result.status === 'licensed') onLicensed(result)
      else setError('لا يزال التحقق من الترخيص غير متاح.')
    } catch {
      setError('تعذر الوصول إلى خدمة الترخيص.')
    } finally {
      setBusy(false)
    }
  }

  const needsOnline = status === 'offline' || status === 'expired'

  return (
    <main className="license-gate" dir="rtl">
      <section className="license-gate-card" aria-labelledby="license-gate-title">
        <div className="license-gate-icon" aria-hidden="true">
          <ShieldCheck size={30} strokeWidth={1.9} />
        </div>
        <h1 id="license-gate-title">تفعيل التطبيق</h1>
        <p>
          أدخل مفتاح الترخيص للمتابعة.
          {needsOnline ? ' يلزم الاتصال بالإنترنت للتحقق من هذا الترخيص.' : ''}
        </p>

        <form onSubmit={submit} className="license-gate-form">
          <label htmlFor="license-token">مفتاح الترخيص</label>
          <div className="license-token-field">
            <KeyRound size={18} aria-hidden="true" />
            <input
              id="license-token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="AS-2H-... أو AS-LIFE-..."
              autoComplete="off"
              spellCheck="false"
              dir="ltr"
              disabled={busy}
            />
          </div>
          <button type="submit" className="license-submit" disabled={busy || !token.trim()}>
            {busy ? <LoaderCircle className="license-spinner" size={18} aria-hidden="true" /> : null}
            تحقق وتفعيل
          </button>
        </form>

        {status === 'storage_unavailable' ? (
          <div className="license-gate-error" role="alert">
            التخزين الآمن لنظام التشغيل غير متاح. على Linux فعّل GNOME Keyring أو KWallet.
          </div>
        ) : null}
        {error ? (
          <div className="license-gate-error" role="alert">
            {error}
          </div>
        ) : null}

        {needsOnline ? (
          <button type="button" className="license-retry" onClick={retry} disabled={busy}>
            <RefreshCw size={15} aria-hidden="true" />
            إعادة التحقق
          </button>
        ) : null}
      </section>
    </main>
  )
}
