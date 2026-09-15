import assert from 'node:assert'
import { svgPathProperties } from 'svg-path-properties'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'
import {
  buildTimeline,
  getBrushSquareGeometry,
  getStepInkProgress,
  getStepStrokeProgress,
  prepareRenderScene,
  renderSvgFrame,
  setupEngine,
  renderSvg
} from '../src/renderer/src/engine'
import type { ComposedGlyph } from '../src/renderer/src/engine'

function bodySteps(
  setup: ReturnType<typeof setupEngine>
): ReturnType<typeof setupEngine>['timeline']['steps'] {
  return setup.timeline.steps.filter((step) => !step.isDot)
}

function syntheticBaseGlyph(glyphId: number, glyphName: string, medianPath: string): ComposedGlyph {
  return {
    cluster: glyphId,
    clusterStart: glyphId,
    clusterEnd: glyphId + 1,
    sourceSpan: '',
    baseChar: '',
    glyphId,
    glyphName,
    glyphX: 0,
    glyphY: 0,
    isSupported: true,
    definition: null,
    semanticRole: 'base',
    orderedStrokes: [
      {
        order: 0,
        outlinePath: '',
        medianPath,
        startPoint: null,
        endPoint: null,
        points: [],
        pointsWithWidth: []
      }
    ],
    hb: { glyphId } as ComposedGlyph['hb'],
    cursorX: 0,
    cursorY: 0
  }
}

