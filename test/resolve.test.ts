import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CircuitextError, parse, resolve, resolveWithDiagnostics, sanitizeNetName } from "../src/index.js"

const nets = (src: string) =>
  Object.fromEntries(resolve(parse(src)).nets.map((n) => [n.sourceName, n.pins.map((p) => `${p.ref}.${p.pin}`)]))
const errors = (src: string) =>
  resolveWithDiagnostics(parse(src))
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.message)

describe("resolve", () => {
  it("builds the 4-20 mA example netlist", () => {
    expect(nets(readFileSync("examples/loop-4-20ma.ckt", "utf8"))).toEqual({
      GND: ["C1.2", "R1.2", "U1.1", "U1.3", "V1.2"],
      LOOP_P: ["V1.1", "XMTR.1"],
      SCL: ["U1.10"],
      SDA: ["U1.9"],
      VCC: ["C1.1", "U1.8"],
      N1: ["R1.1", "U1.4", "XMTR.2"],
    })
  })

  it("maps part types to tscircuit elements and props", () => {
    const nl = resolve(
      parse(`part R1 resistor 150 footprint=0805 tolerance=0.1% x=2
part D1 led red
part U1 ads1115
part J1 header pins=VIN,GND`),
    )
    const [r1, d1, u1, j1] = nl.parts
    expect(r1).toMatchObject({ element: "resistor", props: { resistance: 150, footprint: "0805", tolerance: "0.1%", schX: 2 } })
    expect(d1).toMatchObject({ element: "led", props: { color: "red", footprint: "0603" } })
    expect(u1?.element).toBe("chip")
    expect(u1?.props.manufacturerPartNumber).toBe("ADS1115")
    expect(u1?.props.pinLabels).toMatchObject({ pin4: "AIN0", pin8: "VDD" })
    expect(j1).toMatchObject({ element: "pinheader", pinCount: 2, props: { pinCount: 2 } })
  })

  it("resolves pin aliases, numbers and chip labels (case-insensitive)", () => {
    expect(
      nets(`part D1 diode
part Q1 npn
part U1 chip pins=VDD,GND,OUT
D1.anode -- Q1.c
D1.K -- Q1.emitter
U1.out -- Q1.b
U1.2 -- GND`),
    ).toEqual({ GND: ["U1.2"], N1: ["D1.1", "Q1.1"], N2: ["D1.2", "Q1.3"], N3: ["Q1.2", "U1.3"] })
  })

  it("reports unknown parts, pins and types", () => {
    expect(errors("part R1 resistor 1k\nR1.3 -- X1.1\npart Z1 flux_capacitor")).toEqual([
      "unknown part type 'flux_capacitor' for Z1",
      "R1 (resistor) has no pin '3'; pins: 1, 2, left, right, a, b",
      "unknown part 'X1' (declare it with 'part X1 <type>')",
    ])
  })

  it("rejects shorted named nets, bare part refs and duplicates", () => {
    expect(errors("part R1 resistor 1k\nR1.1 -- VCC\nR1.1 -- GND")).toEqual(["nets VCC, GND are shorted together"])
    expect(errors("part R1 resistor 1k\nR1 -- GND")).toEqual(["'R1' is a part; connect a pin such as R1.1"])
    expect(errors("part R1 resistor 1k\npart R1 resistor 2k")).toEqual(["duplicate part 'R1'"])
    expect(errors("VCC -- GND")).toEqual(["cannot connect two nets directly (VCC -- GND)"])
  })

  it("sanitizes net names for tscircuit and warns", () => {
    expect(sanitizeNetName("3V3")).toBe("V3V3")
    expect(sanitizeNetName("+5V")).toBe("V5V")
    expect(sanitizeNetName("-12V")).toBe("N12V")
    expect(sanitizeNetName("LOOP_P")).toBe("LOOP_P")
    const nl = resolve(parse("part R1 resistor 1k\nR1.1 -- 3V3"))
    expect(nl.namedNets).toEqual(["V3V3"])
    expect(nl.nets[0]?.sourceName).toBe("3V3")
    expect(nl.diagnostics[0]?.message).toBe("net '3V3' is renamed 'V3V3' for tscircuit")
  })

  it("de-duplicates repeated connections", () => {
    const nl = resolve(parse("part R1 resistor 1k\nR1.1 -- GND\nGND -- R1.1\nnet GND: R1.1"))
    expect(nl.edges).toHaveLength(1)
  })

  it("throws CircuitextError from resolve()", () => {
    expect(() => resolve(parse("A.1 -- GND"))).toThrow(CircuitextError)
  })
})
