import React, { memo } from 'react'
import { Handle, Position } from 'reactflow'

const nodeTypesConfig = {
  folder: { icon: '📁', color: '#EAB308', name: 'Folder' },
  file: { icon: '📄', color: '#3B82F6', name: 'File' },
  function: { icon: '⚙', color: '#10B981', name: 'Function' },
  class: { icon: '🧩', color: '#8B5CF6', name: 'Class' },
  agent: { icon: '🤖', color: '#EF4444', name: 'AI Agent' },
  database: { icon: '🗄', color: '#F97316', name: 'Database' },
  api: { icon: '🌐', color: '#06B6D4', name: 'API' },
  embedding: { icon: '🧠', color: '#EC4899', name: 'Embedding' }
}

const CustomNode = ({ data, selected }) => {
  const type = data.type || 'file'
  const config = nodeTypesConfig[type] || nodeTypesConfig.file
  
  const borderGlow = selected 
    ? `0 0 18px ${config.color}` 
    : '0 4px 15px rgba(0, 0, 0, 0.5)'
    
  return (
    <div 
      className="custom-flow-node"
      style={{
        background: 'rgba(18, 22, 32, 0.8)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${selected ? config.color : 'rgba(255, 255, 255, 0.08)'}`,
        borderRadius: '10px',
        padding: '0.65rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        color: '#FFFFFF',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.85rem',
        fontWeight: '500',
        boxShadow: borderGlow,
        transition: 'all 0.25s ease-in-out',
        minWidth: '160px',
        maxWidth: '280px',
        position: 'relative'
      }}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        style={{ background: config.color, width: '6px', height: '6px', border: 'none' }} 
      />
      
      <div 
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          background: `rgba(${hexToRgb(config.color)}, 0.12)`,
          border: `1px solid rgba(${hexToRgb(config.color)}, 0.3)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.9rem',
          flexShrink: 0
        }}
      >
        {config.icon}
      </div>

      <div style={{ flexGrow: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.label}
        </div>
        {data.path && data.type !== 'folder' && (
          <div style={{ 
            fontSize: '0.68rem', 
            color: 'var(--text-muted)', 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis' 
          }}>
            {data.path}
          </div>
        )}
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={{ background: config.color, width: '6px', height: '6px', border: 'none' }} 
      />
    </div>
  )
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result 
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '255, 255, 255'
}

export default memo(CustomNode)
