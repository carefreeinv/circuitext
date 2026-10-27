import { execFileSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"

const CLI = "dist/cli.js"

describe.skipIf(!existsSync(CLI))("cli (built)", () => {
  it("prints a netlist", () => {
    const out = execFileSync("node", [CLI, "netlist", "examples/voltage-divider.ckt"], { encoding: "utf8" })
    expect(out).toBe("GND: R2.2\nVIN: R1.1\nVOUT: R1.2, R2.1\n")
  })

  it("renders SVG to stdout", () => {
    const out = execFileSync("node", [CLI, "render", "examples/voltage-divider.ckt"], { encoding: "utf8" })
    expect(out.startsWith("<svg")).toBe(true)
  })

  it("exits 1 with file:line:col diagnostics", () => {
    const r = spawnSync("node", [CLI, "check", "-"], { input: "part R1 resistor 1k\nR1.9 -- GND\n", encoding: "utf8" })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain("-:2:1: error: R1 (resistor) has no pin '9'")
  })
})
