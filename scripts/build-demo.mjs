// Bundle the browser demo pages into demo/dist (not committed).
import { build } from "esbuild"

// Node-only / 3D-only modules that @tscircuit/core references but a
// schematic-only browser build never executes.
const STUB = /^(@resvg\/resvg-js|circuit-json-to-gltf|fs|path|os|module|node:.*)$/
const stubPlugin = {
  name: "stub-node-only",
  setup(b) {
    b.onResolve({ filter: STUB }, (args) => ({ path: args.path, namespace: "stub" }))
    b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
      contents: `module.exports = new Proxy({}, { get: (_, k) => k === "__esModule" ? false : () => { throw new Error("${args.path} is not available in the browser") } })`,
      loader: "js",
    }))
  },
}

await build({
  entryPoints: { demo: "demo/main.ts", mermaid: "demo/mermaid.ts" },
  outdir: "demo/dist",
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  platform: "browser",
  target: "es2022",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [stubPlugin],
  logLevel: "error",
})
console.log("built demo/dist")
