import React, { useRef, useEffect } from 'react'

export default function BackgroundCanvas({ viewMode }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animationFrameId
    
    let particles = []
    let trailParticles = []
    let auroras = []
    let mouse = { x: null, y: null, targetX: 0, targetY: 0, rx: 0, ry: 0 }

    const themeColors = ['#8B5CF6', '#6366F1', '#A855F7', '#FFFFFF', '#06B6D4']

    // Particle class definition
    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width
        this.y = Math.random() * canvas.height
        this.size = Math.random() * 1.6 + 0.6
        this.vx = (Math.random() - 0.5) * 0.1
        this.vy = (Math.random() - 0.5) * 0.1
        // Brighter base opacity (15% to 50% opacity)
        this.baseAlpha = Math.random() * 0.35 + 0.15
        this.alpha = this.baseAlpha
      }
      update() {
        this.x += this.vx
        this.y += this.vy

        if (this.x < 0) this.x = canvas.width
        if (this.x > canvas.width) this.x = 0
        if (this.y < 0) this.y = canvas.height
        if (this.y > canvas.height) this.y = 0

        // Repulsion only on landing / auth / loading page modes
        const isInteractive = viewMode === 'landing' || viewMode === 'auth' || viewMode === 'loading'
        if (mouse.x !== null && isInteractive) {
          const dx = this.x - mouse.x
          const dy = this.y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 140) {
            const force = (140 - dist) / 140
            this.x += (dx / dist) * force * 1.4
            this.y += (dy / dist) * force * 1.4
          }
        }
      }
      draw() {
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`
        ctx.fill()
      }
    }

    // Sparkle trail particles
    class TrailParticle {
      constructor(x, y) {
        this.x = x
        this.y = y
        this.size = Math.random() * 2.8 + 0.8
        this.vx = (Math.random() - 0.5) * 1.6
        this.vy = (Math.random() - 0.5) * 1.6
        this.alpha = 0.95
        this.decay = Math.random() * 0.018 + 0.012
        this.color = themeColors[Math.floor(Math.random() * themeColors.length)]
      }
      update() {
        this.x += this.vx
        this.y += this.vy
        this.alpha -= this.decay
        if (this.size > 0.1) this.size -= 0.02
      }
      draw() {
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fillStyle = this.color
        ctx.globalAlpha = this.alpha
        ctx.fill()
        ctx.globalAlpha = 1.0
      }
    }

    // Slow moving background gradient blobs
    class AuroraBlob {
      constructor(color, xRatio, yRatio, baseRadius) {
        this.color = color
        this.xRatio = xRatio
        this.yRatio = yRatio
        this.baseRadius = baseRadius
        this.angle = Math.random() * Math.PI * 2
        this.speed = Math.random() * 0.001 + 0.0005
        this.radiusVar = Math.random() * 0.1
      }
      update() {
        this.angle += this.speed
      }
      draw() {
        const x = (this.xRatio * canvas.width) + Math.cos(this.angle) * 30
        const y = (this.yRatio * canvas.height) + Math.sin(this.angle) * 30
        const radius = this.baseRadius + Math.sin(this.angle * 1.5) * (this.baseRadius * this.radiusVar)
        
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
        grad.addColorStop(0, this.color)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    }

    const initAuroras = () => {
      auroras = [
        new AuroraBlob('rgba(139, 92, 246, 0.08)', 0.15, 0.15, Math.min(canvas.width, canvas.height) * 0.4),
        new AuroraBlob('rgba(99, 102, 241, 0.07)', 0.85, 0.85, Math.min(canvas.width, canvas.height) * 0.45),
        new AuroraBlob('rgba(168, 85, 247, 0.06)', 0.8, 0.2, Math.min(canvas.width, canvas.height) * 0.35)
      ]
    }

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initAuroras()
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    // Populate particles
    const particleCount = Math.min(100, Math.floor((canvas.width * canvas.height) / 18000))
    particles = []
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle())
    }

    // Mouse & Click Listeners
    const handleMouseMove = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      
      const isLandingOrAuth = viewMode === 'landing' || viewMode === 'auth'
      if (isLandingOrAuth) {
        mouse.targetX = (e.clientX - window.innerWidth / 2) * -0.015
        mouse.targetY = (e.clientY - window.innerHeight / 2) * -0.015

        // Spawn sparkles
        for (let i = 0; i < 2; i++) {
          trailParticles.push(new TrailParticle(e.clientX, e.clientY))
        }
      } else {
        mouse.targetX = 0
        mouse.targetY = 0
      }
    }

    const handleMouseLeave = () => {
      mouse.x = null
      mouse.y = null
    }

    const handleWindowClick = (e) => {
      // Spawn a burst of space sparkles on any click
      for (let i = 0; i < 15; i++) {
        trailParticles.push(new TrailParticle(e.clientX, e.clientY))
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseleave', handleMouseLeave)
    window.addEventListener('click', handleWindowClick)

    // Animation Loop
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 1. Draw auroras
      auroras.forEach(blob => {
        blob.update()
        blob.draw()
      })

      // 3. Parallax Lerp
      mouse.rx += (mouse.targetX - mouse.rx) * 0.08
      mouse.ry += (mouse.targetY - mouse.ry) * 0.08

      ctx.save()
      ctx.translate(mouse.rx, mouse.ry)

      // 4. Connect lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 110) {
            const alpha = ((110 - dist) / 110) * 0.085 // brighter connectors
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(139, 92, 246, ${alpha})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      // 5. Draw/Update particles
      particles.forEach(p => {
        p.update()
        p.draw()
      })

      ctx.restore()

      // 6. Draw mouse sparkles
      for (let i = trailParticles.length - 1; i >= 0; i--) {
        const tp = trailParticles[i]
        tp.update()
        if (tp.alpha <= 0) {
          trailParticles.splice(i, 1)
        } else {
          tp.draw()
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    // Cleanup listeners and loops on unmount
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('click', handleWindowClick)
      cancelAnimationFrame(animationFrameId)
    }
  }, [viewMode])

  return <canvas ref={canvasRef} id="bg-canvas" />
}
