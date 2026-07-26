import React from 'react'

export default function Sidebar({ 
  history, 
  username, 
  activeTutorialId, 
  onSelect, 
  onDelete, 
  onNewClick, 
  onLogout,
  theme,
  onToggleTheme
}) {
  return (
    <aside id="history-sidebar" className="history-sidebar glass-panel">
      {/* New Tutorial button */}
      <button id="new-tutorial-btn" className="new-tutorial-btn" onClick={onNewClick}>
        <span className="plus-icon">+</span>
        <span>New Tutorial</span>
      </button>

      <div className="history-title">History</div>

      {/* History List */}
      <ul id="history-list" className="history-list">
        {history.length === 0 ? (
          <li style={{ 
            padding: '1rem', 
            fontSize: '0.85rem', 
            color: 'var(--text-muted)', 
            textAlign: 'center' 
          }}>
            No generated tutorials yet.
          </li>
        ) : (
          history.map(t => (
            <li 
              key={t.id} 
              className={`history-item ${activeTutorialId === t.id ? 'active' : ''}`}
            >
              <span className="history-label" onClick={() => onSelect(t.id)}>
                {t.project_name}
              </span>
              <button 
                className="delete-history-btn" 
                title="Delete Tutorial"
                onClick={() => onDelete(t.id)}
              >
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </li>
          ))
        )}
      </ul>

      {/* User Profile */}
      <div className="user-profile-card">
        <div className="user-details" style={{ flexGrow: 1, minWidth: 0 }}>
          <span className="user-avatar">👤</span>
          <span id="user-display-name" className="user-username">{username || 'User'}</span>
        </div>
        
        {/* Theme Toggle Button */}
        <button 
          className="theme-toggle-btn" 
          title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"} 
          onClick={onToggleTheme}
          style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '0.4rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'var(--transition-fast)',
            marginRight: '0.4rem'
          }}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>

        <button id="logout-btn" className="logout-btn" title="Log Out" onClick={onLogout}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M16 17v-3H9v-4h7V7l5 5-5 5M14 2a2 2 0 0 1 2 2v4h-2V4H4v16h10v-4h2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10Z"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}
