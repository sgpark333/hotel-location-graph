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
import defaultGraphStateData from './defaultGraphState.json'
import './App.css'

const X_DOMAIN = [-7.2, 7.2]
const Y_DOMAIN = [0, 36]
const X_TICKS = [-7.2, -3.6, 0, 3.6, 7.2]
const Y_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]
const SUB_QUADRANT_X = [-3.5, 3.5]
const SUB_QUADRANT_Y = [9, 27]
const CHART_MARGIN = { top: 18, right: 8, bottom: -6, left: -48 }
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
const DEFAULT_GRAPH_STATE_KEY = 'quadrant-graph-default-state-v7'
const SAVED_GRAPHS_KEY = 'quadrant-graph-saved-states'
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
const DEFAULT_QUADRANT_VISIBILITY = {
  1: true,
  2: true,
  3: true,
  4: true,
}
const CONNECTION_GROUP_COLORS = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#7c3aed',
  '#0f766e',
  '#ca8a04',
  '#db2777',
  '#4f46e5',
  '#059669',
  '#0891b2',
  '#84cc16',
  '#475569',
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

const SORT_OPTIONS = {
  nameAsc: 'nameAsc',
  nameDesc: 'nameDesc',
  quadrantAsc: 'quadrantAsc',
  quadrantDesc: 'quadrantDesc',
}
const TAB_OPTIONS = {
  dashboard: 'dashboard',
  analyze: 'analyze',
}
const DEFAULT_GRAPH_STATE = defaultGraphStateData.state

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

function createDefaultGraphState() {
  return cloneGraphState(DEFAULT_GRAPH_STATE)
}

function cloneGraphState(state) {
  return JSON.parse(JSON.stringify(state))
}

function normalizeGraphState(state) {
  const fallback = createDefaultGraphState()

  if (!state || typeof state !== 'object') {
    return fallback
  }

  const points = Array.isArray(state.points)
    ? state.points
        .map((point, index) => {
          const name = String(point?.name ?? '').trim()
          const x = Number(point?.x)
          const y = Number(point?.y)

          if (!name || Number.isNaN(x) || Number.isNaN(y)) {
            return null
          }

          return {
            id: point?.id || crypto.randomUUID(),
            name,
            x,
            y,
            color: point?.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
            visible: point?.visible !== false,
          }
        })
        .filter(Boolean)
    : fallback.points

  const pointIds = new Set(points.map((point) => point.id))

  return {
    points,
    connections: Array.isArray(state.connections)
      ? state.connections.filter(
          (connection) =>
            connection?.id &&
            pointIds.has(connection.fromId) &&
            pointIds.has(connection.toId),
        )
      : [],
    labelOffsets:
      state.labelOffsets && typeof state.labelOffsets === 'object'
        ? Object.fromEntries(
            Object.entries(state.labelOffsets).filter(([id, offset]) =>
              pointIds.has(id) &&
              offset &&
              Number.isFinite(Number(offset.x)) &&
              Number.isFinite(Number(offset.y)),
            ).map(([id, offset]) => [id, { x: Number(offset.x), y: Number(offset.y) }]),
          )
        : {},
    axisLabelOffsets:
      state.axisLabelOffsets && typeof state.axisLabelOffsets === 'object'
        ? {
            top: {
              x: Number(state.axisLabelOffsets.top?.x) || 0,
              y: Number(state.axisLabelOffsets.top?.y) || 0,
            },
            left: {
              x: Number(state.axisLabelOffsets.left?.x) || 0,
              y: Number(state.axisLabelOffsets.left?.y) || 0,
            },
          }
        : {
            top: { x: 0, y: 0 },
            left: { x: 0, y: 0 },
          },
    quadrantVisibility:
      state.quadrantVisibility && typeof state.quadrantVisibility === 'object'
        ? {
            1: state.quadrantVisibility[1] !== false,
            2: state.quadrantVisibility[2] !== false,
            3: state.quadrantVisibility[3] !== false,
            4: state.quadrantVisibility[4] !== false,
          }
        : DEFAULT_QUADRANT_VISIBILITY,
    showConnectedOnly: Boolean(state.showConnectedOnly),
    showSecondaryQuadrants: Boolean(state.showSecondaryQuadrants),
  }
}

