import type { Document, Endpoint, Loc, PartDecl } from "./ast.js"
import { CircuitextError, type Diagnostic } from "./errors.js"
import { lookupPartType, type PartSpec } from "./parts.js"

export type PropValue = string | number | boolean | Record<string, unknown>

export interface ResolvedPart {
  ref: string
  type: string
  spec: PartSpec
  /** tscircuit intrinsic element, e.g. "resistor" or "chip". */
  element: string
  /** Props for the tscircuit element (excluding `name`). */
  props: Record<string, PropValue>
  pinCount: number
  /** Optional label per pin; index 0 is pin 1. */
  pinLabels?: (string | undefined)[]
  loc: Loc
}

export interface PinRef {
  kind: "pin"
  ref: string
  /** 1-based pin number. */
  pin: number
}

export interface NetRef {
  kind: "net"
  /** tscircuit-safe net name. */
  name: string
}

export type Terminal = PinRef | NetRef

export interface Edge {
  a: Terminal
  b: Terminal
}

export interface NetInfo {
  /** tscircuit-safe name, or an auto name like `N1` for unnamed nets. */
  name: string
  /** The name as written in the source (equals `name` for unnamed nets). */
  sourceName: string
  named: boolean
  pins: PinRef[]
}

export interface Netlist {
  title?: string
  parts: ResolvedPart[]
  /** Named nets that appear in the design (need a tscircuit `<net>`). */
  namedNets: string[]
  /** Pairwise connections, in source order, de-duplicated. */
  edges: Edge[]
  /** Full connectivity: every group of connected pins. */
  nets: NetInfo[]
  diagnostics: Diagnostic[]
}

const RESERVED_CHIP_PROPS = new Set(["pins", "left", "right", "top", "bottom"])
const PROP_ALIASES: Record<string, string> = {
  x: "schX",
  y: "schY",
  rotate: "schRotation",
  rotation: "schRotation",
  mpn: "manufacturerPartNumber",
}

/** Make a net name acceptable to tscircuit (no leading digit, no +/-). */
export function sanitizeNetName(name: string): string {
  let s = name
  if (s.startsWith("+")) s = s.slice(1)
  else if (s.startsWith("-")) s = `N${s.slice(1)}`
  s = s.replace(/\+/g, "P").replace(/-/g, "_")
  if (/^[0-9]/.test(s)) s = `V${s}`
  return s
}

