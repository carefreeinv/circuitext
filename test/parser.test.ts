import { describe, expect, it } from "vitest"
import { CircuitextError, parse, parseWithDiagnostics } from "../src/index.js"

describe("parser", () => {
  it("parses the README example", () => {
    const doc = parse(`circuit "4-20mA input"
  part V1 dc_source 24V
  part R1 resistor 150 footprint=0805 tolerance=0.1%
  part U1 ads1115
  net LOOP_P: V1.pos, XMTR.pos
  XMTR.neg -- R1.1
  R1.1 -- U1.AIN0
  R1.2 -- GND
`)
    expect(doc.title).toBe("4-20mA input")
    expect(doc.statements).toHaveLength(7)
    expect(doc.statements[1]).toMatchObject({
      kind: "part",
      ref: "R1",
      type: "resistor",
      value: "150",
      props: { footprint: "0805", tolerance: "0.1%" },
      loc: { line: 3, col: 3 },
    })
    expect(doc.statements[3]).toMatchObject({
      kind: "net",
      name: "LOOP_P",
      members: [
        { kind: "pin", ref: "V1", pin: "pos" },
        { kind: "pin", ref: "XMTR", pin: "pos" },
      ],
    })
    expect(doc.statements[6]).toMatchObject({
      kind: "connect",
      endpoints: [
        { kind: "pin", ref: "R1", pin: "2" },
        { kind: "net", name: "GND" },
      ],
    })
  })

  it("strips #, // and %% comments but not inside strings", () => {
    const doc = parse(`# header
part U1 chip pins=A,B mpn="X#1 // not a comment" // trailing
%% mermaid style
U1.A -- U1.B # done`)
    expect(doc.statements).toHaveLength(2)
    expect(doc.statements[0]).toMatchObject({ props: { pins: "A,B", mpn: "X#1 // not a comment" } })
  })

  it("parses chains and tight '--' without spaces", () => {
    const doc = parse("R1.2--R2.1 -- U1.AIN0 -- VOUT")
    const st = doc.statements[0]
    expect(st?.kind).toBe("connect")
    if (st?.kind === "connect")
      expect(st.endpoints.map((e) => (e.kind === "pin" ? `${e.ref}.${e.pin}` : e.name))).toEqual(["R1.2", "R2.1", "U1.AIN0", "VOUT"])
  })

  it("accepts a mermaid-style 'circuitext' header and bare net declarations", () => {
    const doc = parse('circuitext "Demo"\nnet VBUS\n')
    expect(doc.title).toBe("Demo")
    expect(doc.statements[0]).toMatchObject({ kind: "net", name: "VBUS", members: [] })
  })

  it("reports errors with line and column", () => {
    const { diagnostics } = parseWithDiagnostics(`part R1 resistor 1k
R1.1 R1.2
part
part U1 chip mpn="oops
net X: R1.1,`)
    const errs = diagnostics.filter((d) => d.severity === "error")
    expect(errs.map((e) => [e.loc?.line, e.message])).toEqual([
      [2, "expected '--' but got 'R1.2'"],
      [3, "expected a part reference after 'part' (e.g. R1)"],
      [4, "unterminated string"],
      [5, "trailing ','"],
    ])
    expect(errs[0]?.loc?.col).toBe(6)
  })

  it("throws CircuitextError from parse()", () => {
    expect(() => parse("lonely")).toThrow(CircuitextError)
    expect(() => parse("lonely")).toThrow(/1:1: error: 'lonely' is not a statement/)
  })
})
