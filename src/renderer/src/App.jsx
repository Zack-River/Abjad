import { lazy, Suspense, useEffect, useState } from 'react'
import LicenseGate from './components/LicenseGate'
import './App.css'

const StudioView = lazy(() => import('./components/StudioView'))

const THEME_STORAGE_KEY = 'abjad-theme'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'

  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

function App() {
  const [license, setLicense] = useState({ status: 'loading' })
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    window.api
      .getLicenseStatus()
      .then(setLicense)
      .catch(() => setLicense({ status: 'offline' }))
  }, [])

  if (license.status === 'loading') {
    return <div className="route-loading">جاري التحقق من الترخيص...</div>
  }

  if (license.status !== 'licensed') {
    return <LicenseGate status={license.status} onLicensed={setLicense} />
  }

  return (
    <Suspense fallback={<div className="route-loading">جاري تحميل لوحة الخط...</div>}>
      <StudioView
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      />
    </Suspense>
  )
}

export default App
