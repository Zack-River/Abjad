import { useEffect, useRef, useState } from 'react'
import { Copy, RotateCcw } from 'lucide-react'

// The Kaf contextual forms reach above -700 font units. Keep every form
// visible in the same responsive editor frame.
const VIEW_BOX = { x: -80, y: -760, width: 1250, height: 1050 }

function parsePath(path) {
  const tokens = [...path.matchAll(/([MLC])|(-?\d+(?:\.\d+)?)/g)].map((match) => match[0])
  const commands = []
  let index = 0
  let command = null

  while (index < tokens.length) {
    if (/^[MLC]$/.test(tokens[index])) {
      command = tokens[index]
      index += 1
    }
    if (!command) break

    const count = command === 'C' ? 6 : 2
    const values = tokens.slice(index, index + count).map(Number)
    if (values.length !== count || values.some((value) => Number.isNaN(value))) break

    if (command === 'M') {
      commands.push({ type: 'M', x: values[0], y: values[1] })
    } else if (command === 'L') {
      commands.push({ type: 'L', x: values[0], y: values[1] })
    } else {
      commands.push({
        type: 'C',
        c1: { x: values[0], y: values[1] },
        c2: { x: values[2], y: values[3] },
        x: values[4],
        y: values[5]
      })
    }
    index += count
  }

  return commands
}

function formatNumber(value) {
  return Number(value.toFixed(1))
}

function formatPath(commands) {
  return commands
    .map((command) => {
      if (command.type === 'C') {
        return `C ${formatNumber(command.c1.x)} ${formatNumber(command.c1.y)}, ${formatNumber(command.c2.x)} ${formatNumber(command.c2.y)}, ${formatNumber(command.x)} ${formatNumber(command.y)}`
      }
      return `${command.type} ${formatNumber(command.x)} ${formatNumber(command.y)}`
    })
    .join(' ')
}

function pointsForCommand(command) {
  if (command.type === 'C') {
    return [
      { key: 'c1', ...command.c1 },
      { key: 'c2', ...command.c2 },
      { key: 'end', x: command.x, y: command.y }
    ]
  }
  return [{ key: 'end', x: command.x, y: command.y }]
}