function coerce(v: string): string | number | boolean {
  if (v === "true") return true
  if (v === "false") return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

const list = (v: string | undefined) =>
  v
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? []

function defaultChipFootprint(n: number): string {
  return n >= 4 && n % 2 === 0 ? `soic${n}` : `pinrow${n}`
}

function resolvePart(decl: PartDecl, diags: Diagnostic[]): ResolvedPart | undefined {
  const spec = lookupPartType(decl.type)
  if (!spec) {
    diags.push({ severity: "error", message: `unknown part type '${decl.type}' for ${decl.ref}`, loc: decl.loc })
    return undefined
  }
  const props: Record<string, PropValue> = { ...(spec.defaults ?? {}) }
  if (spec.footprint) props.footprint = spec.footprint
  let pinCount = spec.pinCount ?? 0
  let pinLabels: (string | undefined)[] | undefined

  if (spec.chip) {
    const def = spec.chip === "dynamic" ? undefined : spec.chip
    const labels = def ? [...def.pinLabels] : list(decl.props.pins)
    if (!def && labels.length === 0) {
      diags.push({ severity: "error", message: `chip ${decl.ref} needs pins=NAME,NAME,... (in pin-number order)`, loc: decl.loc })
      return undefined
    }
    const seen = new Set<string>()
    for (const l of labels) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(l)) {
        diags.push({ severity: "error", message: `invalid pin label '${l}' on ${decl.ref} (use letters, digits, _)`, loc: decl.loc })
        return undefined
      }
      if (seen.has(l.toLowerCase())) diags.push({ severity: "error", message: `duplicate pin label '${l}' on ${decl.ref}`, loc: decl.loc })
      seen.add(l.toLowerCase())
    }
    pinLabels = labels
    pinCount = labels.length
    props.pinLabels = Object.fromEntries(labels.map((l, i) => [`pin${i + 1}`, l]))
    props.footprint = def?.footprint ?? defaultChipFootprint(pinCount)
    if (def?.mpn) props.manufacturerPartNumber = def.mpn
    const arrangement: Record<string, unknown> = {}
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const pins = decl.props[side] !== undefined ? list(decl.props[side]) : (def?.[side] ?? [])
      if (pins.length === 0) continue
      const resolved: string[] = []
      for (const p of pins) {
        const n = /^\d+$/.test(p) ? Number(p) : labels.findIndex((l) => l.toLowerCase() === p.toLowerCase()) + 1
        if (n < 1 || n > pinCount) {
          diags.push({ severity: "error", message: `${side}= refers to unknown pin '${p}' on ${decl.ref}`, loc: decl.loc })
          continue
        }
        resolved.push(`pin${n}`)
      }
      const direction = side === "left" || side === "right" ? "top-to-bottom" : "left-to-right"
      arrangement[`${side}Side`] = { direction, pins: resolved }
    }
    if (Object.keys(arrangement).length > 0) props.schPinArrangement = arrangement
    if (decl.value !== undefined) props.manufacturerPartNumber = decl.value
  } else if (spec.header) {
    const labels = list(decl.props.pins)
    const n = labels.length || (decl.value !== undefined ? Number(decl.value) : Number(decl.props.pinCount ?? Number.NaN))
    if (!Number.isInteger(n) || n < 1) {
      diags.push({
        severity: "error",
        message: `header ${decl.ref} needs a pin count (e.g. 'part J1 header 4') or pins=A,B,...`,
        loc: decl.loc,
      })
      return undefined
    }
    pinCount = n
    props.pinCount = n
    if (labels.length) {
      pinLabels = labels
      props.pinLabels = Object.fromEntries(labels.map((l, i) => [`pin${i + 1}`, l]))
    }
  } else if (decl.value !== undefined) {
    if (spec.valueProp) props[spec.valueProp] = coerce(decl.value)
    else diags.push({ severity: "warning", message: `${decl.ref}: ${decl.type} takes no value; '${decl.value}' ignored`, loc: decl.loc })
  }

  for (const [rawKey, rawVal] of Object.entries(decl.props)) {
    if ((spec.chip || spec.header) && RESERVED_CHIP_PROPS.has(rawKey)) continue
    if (rawKey === "pinCount" && spec.header) continue
    const key = PROP_ALIASES[rawKey] ?? rawKey
    if (key === "name") {
      diags.push({ severity: "warning", message: `${decl.ref}: 'name' is set from the reference; ignored`, loc: decl.loc })
      continue
    }
    props[key] = key === "footprint" || key === "manufacturerPartNumber" ? rawVal : coerce(rawVal)
  }
  if (spec.valueProp && props[spec.valueProp] === undefined && spec.element !== "led" && spec.element !== "chip") {
    diags.push({ severity: "warning", message: `${decl.ref}: no value given for ${decl.type}`, loc: decl.loc })
  }
  return { ref: decl.ref, type: decl.type, spec, element: spec.element, props, pinCount, pinLabels, loc: decl.loc }
}

function resolvePin(part: ResolvedPart, token: string): number | undefined {
  if (/^\d+$/.test(token)) {
    const n = Number(token)
    return n >= 1 && n <= part.pinCount ? n : undefined
  }
  const t = token.toLowerCase()
  if (part.pinLabels) {
    const i = part.pinLabels.findIndex((l) => l?.toLowerCase() === t)
    if (i >= 0) return i + 1
  }
  const m = /^pin(\d+)$/.exec(t)
  if (m) return resolvePin(part, m[1] as string)
  return part.spec.pins?.[t]
}

function pinNames(part: ResolvedPart): string {
  const names = new Set<string>()
  for (let i = 1; i <= part.pinCount; i++) names.add(String(i))
  for (const l of part.pinLabels ?? []) if (l) names.add(l)
  for (const k of Object.keys(part.spec.pins ?? {})) names.add(k)
  return [...names].join(", ")
}

