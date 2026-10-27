import { CircuitextError, circuitJsonToKicadSch, circuitJsonToSvg, compileNetlist, parse, resolve } from "../src/index.js"

const EXAMPLE = `circuit "4-20mA loop sensor into ADS1115"
# 24 V loop supply -> 2-wire transmitter -> 150 ohm shunt
part V1 dc_source 24V
part XMTR chip pins=pos,neg mpn="4-20mA XMTR"
part R1 resistor 150 footprint=0805 tolerance=0.1%
part U1 ads1115

net LOOP_P: V1.pos, XMTR.pos
XMTR.neg -- R1.1
R1.1 -- U1.AIN0
R1.2 -- GND
V1.neg -- GND
U1.VDD -- VCC
U1.GND -- GND
`

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const editor = $<HTMLTextAreaElement>("src")
const out = $<HTMLDivElement>("out")
const status = $<HTMLDivElement>("status")
const dl = $<HTMLButtonElement>("kicad")
editor.value = new URLSearchParams(location.hash.slice(1)).get("src") ?? EXAMPLE

let seq = 0
let lastJson: unknown[] | undefined
let lastTitle: string | undefined
async function update() {
  const my = ++seq
  status.textContent = "rendering…"
  try {
    const nl = resolve(parse(editor.value))
    const t0 = performance.now()
    const { circuitJson, diagnostics } = await compileNetlist(nl)
    if (my !== seq) return
    out.innerHTML = circuitJsonToSvg(circuitJson)
    const svg = out.querySelector("svg")
    if (svg) {
      svg.setAttribute("viewBox", `0 0 ${svg.getAttribute("width")} ${svg.getAttribute("height")}`)
      svg.setAttribute("width", "100%")
      svg.removeAttribute("height")
    }
    lastJson = circuitJson
    lastTitle = nl.title
    const warn = diagnostics.map((d) => `${d.loc ? `${d.loc.line}:${d.loc.col} ` : ""}${d.severity}: ${d.message}`)
    status.textContent = `${nl.parts.length} parts, ${nl.nets.length} nets, ${Math.round(performance.now() - t0)} ms${warn.length ? `\n${warn.join("\n")}` : ""}`
    status.className = ""
  } catch (e) {
    if (my !== seq) return
    status.textContent = e instanceof CircuitextError ? e.message : String(e)
    status.className = "error"
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
editor.addEventListener("input", () => {
  clearTimeout(timer)
  timer = setTimeout(update, 300)
})
dl.addEventListener("click", () => {
  if (!lastJson) return
  const blob = new Blob([circuitJsonToKicadSch(lastJson as never, { title: lastTitle })], { type: "text/plain" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "circuit.kicad_sch"
  a.click()
})
update()
