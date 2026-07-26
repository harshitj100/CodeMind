import React, { useState, useEffect } from 'react'
import BackgroundCanvas from './components/BackgroundCanvas'
import AuthPanel from './components/AuthPanel'
import Sidebar from './components/Sidebar'
import SearchSection from './components/SearchSection'
import LoadingSection from './components/LoadingSection'
import Workspace from './components/Workspace'

export default function App() {
  const [username, setUsername] = useState(null)
  const [viewMode, setViewMode] = useState('auth') // 'auth' | 'landing' | 'loading' | 'workspace'
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark') // 'dark' | 'light'
  const [history, setHistory] = useState([])
  const [activeTutorial, setActiveTutorial] = useState(null)
  const [loadingRepo, setLoadingRepo] = useState('')

  // 1. Sync React viewMode and theme with document.body.className for stylesheet states
  useEffect(() => {
    document.body.className = `mode-${viewMode} theme-${theme}`
  }, [viewMode, theme])

  // 2. Check local session cache on startup
  useEffect(() => {
    const storedUser = localStorage.getItem('username')
    if (storedUser) {
      setUsername(storedUser)
      setViewMode('landing')
      fetchHistory(storedUser)
    } else {
      setViewMode('auth')
    }
  }, [])

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem('theme', nextTheme)
  }

  // 3. Fetch user history from MongoDB
  const fetchHistory = async (user) => {
    const targetUser = user || username
    if (!targetUser) return
    try {
      const response = await fetch(`/api/tutorials?username=${encodeURIComponent(targetUser)}`)
      const data = await response.json()
      if (data && data.success) {
        setHistory(data.tutorials)
      }
    } catch (err) {
      console.error("Error loading tutorial history:", err)
    }
  }

  // 4. Handle successful login/signup session allocation
  const handleAuthSuccess = (loggedUsername) => {
    localStorage.setItem('username', loggedUsername)
    setUsername(loggedUsername)
    setViewMode('landing')
    fetchHistory(loggedUsername)
  }

  // 5. Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('username')
    setUsername(null)
    setHistory([])
    setActiveTutorial(null)
    setViewMode('auth')
  }

  // 6. Handle historical tutorial selection
  const handleSelectTutorial = async (id) => {
    try {
      const response = await fetch(`/api/tutorials/${id}`)
      const data = await response.json()
      if (data && data.success) {
        setActiveTutorial(data)
        setViewMode('workspace')
      }
    } catch (err) {
      console.error("Error loading saved tutorial:", err)
    }
  }

  // 7. Handle tutorial deletion
  const handleDeleteTutorial = async (id) => {
    if (!confirm("Are you sure you want to delete this tutorial?")) return
    try {
      const response = await fetch(`/api/tutorials/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (response.ok && data.success) {
        // If deleted is currently displayed, go back to landing
        if (activeTutorial && activeTutorial.id === id) {
          setActiveTutorial(null)
          setViewMode('landing')
        } else if (viewMode === 'workspace' && activeTutorial) {
          // If active is not matching ID but we are in workspace, fetch details from active tutorial to verify
          // If the list refreshes we can just keep it.
        }
        fetchHistory()
      } else {
          alert("Error: " + (data.detail || "Failed to delete tutorial."))
      }
    } catch (err) {
      console.error("Error deleting tutorial:", err)
    }
  }

  // 8. Handle Generation trigger
  const handleGenerate = async (repoUrl) => {
    setLoadingRepo(repoUrl)
    setViewMode('loading')

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: repoUrl, username: username })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || "Generation workflow encountered an error.")
      }

      if (data && data.success) {
        setActiveTutorial(data)
        await fetchHistory()
        setViewMode('workspace')
      }
    } catch (err) {
      console.error(err)
      setViewMode('landing')
      alert(`Error: ${err.message || "An error occurred compiling the repository."}`)
    }
  }

  // 9. Go back to Home
  const handleGoHome = () => {
    setActiveTutorial(null)
    setViewMode('landing')
  }

  return (
    <>
      {/* 2D Particles & Star constellations background canvas */}
      <BackgroundCanvas viewMode={viewMode} theme={theme} />

      {/* Volumetric HSL Edge Glows */}
      <div className="glow-orb glow-orb-1"></div>
      <div className="glow-orb glow-orb-2"></div>
      <div className="glow-orb glow-orb-3"></div>

      {viewMode === 'auth' ? (
        <AuthPanel onAuthSuccess={handleAuthSuccess} />
      ) : (
        <div id="app-layout" className="app-layout">
          {/* Persistent Left Sidebar History Panel */}
          <Sidebar 
            history={history}
            username={username}
            activeTutorialId={activeTutorial ? activeTutorial.id : null}
            onSelect={handleSelectTutorial}
            onDelete={handleDeleteTutorial}
            onNewClick={handleGoHome}
            onLogout={handleLogout}
            theme={theme}
            onToggleTheme={handleToggleTheme}
          />

          {/* Right Side Main Stage */}
          <div id="main-stage" className="main-stage">
            {viewMode === 'landing' && (
              <SearchSection 
                username={username} 
                onGenerate={handleGenerate} 
              />
            )}
            
            {viewMode === 'loading' && (
              <LoadingSection />
            )}
            
            {viewMode === 'workspace' && activeTutorial && (
              <Workspace 
                tutorial={activeTutorial} 
                onBack={handleGoHome} 
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
