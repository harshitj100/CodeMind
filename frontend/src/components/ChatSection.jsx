import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ChatSection({ tutorial }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: `Hello! I'm your Codebase Assistant. I have analyzed the architecture of **${tutorial.project_name || 'this project'}**. Ask me anything about its design, file structures, dependencies, or class structures!`
    }
  ])
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef(null)

  const suggestions = [
    "Explain the codebase application flow",
    "How does User Authentication work?",
    "Where is the database session connection established?",
    "Summarize the relationship between Catalog and Cart"
  ]

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
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

    // Simulate AI response based on questions
    setTimeout(() => {
      let reply = ""
      const q = text.toLowerCase()

      if (q.includes("flow") || q.includes("architecture") || q.includes("structure")) {
        reply = `The architecture of **${tutorial.project_name}** splits operations into distinct modules under \`src/\`. The main entry points coordinate authentication (\`auth.py\`), catalog management (\`catalog.py\`), cart state (\`cart.py\`), and final checkouts (\`orders.py\`). All configuration client setups interface with \`db/connection.py\` which instantiates a MongoDB client session.`
      } else if (q.includes("auth") || q.includes("user") || q.includes("login")) {
        reply = `**User Authentication** is handled inside \`src/auth/auth.py\`. It contains:
*   \`User\`: Model managing credential layouts and profile keys.
*   \`SessionManager\`: Handles token generation and expiration.
*   \`hash_password\`: Encrypts raw passwords using \`bcrypt\`.
Chapter 2 of the tutorial covers this implementation in detail!`
      } else if (q.includes("db") || q.includes("database") || q.includes("connection") || q.includes("mongo")) {
        reply = `Database connections are established inside \`src/db/connection.py\`. It defines the \`DatabaseConnection\` class and exposes a \`get_db_session\` utility. It instantiates a \`MongoDB\` database object which stores the cart schemas and transaction order logs.`
      } else if (q.includes("catalog") || q.includes("product") || q.includes("embed")) {
        reply = `The **Product Catalog** is managed by \`src/catalog/catalog.py\`. It handles listing, searching, and vector index generation:
*   \`Product\`: Class defining catalog entries.
*   \`ProductEmbedder\`: Embedding module generating high-dimensional vectors of products for semantic recommendations.
Chapter 3 details the search structure.`
      } else if (q.includes("cart") || q.includes("checkout") || q.includes("order")) {
        reply = `Shopping operations are divided between \`cart.py\` and \`orders.py\`:
*   \`ShoppingCart\` (inside \`cart.py\`): Models user items list and computes sub-totals.
*   \`Order\` & \`POST /api/checkout\` (inside \`orders.py\`): Processes payments and inserts records to MongoDB.
Refer to Chapters 4 and 5 for complete details.`
      } else {
        reply = `Based on the codebase analysis for **${tutorial.project_name}**, the core modules coordinate actions under \`src/\`. The catalog embedders feed semantic vectors to recommendation agents, while checkout routes call authentication checkers. Let me know if you would like me to explain any specific class or functions in detail!`
      }

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'assistant',
        text: reply
      }])
      setIsTyping(false)
    }, 1200 + Math.random() * 800)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    handleSend(inputText)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 6.5rem)', maxWidth: '850px', margin: '0 auto', width: '100%', position: 'relative' }}>
      
      {/* Suggestions Header */}
      {messages.length === 1 && (
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <h3 style={{ fontSize: '0.95rem', color: '#FFFFFF', marginBottom: '0.85rem', fontWeight: '500' }}>Suggested Questions:</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            {suggestions.map((s, idx) => (
              <button 
                key={idx}
                onClick={() => handleSend(s)}
                style={{
                  padding: '0.65rem 1.2rem',
                  borderRadius: '20px',
                  border: '1px solid var(--border-glass)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
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

      {/* Messages Window */}
      <div 
        className="glass-panel"
        style={{
          flexGrow: 1,
          overflowY: 'auto',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          marginBottom: '1rem',
          borderRadius: 'var(--border-radius-panel)',
          scrollbarWidth: 'none'
        }}
      >
        <AnimatePresence>
          {messages.map(m => (
            <motion.div 
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                display: 'flex',
                justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start',
                width: '100%'
              }}
            >
              <div 
                style={{
                  maxWidth: '75%',
                  padding: '0.85rem 1.25rem',
                  borderRadius: '16px',
                  border: m.sender === 'user' ? '1px solid rgba(139, 92, 246, 0.25)' : '1px solid var(--border-glass)',
                  background: m.sender === 'user' ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                  color: '#CBD5E1',
                  fontSize: '0.92rem',
                  lineHeight: '1.5',
                  textAlign: 'left',
                  whiteSpace: 'pre-wrap',
                  boxShadow: m.sender === 'user' ? '0 4px 15px rgba(139, 92, 246, 0.1)' : 'none'
                }}
              >
                {m.text}
              </div>
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

      {/* Input Field */}
      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <div className="input-wrapper" style={{ height: '54px', padding: '0.4rem 0.4rem 0.4rem 1.2rem', borderRadius: '30px' }}>
          <input 
            type="text"
            className="repo-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask a question about the repository..."
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

      {/* Typing animations styles */}
      <style>{`
        @keyframes typing-dot {
          0%, 100% { transform: translateY(0); opacity: 0.3; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
