import { INKS, GRADIENTS, isHex, inkFill } from './inks.mjs'
import { PI_CHARACTERS, LEGACY_SHAPE_ALIASES } from '../pi-characters.mjs'
import { PI_RASTER_AVATARS, PI_NEW_RASTER_AVATARS } from '../pi-raster-avatars.mjs'

// Preserve the original PI mascot; its companions use the user's 3D artwork.
export const CHARACTERS = {
  'pi-bot': {label:'PI-bot',body:'M46 20v-5a6 6 0 1 1 8 0v5h12q22 0 22 22v4h3q5 0 5 5v9q0 5-5 5h-3q-1 23-24 23H36Q13 88 12 65H9q-5 0-5-5v-9q0-5 5-5h3v-4q0-22 22-22z',paints:[['M34 32h32q12 0 12 12v14q0 12-12 12H34Q22 70 22 58V44q0-12 12-12Z','#ecf3ff',1],['M39 76h22v3H39zM42 78h3v7h-3zM55 78h3v7h-3z','#ecf3ff',1]],shade:'M85 34q3 5 3 14v17q-1 23-24 23H36q-13 0-19-10 8 5 21 5h25q20 0 20-20V45z',light:'M26 28q4-4 13-4h22q5 0 8 2H39q-10 0-13 9l-5 11v-7q0-7 5-11Z',eyes:[[38,51,9,17,0],[62,51,9,17,0]]},
  ...PI_CHARACTERS,
  ...PI_RASTER_AVATARS,
  ...PI_NEW_RASTER_AVATARS,
}
// Six columns of PI companions, with the unchanged default mascot first.
export const PICKER_SHAPES = Object.keys(CHARACTERS)
export const PICKER_COLUMNS = 6
export const DEFAULT_SHAPES = ['pi-cloud', 'pi-sprout', 'pi-otter', 'pi-fox', 'pi-owl', 'pi-seal', 'pi-penguin']
export const FALLBACK_SHAPE = 'pi-cloud'
// The team's first Main Bot, and the plugin's own mark in the sidebar.
export const MAIN_LOOK = Object.freeze({ shape: 'pi-bot', color: 'deepseek' })
// Character colors in picker order. Black, the gradients, and the dull gray and brown
// are never defaults; the user must pick them.
export const CHARACTER_COLORS = ['deepseek', 'black', 'brown', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta', 'gray', 'aurora']
// Keep existing id-derived colours stable; the PI blue is an explicit new swatch.
export const DEFAULT_COLORS = CHARACTER_COLORS.filter(color => !['deepseek', 'black', 'gray', 'brown'].includes(color) && !GRADIENTS[color])
export const isColor = color => isHex(color) || Object.hasOwn(INKS, color)

// The default look comes from the Bot id (FNV-1a, then mulberry32 for the
// color and murmur3's fmix32 for the shape), so it is the same on every device.
export function fnv1a(text) {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  return value >>> 0
}
export function defaultColor(id) {
  const t = (fnv1a(id) + 1831565813) | 0
  let n = Math.imul(t ^ (t >>> 15), 1 | t)
  n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n
  return DEFAULT_COLORS[Math.floor((((n ^ (n >>> 14)) >>> 0) / 4294967296) * DEFAULT_COLORS.length)]
}
export function defaultShape(id) {
  let value = fnv1a(id) | 0
  value = Math.imul(value ^ (value >>> 16), 73244475)
  value = Math.imul(value ^ (value >>> 13), 3266489909)
  return DEFAULT_SHAPES[((value ^ (value >>> 16)) >>> 0) % DEFAULT_SHAPES.length]
}

// A stored choice wins, with legacy IDs resolving to new PI companions.
export const colorOf = bot => (isColor(bot?.color) ? bot.color : bot?.id ? defaultColor(String(bot.id)) : 'black')
export function lookOf(bot) {
  const avatar = bot?.avatar ?? {}
  return {
    shape: hasShape(avatar.shape) ? shapeId(avatar.shape) : bot?.id ? defaultShape(String(bot.id)) : FALLBACK_SHAPE,
    image: avatar.image,
    color: colorOf(bot),
  }
}

// Registered shapes join the characters: `body(paint)` returns SVG markup in a
// `size` box and `eyes` lists the two capsules.
export const SHAPES = {}
for (const [id, character] of Object.entries(CHARACTERS)) {
  if (character.raster) {
    SHAPES[id] = { label: character.label, size: character.size, raster: character.raster, eyes: [] }
    continue
  }
  const layers = [
    ...(character.paints ?? []).map(([d, fill, opacity]) => `<path d="${d}" fill="${fill}" fill-opacity="${opacity}"/>`),
    `<path d="${character.shade}" fill="#000" fill-opacity=".14"/>`,
    `<path d="${character.light}" fill="#fff" fill-opacity=".16"/>`,
  ].join('')
  SHAPES[id] = { label: character.label ?? id[0].toUpperCase() + id.slice(1), size: 100, path: character.body, layers, eyes: character.eyes, solidEyes:character.solidEyes===true }
}
const canonicalShape = id => typeof id === 'string' && Object.hasOwn(LEGACY_SHAPE_ALIASES, id) ? LEGACY_SHAPE_ALIASES[id] : id
export const hasShape = id => typeof id === 'string' && Object.hasOwn(SHAPES, canonicalShape(id))
export const shapeId = id => (hasShape(id) ? canonicalShape(id) : FALLBACK_SHAPE)
export const shapeOf = id => SHAPES[shapeId(id)]
// `flat` draws the silhouette alone, for masks and selection rings.
export function bodyOf(def, paint, flat = false) {
  // Raster art keeps its painted lighting, colours and eyes in every theme.
  if (def.raster) return `<image href="${def.raster.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" width="${def.size}" height="${def.size}" preserveAspectRatio="xMidYMid meet"/>`
  if (def.path) {
    // The companions share shell highlights; clip these and the porcelain panels
    // to the outer shell so layered shading never leaks around small appendages.
    const layers=flat?'':def.solidEyes?`<defs><clipPath id="${MASK_ID}shell"><path d="${def.path}" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#${MASK_ID}shell)">${def.layers}</g>`:def.layers;
    return `<g fill-rule="evenodd"><path d="${def.path}" fill="${paint}"/>${layers}</g>`
  }
  try { return def.body(paint) } catch { return '' }
}
const eyeMarkup = ([cx, cy, w, h, tilt]) => `<g transform="translate(${cx} ${cy}) rotate(${tilt})"><rect class="bt-eye" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${w / 2}"/></g>`
// A closed, happy eye (an upturned arc) in the same spot, shown while the mark is petted.
const happyEyeMarkup = ([cx, cy, w, h, tilt]) => `<g transform="translate(${cx} ${cy}) rotate(${tilt})"><path class="bt-eye-happy" opacity="0" d="M${-w * 0.62} ${h * 0.14}Q0 ${-h * 0.42} ${w * 0.62} ${h * 0.14}" fill="none" stroke="#000" stroke-width="${w * 0.5}" stroke-linecap="round"/></g>`
// A mask covering three boxes, so a bob or squash never clips the body at the edge.
export const maskBox = size => `maskUnits="userSpaceOnUse" x="${-size}" y="${-size}" width="${size * 3}" height="${size * 3}"`
export const holes = (def, eyes) => `<rect x="${-def.size}" y="${-def.size}" width="${def.size * 3}" height="${def.size * 3}" fill="#fff"/>${eyes}`

// MASK_ID stands for each mark's own mask id: a duplicate id resolves to its first
// copy, which stops painting once that copy unmounts or sits in a hidden subtree.
export const MASK_ID = '%MASK%'
let markSerial = 0
export const nextMarkSerial = () => (markSerial += 1)
export const markupCache = new Map()
export function characterMarkup(shape, color) {
  const def = shapeOf(shape)
  const key = def.raster ? `${shape}|raster` : `${shape}|${color}`
  let markup = markupCache.get(key)
  if (markup === undefined) {
    if (def.raster) {
      // Keep the shared full-body animation hook; never mask or recolour eyes.
      markup = `<g class="bt-b bt-raster">${bodyOf(def)}</g>`
      markupCache.set(key, markup)
      return markup
    }
    // The eyes sit in the mask, untransformed by their placement, so CSS blinks and
    // glances never replace where they sit.
    const eyes = `<g class="bt-gaze"><g class="bt-eyes" fill="#000">${def.eyes.map(eyeMarkup).join('')}${def.eyes.map(happyEyeMarkup).join('')}</g></g>`
    const stops = GRADIENTS[color]
    const gradient = stops ? `<linearGradient id="${MASK_ID}g" gradientUnits="userSpaceOnUse" x1="18" y1="10" x2="78" y2="92">${stops.map(([offset, value]) => `<stop offset="${offset}" stop-color="${value}"/>`).join('')}</linearGradient>` : ''
    const paint = stops ? `url(#${MASK_ID}g)` : inkFill(color)
    // PI's porcelain faces have painted eyes in both themes, never punched holes.
    if (shape === 'pi-bot' || def.solidEyes) {
      const painted=eyes.replace('fill="#000"', 'fill="#223354"');
      markup = `<defs>${gradient}</defs><g class="bt-b">${bodyOf(def, paint)}${def.solidEyes?painted.replaceAll('stroke="#000"','stroke="#223354"'):painted}</g>`
    } else {
      const body = `<g mask="url(#${MASK_ID})">${bodyOf(def, paint)}</g>`
      markup = `<defs>${gradient}<mask id="${MASK_ID}" ${maskBox(def.size)}>${holes(def, eyes)}</mask></defs><g class="bt-b">${def.wrap ? `<g transform="${def.wrap}">${body}</g>` : body}</g>`
    }
    markupCache.set(key, markup)
  }
  return markup
}
const svgUrl = (inner, size) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${inner}</svg>`)}")`
export const maskCache = new Map()
export function maskOf(shape) {
  let mask = maskCache.get(shape)
  if (mask === undefined) {
    const def = shapeOf(shape)
    if (def.raster) {
      // A CSS image mask reads the PNG's real alpha, including its antenna.
      mask = `url("${def.raster}")`
      maskCache.set(shape, mask)
      return mask
    }
    const body = `<g mask="url(#e)">${bodyOf(def, '#000', true)}</g>`
    mask = svgUrl(`<mask id="e" ${maskBox(def.size)}>${holes(def, def.eyes.map(eyeMarkup).join('').replaceAll('class="bt-eye"', 'fill="#000"'))}</mask>${def.wrap ? `<g transform="${def.wrap}">${body}</g>` : body}`, def.size)
    maskCache.set(shape, mask)
  }
  return mask
}
export const DEFAULT_MASK = maskOf(FALLBACK_SHAPE)
