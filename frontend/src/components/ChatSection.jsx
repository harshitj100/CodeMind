import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ChatSection({ tutorial }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: `Hello! I'm your RAG-based Codebase Assistant. I have indexed **${tutorial.project_name || 'this repository'}** using Tree-sitter and created semantic vector embeddings inside MongoDB Atlas.

Ask me questions about modules, specific functions, classes, or design flow, and I'll retrieve relevant code blocks to guide you!`
    }
  ])
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef(null)

  const suggestions = [
    "Explain the codebase structure and logical modules",
    "Where is User Authentication defined and how does it verify passwords?",
    "Show the MongoDB database connection details",
    "Explain how checkout and order processing is structured"
  ]

  // Dynamic layout hooks to scroll, highlight, and inject Copy buttons into code blocks
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }

    if (window.Prism && chatEndRef.current) {
      const container = chatEndRef.current.parentElement
      if (container) {
        window.Prism.highlightAllUnder(container)
      }
    }

    // Append absolute Copy buttons to all pre elements
    if (chatEndRef.current) {
      const container = chatEndRef.current.parentElement
      if (container) {
        const preElements = container.querySelectorAll('pre')
        preElements.forEach(pre => {
          if (pre.querySelector('.copy-code-btn')) return

          const btn = document.createElement('button')
          btn.className = 'copy-code-btn'
          btn.innerText = 'Copy'
          btn.style.position = 'absolute'
          btn.style.top = '6px'
          btn.style.right = '6px'
          btn.style.padding = '3px 8px'
          btn.style.fontSize = '0.72rem'
          btn.style.background = 'rgba(255, 255, 255, 0.05)'
          btn.style.border = '1px solid var(--border-glass)'
          btn.style.borderRadius = '6px'
          btn.style.color = 'var(--text-muted)'
          btn.style.cursor = 'pointer'
          btn.style.zIndex = '5'
          btn.style.transition = 'var(--transition-fast)'

          pre.style.position = 'relative'
          pre.appendChild(btn)

          btn.onclick = () => {
            const code = pre.querySelector('code')
            const textToCopy = code ? code.innerText : pre.innerText.replace('Copy', '')
            navigator.clipboard.writeText(textToCopy)
            btn.innerText = 'Copied!'
            btn.style.borderColor = 'var(--accent-purple)'
            btn.style.color = '#FFFFFF'
            setTimeout(() => {
              btn.innerText = 'Copy'
              btn.style.borderColor = 'var(--border-glass)'
              btn.style.color = 'var(--text-muted)'
            }, 2000)
          }
        })
      }
    }
  }, [messages, isTyping])

  const handleSend = async (text) => {
    if (!text.trim()) return

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: text
    }

    setMessages(prev => [...prev, userMessage])
    setInputText('')
    setIsTyping(true)

    try {
      // Build history payload formatted for Ollama Mistral prompt
      const conversationHistory = [
        ...messages.map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        })),
        { role: 'user', content: text }
      ]

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: tutorial.id,
          messages: conversationHistory
        })
      })

      if (!response.ok) {
        throw new Error("Local Ollama endpoint returned an error.")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let assistantMsgId = Date.now() + 1

      // Set empty response block
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        sender: 'assistant',
        text: ''
      }])
      setIsTyping(false)

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return { ...m, text: m.text + chunk }
          }
          return m
        }))
      }
    } catch (err) {
      console.error("RAG Chat stream error:", err)
      setMessages(prev => [...prev, {
        id: Date.now() + 2,
        sender: 'assistant',
        text: `⚠️ **Connection Error**: Could not stream answer from RAG server. Ensure Ollama is running locally at \`http://localhost:11434\` and the \`mistral\` model is pulled.\n\n*(Error Details: ${err.message || err})*`
      }])
      setIsTyping(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    handleSend(inputText)
  }

  const handleClearChat = () => {
    setMessages([
      {
        id: Date.now(),
        sender: 'assistant',
        text: `Cleared chat history. Ask me anything about **${tutorial.project_name}** repository codebase!`
      }
    ])
  }

  const renderMarkdown = (text) => {
    if (window.marked) {
      return { __html: window.marked.parse(text) }
    }
    return { __html: text }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 6.5rem)', maxWidth: '880px', margin: '0 auto', width: '100%', position: 'relative' }}>
      
      {/* Header controls for RAG Chat */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10B981', fontWeight: '600' }}>
            ● RAG Index Loaded
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Mistral Model</span>
        </div>
        <button 
          onClick={handleClearChat}
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-glass)',
            padding: '0.4rem 0.85rem',
            borderRadius: '16px',
            color: 'var(--text-muted)',
            fontSize: '0.78rem',
            cursor: 'pointer',
            transition: 'var(--transition-fast)'
          }}
          className="new-tutorial-btn"
        >
          Clear Conversation
        </button>
      </div>

      {/* Suggestions List */}
      {messages.length === 1 && (
        <div style={{ marginBottom: '1.2rem', textAlign: 'center' }}>
          <h3 style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: '500' }}>Suggested Questions:</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            {suggestions.map((s, idx) => (
              <button 
                key={idx}
                onClick={() => handleSend(s)}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '20px',
                  border: '1px solid var(--border-glass)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  color: 'var(--text-muted)',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'var(--transition-fast)',
                  maxWidth: '100%',
                  wordBreak: 'break-word'
                }}
                className="suggestion-chip"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages Scroll Panel */}
      <div 
        className="glass-panel"
        style={{
          flexGrow: 1,
          overflowY: 'auto',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.2rem',
          marginBottom: '1rem',
          borderRadius: 'var(--border-radius-panel)',
          scrollbarWidth: 'none'
        }}
      >
        <AnimatePresence>
          {messages.map(m => (
            <motion.div 
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
              style={{
                display: 'flex',
                justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start',
                width: '100%'
              }}
            >
              <div 
                className="markdown-body"
                dangerouslySetInnerHTML={renderMarkdown(m.text)}
                style={{
                  maxWidth: '85%',
                  padding: '0.85rem 1.35rem',
                  borderRadius: '16px',
                  border: m.sender === 'user' ? '1px solid rgba(139, 92, 246, 0.22)' : '1px solid var(--border-glass)',
                  background: m.sender === 'user' ? 'rgba(139, 92, 246, 0.06)' : 'rgba(255, 255, 255, 0.01)',
                  color: '#CBD5E1',
                  fontSize: '0.92rem',
                  lineHeight: '1.6',
                  textAlign: 'left',
                  boxShadow: m.sender === 'user' ? '0 4px 15px rgba(139, 92, 246, 0.05)' : 'none'
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.01)',
              border: '1px solid var(--border-glass)',
              borderRadius: '16px',
              padding: '0.85rem 1.25rem',
              display: 'flex',
              gap: '4px',
              alignItems: 'center'
            }}>
              <span className="dot" style={{ width: '6px', height: '6px', background: 'var(--accent-purple)', borderRadius: '50%', display: 'inline-block', animation: 'typing-dot 1.2s infinite' }}></span>
              <span className="dot" style={{ width: '6px', height: '6px', background: 'var(--accent-purple)', borderRadius: '50%', display: 'inline-block', animation: 'typing-dot 1.2s infinite 0.2s' }}></span>
              <span className="dot" style={{ width: '6px', height: '6px', background: 'var(--accent-purple)', borderRadius: '50%', display: 'inline-block', animation: 'typing-dot 1.2s infinite 0.4s' }}></span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <div className="input-wrapper" style={{ height: '54px', padding: '0.4rem 0.4rem 0.4rem 1.2rem', borderRadius: '30px' }}>
          <input 
            type="text"
            className="repo-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask a question about the repository classes/methods..."
            style={{ fontSize: '0.95rem' }}
          />
          <button 
            type="submit" 
            className="arrow-btn" 
            style={{ width: '38px', height: '38px' }}
            aria-label="Send Message"
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </form>

      {/* Styles for typing indicator dots */}
      <style>{`
        @keyframes typing-dot {
          0%, 100% { transform: translateY(0); opacity: 0.3; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
