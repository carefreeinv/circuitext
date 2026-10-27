/**
 * Mermaid external-diagram adapter (experimental).
 *
 *   import mermaid from "mermaid"
 *   import circuitext from "circuitext/mermaid"
 *   await mermaid.registerExternalDiagrams([circuitext])
 *
 * Then a fenced block that starts with `circuitext` renders as a schematic:
 *
 *   circuitext "Divider"
 *     part R1 resistor 10k
 *     ...
 *
 * The object is shaped like Mermaid's `ExternalDiagramDefinition`; mermaid is
 * not a dependency. Rendering runs @tscircuit/core in the page, so the first
 * diagram pulls in a large bundle (lazy-loaded via the loader).
 */

export interface MermaidLikeDiagramDefinition {
  id: string
  detector: (text: string) => boolean
  // `any` so it is assignable to mermaid's ExternalDiagramDefinition without depending on mermaid
  loader: () => Promise<{ id: string; diagram: any }>
}

const HEADER = /^\s*circuitext\b/i

export const circuitextDiagram: MermaidLikeDiagramDefinition = {
  id: "circuitext",
  detector: (text: string) => HEADER.test(text),
  loader: async () => {
    const [{ parse }, { resolve }, { compileNetlist }, { circuitJsonToSvg }] = await Promise.all([
      import("./parser.js"),
      import("./resolve.js"),
      import("./compile.js"),
      import("./render.js"),
    ])
    const diagram = {
      db: { clear: () => {} },
      parser: {
        // throws CircuitextError with line:col diagnostics on bad input
        parse: (text: string) => {
          resolve(parse(text))
        },
      },
      renderer: {
        draw: async (text: string, id: string) => {
          const { circuitJson } = await compileNetlist(resolve(parse(text)))
          const svgText = circuitJsonToSvg(circuitJson)
          const target = document.getElementById(id)
          if (!target) throw new Error(`circuitext: no element #${id}`)
          const doc = new DOMParser().parseFromString(svgText, "image/svg+xml")
          const src = doc.documentElement
          const w = src.getAttribute("width") ?? "1200"
          const h = src.getAttribute("height") ?? "600"
          target.setAttribute("viewBox", `0 0 ${w} ${h}`)
          target.setAttribute("width", "100%")
          target.setAttribute("style", `max-width: ${w}px; ${src.getAttribute("style") ?? ""}`)
          target.setAttribute("class", `${target.getAttribute("class") ?? ""} ${src.getAttribute("class") ?? ""}`.trim())
          while (target.firstChild) target.removeChild(target.firstChild)
          for (const child of Array.from(src.childNodes)) target.appendChild(document.importNode(child, true))
        },
      },
      styles: () => "",
    }
    return { id: "circuitext", diagram }
  },
}

export default circuitextDiagram