function readStorageJson(key, fallback) {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const stored = window.localStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

function getInitialGraphState() {
  return normalizeGraphState(readStorageJson(DEFAULT_GRAPH_STATE_KEY, DEFAULT_GRAPH_STATE))
}

function getInitialSavedGraphs() {
  const saved = readStorageJson(SAVED_GRAPHS_KEY, [])

  if (!Array.isArray(saved)) {
    return []
  }

  return saved
    .map((item, index) => {
      const name = String(item?.name ?? '').trim()

      if (!item?.id || !name) {
        return null
      }

      return {
        id: item.id,
        name,
        state: normalizeGraphState(item.state),
        createdAt: item.createdAt || Date.now() + index,
      }
    })
    .filter(Boolean)
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

function getPrimaryQuadrantLabel(point) {
  return `${getQuadrant(point)}사분면`
}

function getSecondaryQuadrantLabel(point) {
  const primaryQuadrant = getQuadrant(point)
  const secondaryQuadrant = getSecondaryQuadrantNumber(point)

  return `${primaryQuadrant}-${secondaryQuadrant} 사분면`
}

function getSecondaryQuadrantNumber(point) {
  const primaryQuadrant = getQuadrant(point)

  const horizontalIndex = point.x < 0
    ? point.x < -3.5 ? 1 : 2
    : point.x < 3.5 ? 1 : 2

  const verticalIndex = point.y < 18
    ? point.y < 9 ? 2 : 1
    : point.y < 27 ? 2 : 1

  const secondaryIndexByQuadrant = {
    1: {
      '2-1': 1,
      '1-1': 2,
      '1-2': 3,
      '2-2': 4,
    },
    2: {
      '1-2': 3,
      '1-1': 1,
      '2-2': 2,
      '2-1': 4,
    },
    3: {
      '1-2': 1,
      '2-2': 2,
      '2-1': 3,
      '1-1': 4,
    },
    4: {
      '2-2': 1,
      '2-1': 2,
      '1-1': 3,
      '1-2': 4,
    },
  }

  const secondaryIndex =
    secondaryIndexByQuadrant[primaryQuadrant][`${horizontalIndex}-${verticalIndex}`]

  return secondaryIndex
}

function getPointLocationLabel(point, showSecondaryQuadrants) {
  return showSecondaryQuadrants
    ? `위치 : ${getSecondaryQuadrantLabel(point)}`
    : `위치 : ${getPrimaryQuadrantLabel(point)}`
}

function getAnalyzeQuadrantGroups(points, showSecondaryQuadrants) {
  const collator = new Intl.Collator('ko')
  const groups = []

  for (let primary = 1; primary <= 4; primary += 1) {
    if (showSecondaryQuadrants) {
      for (let secondary = 1; secondary <= 4; secondary += 1) {
        groups.push({
          id: `${primary}-${secondary}`,
          label: `${primary}-${secondary} 사분면`,
          items: [],
        })
      }
    } else {
      groups.push({
        id: `${primary}`,
        label: `${primary}사분면`,
        items: [],
      })
    }
  }

  points
    .filter((point) => point.visible !== false)
    .forEach((point) => {
      const id = showSecondaryQuadrants
        ? `${getQuadrant(point)}-${getSecondaryQuadrantNumber(point)}`
        : `${getQuadrant(point)}`
      const target = groups.find((group) => group.id === id)

      if (target) {
        target.items.push(point)
      }
    })

  groups.forEach((group) => {
    group.items.sort((left, right) => collator.compare(left.name, right.name))
  })

  return groups
}

function hexToRgba(color, alpha) {
  if (typeof color !== 'string') {
    return `rgba(38, 70, 83, ${alpha})`
  }

  const normalized = color.replace('#', '')

  if (normalized.length !== 6) {
    return `rgba(38, 70, 83, ${alpha})`
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return `rgba(38, 70, 83, ${alpha})`
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function buildDisplayColorMap(points, connections) {
  const displayMap = Object.fromEntries(points.map((point) => [point.id, point.color]))
  const pointIds = new Set(points.map((point) => point.id))

  connections.forEach((connection, index) => {
    if (!pointIds.has(connection.fromId) || !pointIds.has(connection.toId)) {
      return
    }

    const groupColor = CONNECTION_GROUP_COLORS[index % CONNECTION_GROUP_COLORS.length]
    displayMap[connection.fromId] = groupColor
    displayMap[connection.toId] = groupColor
  })

  return displayMap
}

function getAnalyzeItemStyle(point, connectionPointIds, displayColorMap) {
  const groupColor = displayColorMap[point.id] ?? point.color
  const isConnected = connectionPointIds.has(point.id)
  const isTagged = /\((재|신)\)\s*$/.test(point.name)

  if (!isConnected && !isTagged) {
    return null
  }

  return {
    '--analyze-accent': groupColor,
    backgroundColor: hexToRgba(groupColor, isConnected ? 0.12 : 0.09),
    borderColor: hexToRgba(groupColor, isConnected ? 0.28 : 0.2),
  }
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

function buildLabelLayouts(points, pointScreenMap, radiusMap, labelOffsets, sourcePointIds) {
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
        opacity: sourcePointIds.has(point.id) ? 0.5 : 1,
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
  const { cx, cy, payload, onPointRender, radius = POINT_RADIUS, opacity = 1 } = props

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
        fill={payload.displayColor ?? payload.color}
        opacity={opacity}
      />
    </g>
  )
}

function App() {
  const initialGraphStateRef = useRef(null)
  const initialSavedGraphsRef = useRef(null)

  if (!initialGraphStateRef.current) {
    initialGraphStateRef.current = getInitialGraphState()
  }

  if (!initialSavedGraphsRef.current) {
    initialSavedGraphsRef.current = getInitialSavedGraphs()
  }

  const chartRef = useRef(null)
  const chartWrapRef = useRef(null)
  const chartSizeRef = useRef({ width: 0, height: 0 })
  const dragStateRef = useRef(null)
  const activeLabelRef = useRef(null)
  const [points, setPoints] = useState(() => initialGraphStateRef.current.points)
  const [connections, setConnections] = useState(() => initialGraphStateRef.current.connections)
  const [form, setForm] = useState(EMPTY_FORM)
  const [arrowForm, setArrowForm] = useState(EMPTY_ARROW_FORM)
  const [showSecondaryQuadrants, setShowSecondaryQuadrants] = useState(
    () => initialGraphStateRef.current.showSecondaryQuadrants,
  )
  const [quadrantVisibility, setQuadrantVisibility] = useState(
    () => initialGraphStateRef.current.quadrantVisibility ?? DEFAULT_QUADRANT_VISIBILITY,
  )
  const [showConnectedOnly, setShowConnectedOnly] = useState(
    () => initialGraphStateRef.current.showConnectedOnly ?? false,
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 })
  const [renderedPointMap, setRenderedPointMap] = useState({})
  const [labelOffsets, setLabelOffsets] = useState(() => initialGraphStateRef.current.labelOffsets)
  const [axisLabelOffsets, setAxisLabelOffsets] = useState(
    () => initialGraphStateRef.current.axisLabelOffsets ?? {
      top: { x: 0, y: 0 },
      left: { x: 0, y: 0 },
    },
  )
  const [savedGraphs, setSavedGraphs] = useState(() => initialSavedGraphsRef.current)
  const [savedGraphName, setSavedGraphName] = useState('')
  const [activeSavedGraphId, setActiveSavedGraphId] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [activeLabelId, setActiveLabelId] = useState(null)
  const [debugLabelEvent, setDebugLabelEvent] = useState('idle')
  const [pointSortOrder, setPointSortOrder] = useState(SORT_OPTIONS.nameAsc)
  const [isDisplayPanelOpen, setIsDisplayPanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(TAB_OPTIONS.dashboard)

  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_GRAPHS_KEY, JSON.stringify(savedGraphs))
    } catch {
      // Ignore local storage issues.
    }
  }, [savedGraphs])

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
  }, [points])

  const pointScreenMap = useMemo(
    () => {
      const visiblePoints = points.filter((point) => point.visible !== false)
      const manualPointMap = buildPointScreenMap(visiblePoints, chartSize)

      return Object.fromEntries(
      visiblePoints.map((point) => {
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
    [points, renderedPointMap, chartSize],
  )

  const connectedPointIds = useMemo(
    () =>
      new Set(
        connections.flatMap((connection) => [connection.fromId, connection.toId]),
      ),
    [connections],
  )

  const displayColorMap = useMemo(
    () => buildDisplayColorMap(points, connections),
    [points, connections],
  )

  const visiblePoints = useMemo(
    () =>
      points.filter((point) => {
        if (showConnectedOnly) {
          return connectedPointIds.has(point.id)
        }

        return (
          point.visible !== false &&
          quadrantVisibility[getQuadrant(point)] !== false
        )
      }),
    [points, quadrantVisibility, showConnectedOnly, connectedPointIds],
  )

  const visibleDisplayPoints = useMemo(
    () =>
      visiblePoints.map((point) => ({
        ...point,
        displayColor: displayColorMap[point.id] ?? point.color,
      })),
    [visiblePoints, displayColorMap],
  )

  const visiblePointIds = useMemo(
    () => new Set(visiblePoints.map((point) => point.id)),
    [visiblePoints],
  )

  const pointRadiusMap = useMemo(
    () => buildPointRadiusMap(visibleDisplayPoints, pointScreenMap),
    [visibleDisplayPoints, pointScreenMap],
  )

  const axisLabelPositions = useMemo(() => {
    if (!chartSize.width || !chartSize.height) {
      return null
    }

    const metrics = buildPlotMetrics(chartSize)

    return {
      topX: metrics.toX(0) + (axisLabelOffsets.top?.x ?? 0),
      topY: Math.max(8, CHART_MARGIN.top - 20) + (axisLabelOffsets.top?.y ?? 0),
      leftX: Math.max(10, CHART_MARGIN.left - 16) + (axisLabelOffsets.left?.x ?? 0),
      leftY: metrics.toY(18) + (axisLabelOffsets.left?.y ?? 0),
    }
  }, [chartSize, axisLabelOffsets])

  const visibleConnections = useMemo(
    () =>
      connections.filter(
        (connection) =>
          visiblePointIds.has(connection.fromId) && visiblePointIds.has(connection.toId),
      ),
    [connections, visiblePointIds],
  )

  const sourcePointIds = useMemo(
    () => new Set(visibleConnections.map((connection) => connection.fromId)),
    [visibleConnections],
  )

  const sortedPoints = useMemo(() => {
    const collator = new Intl.Collator('ko')
    const sorted = [...points]

    if (pointSortOrder === SORT_OPTIONS.nameAsc || pointSortOrder === SORT_OPTIONS.nameDesc) {
      const direction = pointSortOrder === SORT_OPTIONS.nameDesc ? -1 : 1
      return sorted.sort((left, right) => direction * collator.compare(left.name, right.name))
    }

    return sorted.sort((left, right) => {
      const leftPrimary = getQuadrant(left)
      const rightPrimary = getQuadrant(right)
      const leftSecondary = getSecondaryQuadrantNumber(left)
      const rightSecondary = getSecondaryQuadrantNumber(right)
      const leftKey = showSecondaryQuadrants ? leftPrimary * 10 + leftSecondary : leftPrimary
      const rightKey = showSecondaryQuadrants ? rightPrimary * 10 + rightSecondary : rightPrimary

      if (leftKey !== rightKey) {
        return pointSortOrder === SORT_OPTIONS.quadrantDesc
          ? rightKey - leftKey
          : leftKey - rightKey
      }

      return collator.compare(left.name, right.name)
    })
  }, [pointSortOrder, points, showSecondaryQuadrants])

  const labelLayouts = useMemo(
    () => buildLabelLayouts(visibleDisplayPoints, pointScreenMap, pointRadiusMap, labelOffsets, sourcePointIds),
    [visibleDisplayPoints, pointScreenMap, pointRadiusMap, labelOffsets, sourcePointIds],
  )

  const arrowLayouts = useMemo(
    () => buildArrowLayouts(visibleConnections, pointScreenMap),
    [visibleConnections, pointScreenMap],
  )

  const analyzeQuadrantGroups = useMemo(
    () =>
      getAnalyzeQuadrantGroups(
        points.map((point) => ({
          ...point,
          displayColor: displayColorMap[point.id] ?? point.color,
        })),
        showSecondaryQuadrants,
      ),
    [points, displayColorMap, showSecondaryQuadrants],
  )

  const analyzeHighlightIds = useMemo(
    () => new Set(connections.flatMap((connection) => [connection.fromId, connection.toId])),
    [connections],
  )

  const getCurrentGraphState = () =>
    cloneGraphState({
      points,
      connections,
      labelOffsets,
      axisLabelOffsets,
      quadrantVisibility,
      showConnectedOnly,
      showSecondaryQuadrants,
    })

  const applyGraphState = (graphState, options = {}) => {
    const normalized = normalizeGraphState(graphState)

    activeLabelRef.current = null
    dragStateRef.current = null
    setPoints(normalized.points)
    setConnections(normalized.connections)
    setLabelOffsets(normalized.labelOffsets)
    setAxisLabelOffsets(normalized.axisLabelOffsets)
    setQuadrantVisibility(normalized.quadrantVisibility)
    setShowConnectedOnly(normalized.showConnectedOnly)
    setShowSecondaryQuadrants(normalized.showSecondaryQuadrants)
    setArrowForm(EMPTY_ARROW_FORM)
    setActiveLabelId(null)
    setDragState(null)
    setActiveSavedGraphId(options.activeSavedGraphId ?? null)
    setErrorMessage(options.message ?? '')
    setDebugLabelEvent(options.debugLabel ?? 'graph-state-loaded')
  }

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

  const handleLabelMouseDown = (event, labelId, type = 'point') => {
    setDebugLabelEvent(`mousedown:${labelId}`)

    if (activeLabelRef.current !== labelId) {
      setDebugLabelEvent(`mousedown-blocked:${labelId}`)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (event.button !== 0) {
      return
    }

    const pointer = toChartCoordinates(event.clientX, event.clientY)
    const currentOffset = type === 'axis'
      ? axisLabelOffsets[labelId] ?? { x: 0, y: 0 }
      : labelOffsets[labelId] ?? { x: 0, y: 0 }

    if (!pointer) {
      setDebugLabelEvent(`mousedown-no-pointer:${labelId}`)
      return
    }

    const nextDragState = {
      pointId: labelId,
      type,
      pointerStartX: pointer.x,
      pointerStartY: pointer.y,
      initialOffsetX: currentOffset.x,
      initialOffsetY: currentOffset.y,
    }

    dragStateRef.current = nextDragState
    setDebugLabelEvent(`drag-start:${labelId}`)
    setDragState(nextDragState)

  }

  const handleLabelActivate = (event, labelId) => {
    event.preventDefault()
    event.stopPropagation()
    setDebugLabelEvent(`dblclick:${labelId}`)
    if (activeLabelRef.current === labelId) {
      handleResetLabel(labelId)
      activeLabelRef.current = null
      setActiveLabelId(null)
      setDebugLabelEvent(`dblclick-reset:${labelId}`)
      return
    }

    activeLabelRef.current = labelId
    setActiveLabelId(labelId)
    setDebugLabelEvent(`active:${labelId}`)
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
    setActiveSavedGraphId(null)
    const nextOffset = {
      x: currentDragState.initialOffsetX + (pointer.x - currentDragState.pointerStartX),
      y: currentDragState.initialOffsetY + (pointer.y - currentDragState.pointerStartY),
    }

    if (currentDragState.type === 'axis') {
      setAxisLabelOffsets((current) => ({
        ...current,
        [currentDragState.pointId]: nextOffset,
      }))
      return
    }

    setLabelOffsets((current) => ({
      ...current,
      [currentDragState.pointId]: nextOffset,
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

  const handleResetLabel = (labelId) => {
    if (activeLabelRef.current === labelId) {
      activeLabelRef.current = null
    }

    if (labelId === 'top' || labelId === 'left') {
      setAxisLabelOffsets((current) => ({
        ...current,
        [labelId]: { x: 0, y: 0 },
      }))
      return
    }

    setLabelOffsets((current) => {
      if (!current[labelId]) {
        return current
      }

      const next = { ...current }
      delete next[labelId]
      return next
    })
  }

  const handleSaveCurrentAsDefault = () => {
    try {
      window.localStorage.setItem(DEFAULT_GRAPH_STATE_KEY, JSON.stringify(getCurrentGraphState()))
      setErrorMessage('현재 그래프 상태를 기본값으로 저장했습니다.')
    } catch {
      setErrorMessage('기본값 저장에 실패했습니다.')
    }
  }

  const handleSaveGraphPreset = () => {
    const trimmedName = savedGraphName.trim()
    const nextPreset = {
      id: crypto.randomUUID(),
      name: trimmedName || `저장본 ${savedGraphs.length + 1}`,
      state: getCurrentGraphState(),
      createdAt: Date.now(),
    }

    setSavedGraphs((current) => [nextPreset, ...current])
    setSavedGraphName('')
    setErrorMessage('현재 그래프를 저장 목록에 추가했습니다.')
  }

  const handleExportGraphSettings = async () => {
    const selectedPreset = savedGraphs.find((item) => item.id === activeSavedGraphId)
    const exportPayload = {
      name: selectedPreset?.name || savedGraphName.trim() || '현재 세팅값',
      exportedAt: new Date().toISOString(),
      state: selectedPreset ? selectedPreset.state : getCurrentGraphState(),
    }

    const json = JSON.stringify(exportPayload, null, 2)

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json)
      }
    } catch {
      // Ignore clipboard errors and continue with file download.
    }

    try {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const safeName = exportPayload.name.replace(/[\\/:*?"<>|]/g, '-')
      link.href = url
      link.download = `${safeName || 'graph-settings'}.json`
      link.click()
      URL.revokeObjectURL(url)
      setErrorMessage('세팅값을 JSON으로 내보냈습니다.')
    } catch {
      setErrorMessage('세팅값 내보내기에 실패했습니다.')
    }
  }

  const handleSavedGraphToggle = (id, checked) => {
    if (!checked) {
      setActiveSavedGraphId(null)
      return
    }

    const target = savedGraphs.find((item) => item.id === id)

    if (!target) {
      return
    }

    applyGraphState(target.state, {
      activeSavedGraphId: id,
      message: `${target.name} 불러옴`,
      debugLabel: 'saved-graph-loaded',
    })
  }

  const handleSavedGraphRename = (id, name) => {
    setSavedGraphs((current) =>
      current.map((item) => (item.id === id ? { ...item, name } : item)),
    )
  }

  const handleSavedGraphDelete = (id) => {
    setSavedGraphs((current) => current.filter((item) => item.id !== id))
    setActiveSavedGraphId((current) => (current === id ? null : current))
    setErrorMessage('저장된 그래프를 삭제했습니다.')
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

  const handleArrowPointToggle = (type, pointId, checked) => {
    setActiveSavedGraphId(null)
    setArrowForm((current) => {
      if (type === 'fromId') {
        return {
          ...current,
          fromId: checked ? pointId : current.fromId === pointId ? '' : current.fromId,
        }
      }

      return {
        ...current,
        toId: checked ? pointId : current.toId === pointId ? '' : current.toId,
      }
    })
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

    setActiveSavedGraphId(null)
    setPoints((current) => [...current, nextPoint])
    setForm(EMPTY_FORM)
    setErrorMessage('')
  }

  const handleDeletePoint = (id) => {
    setActiveSavedGraphId(null)
    setPoints((current) => current.filter((point) => point.id !== id))
  }

  const handlePointColorChange = (id, color) => {
    setActiveSavedGraphId(null)
    setPoints((current) =>
      current.map((point) => (point.id === id ? { ...point, color } : point)),
    )
  }

  const handlePointVisibilityChange = (id, visible) => {
    setActiveSavedGraphId(null)
    setPoints((current) =>
      current.map((point) => (point.id === id ? { ...point, visible } : point)),
    )
  }

  const handleQuadrantVisibilityChange = (quadrant, visible) => {
    setActiveSavedGraphId(null)
    setQuadrantVisibility((current) => ({
      ...current,
      [quadrant]: visible,
    }))
  }

  const handleAllQuadrantsVisibility = (visible) => {
    setActiveSavedGraphId(null)
    setQuadrantVisibility({
      1: visible,
      2: visible,
      3: visible,
      4: visible,
    })
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

    setActiveSavedGraphId(null)
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
    setActiveSavedGraphId(null)
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
        filter: (node) => {
          if (!(node instanceof HTMLElement || node instanceof SVGElement)) {
            return true
          }

          return node.dataset.exportHidden !== 'true'
        },
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

      setActiveSavedGraphId(null)
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
      <nav className="top-tabs" aria-label="메인 메뉴">
        <button
          type="button"
          className={`top-tab ${activeTab === TAB_OPTIONS.dashboard ? 'is-active' : ''}`}
          onClick={() => setActiveTab(TAB_OPTIONS.dashboard)}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`top-tab ${activeTab === TAB_OPTIONS.analyze ? 'is-active' : ''}`}
          onClick={() => setActiveTab(TAB_OPTIONS.analyze)}
        >
          Analyze
        </button>
      </nav>
      <section className="workspace">
        {activeTab === TAB_OPTIONS.dashboard ? (
        <>
        <div className="chart-panel" ref={chartRef}>
          <div
            className="chart-wrap"
            ref={chartWrapRef}
            onMouseMove={handleChartMouseMove}
            onMouseUp={handleChartMouseUp}
            onMouseLeave={handleChartMouseUp}
            onMouseDown={handleChartMouseDown}
          >
            <button
              type="button"
              className="control-panel-toggle"
              data-export-hidden="true"
              onClick={() => setIsDisplayPanelOpen((current) => !current)}
            >
              표시 옵션
            </button>
            {isDisplayPanelOpen ? (
              <section
                className="floating-control-panel floating-display-panel"
                data-export-hidden="true"
              >
                <div className="floating-control-header">
                  <strong>표시 옵션</strong>
                  <button
                    type="button"
                    className="floating-control-close"
                    onClick={() => setIsDisplayPanelOpen(false)}
                    aria-label="표시 옵션 닫기"
                  >
                    닫기
                  </button>
                </div>
                <div className="display-options-form">
                  <label className="toggle-field">
                    <input
                      type="checkbox"
                      checked={showSecondaryQuadrants}
                      onChange={(event) => {
                        setActiveSavedGraphId(null)
                        setShowSecondaryQuadrants(event.target.checked)
                      }}
                    />
                    <span>2차 사분면 표시</span>
                  </label>

                  <label className="toggle-field">
                    <input
                      type="checkbox"
                      checked={showConnectedOnly}
                      onChange={(event) => {
                        setActiveSavedGraphId(null)
                        setShowConnectedOnly(event.target.checked)
                      }}
                    />
                    <span>화살표 연결된 점만 표시</span>
                  </label>

                  <div className="quadrant-filter-group">
                    <div className="quadrant-filter-header">
                      <span className="quadrant-filter-title">사분면 호텔 표시</span>
                      <div className="quadrant-filter-actions">
                        <button
                          type="button"
                          className="quadrant-filter-button"
                          onClick={() => handleAllQuadrantsVisibility(true)}
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          className="quadrant-filter-button"
                          onClick={() => handleAllQuadrantsVisibility(false)}
                        >
                          전체 해제
                        </button>
                      </div>
                    </div>
                    <div className="quadrant-filter-grid">
                      {[1, 2, 3, 4].map((quadrant) => (
                        <label key={quadrant} className="toggle-field quadrant-toggle">
                          <input
                            type="checkbox"
                            checked={quadrantVisibility[quadrant] !== false}
                            onChange={(event) =>
                              handleQuadrantVisibilityChange(quadrant, event.target.checked)
                            }
                          />
                          <span>{quadrant}사분면</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {axisLabelPositions ? (
              <>
                <div
                  className="chart-axis-label chart-axis-label-top"
                  style={{
                    left: `${axisLabelPositions.topX}px`,
                    top: `${axisLabelPositions.topY}px`,
                  }}
                >
                  운영 난이도
                </div>
                <div
                  className="chart-axis-label chart-axis-label-left"
                  style={{
                    left: `${axisLabelPositions.leftX}px`,
                    top: `${axisLabelPositions.leftY}px`,
                  }}
                >
                  단가 점수
                </div>
              </>
            ) : null}
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
                      strokeOpacity={0.95}
                      strokeDasharray="8 6"
                      strokeWidth={1}
                    />
                  ))}
                {showSecondaryQuadrants &&
                  SUB_QUADRANT_Y.map((value) => (
                    <ReferenceLine
                      key={`y-${value}`}
                      y={value}
                      stroke="#b8c0c7"
                      strokeOpacity={0.95}
                      strokeDasharray="8 6"
                      strokeWidth={1}
                    />
                  ))}
                <ReferenceLine x={0} stroke="#000000" strokeWidth={2} />
                <ReferenceLine y={18} stroke="#000000" strokeWidth={2} />
                <Scatter
                  data={visibleDisplayPoints}
                  shape={(props) => (
                    <PointShape
                      {...props}
                      radius={pointRadiusMap[props.payload.id] ?? POINT_RADIUS}
                      onPointRender={handlePointRender}
                      opacity={sourcePointIds.has(props.payload.id) ? 0.5 : 1}
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
                    opacity: layout.opacity,
                  }}
                >
                  {layout.lines.join('\n')}
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="sidebar">
          <div className="sidebar-top">
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

              <button type="submit">점 추가</button>
              <button type="button" className="secondary-button" onClick={handleDownload}>
                그래프 이미지 다운로드
              </button>
              <button type="button" className="secondary-button" onClick={handleSaveCurrentAsDefault}>
                기본값 저장
              </button>
              <label className="file-field">
                <span>엑셀 업로드</span>
                <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
              </label>
              {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
              <p className="error-text">label-debug: {debugLabelEvent}</p>
            </form>

            <section className="point-list">
              <div className="point-list-header">
                <span>호텔 리스트</span>
                <select
                  className="point-sort-select"
                  value={pointSortOrder}
                  onChange={(event) => setPointSortOrder(event.target.value)}
                >
                  <option value={SORT_OPTIONS.nameAsc}>이름 오름차순</option>
                  <option value={SORT_OPTIONS.nameDesc}>이름 내림차순</option>
                  <option value={SORT_OPTIONS.quadrantAsc}>사분면 오름차순</option>
                  <option value={SORT_OPTIONS.quadrantDesc}>사분면 내림차순</option>
                </select>
              </div>
              <div className="point-list-body">
                <ul>
                  {sortedPoints.map((point) => (
                    <li key={point.id} data-visible={point.visible !== false ? 'true' : 'false'}>
                      <div className="point-meta">
                        <div className="point-title-row">
                          <label className="point-visibility-toggle">
                            <input
                              type="checkbox"
                              checked={point.visible !== false}
                              onChange={(event) =>
                                handlePointVisibilityChange(point.id, event.target.checked)
                              }
                            />
                            <span>표기</span>
                          </label>
                          <strong>{point.name}</strong>
                        </div>
                        <span>{getPointLocationLabel(point, showSecondaryQuadrants)}</span>
                      </div>
                      <div className="point-actions">
                        <label className="point-check">
                          <input
                            type="checkbox"
                            checked={arrowForm.fromId === point.id}
                            onChange={(event) =>
                              handleArrowPointToggle('fromId', point.id, event.target.checked)
                            }
                          />
                          <span>시작</span>
                        </label>
                        <label className="point-check">
                          <input
                            type="checkbox"
                            checked={arrowForm.toId === point.id}
                            onChange={(event) =>
                              handleArrowPointToggle('toId', point.id, event.target.checked)
                            }
                          />
                          <span>끝</span>
                        </label>
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
              </div>
            </section>

            <div className="right-stack">
              <section className="arrow-form-card">
                <form className="arrow-form" onSubmit={handleAddArrow}>
                  <label>
                    시작점
                    <input
                      value={points.find((point) => point.id === arrowForm.fromId)?.name ?? ''}
                      readOnly
                      placeholder="호텔 리스트에서 선택"
                    />
                  </label>

                  <label>
                    끝점
                    <input
                      value={points.find((point) => point.id === arrowForm.toId)?.name ?? ''}
                      readOnly
                      placeholder="호텔 리스트에서 선택"
                    />
                  </label>

                  <button type="submit" className="secondary-button">
                    화살표 추가
                  </button>
                </form>

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
              </section>

              <section className="saved-graph-panel">
                <div className="saved-graph-form">
                  <label>
                    저장 이름
                    <input
                      value={savedGraphName}
                      onChange={(event) => setSavedGraphName(event.target.value)}
                      placeholder="예: 4월 1차 버전"
                    />
                  </label>
                  <button type="button" className="secondary-button" onClick={handleSaveGraphPreset}>
                    변경사항 저장
                  </button>
                  <button type="button" className="secondary-button" onClick={handleExportGraphSettings}>
                    세팅값 내보내기
                  </button>
                </div>

                <ul className="saved-graph-list">
                  {savedGraphs.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="saved-graph-load-button"
                        onClick={() => handleSavedGraphToggle(item.id, activeSavedGraphId !== item.id)}
                      >
                        {activeSavedGraphId === item.id ? '불러옴' : '불러오기'}
                      </button>
                      <input
                        className="saved-graph-name"
                        value={item.name}
                        onChange={(event) => handleSavedGraphRename(item.id, event.target.value)}
                      />
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => handleSavedGraphDelete(item.id)}
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

        </aside>
        </>
        ) : (
          <section className="analyze-view">
            <div className="analyze-header">
              <div className="analyze-header-copy">
                <h2>Analyze</h2>
                <p>{showSecondaryQuadrants ? 'N-n 사분면별 호텔 목록' : '1차 사분면별 호텔 목록'}</p>
              </div>
              <label className="analyze-toggle">
                <input
                  type="checkbox"
                  checked={showSecondaryQuadrants}
                  onChange={(event) => {
                    setActiveSavedGraphId(null)
                    setShowSecondaryQuadrants(event.target.checked)
                  }}
                />
                <span>2차 사분면 표시</span>
              </label>
            </div>
            <div className="analyze-board">
              {analyzeQuadrantGroups.map((group) => (
                <section key={group.id} className="analyze-card">
                  <header className="analyze-card-header">
                    <strong>{group.label}</strong>
                    <span>{group.items.length}개</span>
                  </header>
                  <div className="analyze-card-body">
                    {group.items.length ? (
                      <ul className="analyze-list">
                          {group.items.map((point) => {
                            const analyzeItemStyle = getAnalyzeItemStyle(
                              point,
                              analyzeHighlightIds,
                              displayColorMap,
                            )

                            return (
                            <li
                              key={point.id}
                              className={`analyze-item ${analyzeItemStyle ? 'is-tinted' : ''}`}
                              style={analyzeItemStyle ?? undefined}
                            >
                              <span className="analyze-item-name">{point.name}</span>
                            </li>
                            )
                          })}
                      </ul>
                    ) : (
                      <p className="analyze-empty">해당 호텔 없음</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default App
