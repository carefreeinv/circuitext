import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
// @ts-expect-error plain JS helper shared with scripts/verify-kicad.mjs
import { hasKicadCli, kicadNetGroups } from "../scripts/kicad-netlist.mjs"
import { compile, renderKicadSch } from "../src/index.js"
import { applyKicadFixups, splitWiresAtJunctions } from "../src/kicad-fixups.js"
import { netlistGroups } from "./helpers.js"

const read = (name: string) => readFileSync(`examples/${name}.ckt`, "utf8")

const wire = (x1: number, y1: number, x2: number, y2: number, id: string) => `
  (wire
    (pts
      (xy ${x1} ${y1})
      (xy ${x2} ${y2})
    )
    (stroke
      (width 0.254)
      (type default)
    )
    (uuid ${id})
  )`

describe("KiCad export", () => {
  it("produces a KiCad 9-loadable schematic with a title block", async () => {
    const sch = await renderKicadSch(read("loop-4-20ma"))
    expect(sch.startsWith("(kicad_sch")).toBe(true)
    expect(sch).not.toContain("(power global)")
    expect(sch).toContain('(title "4-20mA loop sensor into ADS1115")')
    expect(sch).toContain('"ADS1115"')
  })

  it("is deterministic", async () => {
    expect(await renderKicadSch(read("voltage-divider"))).toBe(await renderKicadSch(read("voltage-divider")))
  })

  it("splits wires at T-junctions", () => {
    const sch = `(kicad_sch
  (junction
    (at 5 0)
    (diameter 0)
    (uuid 11111111-1111-4111-8111-111111111111)
  )${wire(0, 0, 10, 0, "22222222-2222-4222-8222-222222222222")}${wire(5, 0, 5, 5, "33333333-3333-4333-8333-333333333333")}
)`
    const out = splitWiresAtJunctions(sch)
    expect(out.match(/\(wire/g)).toHaveLength(3)
    expect(out).toContain("(xy 0 0)\n      (xy 5 0)")
    expect(out).toContain("(xy 5 0)\n      (xy 10 0)")
    expect(applyKicadFixups(out)).toContain("00000000-0000-4000-8000-000000000001")
  })

  it.skipIf(!hasKicadCli())("kicad-cli computes the same nets for every example", async () => {
    for (const name of ["loop-4-20ma", "voltage-divider", "555-blinker"]) {
      const { circuitJson, netlist } = await compile(read(name))
      const { circuitJsonToKicadSch } = await import("../src/render.js")
      const ours = netlistGroups(netlist.nets)
      const theirs = (kicadNetGroups(circuitJsonToKicadSch(circuitJson)) as string[][]).filter(
        (g) => g.length > 1 || ours.some((o) => o.includes(g[0] as string)),
      )
      expect(theirs, name).toEqual(ours)
    }
  })
})
