// Motion math ported verbatim from DeepSeek-Bot 0.1.7 client/motion.js (Apache-2.0; see LICENSE and NOTICE).
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

// A damped spring (mass 1) sampled into a CSS linear() easing, for WAAPI glides
// and CSS transitions alike.
export function springEasing(stiffness, damping) {
  const w0 = Math.sqrt(stiffness)
  const zeta = damping / (2 * w0)
  const at = (t) => {
    if (zeta >= 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t)
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t))
  }
  let end = 0.05
  while (end < 2 && Math.abs(1 - at(end)) > 0.001) end += 0.01
  const points = Array.from({ length: 25 }, (_, index) => (index === 24 ? 1 : at(end * index / 24)).toFixed(4))
  return { duration: Math.round(end * 1000), easing: `linear(${points.join(',')})`, stiffness, damping }
}

// The capsule's two springs: a gentle one (ω=20, ζ=0.78) reshapes surfaces, a
// tighter one (ω=30, ζ=0.8) answers the press.
export const SPRING_SHAPE = springEasing(400, 31.2)
export const SPRING_TAP = springEasing(900, 48)
// Rows of a list move to new places on ω=22, ζ=0.8.
export const SPRING_LIST = springEasing(484, 35.2)
// A looser spring (ω≈18, ζ≈0.56) that overshoots a little, for a surface that stretches
// open, and a quicker one for a mark that pops in.
export const SPRING_STRETCH = springEasing(320, 20)
export const SPRING_POP = springEasing(500, 22)
// A thumb's two edges: the one in front runs the fast spring (ω=28), the one behind
// the slower one (ω=17), so the thumb stretches into the move and settles behind it
// within about a quarter second.
export const SPRING_LEAD = springEasing(784, 48.2)
export const SPRING_TRAIL = springEasing(289, 29.2)
// A highlight that follows the keyboard and pointer down a list keeps up on stiffer
// edges (ω=30 and ω=20).
export const QUICK_EDGES = { lead: springEasing(900, 51), trail: springEasing(400, 34) }

export const spring = (curve, ...properties) => properties.map(property => `${property} ${curve.duration}ms ${curve.easing}`).join(',')

// Springs stepped once per frame. A new target keeps the current velocity, so a thumb
// that is sent somewhere else mid-move turns smoothly instead of starting over. Each
// frame covers the whole time since the last one, like a CSS transition, so a busy
// page delays the thumb instead of slowing it down.
export function liveSprings(apply) {
  const values = new Map()
  let frame = 0
  let last = 0
  const read = () => Object.fromEntries([...values].map(([key, value]) => [key, value.x]))
  const step = (now) => {
    const dt = Math.min(0.5, Math.max(0.001, (now - last) / 1000))
    last = now
    const steps = Math.ceil(dt * 240)
    const h = dt / steps
    let moving = false
    for (const value of values.values()) {
      for (let index = 0; index < steps; index += 1) {
        value.v += (-value.k * (value.x - value.to) - value.c * value.v) * h
        value.x += value.v * h
      }
      if (Math.abs(value.x - value.to) < 0.05 && Math.abs(value.v) < 1) { value.x = value.to; value.v = 0 } else moving = true
    }
    apply(read())
    frame = moving ? requestAnimationFrame(step) : 0
  }
  return {
    target: () => (values.size ? Object.fromEntries([...values].map(([key, value]) => [key, value.to])) : null),
    set(targets, curves, jump) {
      for (const [key, to] of Object.entries(targets)) {
        const value = values.get(key)
        const { stiffness: k, damping: c } = curves[key]
        if (!value || jump) values.set(key, { x: to, v: 0, to, k, c })
        else Object.assign(value, { to, k, c })
      }
      if (jump) { cancelAnimationFrame(frame); frame = 0; apply(read()); return }
      if (!frame) { last = performance.now(); frame = requestAnimationFrame(step) }
    },
    stop: () => cancelAnimationFrame(frame),
  }
}

