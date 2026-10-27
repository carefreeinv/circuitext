import type { Loc } from "./ast.js"

export interface Diagnostic {
  severity: "error" | "warning"
  message: string
  loc?: Loc
}

export function formatDiagnostic(d: Diagnostic, file?: string): string {
  const where = d.loc ? `${file ?? "input"}:${d.loc.line}:${d.loc.col}: ` : file ? `${file}: ` : ""
  return `${where}${d.severity}: ${d.message}`
}

/** Thrown when the source text cannot be parsed or resolved. */
export class CircuitextError extends Error {
  readonly diagnostics: Diagnostic[]
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => formatDiagnostic(d)).join("\n"))
    this.name = "CircuitextError"
    this.diagnostics = diagnostics
  }
}
