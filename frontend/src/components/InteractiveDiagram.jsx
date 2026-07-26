import React, { useRef, useEffect } from 'react'

export default function InteractiveDiagram({ mermaidSrc }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !window.vis) return

    const parsed = parseMermaidToVis(mermaidSrc)
    if (parsed.nodes.length === 0) return

    // Glassmorphic node styling with purple borders and shadows
    const styledNodes = parsed.nodes.map(n => ({
      id: n.id,
      label: n.label,
      shape: 'box',
      margin: { top: 12, bottom: 12, left: 20, right: 20 },
      font: {
        color: '#FFFFFF',
        face: 'Inter',
        size: 13,
        bold: { color: '#FFFFFF', size: 13 }
      },
      color: {
        background: 'rgba(139, 92, 246, 0.1)',
        border: 'rgba(139, 92, 246, 0.35)',
        highlight: {
          background: 'rgba(139, 92, 246, 0.25)',
          border: '#8B5CF6'
        },
        hover: {
          background: 'rgba(139, 92, 246, 0.18)',
          border: '#8B5CF6'
        }
      },
      borderWidth: 1.5,
      shapeProperties: { borderRadius: 8 },
      shadow: {
        enabled: true,
        color: 'rgba(139, 92, 246, 0.12)',
        size: 10,
        x: 0,
        y: 4
      }
    }))

    // Indigo edge connectors
    const styledEdges = parsed.edges.map(e => ({
      from: e.from,
      to: e.to,
      label: e.label || '',
      font: {
        color: '#8E919F',
        face: 'Inter',
        size: 11,
        strokeWidth: 0,
        align: 'horizontal',
        vadjust: -12
      },
      color: {
        color: 'rgba(99, 102, 241, 0.35)',
        highlight: '#6366F1',
        hover: 'rgba(99, 102, 241, 0.6)'
      },
      arrows: {
        to: { enabled: true, scaleFactor: 0.8 }
      },
      width: 1.5,
      smooth: {
        type: 'cubicBezier',
        forceDirection: 'none',
        roundness: 0.5
      }
    }))

    const data = {
      nodes: new window.vis.DataSet(styledNodes),
      edges: new window.vis.DataSet(styledEdges)
    }

    const options = {
      physics: {
        enabled: true,
        solver: 'repulsion',
        repulsion: {
          nodeDistance: 160,
          centralGravity: 0.08,
          springLength: 120,
          springConstant: 0.05,
          damping: 0.09
        },
        stabilization: {
          enabled: true,
          iterations: 120,
          updateInterval: 25
        }
      },
      interaction: {
        hover: true,
        zoomView: true,
        dragView: true,
        dragNodes: true
      }
    }

    const network = new window.vis.Network(container, data, options)

    // Cleanup network instance on unmount
    return () => {
      network.destroy()
    }
  }, [mermaidSrc])

  // Helper to parse flowchart/graph nodes and edges from raw mermaid code
  const parseMermaidToVis = (mermaidText) => {
    const nodes = []
    const edges = []
    
    // Match nodes: ID["Label"] or ID["Label\n"]
    const nodeRegex = /(\w+)\s*\["([\s\S]+?)"\]/g
    let match
    while ((match = nodeRegex.exec(mermaidText)) !== null) {
      const id = match[1]
      const label = match[2].trim().replace(/\n/g, ' ')
      nodes.push({ id, label })
    }
    
    // Match labeled edges: ID1 -- "Label" --> ID2
    const edgeRegexLabeled = /(\w+)\s+--\s+"([\s\S]+?)"\s+-->\s*(\w+)/g
    while ((match = edgeRegexLabeled.exec(mermaidText)) !== null) {
      edges.push({
        from: match[1],
        to: match[3],
        label: match[2].trim(),
        arrows: 'to'
      })
    }
    
    // Match simple edges: ID1 --> ID2
    const edgeRegexSimple = /(\w+)\s+-->\s*(\w+)/g
    while ((match = edgeRegexSimple.exec(mermaidText)) !== null) {
      const from = match[1]
      const to = match[2]
      const exists = edges.some(e => e.from === from && e.to === to)
      if (!exists) {
        edges.push({
          from: from,
          to: to,
          arrows: 'to'
        })
      }
    }
    
    return { nodes, edges }
  }

  return (
    <div className="diagram-container">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
