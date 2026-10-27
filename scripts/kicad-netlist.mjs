// Export a .kicad_sch netlist with kicad-cli and return connectivity groups.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export function hasKicadCli() {
  try {
    execFileSync("kicad-cli", ["--version"], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

/** @returns {string[][]} sorted groups of "REF.pin" with >= 1 member, excluding power-symbol refs */
export function kicadNetGroups(kicadSch) {
  const dir = mkdtempSync(join(tmpdir(), "circuitext-kicad-"))
  const sch = join(dir, "design.kicad_sch")
  const net = join(dir, "design.net")
  writeFileSync(sch, kicadSch)
  execFileSync("kicad-cli", ["sch", "export", "netlist", "-o", net, sch], { stdio: "pipe" })
  const text = readFileSync(net, "utf8")
  const nets = text.split(/\(net \(code/).slice(1)
  const groups = []
  for (const n of nets) {
    const nodes = [...n.matchAll(/\(node \(ref "([^"]+)"\) \(pin "([^"]+)"\)/g)]
      .filter((m) => !m[1].startsWith("#"))
      .map((m) => `${m[1]}.${m[2]}`)
      .sort()
    if (nodes.length) groups.push(nodes)
  }
  return groups.sort((a, b) => a[0].localeCompare(b[0]))
}
