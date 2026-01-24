import { Suspense, useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import './App.css'
import { AppRoutes } from './routes'
import { ReadViewProvider } from './readViewContext'
import { applyTheme, getStoredTheme } from '../shared/theme'

function App() {
  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  return (
    <BrowserRouter>
      <ReadViewProvider>
        <div className="app">
          <main className="app__page">
            <Suspense fallback={<div>Loading...</div>}>
              <AppRoutes />
            </Suspense>
          </main>
        </div>
      </ReadViewProvider>
    </BrowserRouter>
  )
}

export default App
