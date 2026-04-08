import { useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import {
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import * as XLSX from 'xlsx'
import './App.css'

const X_DOMAIN = [-7, 7]
const Y_DOMAIN = [0, 36]
const X_TICKS = [-7, -3.5, 0, 3.5, 7]
const Y_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]
const SUB_QUADRANT_X = [-3.5, 3.5]
const SUB_QUADRANT_Y = [9, 27]
const CHART_MARGIN = { top: 36, right: 36, bottom: 28, left: 28 }
const LABEL_MAX_CHARS = 18
const POINT_RADIUS = 4.5
const LABEL_LINE_HEIGHT = 14
const LABEL_TEXT_PADDING_TOP = 2
const DEFAULT_ARROW_COLOR = '#333333'
const ARROW_OPACITY = 0.72
const ARROW_STROKE_WIDTH = 1.2
const ARROW_DASH = '5 5'
const LABEL_GAP = 18
const LEADER_STEP = 12
const LABEL_BOX_PADDING = 8
const TOP_LABEL_OFFSET = 8
const SHRUNK_POINT_RADIUS = 2.25
const LABEL_FONT_SIZE = 8.5
const DENSE_LABEL_FONT_SIZE = 8
const LEADER_LABEL_INSET_X = 5
const LEADER_LABEL_INSET_Y = 3
const LEADER_ELBOW_GAP = 6
const LABEL_MIN_GAP_X = 8
const LABEL_MIN_GAP_Y = 6
const MAX_LABEL_FREE_DISTANCE = 20
const LEADER_REQUIRED_DISTANCE = 3
const LABEL_STORAGE_KEY = 'quadrant-graph-label-offsets'
const DEFAULT_LABEL_STORAGE_KEY = 'quadrant-graph-default-label-offsets'
const DEFAULT_COLORS = [
  '#264653',
  '#2a9d8f',
  '#e76f51',
  '#f4a261',
  '#457b9d',
  '#8d5fd3',
  '#d62828',
  '#3a86ff',
]

const EMPTY_FORM = {
  name: '',
  x: '',
  y: '',
}

const EMPTY_ARROW_FORM = {
  fromId: '',
  toId: '',
}

const DEFAULT_POINT_ROWS = [
  ['반얀트리', -5.79, 35.42],
  ['포레스타 불광', -4.4, 15.05],
  ['페어필드', -5.51, 19.14],
  ['AC메리어트', -5.55, 19.29],
  ['소노캄 고양', -3.72, 23.44],
  ['토요코인 강남', -4.95, 26.25],
  ['토요코인 동대문', -4.98, 28],
  ['포포인츠', -5.75, 14.41],
  ['로카우스', -3.51, 20.49],
  ['더윈', -2.74, 12.25],
  ['클라움', -4.2, 10.85],
  ['라마다 남대문', -2.16, 6.65],
  ['밀레니엄', -3.92, 10.5],
  ['인나인', -2.6, 15.1],
  ['베이튼', -2.79, 7],
  ['블루오션', -1.58, 11.2],
  ['아비숑', -2.32, 10.5],
  ['오클라우드', -1.59, 12.25],
  ['홀리데이 인 홍대', -2.63, 11.55],
  ['그랜드 인터컨티넨탈', -2.1, 34.75],
  ['오크우드', -1.54, 13.37],
  ['워커힐', -2.02, 29.88],
  ['테이크', -3.49, 27.74],
  ['G1', -1.09, 10.15],
  ['G2', -2.17, 10.15],
  ['G3', -2.26, 15.05],
  ['밀리오레', -3.76, 19.25],
  ['에이든', -1.29, 10.46],
  ['페이토 강남', -2.11, 16.88],
  ['베르누이', -2.65, 9.81],
  ['안토', -0.22, 21.82],
  ['페이토 삼성', -1.92, 7.38],
  ['임피리얼 강남', 0.28, 27.73],
  ['아난티 앳 강남', -0.79, 21.62],
  ['보코', 1.33, 18.64],
  ['호텔 스타', 1.58, 13.3],
  ['호텔 스테이', 1.78, 13.3],
  ['드립앤드롭', 2.52, 16.15],
  ['에어스카이', 2.51, 10.5],
  ['인더시티 남산', 3.31, 14],
  ['인더시티 명동', 3.27, 14],
  ['더 플라자', 5.41, 20.38],
  ['서교타운', 7, 9.1],
]

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function createPoint(name, x, y, color) {
  return {
    id: crypto.randomUUID(),
    name,
    x,
    y,
    color,
  }
}

function createDefaultPoints() {
  return DEFAULT_POINT_ROWS.map(([name, x, y], index) =>
    createPoint(name, x, y, DEFAULT_COLORS[index % DEFAULT_COLORS.length]),
  )
}

function wrapLabelText(value) {
  const text = String(value ?? '').trim()

  if (!text) {
    return ['']
  }

  const words = text.split(/\s+/)
  const lines = []
  let currentLine = ''

  const pushChunkedWord = (word) => {
    for (let index = 0; index < word.length; index += LABEL_MAX_CHARS) {
      lines.push(word.slice(index, index + LABEL_MAX_CHARS))
    }
  }

  words.forEach((word) => {
    if (word.length > LABEL_MAX_CHARS) {
      if (currentLine) {
        lines.push(currentLine)
        currentLine = ''
      }
      pushChunkedWord(word)
      return
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word

    if (nextLine.length > LABEL_MAX_CHARS) {
      lines.push(currentLine)
      currentLine = word
      return
    }

    currentLine = nextLine
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines.length ? lines : [text]
}

function boxesOverlap(boxA, boxB) {
  return !(
    boxA.x + boxA.width < boxB.x ||
    boxB.x + boxB.width < boxA.x ||
    boxA.y + boxA.height < boxB.y ||
    boxB.y + boxB.height < boxA.y
  )
}

function boxOverlapsPoint(box, point) {
  const nearestX = clamp(point.x, box.x, box.x + box.width)
  const nearestY = clamp(point.y, box.y, box.y + box.height)
  const distance = Math.hypot(point.x - nearestX, point.y - nearestY)

  return distance <= POINT_RADIUS + 4
}

function buildBaseLabel(anchorX, anchorY, width, height) {
  const textX = anchorX
  const textY = anchorY - TOP_LABEL_OFFSET

  return {
    direction: 'top',
    box: {
      x: textX - width / 2,
      y: textY - LABEL_LINE_HEIGHT + LABEL_TEXT_PADDING_TOP,
      width,
      height,
    },
    textX,
    textY,
    requiresLeader: false,
    leader: null,
  }
}

function buildPlotMetrics(size) {
  const plotLeft = CHART_MARGIN.left
  const plotTop = CHART_MARGIN.top
  const plotRight = size.width - CHART_MARGIN.right
  const plotBottom = size.height - CHART_MARGIN.bottom
  const plotWidth = plotRight - plotLeft
  const plotHeight = plotBottom - plotTop

  return {
    plotLeft,
    plotTop,
    plotRight,
    plotBottom,
    plotWidth,
    plotHeight,
    toX(value) {
      return plotLeft + ((value - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0])) * plotWidth
    },
    toY(value) {
      return plotBottom - ((value - Y_DOMAIN[0]) / (Y_DOMAIN[1] - Y_DOMAIN[0])) * plotHeight
    },
  }
}

function buildPointScreenMap(points, size) {
  if (!size.width || !size.height) {
    return {}
  }

  const metrics = buildPlotMetrics(size)

  return Object.fromEntries(
    points.map((point) => [
      point.id,
      {
        ...point,
        screenX: clamp(metrics.toX(point.x), metrics.plotLeft, metrics.plotRight),
        screenY: clamp(metrics.toY(point.y), metrics.plotTop, metrics.plotBottom),
      },
    ]),
  )
}

function circleOverlapArea(radiusA, radiusB, distance) {
  if (distance >= radiusA + radiusB) {
    return 0
  }

  if (distance <= Math.abs(radiusA - radiusB)) {
    const minRadius = Math.min(radiusA, radiusB)
    return Math.PI * minRadius * minRadius
  }

  const radiusASquared = radiusA * radiusA
  const radiusBSquared = radiusB * radiusB

  const alpha = Math.acos(
    clamp((distance * distance + radiusASquared - radiusBSquared) / (2 * distance * radiusA), -1, 1),
  )
  const beta = Math.acos(
    clamp((distance * distance + radiusBSquared - radiusASquared) / (2 * distance * radiusB), -1, 1),
  )

  return (
    radiusASquared * alpha +
    radiusBSquared * beta -
    0.5 *
      Math.sqrt(
        Math.max(
          0,
          (-distance + radiusA + radiusB) *
            (distance + radiusA - radiusB) *
            (distance - radiusA + radiusB) *
            (distance + radiusA + radiusB),
        ),
      )
  )
}

function buildPointRadiusMap(points, pointScreenMap) {
  const radiusMap = Object.fromEntries(points.map((point) => [point.id, POINT_RADIUS]))

  for (let frontIndex = 0; frontIndex < points.length; frontIndex += 1) {
    const frontPoint = points[frontIndex]
    const frontCoords = pointScreenMap[frontPoint.id]

    if (!frontCoords) {
      continue
    }

    for (let backIndex = 0; backIndex < frontIndex; backIndex += 1) {
      const backPoint = points[backIndex]
      const backCoords = pointScreenMap[backPoint.id]

      if (!backCoords) {
        continue
      }

      const distance = Math.hypot(
        frontCoords.screenX - backCoords.screenX,
        frontCoords.screenY - backCoords.screenY,
      )
      const overlapArea = circleOverlapArea(
        radiusMap[frontPoint.id],
        radiusMap[backPoint.id],
        distance,
      )
      const frontArea = Math.PI * radiusMap[frontPoint.id] * radiusMap[frontPoint.id]

      if (frontArea > 0 && overlapArea / frontArea >= 0.5) {
        radiusMap[frontPoint.id] = SHRUNK_POINT_RADIUS
        break
      }
    }
  }

  return radiusMap
}

function estimateLabelBox(lines, centerX, topY) {
  return estimateLabelBoxWithFont(lines, centerX, topY, LABEL_FONT_SIZE)
}

function estimateLabelBoxWithFont(lines, centerX, topY, fontSize) {
  const maxVisualLength = Math.max(
    ...lines.map((line) =>
      Array.from(line).reduce((total, character) => {
        const code = character.charCodeAt(0)
        const isWideCharacter =
          (code >= 0x1100 && code <= 0x11ff) ||
          (code >= 0x2e80 && code <= 0xa4cf) ||
          (code >= 0xac00 && code <= 0xd7a3) ||
          (code >= 0xf900 && code <= 0xfaff) ||
          (code >= 0xff01 && code <= 0xff60) ||
          (code >= 0xffe0 && code <= 0xffe6)

        return total + (isWideCharacter ? 1.05 : 0.58)
      }, 0),
    ),
    1,
  )
  const width = maxVisualLength * fontSize + LABEL_BOX_PADDING * 2
  const height = lines.length * LABEL_LINE_HEIGHT + LABEL_BOX_PADDING

  return {
    x: centerX - width / 2,
    y: topY,
    width,
    height,
  }
}

function expandBox(box, gapX = LABEL_MIN_GAP_X, gapY = LABEL_MIN_GAP_Y) {
  return {
    x: box.x - gapX / 2,
    y: box.y - gapY / 2,
    width: box.width + gapX,
    height: box.height + gapY,
  }
}

function boxWithinChart(box, size) {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= size.width &&
    box.y + box.height <= size.height
  )
}

function boxOverlapsGuideLines(box, guideLines) {
  return (
    guideLines.vertical.some((x) => x >= box.x - 4 && x <= box.x + box.width + 4) ||
    guideLines.horizontal.some((y) => y >= box.y - 4 && y <= box.y + box.height + 4)
  )
}

function getRectAnchor(point, box) {
  const targetBox = {
    x: box.x + LEADER_LABEL_INSET_X,
    y: box.y + LEADER_LABEL_INSET_Y,
    width: Math.max(box.width - LEADER_LABEL_INSET_X * 2, 1),
    height: Math.max(box.height - LEADER_LABEL_INSET_Y * 2, 1),
  }
  const centerX = targetBox.x + targetBox.width / 2
  const centerY = targetBox.y + targetBox.height / 2
  const dx = point.x - centerX
  const dy = point.y - centerY
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  if (absX / targetBox.width > absY / targetBox.height) {
    return {
      x: dx < 0 ? targetBox.x : targetBox.x + targetBox.width,
      y: clamp(point.y, targetBox.y + 2, targetBox.y + targetBox.height - 2),
    }
  }

  return {
    x: clamp(point.x, targetBox.x + 2, targetBox.x + targetBox.width - 2),
    y: dy < 0 ? targetBox.y : targetBox.y + targetBox.height,
  }
}

function buildLeaderLine(point, radius, boxAnchor) {
  const dx = boxAnchor.x - point.x
  const dy = boxAnchor.y - point.y
  const length = Math.hypot(dx, dy) || 1
  const unitX = dx / length
  const unitY = dy / length
  const start = {
    x: point.x,
    y: point.y,
  }
  const elbow = Math.abs(dx) > Math.abs(dy)
    ? { x: boxAnchor.x - unitX * LEADER_ELBOW_GAP, y: start.y }
    : { x: start.x, y: boxAnchor.y - unitY * LEADER_ELBOW_GAP }

  return { start, elbow, end: boxAnchor }
}

function getCandidateDistance(point, candidate) {
  const anchorX =
    candidate.anchor === 'start'
      ? candidate.box.x
      : candidate.anchor === 'end'
        ? candidate.box.x + candidate.box.width
        : candidate.centerX
  const anchorY = candidate.topY + Math.min(candidate.box.height / 2, LABEL_LINE_HEIGHT)

  return Math.hypot(anchorX - point.x, anchorY - point.y)
}

function getQuadrant(point) {
  if (point.x >= 0 && point.y >= 18) {
    return 1
  }

  if (point.x < 0 && point.y >= 18) {
    return 2
  }

  if (point.x < 0 && point.y < 18) {
    return 3
  }

  return 4
}

function getDenseNeighborCount(point, pointScreenMap, points) {
  const coords = pointScreenMap[point.id]

  if (!coords) {
    return 0
  }

  return points.filter((other) => {
    if (other.id === point.id || getQuadrant(other) !== 3) {
      return false
    }

    const otherCoords = pointScreenMap[other.id]

    if (!otherCoords) {
      return false
    }

    return (
      Math.abs(otherCoords.screenX - coords.screenX) <= 90 &&
      Math.abs(otherCoords.screenY - coords.screenY) <= 70
    )
  }).length
}

function getLabelCandidates(point, coords, radius, lines, fontSize) {
  const baseTopY = coords.screenY - radius - TOP_LABEL_OFFSET - LABEL_LINE_HEIGHT
  const sideOffset = 18
  const lowerOffset = 16

  const topCandidate = {
    centerX: coords.screenX,
    topY: baseTopY,
    anchor: 'middle',
    requiresLeader: false,
  }

  return [
    topCandidate,
    {
      centerX: coords.screenX + sideOffset,
      topY: coords.screenY - LABEL_LINE_HEIGHT / 2,
      anchor: 'start',
      requiresLeader: false,
    },
    {
      centerX: coords.screenX - sideOffset,
      topY: coords.screenY - LABEL_LINE_HEIGHT / 2,
      anchor: 'end',
      requiresLeader: false,
    },
    {
      centerX: coords.screenX,
      topY: coords.screenY + lowerOffset,
      anchor: 'middle',
      requiresLeader: false,
    },
  ]
}

function buildGuideLines(chartSize, showSecondaryQuadrants) {
  if (!chartSize.width || !chartSize.height) {
    return { vertical: [], horizontal: [] }
  }

  const metrics = buildPlotMetrics(chartSize)

  return {
    vertical: [
      metrics.toX(0),
      ...(showSecondaryQuadrants ? SUB_QUADRANT_X.map((value) => metrics.toX(value)) : []),
    ],
    horizontal: [
      metrics.toY(18),
      ...(showSecondaryQuadrants ? SUB_QUADRANT_Y.map((value) => metrics.toY(value)) : []),
    ],
  }
}

function buildLabelLayouts(points, pointScreenMap, radiusMap, labelOffsets) {
  return points
    .map((point) => {
      const coords = pointScreenMap[point.id]

      if (!coords) {
        return null
      }

      const lines = wrapLabelText(point.name)
      const fontSize = LABEL_FONT_SIZE
      const offsetX = labelOffsets[point.id]?.x ?? 0
      const offsetY = labelOffsets[point.id]?.y ?? 0
      const textX = coords.screenX + offsetX
      const textY = coords.screenY - TOP_LABEL_OFFSET + offsetY
      const box = estimateLabelBoxWithFont(
        lines,
        textX,
        textY - LABEL_LINE_HEIGHT + LABEL_TEXT_PADDING_TOP,
        fontSize,
      )
      const offsetDistance = Math.hypot(offsetX, offsetY)
      const boxAnchor = getRectAnchor(
        { x: coords.screenX, y: coords.screenY },
        box,
      )
      const leader = buildLeaderLine(
        { x: coords.screenX, y: coords.screenY },
        radiusMap[point.id] ?? POINT_RADIUS,
        boxAnchor,
      )

      return {
        id: point.id,
        color: '#000000',
        lines,
        box,
        textX,
        textY,
        textAnchor: 'middle',
        fontSize,
        requiresLeader:
          Math.abs(offsetX) > LEADER_REQUIRED_DISTANCE || Math.abs(offsetY) > LEADER_REQUIRED_DISTANCE,
        leader,
        offsetX,
        offsetY,
      }
    })
    .filter(Boolean)
}

function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  )
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  }

  return Math.hypot(point.x - projection.x, point.y - projection.y)
}

