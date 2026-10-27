import { describe, expect, it } from "vitest"
import circuitext from "../src/mermaid.js"

describe("mermaid adapter", () => {
  it("detects circuitext blocks only", () => {
    expect(circuitext.id).toBe("circuitext")
    expect(circuitext.detector('circuitext "x"\npart R1 resistor 1k')).toBe(true)
    expect(circuitext.detector("  circuitext\n")).toBe(true)
    expect(circuitext.detector("flowchart LR\n a-->b")).toBe(false)
    expect(circuitext.detector("circuitDiagram A")).toBe(false)
  })

  it("loader returns a diagram whose parser validates input", async () => {
    const { diagram } = (await circuitext.loader()) as { diagram: { parser: { parse: (t: string) => void } } }
    expect(() => diagram.parser.parse("circuitext\npart R1 resistor 1k\nR1.1 -- GND")).not.toThrow()
    expect(() => diagram.parser.parse("circuitext\nR9.1 -- GND")).toThrow(/unknown part 'R9'/)
  })
})
