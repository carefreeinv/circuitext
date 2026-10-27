import mermaid from "mermaid"
import circuitext from "../src/mermaid.js"

await mermaid.registerExternalDiagrams([circuitext])
mermaid.initialize({ startOnLoad: false })
await mermaid.run({ querySelector: ".mermaid" })
document.title = `${document.title} (done)`