function pointInsideRect(point, rect, padding = 0) {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  )
}

function bezierPoint(start, control, end, t) {
  const inverse = 1 - t

  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  }
}

function getArrowAnchorPoints(start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const unitX = dx / length
  const unitY = dy / length
  const offset = POINT_RADIUS + 2

  return {
    startAnchor: {
      x: start.x + unitX * offset,
      y: start.y + unitY * offset,
    },
    endAnchor: {
      x: end.x - unitX * offset,
      y: end.y - unitY * offset,
    },
    dx,
    dy,
    length,
    unitX,
    unitY,
  }
}

function segmentHitsObstacles(start, end, obstacles) {
  return obstacles.some((obstacle) => {
    if (obstacle.type === 'point') {
      return distancePointToSegment(obstacle.center, start, end) <= obstacle.radius
    }

    if (obstacle.type === 'rect') {
      const samples = 28

      for (let step = 0; step <= samples; step += 1) {
        const t = step / samples
        const sample = {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        }

        if (pointInsideRect(sample, obstacle.rect, obstacle.padding)) {
          return true
        }
      }

      return false
    }

    if (obstacle.type === 'line') {
      const samples = 28

      for (let step = 0; step <= samples; step += 1) {
        const t = step / samples
        const sample = {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        }

        if (
          distancePointToSegment(sample, obstacle.start, obstacle.end) <= obstacle.thickness
        ) {
          return true
        }
      }

      return false
    }

    return false
  })
}

