import React from 'react'

export default function Sidebar({ 
  history, 
  username, 
  activeTutorialId, 
  onSelect, 
  onDelete, 
  onNewClick, 
  onLogout,
  isCollapsed,
  onToggleCollapse
}) {
  return (
    <aside id="history-sidebar" className={`history-sidebar glass-panel ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Collapse Toggle Button */}
      <button 
        className="sidebar-collapse-btn" 
        onClick={onToggleCollapse} 
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
          {isCollapsed ? (
            <polyline points="9 18 15 12 9 6"></polyline>
          ) : (
            <polyline points="15 18 9 12 15 6"></polyline>
          )}
        </svg>
      </button>

      {/* New Tutorial button */}
      <button id="new-tutorial-btn" className="new-tutorial-btn" onClick={onNewClick} title="New Tutorial">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="plus-icon" style={{ flexShrink: 0 }}>
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
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
            {!isCollapsed && "No generated tutorials yet."}
          </li>
        ) : (
          history.map(t => (
            <li 
              key={t.id} 
              className={`history-item ${activeTutorialId === t.id ? 'active' : ''}`}
              title={isCollapsed ? t.project_name : ""}
            >
              <span className="history-item-inner" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', minWidth: 0 }}>
                {/* SVG Folder Icon replacing emoji */}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="folder-icon" style={{ flexShrink: 0, opacity: 0.65 }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span className="history-label" onClick={() => onSelect(t.id)}>
                  {t.project_name}
                </span>
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
        <div className="user-details" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexGrow: 1, minWidth: 0 }}>
          {/* SVG User Icon replacing emoji */}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="user-avatar-svg" style={{ flexShrink: 0, color: 'var(--accent-purple)' }}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span id="user-display-name" className="user-username">{username || 'User'}</span>
        </div>

        <button id="logout-btn" className="logout-btn" title="Log Out" onClick={onLogout}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M16 17v-3H9v-4h7V7l5 5-5 5M14 2a2 2 0 0 1 2 2v4h-2V4H4v16h10v-4h2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10Z"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}
