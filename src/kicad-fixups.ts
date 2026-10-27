/**
 * Post-processing for circuit-json-to-kicad output so the schematic loads and
 * netlists correctly in KiCad 9/10 (including headless `kicad-cli`).
 */

const WIRE_RE =
  /\n(\s*)\(wire\s*\(pts\s*\(xy ([-\d.e]+) ([-\d.e]+)\)\s*\(xy ([-\d.e]+) ([-\d.e]+)\)\s*\)([\s\S]*?)\(uuid ([0-9a-f-]+)\)\s*\)/g
const JUNCTION_RE = /\(junction\s*\(at ([-\d.e]+) ([-\d.e]+)\)/g
const EPS = 1e-6

/** `(power global)` is KiCad 10 syntax; `(power)` means the same and loads in KiCad 9. */
export function fixPowerSymbols(sch: string): string {
  return sch.replace(/\(power global\)/g, "(power)")
}

function derivedUuid(uuid: string, i: number): string {
  const suffix = i.toString(16).padStart(4, "0")
  return uuid.slice(0, -4) + suffix
}

/**
 * Split wires at junctions that lie strictly inside them. circuit-json-to-kicad
 * emits T-connections as a wire ending in the middle of another wire plus a
 * junction; KiCad's GUI breaks such wires on load, but `kicad-cli` netlisting
 * does not, which leaves the branch disconnected.
 */
export function splitWiresAtJunctions(sch: string): string {
  const junctions: [number, number][] = []
  for (const m of sch.matchAll(JUNCTION_RE)) junctions.push([Number(m[1]), Number(m[2])])
  if (junctions.length === 0) return sch
  return sch.replace(WIRE_RE, (whole, indent: string, x1s, y1s, x2s, y2s, rest: string, uuid: string) => {
    const [x1, y1, x2, y2] = [x1s, y1s, x2s, y2s].map(Number) as [number, number, number, number]
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    if (len2 < EPS) return whole
    const cuts: number[] = []
    for (const [jx, jy] of junctions) {
      const cross = (jx - x1) * dy - (jy - y1) * dx
      if (Math.abs(cross) > EPS * Math.sqrt(len2) * 1000) continue
      const t = ((jx - x1) * dx + (jy - y1) * dy) / len2
      if (t > EPS && t < 1 - EPS && !cuts.some((c) => Math.abs(c - t) < EPS)) cuts.push(t)
    }
    if (cuts.length === 0) return whole
    cuts.sort((a, b) => a - b)
    const pts: [string, string][] = [[x1s, y1s]]
    for (const t of cuts) pts.push([String(+(x1 + t * dx).toFixed(6)), String(+(y1 + t * dy).toFixed(6))])
    pts.push([x2s, y2s])
    let out = ""
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]] as [[string, string], [string, string]]
      const id = i === 0 ? uuid : derivedUuid(uuid, i)
      out += `\n${indent}(wire\n${indent}  (pts\n${indent}    (xy ${a[0]} ${a[1]})\n${indent}    (xy ${b[0]} ${b[1]})\n${indent}  )${rest}(uuid ${id})\n${indent})`
    }
    return out
  })
}

/** Remove exact-duplicate junctions (same position). */
export function dedupeJunctions(sch: string): string {
  const seen = new Set<string>()
  return sch.replace(/\n\s*\(junction\s*\(at ([-\d.e]+) ([-\d.e]+)\)[\s\S]*?\(uuid [0-9a-f-]+\)\s*\)/g, (whole, x, y) => {
    const k = `${Number(x)},${Number(y)}`
    if (seen.has(k)) return ""
    seen.add(k)
    return whole
  })
}

/** Insert a `(title_block (title ...))` after `(paper ...)` if none exists. */
export function addTitleBlock(sch: string, title: string): string {
  if (sch.includes("(title_block")) return sch
  const escaped = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return sch.replace(/(\(paper\s*[^)]*\))/, `$1\n  (title_block\n    (title "${escaped}")\n  )`)
}

/**
 * Replace random UUIDs with sequential ones (consistently, so references keep
 * matching) to make the output reproducible and diff-friendly.
 */
export function renumberUuids(sch: string): string {
  const map = new Map<string, string>()
  return sch.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (u) => {
    let v = map.get(u)
    if (!v) {
      v = `00000000-0000-4000-8000-${(map.size + 1).toString(16).padStart(12, "0")}`
      map.set(u, v)
    }
    return v
  })
}

export interface KicadFixupOptions {
  title?: string
  /** Sequential UUIDs for reproducible output (default true). */
  deterministicUuids?: boolean
}

export function applyKicadFixups(sch: string, opts: KicadFixupOptions = {}): string {
  let out = dedupeJunctions(splitWiresAtJunctions(fixPowerSymbols(sch)))
  if (opts.title) out = addTitleBlock(out, opts.title)
  if (opts.deterministicUuids !== false) out = renumberUuids(out)
  return out
}