async function run(): Promise<void> {
  await initHarfBuzz()

  // Use a dotless connected word so the body-to-body bridge is directly
  // adjacent. Dotted words intentionally place each dot before the next body.
  const connected = setupEngine('لال', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const connectedBodies = bodySteps(connected)
  assert(connectedBodies.length >= 3, 'ببب exposes all three body strokes')
  assert(connectedBodies[1].transition?.kind === 'bridge', 'joined body boundary gets a bridge')
  assert(
    connectedBodies[1].startMs === connectedBodies[1].transition!.startMs,
    'joined body stroke starts with its bridge instead of after a blank gap'
  )
  assert(
    connectedBodies[1].transition!.endMs - connectedBodies[1].transition!.startMs <= 96,
    'bridge duration stays below the continuity budget'
  )
  assert(connectedBodies[1].transition!.path.includes(' C '), 'bridge follows a cubic cursor path')

  const scene = prepareRenderScene(connected.glyphs, connected.timeline, 'continuity-handoff', {
    stageWidth: 800,
    stageHeight: 380,
    showBaseline: false,
    strokeWeight: 80,
    includeMedianLayer: false
  })
  const nextBodySceneStroke = scene.strokes.find(
    (stroke) => stroke.step?.id === connectedBodies[1].id
  )
  assert(nextBodySceneStroke, 'next body stroke is present in the prepared scene')
  const handoffFrame = renderSvgFrame(
    scene,
    connectedBodies[1].transition!.startMs +
      (connectedBodies[1].transition!.endMs - connectedBodies[1].transition!.startMs) / 2
  )
  const nextMaskStart = handoffFrame.indexOf(`<mask id="${nextBodySceneStroke.maskId}"`)
  const nextMaskEnd = handoffFrame.indexOf('</mask>', nextMaskStart)
  assert(
    nextMaskStart >= 0 && nextMaskEnd > nextMaskStart,
    'next body mask is rendered during handoff'
  )
  assert(
    handoffFrame.slice(nextMaskStart, nextMaskEnd).includes('<rect'),
    'bridge exposes the next body handoff brush stamp'
  )
  const outgoingBridge = scene.connections.find(
    (connection) => connection.mode === 'outgoing-mask'
  )
  assert(outgoingBridge?.bridgePath, 'ordinary connected joins keep a measured bridge path')
  const outgoingBridgeFrame = renderSvgFrame(
    scene,
    outgoingBridge!.bridgeStartMs! +
      (outgoingBridge!.bridgeEndMs! - outgoingBridge!.bridgeStartMs!) / 2
  )
  assert(
    outgoingBridgeFrame.includes('class="ink-connection-bridge"'),
    'ordinary connected joins paint the rounded ink bridge'
  )

  const bridge = connectedBodies[1].transition!
  const bridgePath = new svgPathProperties(bridge.path)
  const travelX = bridge.endPoint.x - bridge.startPoint.x
  const travelY = bridge.endPoint.y - bridge.startPoint.y
  const travelLength = Math.hypot(travelX, travelY)
  const travelUnit = { x: travelX / travelLength, y: travelY / travelLength }
  for (let index = 0; index <= 20; index++) {
    const point = bridgePath.getPointAtLength((bridgePath.getTotalLength() * index) / 20)
    const projectedDistance =
      (point.x - bridge.startPoint.x) * travelUnit.x +
      (point.y - bridge.startPoint.y) * travelUnit.y
    assert(
      projectedDistance >= -0.001 && projectedDistance <= travelLength + 0.001,
      'bridge stays between its two handoff points'
    )
  }

  const separated = setupEngine('ببب', {
    allowUnverifiedFallback: true,
    connectGlyphs: false
  })
  assert(
    bodySteps(separated)[1].transition?.kind !== 'bridge',
    'separated-stroke mode does not create a bridge'
  )

  const dottedConnected = setupEngine('ببب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const dottedBodies = bodySteps(dottedConnected)
  assert(
    dottedBodies.slice(1).every((step) => step.transition?.kind === 'bridge'),
    'body joins remain connected when a letter dot is animated between the two bodies'
  )

  const overshootingPair = buildTimeline(
    [
      syntheticBaseGlyph(9001, 'synthetic.init', 'M 0 0 L 140 0'),
      syntheticBaseGlyph(9002, 'synthetic.fina', 'M 100 0 L 180 0')
    ],
    { connectGlyphs: true }
  )
  const overshootingStep = overshootingPair.steps[0]
  assert(
    Math.abs(overshootingStep.endProgress - 108 / 140) < 0.03,
    'an overshooting terminal path stops at the shared handoff center'
  )
  assert(
    Math.abs(getStepStrokeProgress(overshootingStep, overshootingStep.endMs) - 108 / 140) < 0.03,
    'the renderer-facing progress helper never reveals the overshooting tail'
  )
  assert(
    Math.abs(getStepInkProgress(overshootingStep, overshootingStep.endMs) - 108 / 140) < 0.03,
    'a normalized handoff stops outgoing ink at the terminal point'
  )
  assert(
    Math.abs((overshootingPair.steps[1].transition?.startPoint.x ?? Infinity) - 108) < 0.5,
    'the next body handoff starts at the shared center inside its original terminal'
  )

  const detached = setupEngine('أبجد', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const detachedBodies = bodySteps(detached)
  assert(detachedBodies[1].transition?.kind === 'lift', 'non-joining boundary remains lifted')

  const nonJoiningBoundary = setupEngine('دق', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const nonJoiningBodies = bodySteps(nonJoiningBoundary)
  const isolatedQaf = nonJoiningBoundary.glyphs.find(
    (glyph) => glyph.baseChar === 'ق' && glyph.semanticRole === 'base'
  )
  assert(
    isolatedQaf?.glyphName === 'uni066F',
    'qaf remains bare when the previous letter cannot join'
  )
  assert(
    isolatedQaf?.definition?.id === 'canonical_contextual_ق_isolated',
    'isolated qaf in a word uses a canonical body-only definition'
  )
  assert(
    nonJoiningBodies[1]?.transition?.kind !== 'bridge',
    'a non-left-joining predecessor never creates a cursive bridge'
  )

  const isolatedBaaAfterBreak = setupEngine('دب', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  }).glyphs.find((glyph) => glyph.baseChar === 'ب' && glyph.semanticRole === 'base')
  assert(
    isolatedBaaAfterBreak?.definition?.id === 'canonical_contextual_ب_isolated',
    'a bare letter after a joining break uses its canonical isolated body'
  )
  assert(
    isolatedBaaAfterBreak?.orderedStrokes.every(
      (stroke) => !(stroke.isCandidateDot || stroke.type === 'dot')
    ),
    'the isolated body does not duplicate the separately shaped dot'
  )

  const dottedRegression = setupEngine('أبجد', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  assert(
    dottedRegression.glyphs
      .filter((glyph) => glyph.semanticRole === 'dot')
      .every((glyph) => !glyph.definition?.id.startsWith('canonical_contextual_')),
    'shaped dots keep their dot definition and never resolve as duplicate letter bodies'
  )

  const initialAfterBreak = setupEngine('دبت', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const initialBaa = initialAfterBreak.glyphs.find(
    (glyph) => glyph.baseChar === 'ب' && glyph.semanticRole === 'base'
  )
  assert(
    initialBaa?.glyphName === 'uni066E.init',
    'a letter after a joining break keeps its initial form'
  )

  const firstDot = separated.timeline.steps.find((step) => step.isDot)
  assert(firstDot?.transition?.kind !== 'bridge', 'dots never participate in body bridges')

  const longWord = setupEngine('عبدالله', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const sparseLiveScene = prepareRenderScene(longWord.glyphs, longWord.timeline, 'sparse-live', {
    stageWidth: 800,
    stageHeight: 380,
    showBaseline: false,
    strokeWeight: 80,
    centerVertically: true,
    stampSpacingScale: 3
  })
  const bodyBrushWidth = getBrushSquareGeometry(
    sparseLiveScene.strokes.find((stroke) => !stroke.isDot)!,
    0,
    sparseLiveScene.strokeWeight
  ).width
  const bodyBrush = getBrushSquareGeometry(
    sparseLiveScene.strokes.find((stroke) => !stroke.isDot)!,
    0,
    sparseLiveScene.strokeWeight
  )
  const dotBrush = getBrushSquareGeometry(
    sparseLiveScene.strokes.find((stroke) => stroke.isDot)!,
    0,
    sparseLiveScene.strokeWeight
  )
  assert(
    bodyBrush.width > 20 && bodyBrush.width < bodyBrush.height,
    'body brush is wider but not oversized'
  )
  assert(
    dotBrush.width / dotBrush.height === bodyBrush.width / bodyBrush.height,
    'dot brush keeps the canonical width ratio'
  )
  assert(
    sparseLiveScene.strokes
      .filter((stroke) => !stroke.isDot)
      .every((stroke) => stroke.spacing <= bodyBrushWidth),
    'sparse live stamps never leave gaps wider than the brush coverage'
  )
  assert(
    sparseLiveScene.connections.every((connection) => {
      const sourceStep = [...longWord.timeline.steps]
        .reverse()
        .find((step) => step.glyphIndex === connection.fromGlyphIndex && !step.isDot)
      return sourceStep?.endProgress === 1 || connection.mode === 'handoff-mask'
    }),
    'a clipped handoff uses a dedicated bridge mask instead of the completed outgoing mask'
  )
  assert(
    sparseLiveScene.connections.some((connection) => connection.mode === 'handoff-mask'),
    'connected clipped letters receive a localized handoff mask'
  )

  assert(
    sparseLiveScene.strokes.filter((stroke) => !stroke.isDot).every((stroke) => stroke.continuousMask),
    'every body stroke uses a brush-progress mask with no post-draw outline fill'
  )
  const firstBodyStep = longWord.timeline.steps.find((step) => !step.isDot)
  assert(firstBodyStep, 'long-word scene has a body stroke to verify progressive coverage')
  const progressiveFrame = renderSvgFrame(
    sparseLiveScene,
    firstBodyStep.startMs + (firstBodyStep.endMs - firstBodyStep.startMs) / 2
  )
  assert(
    progressiveFrame.includes('class="continuous-mask-path"'),
    'body coverage follows the travelled brush path continuously'
  )
  assert(
    progressiveFrame.includes('shadow-normalize') &&
      progressiveFrame.includes('class="ghost-outline" filter="url(#sparse-live-shadow-normalize)"') &&
      progressiveFrame.includes('filter="url(#sparse-live-shadow-normalize)"'),
    'shadow geometry uses the dedicated normalization filter'
  )
  assert(
    !progressiveFrame.includes('class="ink-outline" filter="url(#sparse-live-shadow-normalize)"'),
    'ink geometry remains unaffected by shadow normalization'
  )
  assert(
    !progressiveFrame.includes('glyph-completion-fill'),
    'no completed outline is injected ahead of the brush path'
  )
  const clippedHandoff = sparseLiveScene.connections.find(
    (connection) => connection.mode === 'handoff-mask'
  )
  assert(clippedHandoff, 'long-word scene has a clipped handoff connector')
  const clippedHandoffFrame = renderSvgFrame(
    sparseLiveScene,
    clippedHandoff.bridgeStartMs! +
      (clippedHandoff.bridgeEndMs! - clippedHandoff.bridgeStartMs!) / 2
  )
  assert(
    clippedHandoffFrame.includes('class="ink-connection-bridge"'),
    'bridge paints a dedicated rounded ink connector during handoff'
  )

  const tariq = setupEngine('طارق', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  assert(tariq.skippedGlyphs.length === 0, 'طارق has no skipped glyphs')
  assert(
    tariq.glyphs.every((glyph) => glyph.definition?.provenance !== 'unverified_fallback'),
    'طارق resolves the font bare uni066F final qaf without fallback geometry'
  )

  const frame = renderSvg(
    connected.glyphs,
    connected.timeline,
    connected.timeline.totalDurationMs,
    'continuity-test'
  )
  assert(frame.includes('<svg'), 'connected words still render a complete SVG frame')

  console.log('Cursive continuity checks passed.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
