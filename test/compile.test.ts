import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { compile, parse, renderSvg, resolve, toTsx } from "../src/index.js"
import { circuitJsonNetGroups, netlistGroups } from "./helpers.js"

const EXAMPLES = ["loop-4-20ma", "voltage-divider", "555-blinker"]
const read = (name: string) => readFileSync(`examples/${name}.ckt`, "utf8")

describe("compile to Circuit JSON", () => {
  it("emits source components, nets and traces for the 4-20 mA example", async () => {
    const { circuitJson, diagnostics } = await compile(read("loop-4-20ma"))
    const els = circuitJson as Array<Record<string, any>>
    const comps = els.filter((e) => e.type === "source_component")
    expect(comps.map((c) => [c.name, c.ftype])).toEqual([
      ["V1", "simple_power_source"],
      ["XMTR", "simple_chip"],
      ["R1", "simple_resistor"],
      ["U1", "simple_chip"],
      ["C1", "simple_capacitor"],
    ])
    expect(comps.find((c) => c.name === "R1")?.resistance).toBe(150)
    expect(
      els
        .filter((e) => e.type === "source_net")
        .map((n) => n.name)
        .sort(),
    ).toEqual(["GND", "LOOP_P", "SCL", "SDA", "VCC"])
    expect(els.some((e) => e.type === "schematic_component")).toBe(true)
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([])
  })

  for (const name of EXAMPLES) {
    it(`preserves connectivity for ${name}`, async () => {
      const src = read(name)
      const nl = resolve(parse(src))
      const { circuitJson } = await compile(src)
      expect(circuitJsonNetGroups(circuitJson)).toEqual(netlistGroups(nl.nets))
    })
  }

  it("emits equivalent tscircuit TSX", () => {
    expect(toTsx(resolve(parse(read("voltage-divider"))))).toMatchInlineSnapshot(`
      "// Voltage divider
      export default () => (
        <board routingDisabled>
          <resistor name="R1" footprint="0402" resistance="10k" />
          <resistor name="R2" footprint="0402" resistance="4.7k" />
          <net name="VIN" />
          <net name="VOUT" />
          <net name="GND" />
          <trace from="net.VIN" to=".R1 > .pin1" />
          <trace from=".R1 > .pin2" to="net.VOUT" />
          <trace from=".R2 > .pin1" to="net.VOUT" />
          <trace from=".R2 > .pin2" to="net.GND" />
        </board>
      )
      "
    `)
  })

  it("renders a stable schematic SVG (snapshot)", async () => {
    const svg = await renderSvg(read("voltage-divider"))
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("R1")
    expect(svg).toContain("VOUT")
    await expect(svg).toMatchFileSnapshot("__snapshots__/voltage-divider.svg")
  })
})
