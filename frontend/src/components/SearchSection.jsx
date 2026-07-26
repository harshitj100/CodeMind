import React, { useState, useEffect } from 'react'

export default function SearchSection({ username, onGenerate }) {
  const [repoUrl, setRepoUrl] = useState('')
  const [typedText, setTypedText] = useState('')
  const [cursorVisible, setCursorVisible] = useState(true)

  useEffect(() => {
    setTypedText('')
    setCursorVisible(true)
    
    const welcomeName = username ? username.charAt(0).toUpperCase() + username.slice(1) : 'User'
    const fullText = `Welcome, ${welcomeName}`
    let index = 0

    const typingTimer = setInterval(() => {
      if (index < fullText.length) {
        setTypedText((prev) => prev + fullText.charAt(index))
        index++
      } else {
        clearInterval(typingTimer)
        setTimeout(() => {
          setCursorVisible(false)
        }, 2000)
      }
    }, 80 + Math.random() * 60)

    return () => clearInterval(typingTimer)
  }, [username])

  const handleSubmit = (e) => {
    e.preventDefault()
    const url = repoUrl.trim()
    if (url) {
      onGenerate(url)
    }
  }

  return (
    <div id="search-section" className="search-section">
      <h1 className="welcome-title" id="welcome-title" style={{ fontSize: 'clamp(2.8rem, 4.5vw, 3.8rem)' }}>
        <span>{typedText}</span>
        {cursorVisible && <span className="typewriter-cursor">|</span>}
      </h1>

      <div className="search-box-container">
        <form onSubmit={handleSubmit}>
          <div className="input-wrapper">
            {/* Custom GitHub Icon */}
            <svg className="github-icon" viewBox="0 0 24 24" width="24" height="24">
              <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577v-2.234c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22v3.293c0 .319.22.694.825.576C20.565 21.795 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            
            <input 
              type="url" 
              className="repo-input" 
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="Paste a GitHub repository URL..." 
              required
            />
            
            <button type="submit" className="arrow-btn" aria-label="Generate Tutorial">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
