import React, { useState, useEffect } from 'react'

export default function LoadingSection() {
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const stepDurations = [0, 800, 1600, 2400, 3200, 4000]
    const timers = []

    stepDurations.forEach((duration, index) => {
      const t = setTimeout(() => {
        setActiveStep(index)
      }, duration)
      timers.push(t)
    })

    const finalT = setTimeout(() => {
      setActiveStep(6)
    }, 4800)
    timers.push(finalT)

    return () => {
      timers.forEach(t => clearTimeout(t))
    }
  }, [])

  const steps = [
    "Fetching Repository Metadata",
    "Identifying Core Abstractions",
    "Analyzing Dependency Relationships",
    "Structuring Tutorial Chapters",
    "Generating Explanations & Examples",
    "Compiling Flow Visualizations"
  ]

  return (
    <div id="loading-container" className="loading-container glass-panel">
      <div className="loader-visual">
        <div className="glow-bar"></div>
      </div>
      <div className="loading-text">Assembling Codebase Tutorial...</div>
      <div className="pipeline-steps">
        {steps.map((label, index) => {
          let stepClass = "pipeline-step"
          if (activeStep === index) {
            stepClass += " active"
          } else if (activeStep > index) {
            stepClass += " completed"
          }
          return (
            <div key={index} className={stepClass}>
              <span className="step-indicator"></span>
              <span className="step-label">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
