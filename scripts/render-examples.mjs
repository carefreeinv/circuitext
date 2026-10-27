// Re-render every examples/*.ckt to .svg and .kicad_sch (run after `npm run build`).
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { circuitJsonToKicadSch, circuitJsonToSvg, compile } from "../dist/index.js"

for (const f of readdirSync("examples").filter((f) => f.endsWith(".ckt"))) {
  const base = `examples/${f.replace(/\.ckt$/, "")}`
  const { circuitJson, netlist, diagnostics } = await compile(readFileSync(`examples/${f}`, "utf8"))
  for (const d of diagnostics) console.warn(`${f}: ${d.severity}: ${d.message}`)
  writeFileSync(`${base}.svg`, circuitJsonToSvg(circuitJson))
  writeFileSync(`${base}.kicad_sch`, circuitJsonToKicadSch(circuitJson, { title: netlist.title }))
  console.log(`rendered ${base}.svg and ${base}.kicad_sch`)
}
