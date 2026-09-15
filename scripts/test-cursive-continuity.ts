import assert from 'node:assert'
import { svgPathProperties } from 'svg-path-properties'
import { initHarfBuzz } from '../src/renderer/src/engine/shaping/harfbuzz'
import { prepareRenderScene, renderSvgFrame, setupEngine, renderSvg } from '../src/renderer/src/engine'

function bodySteps(setup: ReturnType<typeof setupEngine>): ReturnType<typeof setupEngine>['timeline']['steps'] {
  return setup.timeline.steps.filter((step) => !step.isDot)
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
  assert(nextMaskStart >= 0 && nextMaskEnd > nextMaskStart, 'next body mask is rendered during handoff')
  assert(
    handoffFrame.slice(nextMaskStart, nextMaskEnd).includes('<rect'),
    'bridge exposes the next body handoff brush stamp'
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

  const detached = setupEngine('أبجد', {
    allowUnverifiedFallback: true,
    connectGlyphs: true
  })
  const detachedBodies = bodySteps(detached)
  assert(detachedBodies[1].transition?.kind === 'lift', 'non-joining boundary remains lifted')

  const firstDot = separated.timeline.steps.find((step) => step.isDot)
  assert(firstDot?.transition?.kind !== 'bridge', 'dots never participate in body bridges')

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