function curveHitsObstacles(start, control, end, obstacles) {
  return obstacles.some((obstacle) => {
    const samples = 40

    for (let step = 0; step <= samples; step += 1) {
      const point = bezierPoint(start, control, end, step / samples)

      if (obstacle.type === 'point') {
        if (Math.hypot(point.x - obstacle.center.x, point.y - obstacle.center.y) <= obstacle.radius) {
          return true
        }
      }

      if (obstacle.type === 'rect' && pointInsideRect(point, obstacle.rect, obstacle.padding)) {
        return true
      }

      if (
        obstacle.type === 'line' &&
        distancePointToSegment(point, obstacle.start, obstacle.end) <= obstacle.thickness
      ) {
        return true
      }
    }

    return false
  })
}

function buildArrowLayouts(connections, pointScreenMap) {
  const pointEntries = Object.values(pointScreenMap)

  return connections
    .map((connection) => {
      const start = pointScreenMap[connection.fromId]
      const end = pointScreenMap[connection.toId]

      if (!start || !end) {
        return null
      }

      const obstacles = []

      pointEntries.forEach((point) => {
        if (point.id === start.id || point.id === end.id) {
          return
        }

        obstacles.push({
          type: 'point',
          center: { x: point.screenX, y: point.screenY },
          radius: POINT_RADIUS + 8,
        })
      })

      const centerStart = { x: start.screenX, y: start.screenY }
      const centerEnd = { x: end.screenX, y: end.screenY }
      const anchorGeometry = getArrowAnchorPoints(centerStart, centerEnd)
      const straightStart = anchorGeometry.startAnchor
      const straightEnd = anchorGeometry.endAnchor
      const useCurve = segmentHitsObstacles(straightStart, straightEnd, obstacles)
      const normal = { x: -anchorGeometry.unitY, y: anchorGeometry.unitX }
      const curveOffset = Math.min(Math.max(anchorGeometry.length * 0.18, 36), 74)

      let path = `M ${straightStart.x} ${straightStart.y} L ${straightEnd.x} ${straightEnd.y}`

      if (useCurve) {
        const controlCandidates = [1, -1].map((direction) => ({
          x: (straightStart.x + straightEnd.x) / 2 + normal.x * curveOffset * direction,
          y: (straightStart.y + straightEnd.y) / 2 + normal.y * curveOffset * direction,
        }))

        const selectedControl =
          controlCandidates.find(
            (candidate) => !curveHitsObstacles(straightStart, candidate, straightEnd, obstacles),
          ) ?? controlCandidates[0]

        path = `M ${straightStart.x} ${straightStart.y} Q ${selectedControl.x} ${selectedControl.y} ${straightEnd.x} ${straightEnd.y}`
      }

      return {
        ...connection,
        fromName: start.name,
        toName: end.name,
        path,
        color: connection.color ?? DEFAULT_ARROW_COLOR,
        startCenter: centerStart,
        endCenter: centerEnd,
        startAnchor: straightStart,
        endAnchor: straightEnd,
      }
    })
    .filter(Boolean)
}

