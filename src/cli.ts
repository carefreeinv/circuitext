#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { compileNetlist, toTsx } from "./compile.js"
import { CircuitextError, type Diagnostic, formatDiagnostic } from "./errors.js"
import { parseWithDiagnostics } from "./parser.js"
import { circuitJsonToKicadSch, circuitJsonToSvg } from "./render.js"
import { resolveWithDiagnostics } from "./resolve.js"

const USAGE = `circuitext — a Mermaid-style text syntax for circuits (tscircuit backend)

Usage:
  circuitext render  <in.ckt> [-o out.svg]        schematic SVG (circuit-to-svg)
  circuitext kicad   <in.ckt> [-o out.kicad_sch]  KiCad schematic (circuit-json-to-kicad)
  circuitext json    <in.ckt> [-o out.json]       tscircuit Circuit JSON
  circuitext tsx     <in.ckt> [-o out.tsx]        equivalent tscircuit TSX
  circuitext netlist <in.ckt> [-o out.txt]        resolved nets (text)
  circuitext check   <in.ckt>                     parse + validate only

Options:
  -o, --output <file>   write to file instead of stdout ('-' reads stdin)
  -w, --warnings        also show tscircuit warnings
      --grid            draw the schematic grid (render)
  -h, --help
`

function fail(diags: Diagnostic[], file: string): never {
  for (const d of diags) process.stderr.write(`${formatDiagnostic(d, file)}\n`)
  process.exit(1)
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      warnings: { type: "boolean", short: "w" },
      grid: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  })
  const [cmd, file] = positionals
  if (values.help || !cmd || !file) {
    process.stdout.write(USAGE)
    process.exit(values.help ? 0 : 2)
  }
  const commands = ["render", "svg", "kicad", "json", "tsx", "netlist", "check"]
  if (!commands.includes(cmd)) {
    process.stderr.write(`unknown command '${cmd}'\n\n${USAGE}`)
    process.exit(2)
  }
  const source = readFileSync(file === "-" ? 0 : file, "utf8")
  const parsed = parseWithDiagnostics(source)
  const nl = resolveWithDiagnostics(parsed.document)
  const front = [...parsed.diagnostics, ...nl.diagnostics]
  if (front.some((d) => d.severity === "error")) fail(front, file)

  let out: string
  if (cmd === "check") {
    for (const d of front) process.stderr.write(`${formatDiagnostic(d, file)}\n`)
    process.stdout.write(`ok: ${nl.parts.length} parts, ${nl.nets.length} nets\n`)
    return
  }
  if (cmd === "tsx") {
    out = toTsx(nl)
  } else if (cmd === "netlist") {
    out = `${nl.nets.map((n) => `${n.sourceName}: ${n.pins.map((p) => `${p.ref}.${p.pin}`).join(", ")}`).join("\n")}\n`
  } else {
    const { circuitJson, diagnostics } = await compileNetlist(nl, { includeTscircuitWarnings: values.warnings })
    const extra = diagnostics.filter((d) => !front.includes(d))
    for (const d of [...parsed.diagnostics, ...diagnostics]) {
      if (d.severity === "warning" || extra.includes(d)) process.stderr.write(`${formatDiagnostic(d, file)}\n`)
    }
    if (cmd === "json") out = `${JSON.stringify(circuitJson, null, 2)}\n`
    else if (cmd === "kicad") out = circuitJsonToKicadSch(circuitJson, { title: nl.title })
    else out = circuitJsonToSvg(circuitJson, { grid: values.grid })
  }
  if (values.output && values.output !== "-") writeFileSync(values.output, out)
  else process.stdout.write(out)
}

main().catch((err) => {
  if (err instanceof CircuitextError) fail(err.diagnostics, "input")
  process.stderr.write(`${err?.stack ?? err}\n`)
  process.exit(1)
})
