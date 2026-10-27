import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"
import { type CircuitJson, type CompileOptions, compile } from "./compile.js"
import { applyKicadFixups, type KicadFixupOptions } from "./kicad-fixups.js"

export interface SvgOptions {
  width?: number
  height?: number
  /** Draw the schematic grid. */
  grid?: boolean
}

export function circuitJsonToSvg(cj: CircuitJson, opts: SvgOptions = {}): string {
  return convertCircuitJsonToSchematicSvg(cj, {
    width: opts.width,
    height: opts.height,
    grid: opts.grid || undefined,
  })
}

/**
 * Convert Circuit JSON to a KiCad schematic via circuit-json-to-kicad, then
 * apply small compatibility fixups (see kicad-fixups.ts).
 */
export function circuitJsonToKicadSch(cj: CircuitJson, opts: KicadFixupOptions = {}): string {
  const conv = new CircuitJsonToKicadSchConverter(cj as never)
  conv.runUntilFinished()
  return applyKicadFixups(conv.getOutputString(), opts)
}

export async function renderSvg(source: string, opts: SvgOptions & CompileOptions = {}): Promise<string> {
  const { circuitJson } = await compile(source, opts)
  return circuitJsonToSvg(circuitJson, opts)
}

export async function renderKicadSch(source: string, opts: CompileOptions = {}): Promise<string> {
  const { circuitJson, netlist } = await compile(source, opts)
  return circuitJsonToKicadSch(circuitJson, { title: netlist.title })
}
