// Generates tests/fixtures/twist120.stl: a 120 mm tall twisted 9-lobed tube (outer radius 30-38 mm,
// 14 mm bore), a watertight binary STL. Used to check preview load time on a large G-code.
//   node scripts/make-twist.mjs [out.stl] [height] [twistTurns]

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const out = resolve(process.argv[2] ?? 'tests/fixtures/twist120.stl')
const H = Number(process.argv[3] ?? 120)
const turns = Number(process.argv[4] ?? 0.5)
const N = 180 // points around
const Z = 240 // rings up the height
const lobes = 9

const ring = (k, inner) => {
  const z = (k / Z) * H
  const twist = (k / Z) * turns * Math.PI * 2
  const pts = []
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    const r = inner ? 14 : 34 + 4 * Math.cos(lobes * a)
    pts.push([110 + r * Math.cos(a + twist), 110 + r * Math.sin(a + twist), z])
  }
  return pts
}

const tris = []
const quad = (a, b, c, d) => {
  tris.push([a, b, c], [a, c, d])
}
const outer = []
const inner = []
for (let k = 0; k <= Z; k++) {
  outer.push(ring(k, false))
  inner.push(ring(k, true))
}
for (let k = 0; k < Z; k++)
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    // outer wall faces outward (CCW seen from outside)
    quad(outer[k][i], outer[k][j], outer[k + 1][j], outer[k + 1][i])
    // bore faces inward
    quad(inner[k][j], inner[k][i], inner[k + 1][i], inner[k + 1][j])
  }
for (let i = 0; i < N; i++) {
  const j = (i + 1) % N
  // bottom cap faces down, top cap faces up
  quad(outer[0][j], outer[0][i], inner[0][i], inner[0][j])
  quad(outer[Z][i], outer[Z][j], inner[Z][j], inner[Z][i])
}

const buf = Buffer.alloc(84 + tris.length * 50)
buf.write('FF Print twisted test part', 0, 'ascii')
buf.writeUInt32LE(tris.length, 80)
let o = 84
for (const [a, b, c] of tris) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const l = Math.hypot(...n) || 1
  for (const x of [n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c]) {
    buf.writeFloatLE(x, o)
    o += 4
  }
  buf.writeUInt16LE(0, o)
  o += 2
}
writeFileSync(out, buf)
console.log(`${out}: ${tris.length} triangles, ${(buf.length / 1024).toFixed(0)} KB`)