/** Resolve a parsed document into a validated netlist. */
export function resolveWithDiagnostics(doc: Document): Netlist {
  const diags: Diagnostic[] = []
  const parts = new Map<string, ResolvedPart>()
  for (const st of doc.statements) {
    if (st.kind !== "part") continue
    if (parts.has(st.ref)) {
      diags.push({ severity: "error", message: `duplicate part '${st.ref}'`, loc: st.loc })
      continue
    }
    const p = resolvePart(st, diags)
    if (p) parts.set(st.ref, p)
  }

  const netNames = new Map<string, string>() // safe -> source
  const toTerminal = (ep: Endpoint): Terminal | undefined => {
    if (ep.kind === "pin") {
      const part = parts.get(ep.ref)
      if (!part) {
        diags.push({ severity: "error", message: `unknown part '${ep.ref}' (declare it with 'part ${ep.ref} <type>')`, loc: ep.loc })
        return undefined
      }
      const pin = resolvePin(part, ep.pin)
      if (pin === undefined) {
        diags.push({ severity: "error", message: `${ep.ref} (${part.type}) has no pin '${ep.pin}'; pins: ${pinNames(part)}`, loc: ep.loc })
        return undefined
      }
      return { kind: "pin", ref: ep.ref, pin }
    }
    if (parts.has(ep.name)) {
      diags.push({ severity: "error", message: `'${ep.name}' is a part; connect a pin such as ${ep.name}.1`, loc: ep.loc })
      return undefined
    }
    const safe = sanitizeNetName(ep.name)
    const prev = netNames.get(safe)
    if (prev !== undefined && prev !== ep.name) {
      diags.push({ severity: "error", message: `net names '${prev}' and '${ep.name}' both map to '${safe}'`, loc: ep.loc })
    } else if (prev === undefined) {
      netNames.set(safe, ep.name)
      if (safe !== ep.name) diags.push({ severity: "warning", message: `net '${ep.name}' is renamed '${safe}' for tscircuit`, loc: ep.loc })
    }
    return { kind: "net", name: safe }
  }

  const edges: Edge[] = []
  const edgeKeys = new Set<string>()
  const key = (t: Terminal) => (t.kind === "pin" ? `${t.ref}.${t.pin}` : `net:${t.name}`)
  const addEdge = (a: Terminal, b: Terminal, loc: Loc) => {
    if (a.kind === "net" && b.kind === "net") {
      if (a.name !== b.name) diags.push({ severity: "error", message: `cannot connect two nets directly (${a.name} -- ${b.name})`, loc })
      return
    }
    const k = [key(a), key(b)].sort().join("|")
    if (key(a) === key(b) || edgeKeys.has(k)) return
    edgeKeys.add(k)
    edges.push({ a, b })
  }

  for (const st of doc.statements) {
    if (st.kind === "net") {
      const net = toTerminal({ kind: "net", name: st.name, loc: st.loc })
      if (!net) continue
      for (const m of st.members) {
        const t = toTerminal(m)
        if (t) addEdge(t, net, m.loc)
      }
    } else if (st.kind === "connect") {
      const ts = st.endpoints.map(toTerminal)
      for (let i = 0; i + 1 < ts.length; i++) {
        const a = ts[i]
        const b = ts[i + 1]
        if (a && b) addEdge(a, b, st.endpoints[i + 1]?.loc ?? st.loc)
      }
    }
  }

  // union-find connectivity
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as string
    parent.set(x, r)
    return r
  }
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x)
  }
  for (const e of edges) {
    const a = key(e.a)
    const b = key(e.b)
    add(a)
    add(b)
    parent.set(find(a), find(b))
  }
  const groups = new Map<string, string[]>()
  for (const k of parent.keys()) {
    const r = find(k)
    groups.set(r, [...(groups.get(r) ?? []), k])
  }
  const nets: NetInfo[] = []
  let auto = 1
  for (const members of groups.values()) {
    const named = members.filter((m) => m.startsWith("net:")).map((m) => m.slice(4))
    if (named.length > 1) {
      diags.push({ severity: "error", message: `nets ${named.join(", ")} are shorted together` })
    }
    const pins: PinRef[] = members
      .filter((m) => !m.startsWith("net:"))
      .map((m) => {
        const dot = m.lastIndexOf(".")
        return { kind: "pin", ref: m.slice(0, dot), pin: Number(m.slice(dot + 1)) }
      })
    pins.sort((x, y) => x.ref.localeCompare(y.ref, undefined, { numeric: true }) || x.pin - y.pin)
    const name = named[0] ?? `N${auto++}`
    nets.push({ name, sourceName: named[0] ? (netNames.get(name) ?? name) : name, named: named.length > 0, pins })
  }
  nets.sort((a, b) => Number(b.named) - Number(a.named) || a.name.localeCompare(b.name, undefined, { numeric: true }))

  return {
    title: doc.title,
    parts: [...parts.values()],
    namedNets: [...netNames.keys()],
    edges,
    nets,
    diagnostics: diags,
  }
}

export function resolve(doc: Document): Netlist {
  const nl = resolveWithDiagnostics(doc)
  if (nl.diagnostics.some((d) => d.severity === "error")) throw new CircuitextError(nl.diagnostics)
  return nl
}
