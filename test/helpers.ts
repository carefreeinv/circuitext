import type { CircuitJson } from "../src/index.js"

/** Connectivity groups ("REF.pin") recomputed from Circuit JSON source_traces. */
export function circuitJsonNetGroups(cj: CircuitJson): string[][] {
  const els = cj as Array<Record<string, any>>
  const comps = new Map(els.filter((e) => e.type === "source_component").map((e) => [e.source_component_id, e.name]))
  const portName = new Map<string, string>()
  for (const p of els.filter((e) => e.type === "source_port")) {
    portName.set(p.source_port_id, `${comps.get(p.source_component_id)}.${p.pin_number}`)
  }
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x)
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as string
    return r
  }
  for (const t of els.filter((e) => e.type === "source_trace")) {
    const ids: string[] = [...(t.connected_source_port_ids ?? []), ...(t.connected_source_net_ids ?? [])]
    for (let i = 1; i < ids.length; i++) parent.set(find(ids[i] as string), find(ids[0] as string))
  }
  const groups = new Map<string, string[]>()
  for (const [id, name] of portName) {
    if (!parent.has(id)) continue
    const r = find(id)
    groups.set(r, [...(groups.get(r) ?? []), name])
  }
  return [...groups.values()].map((g) => g.sort()).sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
}

export function netlistGroups(nets: { pins: { ref: string; pin: number }[] }[]): string[][] {
  return nets
    .map((n) => n.pins.map((p) => `${p.ref}.${p.pin}`).sort())
    .filter((g) => g.length > 0)
    .sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
}
