import React, { useState, useEffect, useMemo, useCallback } from 'react'
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  useReactFlow,
  ReactFlowProvider
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'
import { motion, AnimatePresence } from 'framer-motion'
import CustomNode from './CustomNode'

const nodeTypes = {
  folder: CustomNode,
  file: CustomNode,
  class: CustomNode,
  function: CustomNode,
  agent: CustomNode,
  database: CustomNode,
  api: CustomNode,
  embedding: CustomNode
}

// Edge colors based on type
const edgeColors = {
  imports: '#3B82F6',       // Blue
  calls: '#10B981',         // Green
  inheritance: '#8B5CF6',   // Purple
  composition: '#EAB308',   // Yellow
  semantic: '#EC4899',      // Pink
  runtime: '#F97316'        // Orange
}

function GraphExplorer({ graphData, onOpenChapter }) {
  const { setCenter, fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [layoutMode, setLayoutMode] = useState('hierarchical') // 'hierarchical' | 'radial' | 'grid' | 'force'
  
  // Interaction states
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [isolatedNodeId, setIsolatedNodeId] = useState(null)
  const [pulseNodeId, setPulseNodeId] = useState(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all' | 'file' | 'class' | 'function' | 'api' | 'database'

  // Computed layout helpers
  const applyLayout = useCallback((rawNodes, rawEdges, mode) => {
    if (!rawNodes || rawNodes.length === 0) return { nodes: [], edges: [] }

    // Map graphData format to React Flow Node/Edge schemas
    const initialNodes = rawNodes.map(n => ({
      id: n.id,
      type: n.type,
      data: { 
        label: n.label, 
        path: n.path, 
        type: n.type, 
        summary: n.summary,
        language: n.language,
        classes: n.classes,
        functions: n.functions,
        imports: n.imports,
        imported_by: n.imported_by,
        chapter_idx: n.chapter_idx
      },
      position: { x: 0, y: 0 }
    }))

    const initialEdges = rawEdges.map((e, index) => ({
      id: `e-${index}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: hoveredNodeId ? false : true,
      label: e.label || '',
      data: { type: e.type },
      style: { stroke: edgeColors[e.type] || 'rgba(99, 102, 241, 0.4)', strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColors[e.type] || '#6366F1'
      }
    }))

    if (mode === 'hierarchical') {
      const g = new dagre.graphlib.Graph()
      g.setDefaultEdgeLabel(() => ({}))
      g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 120 })

      initialNodes.forEach(n => {
        g.setNode(n.id, { width: 220, height: 70 })
      })
      initialEdges.forEach(e => {
        g.setEdge(e.source, e.target)
      })

      dagre.layout(g)

      return {
        nodes: initialNodes.map(n => {
          const layoutNode = g.node(n.id)
          return {
            ...n,
            position: {
              x: layoutNode.x - 110,
              y: layoutNode.y - 35
            }
          }
        }),
        edges: initialEdges
      }
    } else if (mode === 'radial') {
      const radiusStep = 220
      const ringCapacity = 8
      return {
        nodes: initialNodes.map((n, i) => {
          if (i === 0) return { ...n, position: { x: 0, y: 0 } }
          const ring = Math.floor((i - 1) / ringCapacity) + 1
          const angle = ((i - 1) % ringCapacity) * (2 * Math.PI / ringCapacity)
          return {
            ...n,
            position: {
              x: Math.cos(angle) * (ring * radiusStep),
              y: Math.sin(angle) * (ring * radiusStep)
            }
          }
        }),
        edges: initialEdges
      }
    } else if (mode === 'grid') {
      const spacing = 220
      const columns = Math.ceil(Math.sqrt(initialNodes.length))
      return {
        nodes: initialNodes.map((n, i) => {
          const row = Math.floor(i / columns)
          const col = i % columns
          return {
            ...n,
            position: {
              x: (col - columns / 2) * spacing,
              y: (row - columns / 2) * spacing
            }
          }
        }),
        edges: initialEdges
      }
    } else {
      // Force / Random layout
      const spacing = 200
      return {
        nodes: initialNodes.map((n, i) => {
          const angle = (i / initialNodes.length) * 2 * Math.PI
          const radius = (i % 3 + 1) * spacing
          return {
            ...n,
            position: {
              x: Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
              y: Math.sin(angle) * radius + (Math.random() - 0.5) * 50
            }
          }
        }),
        edges: initialEdges
      }
    }
  }, [hoveredNodeId])

  // Load and layout graph elements
  useEffect(() => {
    if (graphData) {
      const { nodes: lNodes, edges: lEdges } = applyLayout(graphData.nodes, graphData.edges, layoutMode)
      setNodes(lNodes)
      setEdges(lEdges)
      setTimeout(() => {
        fitView({ padding: 0.15, duration: 800 })
      }, 100)
    }
  }, [graphData, layoutMode, setNodes, setEdges])

  // Subgraph isolation logic
  const getSubGraphElements = useCallback((targetId, rawNodes, rawEdges) => {
    const connectedNodeIds = new Set([targetId])
    
    // Simple 1-step dependencies (inbound + outbound)
    rawEdges.forEach(e => {
      if (e.source === targetId) connectedNodeIds.add(e.target)
      if (e.target === targetId) connectedNodeIds.add(e.source)
    })

    return {
      nodes: rawNodes.filter(n => connectedNodeIds.has(n.id)),
      edges: rawEdges.filter(e => connectedNodeIds.has(e.source) && connectedNodeIds.has(e.target))
    }
  }, [])

  // Double click to isolate dependencies
  const onNodeDoubleClick = useCallback((event, node) => {
    if (isolatedNodeId === node.id) {
      // Reset isolation
      setIsolatedNodeId(null)
      const { nodes: lNodes, edges: lEdges } = applyLayout(graphData.nodes, graphData.edges, layoutMode)
      setNodes(lNodes)
      setEdges(lEdges)
    } else {
      // Apply isolation
      setIsolatedNodeId(node.id)
      const { nodes: subNodes, edges: subEdges } = getSubGraphElements(node.id, graphData.nodes, graphData.edges)
      const { nodes: lNodes, edges: lEdges } = applyLayout(subNodes, subEdges, layoutMode)
      setNodes(lNodes)
      setEdges(lEdges)
    }
  }, [isolatedNodeId, graphData, layoutMode, getSubGraphElements, applyLayout, setNodes, setEdges])

  // Hover animations logic
  const handleNodeMouseEnter = useCallback((event, node) => {
    setHoveredNodeId(node.id)
  }, [])

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null)
  }, [])

  // Node highlight values computation
  const finalNodes = useMemo(() => {
    if (!hoveredNodeId) return nodes

    // Find direct neighbors
    const neighbors = new Set([hoveredNodeId])
    edges.forEach(e => {
      if (e.source === hoveredNodeId) neighbors.add(e.target)
      if (e.target === hoveredNodeId) neighbors.add(e.source)
    })

    return nodes.map(n => {
      const isLinked = neighbors.has(n.id)
      return {
        ...n,
        style: {
          ...n.style,
          opacity: isLinked ? 1.0 : 0.18,
          scale: n.id === hoveredNodeId ? 1.05 : 1.0
        }
      }
    })
  }, [nodes, edges, hoveredNodeId])

  const finalEdges = useMemo(() => {
    if (!hoveredNodeId) return edges

    return edges.map(e => {
      const isRelated = e.source === hoveredNodeId || e.target === hoveredNodeId
      return {
        ...e,
        animated: isRelated,
        style: {
          ...e.style,
          opacity: isRelated ? 1.0 : 0.08,
          strokeWidth: isRelated ? 2.5 : 1.0
        }
      }
    })
  }, [edges, hoveredNodeId])

  // Click handler
  const onNodeClick = useCallback((event, node) => {
    setSelectedNodeId(node.id)
  }, [])

  // Statistics calculation
  const stats = useMemo(() => {
    if (!graphData) return { files: 0, folders: 0, classes: 0, functions: 0, dependencies: 0 }
    return {
      files: graphData.nodes.filter(n => n.type === 'file').length,
      folders: graphData.nodes.filter(n => n.type === 'folder').length,
      classes: graphData.nodes.filter(n => n.type === 'class').length,
      functions: graphData.nodes.filter(n => n.type === 'function').length,
      dependencies: graphData.edges.length
    }
  }, [graphData])

  // Node filter and search listing
  const searchedItems = useMemo(() => {
    if (!graphData) return []
    return graphData.nodes.filter(n => {
      const matchSearch = n.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          n.path.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchType = filterType === 'all' || n.type === filterType
      return matchSearch && matchType
    })
  }, [graphData, searchQuery, filterType])

  // Center view on search result
  const handleSearchSelect = (item) => {
    const rfNode = nodes.find(n => n.id === item.id)
    if (rfNode) {
      setSelectedNodeId(item.id)
      setPulseNodeId(item.id)
      setCenter(rfNode.position.x + 80, rfNode.position.y + 35, { zoom: 1.25, duration: 1000 })
      
      // Clear pulse after animation
      setTimeout(() => {
        setPulseNodeId(null)
      }, 2500)
    }
  }

  // Selected Node Metadata Info
  const selectedNodeDetails = useMemo(() => {
    if (!selectedNodeId || !graphData) return null
    return graphData.nodes.find(n => n.id === selectedNodeId)
  }, [selectedNodeId, graphData])

  return (
    <div style={{ display: 'flex', width: '100%', height: 'calc(100vh - 6.5rem)', gap: '1.5rem', position: 'relative' }}>
      
      {/* Left Sidebar */}
      <aside className="sidebar glass-panel" style={{ width: '310px', height: '100%', position: 'relative', top: '0', display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem' }}>
        
        {/* Search */}
        <div>
          <h3 style={{ fontSize: '0.9rem', color: '#FFFFFF', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Search</h3>
          <input 
            type="text" 
            placeholder="Search classes/files..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: '38px',
              padding: '0 0.85rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-glass)',
              color: '#FFFFFF',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          />
          {searchQuery && searchedItems.length > 0 && (
            <ul style={{
              background: 'rgba(10, 10, 12, 0.95)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              marginTop: '5px',
              maxHeight: '140px',
              overflowY: 'auto',
              listStyle: 'none',
              padding: '5px',
              textAlign: 'left'
            }}>
              {searchedItems.slice(0, 5).map(item => (
                <li 
                  key={item.id}
                  onClick={() => handleSearchSelect(item)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: 'var(--text-muted)'
                  }}
                  className="search-item-li"
                >
                  {item.label} <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>({item.type})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stats */}
        <div>
          <h3 style={{ fontSize: '0.9rem', color: '#FFFFFF', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Statistics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Files</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{stats.files}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Classes</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{stats.classes}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Functions</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{stats.functions}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Edges</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{stats.dependencies}</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div>
          <h3 style={{ fontSize: '0.9rem', color: '#FFFFFF', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Filters</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {['all', 'file', 'class', 'function', 'api', 'database'].map(t => (
              <button 
                key={t}
                onClick={() => setFilterType(t)}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: filterType === t ? 'var(--accent-purple)' : 'rgba(255,255,255,0.02)',
                  color: '#FFFFFF',
                  cursor: 'pointer'
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Layout Modes */}
        <div>
          <h3 style={{ fontSize: '0.9rem', color: '#FFFFFF', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Layout Selector</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {[
              { id: 'hierarchical', name: 'Hierarchical' },
              { id: 'radial', name: 'Radial' },
              { id: 'grid', name: 'Grid' },
              { id: 'force', name: 'Force' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setLayoutMode(m.id)}
                style={{
                  fontSize: '0.75rem',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: layoutMode === m.id ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                  borderColor: layoutMode === m.id ? 'var(--accent-purple)' : 'rgba(255,255,255,0.08)',
                  color: '#FFFFFF',
                  cursor: 'pointer'
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* React Flow Stage */}
      <main className="glass-panel" style={{ flexGrow: 1, height: '100%', overflow: 'hidden', position: 'relative' }}>
        <ReactFlow
          nodes={finalNodes}
          edges={finalEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          fitView
          minZoom={0.1}
          maxZoom={2.0}
        >
          <Background color="#555" gap={24} size={1} />
          <Controls style={{ background: 'rgba(18, 22, 32, 0.85)', border: '1px solid var(--border-glass)' }} />
          <MiniMap 
            nodeColor={() => 'rgba(139, 92, 246, 0.4)'} 
            maskColor="rgba(0, 0, 0, 0.7)"
            style={{ background: 'rgba(18, 22, 32, 0.85)', border: '1px solid var(--border-glass)', borderRadius: '8px' }} 
          />
        </ReactFlow>

        {isolatedNodeId && (
          <button 
            onClick={() => {
              setIsolatedNodeId(null)
              const { nodes: lNodes, edges: lEdges } = applyLayout(graphData.nodes, graphData.edges, layoutMode)
              setNodes(lNodes)
              setEdges(lEdges)
            }}
            style={{
              position: 'absolute',
              top: '1rem',
              left: '1rem',
              zIndex: 10,
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #EF4444',
              color: '#FFFFFF',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Reset Isolate Subgraph
          </button>
        )}
      </main>

      {/* Right Sidebar Metadata Panel */}
      <AnimatePresence>
        {selectedNodeDetails && (
          <motion.aside 
            key="right-panel"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ type: 'spring', stiffness: 260, damping: 25 }}
            className="sidebar glass-panel" 
            style={{ 
              width: '320px', 
              height: '100%', 
              position: 'relative', 
              top: '0', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1.25rem', 
              padding: '1.5rem',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.1rem', color: '#FFFFFF', fontWeight: 'bold' }}>Node Details</h2>
              <button 
                onClick={() => setSelectedNodeId(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* General Info */}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Name</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#FFFFFF', marginBottom: '0.5rem' }}>{selectedNodeDetails.label}</div>

              {selectedNodeDetails.path && (
                <>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Path</div>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--accent-indigo)', wordBreak: 'break-all', marginBottom: '0.5rem' }}>
                    {selectedNodeDetails.path}
                  </div>
                </>
              )}

              {selectedNodeDetails.language && (
                <>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Language</div>
                  <div style={{ fontSize: '0.85rem', color: '#FFFFFF', marginBottom: '0.5rem' }}>{selectedNodeDetails.language}</div>
                </>
              )}
            </div>

            {/* Summary */}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Summary</div>
              <p style={{ fontSize: '0.85rem', color: '#CBD5E1', lineHeight: '1.4', marginTop: '3px' }}>
                {selectedNodeDetails.summary || 'No documentation summary available.'}
              </p>
            </div>

            {/* Classes & Functions */}
            {selectedNodeDetails.classes && selectedNodeDetails.classes.length > 0 && (
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Classes ({selectedNodeDetails.classes.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                  {selectedNodeDetails.classes.map(c => (
                    <span key={c} style={{ fontSize: '0.72rem', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '2px 6px', borderRadius: '4px', color: '#D8B4FE' }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedNodeDetails.functions && selectedNodeDetails.functions.length > 0 && (
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Functions ({selectedNodeDetails.functions.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                  {selectedNodeDetails.functions.map(f => (
                    <span key={f} style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '2px 6px', borderRadius: '4px', color: '#A7F3D0' }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Open Tutorial link button */}
            {selectedNodeDetails.chapter_idx !== undefined && (
              <button 
                onClick={() => onOpenChapter(selectedNodeDetails.chapter_idx)}
                style={{
                  width: '100%',
                  height: '42px',
                  background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-indigo))',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  marginTop: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)'
                }}
              >
                <span>Open Tutorial</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function RepositoryGraph(props) {
  return (
    <ReactFlowProvider>
      <GraphExplorer {...props} />
    </ReactFlowProvider>
  )
}
