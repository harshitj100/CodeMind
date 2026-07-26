import React, { useState } from 'react'

export default function AuthPanel({ onAuthSuccess }) {
  const [authMode, setAuthMode] = useState('login') // 'login' | 'signup'
  const [usernameInput, setUsernameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMode, setSuccessMode] = useState(false)

  const handleTabChange = (mode) => {
    setAuthMode(mode)
    setErrorMessage('')
    setSuccessMode(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    setSuccessMode(false)

    const username = usernameInput.trim()
    const password = passwordInput

    if (!username || !password) {
      setErrorMessage("Please fill out all fields.")
      return
    }

    const url = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup'
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (!response.ok) {
        setErrorMessage(data.detail || "Authentication request failed.")
        return
      }

      if (authMode === 'login') {
        onAuthSuccess(data.username)
      } else {
        // Sign Up Success: Switch to Login Tab with Success message
        setAuthMode('login')
        setPasswordInput('')
        setSuccessMode(true)
        setErrorMessage("Sign up successful! Please log in now.")
      }
    } catch (err) {
      console.error(err)
      setErrorMessage("Server communication error. Check connection.")
    }
  }

  return (
    <div id="auth-panel" className="auth-panel glass-panel">
      <div className="auth-header">
        <span className="auth-logo">⚡</span>
        <h2>CodeBase Tutorial Builder</h2>
      </div>

      {/* Tabs */}
      <div className="auth-tabs">
        <button 
          onClick={() => handleTabChange('login')}
          className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
        >
          Log In
        </button>
        <button 
          onClick={() => handleTabChange('signup')}
          className={`auth-tab ${authMode === 'signup' ? 'active' : ''}`}
        >
          Sign Up
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="auth-form-group">
          <label htmlFor="auth-username">Username</label>
          <input 
            type="text" 
            id="auth-username" 
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            required 
            placeholder="Enter your username..." 
          />
        </div>

        <div className="auth-form-group">
          <label htmlFor="auth-password">Password</label>
          <input 
            type="password" 
            id="auth-password" 
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            required 
            placeholder="Enter password (min 6 chars)..." 
          />
        </div>

        {errorMessage && (
          <div 
            className="auth-error-message"
            style={{
              color: successMode ? '#34D399' : '#F87171',
              background: successMode ? 'rgba(52, 211, 153, 0.07)' : 'rgba(248, 113, 113, 0.07)',
              borderColor: successMode ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)'
            }}
          >
            {errorMessage}
          </div>
        )}

        <button type="submit" className="auth-submit-btn">
          {authMode === 'login' ? 'Log In' : 'Sign Up'}
        </button>
      </form>
    </div>
  )
}
