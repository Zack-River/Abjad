import { useRef, useState } from 'react'
import { Copy, RotateCcw } from 'lucide-react'

function number(value) {
  return Number(value.toFixed(1))
}

export default function TransformPathEditor({
  outlinePath,
  medianPath,
  title,
  description,
  initialTransform = { x: 0, y: 0, rotation: 0 },
  viewBox = { x: -220, y: -260, width: 440, height: 300 },
  editorMinHeight = 260
}) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const [transform, setTransform] = useState(initialTransform)
  const [copied, setCopied] = useState(false)

  const updateFromPointer = (event) => {
    const drag = dragRef.current
    const svg = svgRef.current
    if (!drag || !svg) return

    const rect = svg.getBoundingClientRect()
    const x = viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width
    const y = viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height
    setTransform((previous) => ({
      ...previous,
      x: number(x - drag.startX + drag.originX),
      y: number(y - drag.startY + drag.originY)
    }))
  }

  const copyTransform = async () => {
    const value = `translate(${number(transform.x)} ${number(transform.y)}) rotate(${number(transform.rotation)})`
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <section className="inspector-metadata-card" aria-labelledby="transform-path-editor-title">
      <div>
        <h3 id="transform-path-editor-title" style={{ marginBottom: '4px' }}>
          {title}
        </h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>{description}</p>
      </div>

      <div
        style={{
          marginTop: '14px',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#f8fafc'
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          width="100%"
          style={{ display: 'block', minHeight: `${editorMinHeight}px`, touchAction: 'none' }}
          role="img"
          aria-label="Whole-shape superscript alif transform editor"
          onPointerMove={updateFromPointer}
          onPointerUp={() => {
            dragRef.current = null
          }}
          onPointerLeave={() => {
            dragRef.current = null
          }}
        >
          <line
            x1={viewBox.x}
            x2={viewBox.x + viewBox.width}
            y1="-36"
            y2="-36"
            stroke="#94a3b8"
            strokeDasharray="8 8"
          />
          <g
            transform={`translate(${transform.x} ${transform.y}) rotate(${transform.rotation})`}
            onPointerDown={(event) => {
              event.preventDefault()
              dragRef.current = {
                startX:
                  viewBox.x + ((event.clientX - svgRef.current.getBoundingClientRect().left) /
                    svgRef.current.getBoundingClientRect().width) * viewBox.width,
                startY:
                  viewBox.y + ((event.clientY - svgRef.current.getBoundingClientRect().top) /
                    svgRef.current.getBoundingClientRect().height) * viewBox.height,
                originX: transform.x,
                originY: transform.y
              }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            style={{ cursor: 'move' }}
          >
            <path d={outlinePath} fill="#0f766e" fillOpacity="0.22" stroke="#0f766e" strokeWidth="5" />
            <path d={medianPath} fill="none" stroke="#0284c7" strokeWidth="10" strokeLinecap="round" />
          </g>
        </svg>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '10px',
          marginTop: '12px'
        }}
      >
        {[
          ['X', 'x'],
          ['Y', 'y'],
          ['Rotation', 'rotation']
        ].map(([label, key]) => (
          <label key={key} style={{ display: 'grid', gap: '4px', color: '#475569', fontSize: '0.78rem' }}>
            {label}
            <input
              type="number"
              step="0.1"
              value={transform[key]}
              onChange={(event) =>
                setTransform((previous) => ({ ...previous, [key]: Number(event.target.value) || 0 }))
              }
              style={{ width: '100%', padding: '7px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
        <button type="button" className="ctrl-btn" onClick={() => setTransform(initialTransform)}>
          <RotateCcw size={15} aria-hidden="true" /> Reset Transform
        </button>
        <button type="button" className="ctrl-btn primary" onClick={copyTransform}>
          <Copy size={15} aria-hidden="true" /> {copied ? 'Copied' : 'Copy Transform'}
        </button>
      </div>
      <code style={{ display: 'block', marginTop: '8px', color: '#334155', wordBreak: 'break-word' }}>
        translate({number(transform.x)} {number(transform.y)}) rotate({number(transform.rotation)})
      </code>
    </section>
  )
}