export default function MedianPathEditor({
  stroke,
  title = 'Interactive Median Path Editor',
  description,
  commandLimit,
  viewBox = VIEW_BOX,
  editorMinHeight = 360
}) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const getEditableCommands = (path) => {
    const parsed = parsePath(path || '')
    return typeof commandLimit === 'number' ? parsed.slice(0, commandLimit) : parsed
  }
  const getEditablePath = (path) => formatPath(getEditableCommands(path))
  const [commands, setCommands] = useState(() => getEditableCommands(stroke?.medianPath))
  const [pathDraft, setPathDraft] = useState(() => getEditablePath(stroke?.medianPath))
  const [pathError, setPathError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCommands(getEditableCommands(stroke?.medianPath))
    setPathDraft(getEditablePath(stroke?.medianPath))
    setPathError('')
    setCopied(false)
  }, [stroke?.medianPath, commandLimit])

  if (!stroke?.medianPath || commands.length === 0) return null

  const path = formatPath(commands)
  const updatePoint = (event) => {
    const drag = dragRef.current
    const svg = svgRef.current
    if (!drag || !svg) return

    const rect = svg.getBoundingClientRect()
    const nextPoint = {
      x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height
    }

    setCommands((previous) => {
      const nextCommands = previous.map((command, commandIndex) => {
        if (commandIndex !== drag.commandIndex) return command
        if (drag.pointKey === 'end') {
          return { ...command, x: nextPoint.x, y: nextPoint.y }
        }
        return { ...command, [drag.pointKey]: nextPoint }
      })
      setPathDraft(formatPath(nextCommands))
      return nextCommands
    })
  }

  const stopDragging = () => {
    dragRef.current = null
  }

  const copyPath = async () => {
    await navigator.clipboard.writeText(pathDraft)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <section className="inspector-metadata-card" aria-labelledby="median-path-editor-title">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}
      >
        <div>
          <h3 id="median-path-editor-title" style={{ marginBottom: '4px' }}>
            {title}
          </h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>
            {description ||
              'Drag the control points or edit the path text against the authentic shadow outline.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="ctrl-btn"
            onClick={() => {
              setCommands(getEditableCommands(stroke.medianPath))
              setPathDraft(getEditablePath(stroke.medianPath))
              setPathError('')
            }}
            title="Reset the editable path"
          >
            <RotateCcw size={15} aria-hidden="true" /> Reset Path
          </button>
          <button
            type="button"
            className="ctrl-btn primary"
            onClick={copyPath}
            title="Copy the path data"
          >
            <Copy size={15} aria-hidden="true" /> {copied ? 'Copied' : 'Copy Path'}
          </button>
        </div>
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
          style={{
            display: 'block',
            minHeight: `${editorMinHeight}px`,
            touchAction: 'none',
            cursor: 'crosshair'
          }}
          role="img"
          aria-label="Editable median path over the shadow outline"
          onPointerMove={updatePoint}
          onPointerUp={stopDragging}
          onPointerLeave={stopDragging}
        >
          <line
            x1={viewBox.x}
            x2={viewBox.x + viewBox.width}
            y1="-36"
            y2="-36"
            stroke="#94a3b8"
            strokeDasharray="8 8"
          />
          <path
            d={stroke.outlinePath || ''}
            fill="#0f766e"
            fillOpacity="0.14"
            stroke="#0f766e"
            strokeWidth="5"
          />
          <path d={path} fill="none" stroke="#0284c7" strokeWidth="10" strokeLinecap="round" />

          {commands.map((command, commandIndex) => {
            const points = pointsForCommand(command)
            return (
              <g key={`command-${commandIndex}`}>
                {command.type === 'C' && (
                  <>
                    <line
                      x1={command.x}
                      y1={command.y}
                      x2={command.c1.x}
                      y2={command.c1.y}
                      stroke="#38bdf8"
                      strokeDasharray="5 5"
                    />
                    <line
                      x1={command.c1.x}
                      y1={command.c1.y}
                      x2={command.c2.x}
                      y2={command.c2.y}
                      stroke="#38bdf8"
                      strokeDasharray="5 5"
                    />
                    <line
                      x1={command.c2.x}
                      y1={command.c2.y}
                      x2={command.x}
                      y2={command.y}
                      stroke="#38bdf8"
                      strokeDasharray="5 5"
                    />
                  </>
                )}
                {points.map((point) => (
                  <circle
                    key={`${commandIndex}-${point.key}`}
                    cx={point.x}
                    cy={point.y}
                    r={point.key === 'end' ? 11 : 8}
                    fill={point.key === 'end' ? '#0369a1' : '#f97316'}
                    stroke="#ffffff"
                    strokeWidth="3"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      dragRef.current = { commandIndex, pointKey: point.key }
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                  />
                ))}
              </g>
            )
          })}
        </svg>
      </div>

      <textarea
        value={pathDraft}
        aria-label="Extracted median path"
        onChange={(event) => {
          const nextDraft = event.target.value
          const nextCommands = parsePath(nextDraft)
          setPathDraft(nextDraft)
          if (nextCommands.length > 0) {
            setCommands(nextCommands)
            setPathError('')
          } else {
            setPathError('Enter a valid path beginning with M, followed by L or C commands.')
          }
        }}
        style={{
          width: '100%',
          minHeight: '96px',
          marginTop: '12px',
          padding: '10px',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          fontFamily: 'monospace',
          fontSize: '0.76rem',
          lineHeight: 1.45,
          resize: 'vertical',
          color: '#0f172a',
          background: '#ffffff'
        }}
      />
      {pathError && (
        <div style={{ marginTop: '6px', color: '#b91c1c', fontSize: '0.78rem' }}>{pathError}</div>
      )}
    </section>
  )
}
