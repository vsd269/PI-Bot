export function clusterSeats(count, frame) {
  if (count === 1) return [[0, 0, frame]]
  if (count === 2) return [[0, 0, frame / 2], [frame / 2, frame / 2, frame / 2]]
  if (count === 3) {
    const size = frame / 2
    const rest = frame - size
    return [[rest / 2, 0, size], [0, rest, size], [rest, rest, size]]
  }
  const half = frame / 2
  return [[0, 0, half], [half, 0, half], [0, half, half], [half, half, half]]
}