function PointShape(props) {
  const { cx, cy, payload, onPointRender, radius = POINT_RADIUS } = props

  useEffect(() => {
    if (typeof cx === 'number' && typeof cy === 'number' && onPointRender) {
      onPointRender(payload.id, cx, cy)
    }
  }, [cx, cy, onPointRender, payload.id])

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={payload.color}
        stroke="#ffffff"
        strokeWidth="1.5"
      />
    </g>
  )
}

function App() {
  const chartRef = useRef(null)
  const chartWrapRef = useRef(null)
  const chartSizeRef = useRef({ width: 0, height: 0 })
  const dragStateRef = useRef(null)
  const activeLabelRef = useRef(null)
  const [points, setPoints] = useState(createDefaultPoints)
  const [connections, setConnections] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [arrowForm, setArrowForm] = useState(EMPTY_ARROW_FORM)
  const [showSecondaryQuadrants, setShowSecondaryQuadrants] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 })
  const [renderedPointMap, setRenderedPointMap] = useState({})
  const [labelOffsets, setLabelOffsets] = useState({})
  const [defaultLabelOffsets, setDefaultLabelOffsets] = useState({})
  const [dragState, setDragState] = useState(null)
  const [activeLabelId, setActiveLabelId] = useState(null)
  const [debugLabelEvent, setDebugLabelEvent] = useState('idle')

  useEffect(() => {
    try {
      const storedDefaults = window.localStorage.getItem(DEFAULT_LABEL_STORAGE_KEY)
      const parsedDefaults = storedDefaults ? JSON.parse(storedDefaults) : {}
      const stored = window.localStorage.getItem(LABEL_STORAGE_KEY)

      setDefaultLabelOffsets(parsedDefaults)
      setLabelOffsets(stored ? JSON.parse(stored) : parsedDefaults)
    } catch {
      // Ignore local storage issues.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(labelOffsets))
    } catch {
      // Ignore local storage issues.
    }
  }, [labelOffsets])

  useEffect(() => {
    try {
      window.localStorage.setItem(DEFAULT_LABEL_STORAGE_KEY, JSON.stringify(defaultLabelOffsets))
    } catch {
      // Ignore local storage issues.
    }
  }, [defaultLabelOffsets])

  useEffect(() => {
    if (!chartWrapRef.current) {
      return undefined
    }

    const element = chartWrapRef.current
    const updateSize = () => {
      setChartSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    }

    updateSize()

    const observer = new ResizeObserver(() => {
      updateSize()
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    chartSizeRef.current = chartSize
  }, [chartSize])

  useEffect(() => {
    setConnections((current) =>
      current.filter(
        (connection) =>
          points.some((point) => point.id === connection.fromId) &&
          points.some((point) => point.id === connection.toId),
      ),
    )
    setArrowForm((current) => ({
      fromId: points.some((point) => point.id === current.fromId) ? current.fromId : '',
      toId: points.some((point) => point.id === current.toId) ? current.toId : '',
    }))
  }, [points])

  useEffect(() => {
    setRenderedPointMap({})
  }, [points])

  useEffect(() => {
    setLabelOffsets((current) => {
      const validIds = new Set(points.map((point) => point.id))
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => validIds.has(id)),
      )

      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
    setDefaultLabelOffsets((current) => {
      const validIds = new Set(points.map((point) => point.id))
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => validIds.has(id)),
      )

      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [points])

  const pointScreenMap = useMemo(
    () => {
      const manualPointMap = buildPointScreenMap(points, chartSize)

      return Object.fromEntries(
        points.map((point) => {
          const rendered = renderedPointMap[point.id]
          const fallback = manualPointMap[point.id]

          if (!rendered && !fallback) {
            return [point.id, null]
          }

          return [
            point.id,
            {
              ...point,
              screenX: rendered?.x ?? fallback.screenX,
              screenY: rendered?.y ?? fallback.screenY,
            },
          ]
        }),
      )
    },
    [points, renderedPointMap, chartSize, labelOffsets],
  )

  const pointRadiusMap = useMemo(
    () => buildPointRadiusMap(points, pointScreenMap),
    [points, pointScreenMap],
  )

  const labelLayouts = useMemo(
    () => buildLabelLayouts(points, pointScreenMap, pointRadiusMap, labelOffsets),
    [points, pointScreenMap, pointRadiusMap, labelOffsets],
  )

  const arrowLayouts = useMemo(
    () => buildArrowLayouts(connections, pointScreenMap),
    [connections, pointScreenMap],
  )

  const handlePointRender = (id, x, y) => {
    setRenderedPointMap((current) => {
      const previous = current[id]

      if (previous && previous.x === x && previous.y === y) {
        return current
      }

      return {
        ...current,
        [id]: { x, y },
      }
    })
  }

  const toChartCoordinates = (clientX, clientY) => {
    const currentChartSize = chartSizeRef.current

    if (!chartWrapRef.current || !currentChartSize.width || !currentChartSize.height) {
      return null
    }

    const rect = chartWrapRef.current.getBoundingClientRect()
    const scaleX = currentChartSize.width / rect.width
    const scaleY = currentChartSize.height / rect.height

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const handleLabelMouseDown = (event, pointId) => {
    setDebugLabelEvent(`mousedown:${pointId}`)

    if (activeLabelRef.current !== pointId) {
      setDebugLabelEvent(`mousedown-blocked:${pointId}`)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (event.button !== 0) {
      return
    }

    const pointer = toChartCoordinates(event.clientX, event.clientY)
    const currentOffset = labelOffsets[pointId] ?? { x: 0, y: 0 }

    if (!pointer) {
      setDebugLabelEvent(`mousedown-no-pointer:${pointId}`)
      return
    }

    const nextDragState = {
      pointId,
      pointerStartX: pointer.x,
      pointerStartY: pointer.y,
      initialOffsetX: currentOffset.x,
      initialOffsetY: currentOffset.y,
    }

    dragStateRef.current = nextDragState
    setDebugLabelEvent(`drag-start:${pointId}`)
    setDragState(nextDragState)

  }

  const handleLabelActivate = (event, pointId) => {
    event.preventDefault()
    event.stopPropagation()
    setDebugLabelEvent(`dblclick:${pointId}`)
    if (activeLabelRef.current === pointId) {
      handleResetLabel(pointId)
      activeLabelRef.current = null
      setActiveLabelId(null)
      setDebugLabelEvent(`dblclick-reset:${pointId}`)
      return
    }

    activeLabelRef.current = pointId
    setActiveLabelId(pointId)
    setDebugLabelEvent(`active:${pointId}`)
  }

  const handleChartMouseMove = (event) => {
    const currentDragState = dragStateRef.current

    if (!currentDragState) {
      return
    }

    const pointer = toChartCoordinates(event.clientX, event.clientY)

    if (!pointer) {
      setDebugLabelEvent(`drag-no-pointer:${currentDragState.pointId}`)
      return
    }

    setDebugLabelEvent(`dragging:${currentDragState.pointId}`)
    setLabelOffsets((current) => ({
      ...current,
      [currentDragState.pointId]: {
        x: currentDragState.initialOffsetX + (pointer.x - currentDragState.pointerStartX),
        y: currentDragState.initialOffsetY + (pointer.y - currentDragState.pointerStartY),
      },
    }))
  }

  const handleChartMouseUp = () => {
    const currentDragState = dragStateRef.current

    if (currentDragState) {
      setDebugLabelEvent(`drag-end:${currentDragState.pointId}`)
    }

    dragStateRef.current = null
    setDragState(null)
  }

  const handleChartMouseDown = (event) => {
    const labelElement = event.target instanceof Element
      ? event.target.closest('[data-label-id]')
      : null

    if (!labelElement && !dragStateRef.current) {
      activeLabelRef.current = null
      setActiveLabelId(null)
      setDebugLabelEvent('active-cleared')
    }
  }

  const handleResetLabel = (pointId) => {
    if (activeLabelRef.current === pointId) {
      activeLabelRef.current = null
    }

    setLabelOffsets((current) => {
      if (!current[pointId]) {
        return current
      }

      const next = { ...current }
      delete next[pointId]
      return next
    })
  }

  const handleResetAllLabels = () => {
    activeLabelRef.current = null
    setActiveLabelId(null)
    setLabelOffsets(defaultLabelOffsets)
  }

  const handleSaveCurrentLabelsAsDefault = () => {
    setDefaultLabelOffsets(labelOffsets)
    setErrorMessage('현재 라벨 위치를 기본값으로 저장했습니다.')
  }

  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleArrowFormChange = (event) => {
    const { name, value } = event.target

    setArrowForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const nextPoint = createPoint(
      form.name.trim(),
      Number(form.x),
      Number(form.y),
      DEFAULT_COLORS[points.length % DEFAULT_COLORS.length],
    )

    if (!nextPoint.name || Number.isNaN(nextPoint.x) || Number.isNaN(nextPoint.y)) {
      setErrorMessage('유효한 호텔명, x, y를 입력해 주세요.')
      return
    }

    setPoints((current) => [...current, nextPoint])
    setForm(EMPTY_FORM)
    setErrorMessage('')
  }

  const handleDeletePoint = (id) => {
    setPoints((current) => current.filter((point) => point.id !== id))
  }

  const handleResetDefaultPoints = () => {
    activeLabelRef.current = null
    dragStateRef.current = null
    setPoints(createDefaultPoints())
    setConnections([])
    setArrowForm(EMPTY_ARROW_FORM)
    setLabelOffsets(defaultLabelOffsets)
    setActiveLabelId(null)
    setDragState(null)
    setErrorMessage('')
    setDebugLabelEvent('defaults-restored')
  }

  const handlePointColorChange = (id, color) => {
    setPoints((current) =>
      current.map((point) => (point.id === id ? { ...point, color } : point)),
    )
  }

  const handleAddArrow = (event) => {
    event.preventDefault()

    if (!arrowForm.fromId || !arrowForm.toId || arrowForm.fromId === arrowForm.toId) {
      setErrorMessage('시작점과 끝점을 올바르게 선택해 주세요.')
      return
    }

    const duplicate = connections.some(
      (connection) =>
        connection.fromId === arrowForm.fromId && connection.toId === arrowForm.toId,
    )

    if (duplicate) {
      setErrorMessage('같은 화살표가 이미 존재합니다.')
      return
    }

    setConnections((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        fromId: arrowForm.fromId,
        toId: arrowForm.toId,
        color: DEFAULT_ARROW_COLOR,
      },
    ])
    setArrowForm(EMPTY_ARROW_FORM)
    setErrorMessage('')
  }

  const handleDeleteArrow = (id) => {
    setConnections((current) => current.filter((connection) => connection.id !== id))
  }

  const handleDownload = async () => {
    if (!chartRef.current) {
      return
    }

    try {
      const dataUrl = await toPng(chartRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 3,
      })
      const link = document.createElement('a')
      link.download = 'quadrant-graph.png'
      link.href = dataUrl
      link.click()
      setErrorMessage('')
    } catch {
      setErrorMessage('PNG 다운로드에 실패했습니다.')
    }
  }

  const handleFileUpload = async (event) => {
    const [file] = event.target.files ?? []

    if (!file) {
      return
    }

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]

      if (!firstSheet) {
        throw new Error('no-sheet')
      }

      const rows = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        raw: true,
      })

      const nextPoints = rows
        .slice(1)
        .map((row, index) => {
          const name = String(row[0] ?? '').trim()
          const x = Number(row[1])
          const y = Number(row[2])

          if (!name || Number.isNaN(x) || Number.isNaN(y)) {
            return null
          }

          return createPoint(
            name,
            x,
            y,
            DEFAULT_COLORS[index % DEFAULT_COLORS.length],
          )
        })
        .filter(Boolean)

      if (!nextPoints.length) {
        throw new Error('no-valid-rows')
      }

      setPoints(nextPoints)
      setErrorMessage('')
    } catch {
      setErrorMessage('엑셀 업로드에 실패했습니다.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="chart-panel" ref={chartRef}>
          <div
            className="chart-wrap"
            ref={chartWrapRef}
            onMouseMove={handleChartMouseMove}
            onMouseUp={handleChartMouseUp}
            onMouseLeave={handleChartMouseUp}
            onMouseDown={handleChartMouseDown}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={CHART_MARGIN}>
                <XAxis
                  type="number"
                  dataKey="x"
                  name="x"
                  domain={X_DOMAIN}
                  ticks={X_TICKS}
                  padding={{ left: 0, right: 0 }}
                  scale="linear"
                  allowDataOverflow
                  tick={false}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="y"
                  domain={Y_DOMAIN}
                  ticks={Y_TICKS}
                  padding={{ top: 0, bottom: 0 }}
                  scale="linear"
                  allowDataOverflow
                  tick={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={false}
                  formatter={(value, name) => [value, String(name).toUpperCase()]}
                />
                {showSecondaryQuadrants &&
                  SUB_QUADRANT_X.map((value) => (
                    <ReferenceLine
                      key={`x-${value}`}
                      x={value}
                      stroke="#b8c0c7"
                      strokeOpacity={0.42}
                      strokeDasharray="12 10"
                      strokeWidth={1}
                    />
                  ))}
                {showSecondaryQuadrants &&
                  SUB_QUADRANT_Y.map((value) => (
                    <ReferenceLine
                      key={`y-${value}`}
                      y={value}
                      stroke="#b8c0c7"
                      strokeOpacity={0.42}
                      strokeDasharray="12 10"
                      strokeWidth={1}
                    />
                  ))}
                <ReferenceLine x={0} stroke="#000000" strokeWidth={2} />
                <ReferenceLine y={18} stroke="#000000" strokeWidth={2} />
                <Scatter
                  data={points}
                  shape={(props) => (
                    <PointShape
                      {...props}
                      radius={pointRadiusMap[props.payload.id] ?? POINT_RADIUS}
                      onPointRender={handlePointRender}
                    />
                  )}
                  isAnimationActive={false}
                />
              </ScatterChart>
            </ResponsiveContainer>

            <svg
              className="label-overlay"
              width="100%"
              height="100%"
              viewBox={`0 0 ${chartSize.width} ${chartSize.height}`}
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5.2"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M 0 0 L 6 3 L 0 6 z" fill="context-stroke" />
                </marker>
              </defs>

              {arrowLayouts.map((arrow) => (
                <path
                  key={arrow.id}
                  d={arrow.path}
                  className="arrow-path"
                  fill="none"
                  stroke={arrow.color}
                  strokeWidth={ARROW_STROKE_WIDTH}
                  strokeDasharray={ARROW_DASH}
                  opacity={ARROW_OPACITY}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd="url(#arrowhead)"
                />
              ))}

              {labelLayouts
                .filter((layout) => layout.requiresLeader && layout.leader)
                .map((layout) => (
                  <polyline
                    key={`leader-${layout.id}`}
                    className="label-leader"
                    points={`${layout.leader.start.x},${layout.leader.start.y} ${layout.leader.elbow.x},${layout.leader.elbow.y} ${layout.leader.end.x},${layout.leader.end.y}`}
                    fill="none"
                    stroke="rgba(31, 41, 51, 0.5)"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}

            </svg>

            <div className="html-label-layer">
              {labelLayouts.map((layout) => (
                <div
                  key={`label-${layout.id}`}
                  className="html-label"
                  data-label-id={layout.id}
                  data-active={activeLabelId === layout.id ? 'true' : 'false'}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onMouseDown={(event) => handleLabelMouseDown(event, layout.id)}
                  onDoubleClick={(event) => handleLabelActivate(event, layout.id)}
                  style={{
                    left: `${layout.textX}px`,
                    top: `${layout.textY}px`,
                    fontSize: `${layout.fontSize}px`,
                  }}
                >
                  {layout.lines.join('\n')}
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="sidebar">
          <form className="entry-form" onSubmit={handleSubmit}>
            <label>
              호텔명
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="예: Delta Hotel"
              />
            </label>

            <label>
              단가 점수
              <input
                name="x"
                type="number"
                step="any"
                value={form.x}
                onChange={handleChange}
                placeholder="0"
              />
            </label>

            <label>
              운영 난이도
              <input
                name="y"
                type="number"
                step="any"
                value={form.y}
                onChange={handleChange}
                placeholder="18"
              />
            </label>

            <label className="toggle-field">
              <input
                type="checkbox"
                checked={showSecondaryQuadrants}
                onChange={(event) => setShowSecondaryQuadrants(event.target.checked)}
              />
              <span>2차 사분면 표시</span>
            </label>

            <button type="submit">점 추가</button>
            <button type="button" className="secondary-button" onClick={handleDownload}>
              그래프 이미지 다운로드
            </button>
            <button type="button" className="secondary-button" onClick={handleResetDefaultPoints}>
              초기 데이터 복원
            </button>
            <button type="button" className="secondary-button" onClick={handleSaveCurrentLabelsAsDefault}>
              현재 라벨 위치 기본값 저장
            </button>
            <button type="button" className="secondary-button" onClick={handleResetAllLabels}>
              라벨 위치 초기화
            </button>
            <label className="file-field">
              <span>엑셀 업로드</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
            </label>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
            <p className="error-text">label-debug: {debugLabelEvent}</p>
          </form>

          <section className="arrow-form-card">
            <form className="arrow-form" onSubmit={handleAddArrow}>
              <label>
                시작점
                <select name="fromId" value={arrowForm.fromId} onChange={handleArrowFormChange}>
                  <option value="">선택</option>
                  {points.map((point) => (
                    <option key={`from-${point.id}`} value={point.id}>
                      {point.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                끝점
                <select name="toId" value={arrowForm.toId} onChange={handleArrowFormChange}>
                  <option value="">선택</option>
                  {points.map((point) => (
                    <option key={`to-${point.id}`} value={point.id}>
                      {point.name}
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit" className="secondary-button">
                화살표 추가
              </button>
            </form>
          </section>

          <section className="point-list">
            <ul>
              {points.map((point) => (
                <li key={point.id}>
                  <div className="point-meta">
                    <strong>{point.name}</strong>
                    <span>
                      x: {point.x}, y: {point.y}
                    </span>
                  </div>
                  <div className="point-actions">
                    <input
                      type="color"
                      value={point.color}
                      className="color-picker"
                      onChange={(event) => handlePointColorChange(point.id, event.target.value)}
                      aria-label={`${point.name} color`}
                    />
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => handleDeletePoint(point.id)}
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="arrow-list">
            <ul>
              {arrowLayouts.map((arrow) => (
                <li key={arrow.id}>
                  <span>
                    {arrow.fromName} → {arrow.toName}
                  </span>
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => handleDeleteArrow(arrow.id)}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </section>
    </main>
  )
}

export default App
