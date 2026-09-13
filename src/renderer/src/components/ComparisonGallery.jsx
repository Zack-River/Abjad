import { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  BookOpen,
  FastForward,
  Link2,
  Pause,
  PenTool,
  Play,
  RefreshCcw,
  Repeat2,
  Sparkles,
  SkipForward,
  TextCursorInput,
  Zap
} from 'lucide-react'
import candidateData from '../assets/candidates/arabic-strokes.candidates.json'
import conversionReport from '../assets/candidates/conversion-report.json'
import {
  setupEngine,
  renderSvg,
  buildTimeline,
  composeCandidateFixture,
  initHarfBuzz,
  harfbuzzService
} from '../engine'
import MedianPathEditor from './MedianPathEditor'

const DEV_CONTEXTUAL_FIXTURES = [
  {
    id: 'dev_contextual_فففف',
    word: 'فففف',
    devText: 'فففف',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_قققق',
    word: 'قققق',
    devText: 'قققق',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_صصصص',
    word: 'صصصص',
    devText: 'صصصص',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_ضضضض',
    word: 'ضضضض',
    devText: 'ضضضض',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_طططط',
    word: 'طططط',
    devText: 'طططط',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_ظظظظ',
    word: 'ظظظظ',
    devText: 'ظظظظ',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_سسسس',
    word: 'سسسس',
    devText: 'سسسس',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_شششش',
    word: 'شششش',
    devText: 'شششش',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_حححح',
    word: 'حححح',
    devText: 'حححح',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_جججج',
    word: 'جججج',
    devText: 'جججج',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_خخخخ',
    word: 'خخخخ',
    devText: 'خخخخ',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_كككك',
    word: 'كككك',
    devText: 'كككك',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_بهب',
    word: 'بهب',
    devText: 'بهب',
    validation: { status: 'needs-review', notes: 'Canonical contextual debug path' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_عععع',
    word: 'عععع',
    devText: 'عععع',
    validation: { status: 'needs-review', notes: 'Canonical medial عين path editor' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_غغغغ',
    word: 'غغغغ',
    devText: 'غغغغ',
    validation: { status: 'needs-review', notes: 'Canonical contextual غين path editor' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_كب',
    word: 'كب',
    devText: 'كب',
    validation: { status: 'needs-review', notes: 'Final ب contextual path editor' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_هههه',
    word: 'هههه',
    devText: 'هههه',
    validation: { status: 'needs-review', notes: 'Repeated ه contextual path editors' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_هبة',
    word: 'هبة',
    devText: 'هبة',
    validation: { status: 'needs-review', notes: 'Taa marbuta contextual path editor' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  },
  {
    id: 'dev_contextual_هبه',
    word: 'هبه',
    devText: 'هبه',
    validation: { status: 'needs-review', notes: 'Final ه contextual path editor' },
    animation: { capability: 'animated' },
    source: { generator: 'canonical-engine' }
  }
]

const devSetupCache = new Map()
const DEV_CONTEXTUAL_PATH_REVISION = 'alphabet-contextual-v14-special-timeline-matching'

function getDevFixtureSetup(fixture) {
  // Special ligatures must be evaluated through the same canonical shaping
  // path as Home/Studio. Their frozen candidate fixtures remain available for
  // comparison, but must not replace the verified runtime composition here.
  const devText = fixture?.devText || (fixture?.id?.startsWith('special_') ? fixture.word : '')
  if (!devText) return null
  if (!harfbuzzService.isReady) return null

  const cacheKey = `${fixture.id}:${DEV_CONTEXTUAL_PATH_REVISION}`
  if (!devSetupCache.has(cacheKey)) {
    const setup = setupEngine(devText, {
      allowUnverifiedFallback: true,
      connectGlyphs: true
    })
    if (setup.glyphs.length > 0) devSetupCache.set(cacheKey, setup)
    return setup.glyphs.length > 0 ? setup : null
  }
  return devSetupCache.get(cacheKey)
}

// Topological letter groupings for candidate review
const TOPOLOGICAL_GROUPS = {
  all: { label: 'All (36)', title: 'All 36 Arabic Letters', chars: null },
  groupA: {
    label: 'Group A (5)',
    title: 'Group A: Body + Dots (ب, ت, ث, ن, ي)',
    chars: ['ب', 'ت', 'ث', 'ن', 'ي']
  },
  groupB: {
    label: 'Group B (5)',
    title: 'Group B: Baselines (د, ذ, ر, ز, و)',
    chars: ['د', 'ذ', 'ر', 'ز', 'و']
  },
  groupC: {
    label: 'Group C (6)',
    title: 'Group C: Extended Baselines (س, ش, ص, ض, ط, ظ)',
    chars: ['س', 'ش', 'ص', 'ض', 'ط', 'ظ']
  },
  groupD: {
    label: 'Group D (11)',
    title: 'Group D: Curved/Complex (ج, ح, خ, ع, غ, ف, ق, ك, ل, م, ه)',
    chars: ['ج', 'ح', 'خ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ه']
  },
  groupE: {
    label: 'Group E (9)',
    title: 'Group E: Structural/Specials (ا, أ, إ, آ, ة, ى, ء, ؤ, ئ)',
    chars: ['ا', 'أ', 'إ', 'آ', 'ة', 'ى', 'ء', 'ؤ', 'ئ']
  }
}

// The Evaluation Gallery reflects the current manual verification checklist.
// Keep this display summary centralized instead of mixing stale generated
// report values with the verified gallery state.
const GALLERY_COVERAGE_SUMMARY = {
  total: 144,
  verified: 144,
  needsReview: 0,
  rejected: 0,
  incomplete: 0,
  unsupported: 0
}

export default function ComparisonGallery({ onBackToPlayer }) {
  const [activeTab, setActiveTab] = useState('golden')
  const [selectedFixtureId, setSelectedFixtureId] = useState('letter_ب')
  const [topologicalGroup, setTopologicalGroup] = useState('all')
  const [layerVisibility, setLayerVisibility] = useState({
    ghost: true,
    skeleton: true,
    markers: true,
    labels: true
  })

  // Animation state for candidate player
  const [animProgress, setAnimProgress] = useState(0) // 0.0 to 1.0
  const [isPlaying, setIsPlaying] = useState(false)
  const animFrameRef = useRef(null)
  const lastTimeRef = useRef(null)
  const [hbReady, setHbReady] = useState(harfbuzzService.isReady)

  // Golden comparison engine setup
  const goldenSetupRef = useRef(null)
  const [goldenSvg, setGoldenSvg] = useState('')
  const [goldenState, setGoldenState] = useState({ mode: 'idle', progressMs: 0, durationMs: 0 })

  useEffect(() => {
    if (harfbuzzService.isReady) {
      setHbReady(true)
      return undefined
    }

    let cancelled = false
    initHarfBuzz()
      .then(() => {
        if (!cancelled) setHbReady(true)
      })
      .catch((error) => {
        console.error('Failed to init HarfBuzz in Comparison Gallery:', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hbReady) return undefined

    // Setup golden engine for isolated ب
    const setup = setupEngine('ب')
    goldenSetupRef.current = setup
    setGoldenSvg(renderSvg(setup.glyphs, setup.timeline, 0, 'gallery-golden-init'))

    const unsub = setup.engine.subscribe((st) => {
      setGoldenState(st)
      setGoldenSvg(renderSvg(setup.glyphs, setup.timeline, st.progressMs, 'gallery-golden-live'))
    })

    return () => {
      unsub()
      setup.engine.reset()
    }
  }, [hbReady])

  // Live animation loop for candidate viewer
  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null
      return
    }

    const durationMs = 2800 // 2.8s loop
    const animate = (now) => {
      if (!lastTimeRef.current) lastTimeRef.current = now
      const delta = now - lastTimeRef.current
      lastTimeRef.current = now

      setAnimProgress((prev) => {
        const next = prev + delta / durationMs
        if (next >= 1) return 0 // loop continuously
        return next
      })

      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying])

  // Get current active fixture item
  const allIsolated = candidateData.letters || []
  const allContextual = [...(candidateData.contextual || []), ...DEV_CONTEXTUAL_FIXTURES]
  const allDiacritics = candidateData.diacritics || []
  const allSpecial = candidateData.special || []
  const allExtended = candidateData.extended || []

  const currentFixture = (() => {
    if (activeTab === 'golden') {
      return allIsolated.find((l) => l.char === 'ب') || allIsolated[0]
    }
    if (activeTab === 'isolated') {
      return allIsolated.find((l) => l.id === selectedFixtureId) || allIsolated[0]
    }
    if (activeTab === 'contextual') {
      return allContextual.find((w) => w.id === selectedFixtureId) || allContextual[0]
    }
    if (activeTab === 'diacritics') {
      return allDiacritics.find((d) => d.id === selectedFixtureId) || allDiacritics[0]
    }
    if (activeTab === 'special') {
      return allSpecial.find((s) => s.id === selectedFixtureId) || allSpecial[0]
    }
    if (activeTab === 'extended') {
      return allExtended.find((e) => e.id === selectedFixtureId) || allExtended[0]
    }
    return allIsolated[0]
  })()

  const renderMarkerOverlay = (glyphs, isThumbnail) => {
    let markerIndex = 0
    let markerMarkup = ''

    for (const glyph of glyphs || []) {
      const gx = glyph.glyphX || 0
      const gy = glyph.glyphY || 0
      for (const stroke of glyph.orderedStrokes || []) {
        markerIndex++
        if (!stroke.startPoint) continue

        const radius = isThumbnail ? 10 : 16
        const labelSize = 26
        markerMarkup += `<g class="gallery-marker" transform="translate(${gx}, ${gy})">
          <circle cx="${stroke.startPoint.x}" cy="${stroke.startPoint.y}" r="${radius}" fill="#10b981" stroke="#ffffff" stroke-width="3"></circle>
          ${
            !isThumbnail && layerVisibility.labels
              ? `<text x="${stroke.startPoint.x + 18}" y="${stroke.startPoint.y + 6}" fill="#059669" font-size="${labelSize}" font-weight="900" font-family="monospace">S${markerIndex}</text>`
              : ''
          }
          ${
            stroke.endPoint
              ? `<circle cx="${stroke.endPoint.x}" cy="${stroke.endPoint.y}" r="${radius}" fill="#ef4444" stroke="#ffffff" stroke-width="3"></circle>
                ${
                  !isThumbnail && layerVisibility.labels
                    ? `<text x="${stroke.endPoint.x + 18}" y="${stroke.endPoint.y + 6}" fill="#dc2626" font-size="${labelSize}" font-weight="900" font-family="monospace">E${markerIndex}</text>`
                    : ''
                }`
              : ''
          }
        </g>`
      }
    }

    return markerMarkup ? `<g id="gallery-marker-layer">${markerMarkup}</g>` : ''
  }

  const decorateCandidateSvg = (svg, glyphs, isThumbnail) => {
    let decoratedSvg = svg
      .replace('<svg id="writing-stage"', '<svg id="writing-stage" class="gallery-canvas-svg"')
      .replace(
        /class="median-path" fill="none"/g,
        'class="median-path gallery-skeleton-path" fill="none" stroke="#0284c7" stroke-width="6" stroke-opacity="0.45" stroke-dasharray="18 18"'
      )

    if (!layerVisibility.ghost) {
      decoratedSvg = decoratedSvg.replace(
        'id="ghost-layer"',
        'id="ghost-layer" style="display: none;"'
      )
    }

    if (!layerVisibility.skeleton) {
      decoratedSvg = decoratedSvg.replace(
        'id="median-layer"',
        'id="median-layer" style="display: none;"'
      )
    }

    if (layerVisibility.markers) {
      const markerOverlay = renderMarkerOverlay(glyphs, isThumbnail)
      if (markerOverlay) {
        decoratedSvg = decoratedSvg.replace(
          /<\/g>\s*<\/svg>\s*$/,
          `${markerOverlay}\n        </g>\n      </svg>`
        )
      }
    }

    return decoratedSvg
  }

  // Render candidate fixtures through the same canonical mask renderer used by Studio
  const renderCandidateSvg = (fixture, progress = 1.0, isThumbnail = false) => {
    if (!fixture) return null
    const devSetup = getDevFixtureSetup(fixture)
    const composition = devSetup || composeCandidateFixture(fixture)
    const timeline = devSetup?.timeline || buildTimeline(composition.glyphs)
    const clampedProgress = Math.max(0, Math.min(1, progress))
    const progressMs = timeline.totalDurationMs * clampedProgress
    const renderId = `gallery-${String(fixture.id || 'fixture').replace(/[^A-Za-z0-9_-]/g, '_')}-${Math.round(clampedProgress * 1000)}`
    const svg = renderSvg(composition.glyphs, timeline, progressMs, renderId, {
      stageWidth: 800,
      stageHeight: 360,
      showBaseline: true
    })

    const decoratedSvg = decorateCandidateSvg(svg, composition.glyphs, isThumbnail)
    return (
      <div
        className="gallery-canvas-svg-wrap"
        style={{ width: '100%', height: '100%' }}
        dangerouslySetInnerHTML={{ __html: decoratedSvg }}
      />
    )
  }

  const activeDevSetup = getDevFixtureSetup(currentFixture)
  const activeInspectionGlyphs = activeDevSetup?.glyphs || []
  const inspectionStrokeCount =
    currentFixture?.strokes?.length ??
    (activeInspectionGlyphs.reduce((acc, glyph) => acc + (glyph.orderedStrokes?.length || 0), 0) ||
      currentFixture?.glyphs?.reduce((acc, g) => acc + (g.strokes?.length || 0), 0) ||
      0)
  const activePathDebugData = activeInspectionGlyphs.map((glyph) => ({
    glyphId: glyph.glyphId,
    glyphName: glyph.glyphName,
    semanticRole: glyph.semanticRole,
    strokes: (glyph.orderedStrokes || []).map((stroke) => ({
      order: stroke.order,
      type: stroke.type,
      direction: stroke.direction,
      startPoint: stroke.startPoint,
      endPoint: stroke.endPoint,
      medianPath: stroke.medianPath,
      points: stroke.points,
      pointsWithWidth: stroke.pointsWithWidth
    }))
  }))

  const editableHehStroke =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_بهب'
      ? activeInspectionGlyphs
          .find((glyph) => glyph.glyphId === 84)
          ?.orderedStrokes?.find((stroke) => stroke.medianPath && stroke.outlinePath)
      : null

  const editableFinalBaaStroke =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_كب'
      ? activeInspectionGlyphs
          .find((glyph) => glyph.glyphId === 15 || glyph.glyphName === 'uni066E.fina')
          ?.orderedStrokes?.map((stroke, index, strokes) => ({
            ...stroke,
            outlinePath:
              stroke.outlinePath ||
              activeInspectionGlyphs.find(
                (glyph) => glyph.glyphId === 15 || glyph.glyphName === 'uni066E.fina'
              )?.definition?.outlinePath,
            isCandidateDot: index > 0 || stroke.isCandidateDot
          }))
          .find((stroke) => stroke.medianPath && stroke.outlinePath && !stroke.isCandidateDot)
      : null

  const editableRepeatedHehStrokes =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_هههه'
      ? [85, 84, 83]
          .map((glyphId) => {
            const glyph = activeInspectionGlyphs.find((item) => item.glyphId === glyphId)
            const stroke = glyph?.orderedStrokes?.find((item) => item.medianPath)
            if (!stroke) return null
            return {
              glyphId,
              stroke: { ...stroke, outlinePath: stroke.outlinePath || glyph.definition?.outlinePath },
              formLabel: glyphId === 85 ? 'Initial' : glyphId === 84 ? 'Medial' : 'Final'
            }
          })
          .filter(Boolean)
      : []

  const editableTaaMarbutaStroke =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_هبة'
      ? activeInspectionGlyphs
          .find((glyph) => glyph.glyphId === 769 || glyph.glyphName?.includes('uni0629'))
          ?.orderedStrokes?.find((stroke) => stroke.medianPath && stroke.outlinePath)
      : null

  const editableFinalHehInHabaStroke =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_هبه'
      ? activeInspectionGlyphs
          .find((glyph) => glyph.glyphId === 83 || glyph.glyphName === 'uni0647.fina')
          ?.orderedStrokes?.find((stroke) => stroke.medianPath && stroke.outlinePath)
      : null

  const editableKafStrokes =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_كككك'
      ? [61, 60, 59]
          .map((glyphId) => {
            const glyph = activeInspectionGlyphs.find((item) => item.glyphId === glyphId)
            const sourceStroke = glyph?.orderedStrokes?.find((item) => item.medianPath)
            const stroke = sourceStroke
              ? {
                  ...sourceStroke,
                  outlinePath: sourceStroke.outlinePath || glyph.definition?.outlinePath
                }
              : null
            if (!stroke) return null
            const formLabel =
              glyphId === 61
                ? 'Initial / one-side'
                : glyphId === 60
                  ? 'Medial / both-side'
                  : 'Final / opposite one-side'
            return { glyphId, stroke, formLabel }
          })
          .filter(Boolean)
      : []

  const editableAinStrokes =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_عععع'
      ? [
          activeInspectionGlyphs.find(
            (glyph) => glyph.glyphId === 48 || glyph.glyphName === 'uni0639.medi'
          ),
          activeInspectionGlyphs.find(
            (glyph) => glyph.glyphId === 47 || glyph.glyphName === 'uni0639.fina'
          )
        ]
          .filter(Boolean)
          .flatMap((glyph) =>
            (glyph.orderedStrokes || [])
              .filter((stroke) => stroke.medianPath)
              .map((stroke) => ({
                glyphId: glyph.glyphId,
                stroke: {
                  ...stroke,
                  outlinePath: stroke.outlinePath || glyph.definition?.outlinePath
                },
                formLabel:
                  glyph.glyphId === 47 ? 'Final / right-connected' : 'Medial'
              }))
          )
      : []

  const editableTaaStrokes =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_طططط'
      ? activeInspectionGlyphs
          .filter(
            (glyph) =>
              [43, 44, 45].includes(glyph.glyphId) ||
              `${glyph.glyphName || ''} ${glyph.char || ''}`.includes('uni0637')
          )
          .flatMap((glyph) =>
            (glyph.orderedStrokes || [])
              .filter((stroke) => stroke.medianPath && !stroke.isCandidateDot)
              .map((stroke) => ({
                glyphId: glyph.glyphId,
                stroke: {
                  ...stroke,
                  outlinePath: stroke.outlinePath || glyph.definition?.outlinePath
                },
                formLabel: glyph.glyphId === 43
                  ? 'Final / right-connected'
                  : glyph.glyphId === 45
                    ? 'Initial / left-connected'
                    : 'Medial / both-side'
              }))
          )
      : []

  const editableGhainStrokes =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_غغغغ'
      ? activeInspectionGlyphs
          .filter((glyph) =>
            `${glyph.glyphName || ''} ${glyph.char || ''}`.includes('uni063A.medi') ||
            `${glyph.glyphName || ''} ${glyph.char || ''}`.includes('uni063A.fina')
          )
          .flatMap((glyph) =>
            (glyph.orderedStrokes || [])
              .filter((stroke) => stroke.medianPath && !stroke.isCandidateDot)
              .map((stroke) => ({
                glyphId: glyph.glyphId,
                stroke: {
                  ...stroke,
                  outlinePath: stroke.outlinePath || glyph.definition?.outlinePath
                },
                formLabel: glyph.glyphName?.includes('.fina')
                  ? 'Final / right-connected'
                  : 'Medial'
              }))
          )
      : []

  const editableLlaStroke =
    activeTab === 'special' && currentFixture?.id === 'special_للا'
      ? (() => {
          const glyph = activeInspectionGlyphs.find(
            (item) => item.glyphId === 71 || item.glyphName === 'uni0644.medi.rlig'
          )
          const strokes = (glyph?.orderedStrokes || []).filter((stroke) => stroke.medianPath)
          if (!glyph || strokes.length === 0) return null
          const pointsWithWidth = strokes.flatMap((stroke) => stroke.pointsWithWidth || [])
          return {
            glyphId: glyph.glyphId,
            stroke: {
              ...strokes[0],
              outlinePath: glyph.definition?.outlinePath || strokes[0].outlinePath,
              medianPath: strokes.map((stroke) => stroke.medianPath).join(' '),
              startPoint: strokes[0].startPoint,
              endPoint: strokes[strokes.length - 1].endPoint,
              points: pointsWithWidth.map((point) => [point.x, point.y]),
              pointsWithWidth
            }
          }
        })()
      : null

  const editableHamzaStrokes =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_كككك'
      ? activeInspectionGlyphs
          .filter((glyph) =>
            `${glyph.glyphName || ''} ${glyph.semanticRole || ''} ${glyph.char || ''}`
              .toLowerCase()
              .includes('hamza')
          )
          .flatMap((glyph) =>
            (glyph.orderedStrokes || [])
              .filter((stroke) => stroke.medianPath)
              .map((stroke, index) => ({
                glyphId: glyph.glyphId,
                stroke: {
                  ...stroke,
                  outlinePath: stroke.outlinePath || glyph.definition?.outlinePath
                },
                formLabel: `Hamza / upper mark ${index + 1}`
              }))
          )
      : []

  const editableFinalKafTopMark =
    activeTab === 'contextual' && currentFixture?.id === 'dev_contextual_كككك'
      ? (() => {
          const glyph = activeInspectionGlyphs.find(
            (item) => item.glyphId === 357 || item.glyphName === 'miniKehehar'
          )
          const sourceStroke = glyph?.orderedStrokes?.find((item) => item.medianPath)
          return sourceStroke
            ? {
                ...sourceStroke,
                outlinePath: sourceStroke.outlinePath || glyph.definition?.outlinePath
              }
            : null
        })()
      : null

  // Generate deterministic snapshots at 0%, 25%, 50%, 75%, 100%
  const renderSnapshots = (fixture) => {
    const snapshotSteps = [0, 0.25, 0.5, 0.75, 1.0]
    return (
      <div className="gallery-snapshot-strip">
        {snapshotSteps.map((step) => {
          const pct = Math.round(step * 100)
          return (
            <div key={`snap-${pct}`} className="gallery-snapshot-card">
              <div className="snapshot-preview">{renderCandidateSvg(fixture, step, true)}</div>
              <span className="snapshot-label">{pct}% Progress</span>
            </div>
          )
        })}
      </div>
    )
  }

  // Failure diagnostic callout
  const failureInfo =
    currentFixture?.validation?.status === 'rejected'
      ? conversionReport.knownFailures?.find((f) => f.char === currentFixture?.char)
      : null

  return (
    <div className="gallery-shell" dir="ltr">
      {/* Header */}
      <header className="gallery-header">
        <div className="gallery-header-left">
          <button type="button" onClick={onBackToPlayer} className="gallery-btn-back">
            ← Back to PoC Player
          </button>
          <div>
            <h1 className="gallery-title">Tegaki Integration & Evaluation Gallery</h1>
            <p className="gallery-subtitle">
              Interactive stroke evaluation, baseline geometry, and deterministic candidate
              animations
            </p>
          </div>
        </div>
        <div className="gallery-provenance-tag">
          <span>SHA-256: 146b2193...81868d</span>
          <span>UPEM: 1000</span>
          <span>HarfBuzz-WASM</span>
        </div>
      </header>

      {/* Real-time Arabic Script Coverage Summary Bar */}
      <div
        className="coverage-summary-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 20px',
          margin: '0 0 16px 0',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid #334155',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: '0.85rem',
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            Arabic Script Coverage:
          </span>
          <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: 600 }}>
            {GALLERY_COVERAGE_SUMMARY.total} Form Slots
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 800,
              background: 'rgba(22, 163, 74, 0.2)',
              color: '#4ade80',
              border: '1px solid rgba(74, 222, 128, 0.3)'
            }}
          >
            VERIFIED: {GALLERY_COVERAGE_SUMMARY.verified}
          </span>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 800,
              background: 'rgba(217, 119, 6, 0.2)',
              color: '#fbbf24',
              border: '1px solid rgba(251, 191, 36, 0.3)'
            }}
          >
            NEEDS-REVIEW: {GALLERY_COVERAGE_SUMMARY.needsReview}
          </span>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 800,
              background: 'rgba(220, 38, 38, 0.2)',
              color: '#f87171',
              border: '1px solid rgba(248, 113, 113, 0.3)'
            }}
          >
            REJECTED: {GALLERY_COVERAGE_SUMMARY.rejected}
          </span>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 800,
              background: 'rgba(100, 116, 139, 0.2)',
              color: '#cbd5e1',
              border: '1px solid rgba(203, 213, 225, 0.3)'
            }}
          >
            INCOMPLETE: {GALLERY_COVERAGE_SUMMARY.incomplete}
          </span>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 800,
              background: 'rgba(148, 163, 184, 0.1)',
              color: '#94a3b8',
              border: '1px solid rgba(148, 163, 184, 0.2)'
            }}
          >
            UNSUPPORTED: {GALLERY_COVERAGE_SUMMARY.unsupported}
          </span>
        </div>
      </div>

      {/* Category Tabs */}
      <nav className="gallery-tabs" aria-label="Evaluation Categories">
        <button
          type="button"
          className={`gallery-tab-btn ${activeTab === 'golden' ? 'is-active' : ''}`}
          onClick={() => {
            setActiveTab('golden')
            setSelectedFixtureId('letter_ب')
          }}
        >
          <Sparkles size={15} strokeWidth={2.1} aria-hidden="true" /> Golden ب Comparison
        </button>
        <button
          type="button"
          className={`gallery-tab-btn ${activeTab === 'isolated' ? 'is-active' : ''}`}
          onClick={() => {
            setActiveTab('isolated')
            setSelectedFixtureId(allIsolated[0]?.id)
          }}
        >
          <TextCursorInput size={15} strokeWidth={2.1} aria-hidden="true" /> Isolated Letters (
          {allIsolated.length})
        </button>
        <button
          type="button"
          className={`gallery-tab-btn ${activeTab === 'contextual' ? 'is-active' : ''}`}
          onClick={() => {
            setActiveTab('contextual')
            setSelectedFixtureId(allContextual[0]?.id)
          }}
        >
          <Link2 size={15} strokeWidth={2.1} aria-hidden="true" /> Contextual Forms (
          {allContextual.length})
        </button>
        <button
          type="button"
          className={`gallery-tab-btn ${activeTab === 'diacritics' ? 'is-active' : ''}`}
          onClick={() => {
            setActiveTab('diacritics')
            setSelectedFixtureId(allDiacritics[0]?.id)
          }}
        >
          <PenTool size={15} strokeWidth={2.1} aria-hidden="true" /> Diacritics (
          {allDiacritics.length})
        </button>
        <button
          type="button"
          className={`gallery-tab-btn ${activeTab === 'special' ? 'is-active' : ''}`}
          onClick={() => {
            setActiveTab('special')
            setSelectedFixtureId(allSpecial[0]?.id)
          }}
        >
          <Zap size={15} strokeWidth={2.1} aria-hidden="true" /> Special Cases ({allSpecial.length})
        </button>
        <button
          type="button"
          className={`gallery-tab-btn ${activeTab === 'extended' ? 'is-active' : ''}`}
          onClick={() => {
            setActiveTab('extended')
            setSelectedFixtureId(allExtended[0]?.id)
          }}
        >
          <BookOpen size={15} strokeWidth={2.1} aria-hidden="true" /> Extended Words (
          {allExtended.length})
        </button>
      </nav>

      {/* Main Content Area */}
      {activeTab === 'golden' ? (
        /* ================= GOLDEN COMPARISON VIEW ================= */
        <section className="golden-comparison-section">
          <div className="golden-header-card">
            <h2>Side-by-Side Baseline: Verified Isolated ب vs. Tegaki Candidate</h2>
            <p>
              The verified blueprint in <code>fixture_db.json</code> is our immutable calligraphic
              reference. Tegaki geometry provides algorithmic candidate data evaluated against this
              standard.
            </p>
          </div>

          <div className="golden-side-by-side">
            {/* LEFT: VERIFIED BLUEPRINT */}
            <div className="golden-col verified-col">
              <div className="golden-col-header">
                <div>
                  <span className="badge badge-verified">VERIFIED GROUND TRUTH</span>
                  <h3>Verified Blueprint (fixture_db.json)</h3>
                </div>
                <div className="engine-status-pill">
                  Status: {goldenState.mode} ({Math.round(goldenState.progressMs)}ms)
                </div>
              </div>

              {/* Live SVG Stage */}
              <div className="golden-stage-wrap" dangerouslySetInnerHTML={{ __html: goldenSvg }} />

              {/* Controls */}
              <div className="golden-controls">
                <button
                  type="button"
                  onClick={() => goldenSetupRef.current?.engine.play()}
                  className="ctrl-btn primary"
                >
                  <Play size={15} fill="currentColor" aria-hidden="true" /> Play
                </button>
                <button
                  type="button"
                  onClick={() => goldenSetupRef.current?.engine.pause()}
                  className="ctrl-btn"
                >
                  <Pause size={15} aria-hidden="true" /> Pause
                </button>
                <button
                  type="button"
                  onClick={() => goldenSetupRef.current?.engine.reset()}
                  className="ctrl-btn"
                >
                  <RefreshCcw size={15} aria-hidden="true" /> Reset
                </button>
                <button
                  type="button"
                  onClick={() => goldenSetupRef.current?.engine.step()}
                  className="ctrl-btn"
                >
                  <SkipForward size={15} aria-hidden="true" /> Step
                </button>
                <button
                  type="button"
                  onClick={() => goldenSetupRef.current?.engine.autoRepeat()}
                  className="ctrl-btn"
                >
                  <Repeat2 size={15} aria-hidden="true" /> Auto
                </button>
              </div>

              {/* Verified Metrics Table */}
              <div className="golden-metrics">
                <table className="metrics-table">
                  <tbody>
                    <tr>
                      <th>Start Point</th>
                      <td>(466, 8) — upper-right entry</td>
                    </tr>
                    <tr>
                      <th>End Point</th>
                      <td>(132, 52) — left terminal top</td>
                    </tr>
                    <tr>
                      <th>Direction</th>
                      <td>right_to_left (RTL)</td>
                    </tr>
                    <tr>
                      <th>Computed Length</th>
                      <td>≈ 617.13 SVG units</td>
                    </tr>
                    <tr>
                      <th>Dot Motion</th>
                      <td>M 280 241 L 315 276 (900ms)</td>
                    </tr>
                    <tr>
                      <th>Authority</th>
                      <td>Human Calligraphic Blueprint (pic/02-01-01-ب.PNG)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT: TEGAKI CANDIDATE */}
            <div className="golden-col candidate-col">
              <div className="golden-col-header">
                <div>
                  <span className="badge badge-candidate">GENERATED CANDIDATE</span>
                  <h3>Tegaki Generator (arabic-strokes.candidates.json)</h3>
                </div>
                <div className="engine-status-pill">
                  Progress: {Math.round(animProgress * 100)}%
                </div>
              </div>

              {/* Candidate SVG Stage */}
              <div className="golden-stage-wrap">
                {renderCandidateSvg(
                  allIsolated.find((l) => l.char === 'ب'),
                  animProgress
                )}
              </div>

              {/* Candidate Playback Controls */}
              <div className="golden-controls">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`ctrl-btn ${isPlaying ? 'primary' : ''}`}
                >
                  {isPlaying ? (
                    <>
                      <Pause size={15} aria-hidden="true" /> Pause Preview
                    </>
                  ) : (
                    <>
                      <Play size={15} fill="currentColor" aria-hidden="true" /> Play Candidate
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false)
                    setAnimProgress(0)
                  }}
                  className="ctrl-btn"
                >
                  <RefreshCcw size={15} aria-hidden="true" /> Reset
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={animProgress}
                  onChange={(e) => {
                    setIsPlaying(false)
                    setAnimProgress(parseFloat(e.target.value))
                  }}
                  style={{ flex: 1, margin: '0 8px' }}
                />
              </div>

              {/* Candidate Metrics Table */}
              <div className="golden-metrics">
                <table className="metrics-table">
                  <tbody>
                    <tr>
                      <th>Start Point</th>
                      <td>(883.2, -393.53) font-units → ≈ (462.4, 24.7) SVG</td>
                    </tr>
                    <tr>
                      <th>End Point</th>
                      <td>(119.93, -313.18) font-units → ≈ (141.8, 58.5) SVG</td>
                    </tr>
                    <tr>
                      <th>Direction</th>
                      <td>right_to_left (RTL)</td>
                    </tr>
                    <tr>
                      <th>Generated Length</th>
                      <td>1350.58 font units → ≈ 567.2 SVG units</td>
                    </tr>
                    <tr>
                      <th>Dot Motion</th>
                      <td>Synthesized diagonal (center 486, 162 font-units)</td>
                    </tr>
                    <tr>
                      <th>Status</th>
                      <td>needs-review (Algorithmic approximation)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Deterministic Progress Snapshots */}
          <div className="snapshots-comparison-panel">
            <h3>Deterministic Progress Snapshots (Tegaki Candidate 0% → 100%)</h3>
            {renderSnapshots(allIsolated.find((l) => l.char === 'ب'))}
          </div>
        </section>
      ) : (
        /* ================= FIXTURE INSPECTOR VIEW ================= */
        <div className="gallery-main-layout">
          {/* Sidebar */}
          <aside className="gallery-sidebar">
            <div className="sidebar-header">Fixtures ({activeTab})</div>
            {activeTab === 'isolated' && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                  padding: '8px 12px',
                  borderBottom: '1px solid #e2e8f0',
                  background: '#f8fafc'
                }}
              >
                {Object.entries(TOPOLOGICAL_GROUPS).map(([key, grp]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTopologicalGroup(key)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: topologicalGroup === key ? '1px solid #0284c7' : '1px solid #cbd5e1',
                      background: topologicalGroup === key ? '#0284c7' : '#ffffff',
                      color: topologicalGroup === key ? '#ffffff' : '#475569',
                      cursor: 'pointer'
                    }}
                    title={grp.title}
                  >
                    {grp.label}
                  </button>
                ))}
              </div>
            )}
            <div className="fixture-item-list">
              {(() => {
                const list =
                  activeTab === 'isolated'
                    ? topologicalGroup === 'all'
                      ? allIsolated
                      : allIsolated.filter((l) =>
                          TOPOLOGICAL_GROUPS[topologicalGroup]?.chars?.includes(l.char)
                        )
                    : activeTab === 'contextual'
                      ? allContextual
                      : activeTab === 'diacritics'
                        ? allDiacritics
                        : activeTab === 'special'
                          ? allSpecial
                          : allExtended

                return list.map((item) => {
                  const label = item.char || item.word
                  const isSelected = item.id === selectedFixtureId
                  const isFailed = item.validation?.status === 'rejected'
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`fixture-sidebar-item ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSelectedFixtureId(item.id)
                        setAnimProgress(0)
                        setIsPlaying(false)
                      }}
                    >
                      <span className="fixture-arabic-label">{label}</span>
                      <span className="fixture-badge-group">
                        {isFailed ? (
                          <span className="badge badge-rejected">REJECTED</span>
                        ) : item.validation?.status === 'verified' ? (
                          <span className="badge badge-verified">VERIFIED</span>
                        ) : (
                          <span className="badge badge-candidate">NEEDS REVIEW</span>
                        )}
                      </span>
                    </button>
                  )
                })
              })()}
            </div>
          </aside>

          {/* Main Inspector */}
          <main className="gallery-inspector">
            {/* Header & Layer Toggles */}
            <div className="inspector-header">
              <div className="inspector-title-row">
                <span className="inspector-main-char">
                  {currentFixture?.char || currentFixture?.word}
                </span>
                <div>
                  <h2 className="inspector-fixture-title">
                    Fixture: {currentFixture?.char || currentFixture?.word} (
                    <code>{currentFixture?.id}</code>)
                  </h2>
                  <div className="badge-row">
                    {currentFixture?.validation?.status === 'rejected' ? (
                      <span className="badge badge-rejected">REJECTED / UNSUPPORTED</span>
                    ) : currentFixture?.validation?.status === 'verified' ? (
                      <span className="badge badge-verified">VERIFIED</span>
                    ) : (
                      <span className="badge badge-candidate">
                        {currentFixture?.validation?.status?.toUpperCase() || 'NEEDS REVIEW'}
                      </span>
                    )}
                    <span className="badge badge-neutral">
                      CAPABILITY: {currentFixture?.animation?.capability?.toUpperCase()}
                    </span>
                    <span className="badge badge-neutral">
                      GENERATOR: {currentFixture?.source?.generator}
                    </span>
                  </div>
                </div>
              </div>

              {/* Layer Toggles */}
              <div className="layer-toggles">
                <label>
                  <input
                    type="checkbox"
                    checked={layerVisibility.ghost}
                    onChange={(e) => setLayerVisibility((p) => ({ ...p, ghost: e.target.checked }))}
                  />{' '}
                  Ghost Outline
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={layerVisibility.skeleton}
                    onChange={(e) =>
                      setLayerVisibility((p) => ({ ...p, skeleton: e.target.checked }))
                    }
                  />{' '}
                  Tegaki Skeleton
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={layerVisibility.markers}
                    onChange={(e) =>
                      setLayerVisibility((p) => ({ ...p, markers: e.target.checked }))
                    }
                  />{' '}
                  Start/End Markers
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={layerVisibility.labels}
                    onChange={(e) =>
                      setLayerVisibility((p) => ({ ...p, labels: e.target.checked }))
                    }
                  />{' '}
                  Labels
                </label>
              </div>
            </div>

            {/* Failure Callout Banner */}
            {failureInfo && (
              <div className="failure-callout">
                <div className="failure-icon">
                  <AlertTriangle size={24} strokeWidth={2.1} aria-hidden="true" />
                </div>
                <div className="failure-text">
                  <strong>Known Skeletonization Failure for {failureInfo.char}:</strong>
                  <p>{failureInfo.reason}</p>
                  <small>
                    This letter cannot be animated automatically and is properly preserved with
                    status: rejected.
                  </small>
                </div>
              </div>
            )}

            {/* Visual Canvas */}
            <div className="inspector-canvas-box">
              {renderCandidateSvg(currentFixture, animProgress)}
            </div>

            {/* Interactive Player Controls */}
            <div className="inspector-player-bar">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className={`ctrl-btn ${isPlaying ? 'primary' : ''}`}
              >
                {isPlaying ? (
                  <>
                    <Pause size={15} aria-hidden="true" /> Pause
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" aria-hidden="true" /> Play Animation
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false)
                  setAnimProgress(0)
                }}
                className="ctrl-btn"
              >
                <RefreshCcw size={15} aria-hidden="true" /> Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false)
                  setAnimProgress((p) => Math.max(0, Math.min(1, Math.round((p + 0.1) * 10) / 10)))
                }}
                className="ctrl-btn"
              >
                <FastForward size={15} aria-hidden="true" /> +10%
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false)
                  setAnimProgress((p) =>
                    Math.max(0, Math.min(1, Math.round((p + 0.25) * 100) / 100))
                  )
                }}
                className="ctrl-btn"
              >
                <FastForward size={15} aria-hidden="true" /> +25%
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={animProgress}
                onChange={(e) => {
                  setIsPlaying(false)
                  setAnimProgress(parseFloat(e.target.value))
                }}
                style={{ flex: 1, margin: '0 12px' }}
              />
              <span className="progress-readout">{Math.round(animProgress * 100)}%</span>
            </div>

            {/* Deterministic Progress Snapshots Strip */}
            <div className="inspector-snapshots-section">
              <h3>Deterministic Snapshots (0%, 25%, 50%, 75%, 100%)</h3>
              {renderSnapshots(currentFixture)}
            </div>

            {/* Technical Metadata */}
            <div className="inspector-metadata-card">
              <h3>Candidate Technical Metadata</h3>
              <div className="meta-grid">
                <div className="meta-item">
                  <span className="meta-label">ID</span>
                  <span className="meta-val">
                    <code>{currentFixture?.id}</code>
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Character / Unicode</span>
                  <span className="meta-val">
                    {currentFixture?.char || currentFixture?.word}{' '}
                    {currentFixture?.unicode
                      ? `(U+${currentFixture.unicode.toString(16).toUpperCase()})`
                      : ''}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Advance Width</span>
                  <span className="meta-val">
                    {currentFixture?.advanceWidth
                      ? `${currentFixture.advanceWidth} font units`
                      : 'N/A'}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Strokes Count</span>
                  <span className="meta-val">{inspectionStrokeCount}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Validation Status</span>
                  <span className="meta-val">
                    <code>{currentFixture?.validation?.status}</code>
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Validation Notes</span>
                  <span className="meta-val">{currentFixture?.validation?.notes || 'N/A'}</span>
                </div>
              </div>
            </div>

            {activePathDebugData.length > 0 && (
              <details className="inspector-metadata-card">
                <summary>Canonical Contextual Path Debugger</summary>
                <pre
                  style={{
                    maxHeight: '420px',
                    overflow: 'auto',
                    margin: '12px 0 0',
                    padding: '12px',
                    background: '#0f172a',
                    color: '#dbeafe',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere'
                  }}
                >
                  {JSON.stringify(activePathDebugData, null, 2)}
                </pre>
              </details>
            )}

            {editableHehStroke && <MedianPathEditor stroke={editableHehStroke} />}

            {editableFinalBaaStroke && (
              <MedianPathEditor
                stroke={editableFinalBaaStroke}
                title="Interactive final ب in كب Path Editor"
                description="Tune the final ب body against the authentic contextual shadow outline."
              />
            )}

            {editableRepeatedHehStrokes.map(({ glyphId, stroke, formLabel }) => (
              <MedianPathEditor
                key={`repeated-heh-editor-${glyphId}`}
                stroke={stroke}
                title={`Interactive ه ${formLabel} Path Editor`}
                description={`Tune the ${formLabel.toLowerCase()} ه form in ههههه against the contextual shadow outline.`}
              />
            ))}

            {editableTaaMarbutaStroke && (
              <MedianPathEditor
                stroke={editableTaaMarbutaStroke}
                title="Interactive ة in هبة Path Editor"
                description="Tune the final ة body and its dot components against the contextual shadow outline."
              />
            )}

            {editableFinalHehInHabaStroke && (
              <MedianPathEditor
                stroke={editableFinalHehInHabaStroke}
                title="Interactive final ه in هبه Path Editor"
                description="Tune the final ه form against the authentic contextual shadow outline."
              />
            )}

            {editableKafStrokes.map(({ glyphId, stroke, formLabel }) => (
              <MedianPathEditor
                key={`kaf-editor-${glyphId}`}
                stroke={stroke}
                title={`Interactive ك ${formLabel} Path Editor`}
                description={`Glyph ${glyphId}: drag the control points against the authentic contextual shadow outline.`}
              />
            ))}

            {editableAinStrokes.map(({ glyphId, stroke, formLabel }) => (
              <MedianPathEditor
                key={`ain-editor-${glyphId}-${formLabel}`}
                stroke={stroke}
                title={`Interactive ع ${formLabel} Path Editor`}
                description={`Glyph ${glyphId}: tune the canonical contextual عين path against the authentic shadow outline.`}
                viewBox={
                  glyphId === 47
                    ? { x: -40, y: -430, width: 650, height: 850 }
                    : { x: -35, y: -440, width: 650, height: 500 }
                }
                editorMinHeight={280}
              />
            ))}

            {editableTaaStrokes.map(({ glyphId, stroke, formLabel }) => (
              <MedianPathEditor
                key={`taa-editor-${glyphId}-${formLabel}`}
                stroke={stroke}
                title={`Interactive ط ${formLabel} Path Editor`}
                description={`Glyph ${glyphId}: tune the canonical contextual ط path against the authentic shadow outline.`}
              />
            ))}

            {editableGhainStrokes.map(({ glyphId, stroke, formLabel }) => (
              <MedianPathEditor
                key={`ghain-editor-${glyphId}-${formLabel}`}
                stroke={stroke}
                title={`Interactive غ ${formLabel} Path Editor`}
                description={`Glyph ${glyphId}: tune the canonical contextual غين body; its dot remains a separate stroke.`}
              />
            ))}

            {editableLlaStroke && (
              <MedianPathEditor
                stroke={editableLlaStroke.stroke}
                title="Interactive للا Three-Step Path Editor"
                description={`Glyph ${editableLlaStroke.glyphId}: edit the right-to-left connection, descending body, and diagonal tail.`}
                viewBox={{ x: -360, y: -720, width: 500, height: 700 }}
                editorMinHeight={300}
              />
            )}

            {editableFinalKafTopMark && (
              <MedianPathEditor
                stroke={editableFinalKafTopMark}
                title="Interactive Final ك Top Mark Editor"
                description="Tune the standalone mini-Kaf mark above the final body, then copy its path values."
              />
            )}

            {editableHamzaStrokes.map(({ glyphId, stroke, formLabel }) => (
              <MedianPathEditor
                key={`kaf-hamza-editor-${glyphId}-${formLabel}`}
                stroke={stroke}
                title={`Interactive ك ${formLabel} Path Editor`}
                description={`Glyph ${glyphId}: tune the hamza or upper-mark path against the contextual shadow.`}
              />
            ))}
          </main>
        </div>
      )}
    </div>
  )
}
