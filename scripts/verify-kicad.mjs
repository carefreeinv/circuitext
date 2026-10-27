// For every example: compare circuitext's netlist with the netlist KiCad
// computes from the exported .kicad_sch (requires kicad-cli on PATH).
import { readdirSync, readFileSync } from "node:fs"
import { parse, resolve } from "../dist/index.js"
import { hasKicadCli, kicadNetGroups } from "./kicad-netlist.mjs"

if (!hasKicadCli()) {
  console.log("kicad-cli not found; skipping")
  process.exit(0)
}
let failed = 0
for (const f of readdirSync("examples").filter((f) => f.endsWith(".ckt"))) {
  const nl = resolve(parse(readFileSync(`examples/${f}`, "utf8")))
  const ours = nl.nets
    .map((n) => n.pins.map((p) => `${p.ref}.${p.pin}`).sort())
    .filter((g) => g.length)
    .sort((a, b) => a[0].localeCompare(b[0]))
  const sch = readFileSync(`examples/${f.replace(/\.ckt$/, ".kicad_sch")}`, "utf8")
  const theirs = kicadNetGroups(sch).filter((g) => g.length > 1 || ours.some((o) => o.includes(g[0])))
  const a = JSON.stringify(ours)
  const b = JSON.stringify(theirs)
  if (a === b) console.log(`ok   ${f}: ${ours.length} nets match KiCad`)
  else {
    failed++
    console.log(`FAIL ${f}\n  circuitext: ${a}\n  kicad:      ${b}`)
  }
}
process.exit(failed ? 1 : 0)
