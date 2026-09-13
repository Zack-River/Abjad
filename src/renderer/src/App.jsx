import { lazy, Suspense, useState, useEffect } from 'react'
import StudioView from './components/StudioView'
import LicenseGate from './components/LicenseGate'
import './App.css'

const ComparisonGallery = lazy(() => import('./components/ComparisonGallery'))

function App() {
  // Support both direct URL route /dev/stroke-gallery and in-app dev toggle
  const isDevRoute = () =>
    typeof window !== 'undefined' &&
    (window.location.pathname === '/dev/stroke-gallery' ||
      window.location.hash.includes('stroke-gallery'))

  const [currentView, setCurrentView] = useState(isDevRoute() ? 'gallery' : 'player')
  const [license, setLicense] = useState({ status: 'loading' })

  useEffect(() => {
    window.api
      .getLicenseStatus()
      .then(setLicense)
      .catch(() => setLicense({ status: 'offline' }))
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(isDevRoute() ? 'gallery' : 'player')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  if (license.status === 'loading') {
    return <div className="route-loading">جاري التحقق من الترخيص...</div>
  }

  if (license.status !== 'licensed') {
    return <LicenseGate status={license.status} onLicensed={setLicense} />
  }

  const navigateToPlayer = () => {
    if (window.history.pushState) {
      window.history.pushState(null, '', '/')
    }
    setCurrentView('player')
  }

  if (currentView === 'gallery') {
    return (
      <Suspense fallback={<div className="route-loading">جاري تحميل أدوات التحقق...</div>}>
        <ComparisonGallery onBackToPlayer={navigateToPlayer} />
      </Suspense>
    )
  }

  return <StudioView />
}

export default App
