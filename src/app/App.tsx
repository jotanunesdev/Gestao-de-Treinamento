import { Suspense } from 'react'
import { BrowserRouter } from 'react-router-dom'
import './App.css'
import { AppRoutes } from './routes'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <main className="app__page">
          <Suspense fallback={<div>Loading...</div>}>
            <AppRoutes />
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
