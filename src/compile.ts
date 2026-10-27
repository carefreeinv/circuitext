import { Circuit } from "@tscircuit/core"
import type { AnyCircuitElement } from "circuit-json"
import { createElement, type ReactElement } from "react"
import type { Diagnostic } from "./errors.js"
import { parse } from "./parser.js"
import { type Netlist, type PropValue, resolve, type Terminal } from "./resolve.js"

export type CircuitJson = AnyCircuitElement[]

const selector = (t: Terminal) => (t.kind === "pin" ? `.${t.ref} > .pin${t.pin}` : `net.${t.name}`)

/** Build the tscircuit React element tree for a netlist. */
export function toReactElement(nl: Netlist): ReactElement {
  const children: ReactElement[] = []
  for (const p of nl.parts) children.push(createElement(p.element, { name: p.ref, ...p.props }))
  for (const n of nl.namedNets) children.push(createElement("net", { name: n }))
  nl.edges.forEach((e) => {
    children.push(createElement("trace", { from: selector(e.a), to: selector(e.b) }))
  })
  return createElement("board", { routingDisabled: true }, ...children)
}

function jsxValue(v: PropValue): string {
  if (typeof v === "string") return JSON.stringify(v)
  return `{${JSON.stringify(v)}}`
}

/** Emit equivalent tscircuit TSX source (handy for graduating to tscircuit). */
export function toTsx(nl: Netlist): string {
  const lines: string[] = []
  if (nl.title) lines.push(`// ${nl.title}`)
  lines.push("export default () => (", "  <board routingDisabled>")
  for (const p of nl.parts) {
    const attrs = [`name="${p.ref}"`, ...Object.entries(p.props).map(([k, v]) => `${k}=${jsxValue(v)}`)]
    lines.push(`    <${p.element} ${attrs.join(" ")} />`)
  }
  for (const n of nl.namedNets) lines.push(`    <net name="${n}" />`)
  for (const e of nl.edges) lines.push(`    <trace from="${selector(e.a)}" to="${selector(e.b)}" />`)
  lines.push("  </board>", ")", "")
  return lines.join("\n")
}

export interface CompileResult {
  netlist: Netlist
  circuitJson: CircuitJson
  /** circuitext diagnostics plus tscircuit errors/warnings. */
  diagnostics: Diagnostic[]
}

export interface CompileOptions {
  /** Include tscircuit's own warnings (missing MPN, etc.) in diagnostics. Default false. */
  includeTscircuitWarnings?: boolean
}

// tscircuit warnings/errors that are noise for a schematic-first tool
const IGNORED =
  /No footprint specified|missing a manufacturer part number|schematic_missing_sheet|pinAttributes|power_pin|ground_pin|unnamed_trace/

/** Compile a netlist (or source text) into Circuit JSON via @tscircuit/core. */
export async function compileNetlist(nl: Netlist, opts: CompileOptions = {}): Promise<CompileResult> {
  const circuit = new Circuit()
  circuit.add(toReactElement(nl))
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson() as CircuitJson
  const diagnostics: Diagnostic[] = [...nl.diagnostics]
  for (const el of circuitJson as Array<Record<string, unknown>>) {
    const type = String(el.type)
    const isErr = type.endsWith("_error")
    const isWarn = type.endsWith("_warning")
    if (!isErr && !isWarn) continue
    const message = String(el.message ?? type)
    if (IGNORED.test(message) || IGNORED.test(type)) continue
    if (isWarn && !opts.includeTscircuitWarnings) continue
    if (type.startsWith("pcb_")) continue
    diagnostics.push({ severity: isErr ? "error" : "warning", message: `tscircuit: ${message}` })
  }
  return { netlist: nl, circuitJson, diagnostics }
}

export async function compile(source: string, opts?: CompileOptions): Promise<CompileResult> {
  return compileNetlist(resolve(parse(source)), opts)
}
