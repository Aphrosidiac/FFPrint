// Writes extra viewport test models to tests/fixtures/ (binary STL).
//   node scripts/gen-fixtures.mjs
// bracket.stl   L-shaped bracket 40 x 20 x 30 with a hole-free web (odd shape, two flat sides)
// tall.stl      10 x 10 x 200 column (tall/thin)
// wedge.stl     a 30 x 20 x 15 ramp (lay-flat test: largest face is the slope, it can rest on it)
// sphere1m.stl  ~1,000,000-triangle UV sphere, 60 mm (performance; 50 MB, so only with --big,
//               written to the OS temp dir instead of the repo)
// toolarge.stl  240 x 30 x 10 bar (wider than the bed)

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const dir = resolve('tests/fixtures')
mkdirSync(dir, { recursive: true })

function stl(tris) {
  const buf = Buffer.alloc(84 + tris.length * 50)
  buf.write('FF Print fixture', 0)
  buf.writeUInt32LE(tris.length, 80)
  let o = 84
  for (const t of tris) {
    o += 12
    for (const v of t) for (const c of v) (buf.writeFloatLE(c, o), (o += 4))
    o += 2
  }
  return buf
}

/** Axis-aligned box, outward CCW faces. */
function box(x0, y0, z0, x1, y1, z1) {
  const p = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]
  const quads = [
    [0, 2, 3, 1], // bottom (-z)
    [4, 5, 7, 6], // top
    [0, 1, 5, 4], // front (-y)
    [2, 6, 7, 3], // back
    [0, 4, 6, 2], // left (-x)
    [1, 3, 7, 5] // right
  ]
  const out = []
  for (const [a, b, c, d] of quads) {
    out.push([p(a), p(b), p(c)], [p(a), p(c), p(d)])
  }
  return out
}

/** Extruded polygon (CCW in XY) from z0 to z1. */
function prism(poly, z0, z1) {
  const out = []
  // fan triangulation (polygons used here are convex or star-shaped from vertex 0)
  for (let i = 1; i < poly.length - 1; i++) {
    out.push([[...poly[0], z0], [...poly[i + 1], z0], [...poly[i], z0]])
    out.push([[...poly[0], z1], [...poly[i], z1], [...poly[i + 1], z1]])
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    out.push([[...a, z0], [...b, z0], [...b, z1]], [[...a, z0], [...b, z1], [...a, z1]])
  }
  return out
}

function sphere(r, seg, rings) {
  const out = []
  const pt = (i, j) => {
    const th = (i / seg) * Math.PI * 2
    const ph = (j / rings) * Math.PI
    return [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)]
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = pt(i, j)
      const b = pt(i + 1, j)
      const c = pt(i + 1, j + 1)
      const d = pt(i, j + 1)
      if (j > 0) out.push([a, d, b])
      if (j < rings - 1) out.push([b, d, c])
    }
  return out
}

// L bracket: base plate 40 x 20 x 4 plus upright 4 x 20 x 30
writeFileSync(join(dir, 'bracket.stl'), stl([...box(0, 0, 0, 40, 20, 4), ...box(0, 0, 4, 4, 20, 30)]))
writeFileSync(join(dir, 'tall.stl'), stl(box(0, 0, 0, 10, 10, 200)))
// wedge: triangle profile in XZ extruded along Y, then swap to have the profile in XY for prism()
const wedge = prism([[0, 0], [30, 0], [0, 15]], 0, 20).map((t) => t.map(([x, y, z]) => [x, z, y]))
// map (x, y, z) -> (x, z, y) mirrors, so flip each triangle's winding back
writeFileSync(join(dir, 'wedge.stl'), stl(wedge.map(([a, b, c]) => [a, c, b])))
if (process.argv.includes('--big')) {
  const big = join(tmpdir(), 'ffprint-sphere1m.stl')
  writeFileSync(big, stl(sphere(30, 1000, 501)))
  console.log('wrote', big)
}
writeFileSync(join(dir, 'toolarge.stl'), stl(box(0, 0, 0, 240, 30, 10)))
console.log('fixtures written to', dir)
