import type { ConnectStmt, Document, Endpoint, Loc, NetDecl, PartDecl, Statement } from "./ast.js"
import { CircuitextError, type Diagnostic } from "./errors.js"

type TokKind = "word" | "string" | "link" | "colon" | "comma" | "eq"
interface Token {
  kind: TokKind
  text: string
  loc: Loc
}

const REF_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const PIN_RE = /^[A-Za-z0-9_+-]+$/
const NET_RE = /^[A-Za-z0-9_+-]+$/

/** Strip `#`, `//` and `%%` comments that are not inside a quoted string. */
function stripComment(line: string): string {
  let inStr = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "\\" && inStr) {
      i++
      continue
    }
    if (c === '"') inStr = !inStr
    if (inStr) continue
    if (c === "#") return line.slice(0, i)
    if ((c === "/" && line[i + 1] === "/") || (c === "%" && line[i + 1] === "%")) return line.slice(0, i)
  }
  return line
}

function tokenize(line: string, lineNo: number, diags: Diagnostic[]): Token[] {
  const toks: Token[] = []
  let i = 0
  while (i < line.length) {
    const c = line[i] as string
    const loc = { line: lineNo, col: i + 1 }
    if (/\s/.test(c)) {
      i++
    } else if (c === '"') {
      let j = i + 1
      let text = ""
      while (j < line.length && line[j] !== '"') {
        if (line[j] === "\\" && j + 1 < line.length) j++
        text += line[j]
        j++
      }
      if (j >= line.length) diags.push({ severity: "error", message: "unterminated string", loc })
      toks.push({ kind: "string", text, loc })
      i = j + 1
    } else if (c === "-" && line[i + 1] === "-") {
      toks.push({ kind: "link", text: "--", loc })
      i += 2
    } else if (c === ":" || c === "," || c === "=") {
      toks.push({ kind: c === ":" ? "colon" : c === "," ? "comma" : "eq", text: c, loc })
      i++
    } else {
      let j = i
      while (j < line.length && !/[\s",:=]/.test(line[j] as string) && !(line[j] === "-" && line[j + 1] === "-")) j++
      toks.push({ kind: "word", text: line.slice(i, j), loc })
      i = j
    }
  }
  return toks
}

function parseEndpoint(tok: Token | undefined, diags: Diagnostic[], fallback: Loc): Endpoint | undefined {
  if (!tok) {
    diags.push({ severity: "error", message: "expected a pin (REF.pin) or net name", loc: fallback })
    return undefined
  }
  if (tok.kind !== "word") {
    diags.push({ severity: "error", message: `expected a pin (REF.pin) or net name, got '${tok.text}'`, loc: tok.loc })
    return undefined
  }
  const dot = tok.text.indexOf(".")
  if (dot >= 0) {
    const ref = tok.text.slice(0, dot)
    const pin = tok.text.slice(dot + 1)
    if (!REF_RE.test(ref) || !PIN_RE.test(pin)) {
      diags.push({ severity: "error", message: `invalid pin reference '${tok.text}'`, loc: tok.loc })
      return undefined
    }
    return { kind: "pin", ref, pin, loc: tok.loc }
  }
  if (!NET_RE.test(tok.text)) {
    diags.push({ severity: "error", message: `invalid net name '${tok.text}'`, loc: tok.loc })
    return undefined
  }
  return { kind: "net", name: tok.text, loc: tok.loc }
}

function parsePart(toks: Token[], diags: Diagnostic[]): PartDecl | undefined {
  const kw = toks[0] as Token
  const ref = toks[1]
  const type = toks[2]
  if (!ref || ref.kind !== "word" || !REF_RE.test(ref.text)) {
    diags.push({ severity: "error", message: "expected a part reference after 'part' (e.g. R1)", loc: ref?.loc ?? kw.loc })
    return undefined
  }
  if (!type || type.kind !== "word") {
    diags.push({ severity: "error", message: `expected a part type after '${ref.text}' (e.g. resistor)`, loc: type?.loc ?? ref.loc })
    return undefined
  }
  const decl: PartDecl = { kind: "part", ref: ref.text, type: type.text.toLowerCase(), props: {}, loc: kw.loc }
  let i = 3
  while (i < toks.length) {
    const t = toks[i] as Token
    const next = toks[i + 1]
    if ((t.kind === "word" || t.kind === "string") && next?.kind === "eq") {
      const key = t.text
      let j = i + 2
      const parts: string[] = []
      // values may be comma-separated lists: pins=VDD,GND,SDA
      while (j < toks.length) {
        const v = toks[j] as Token
        if (v.kind !== "word" && v.kind !== "string") break
        if (toks[j + 1]?.kind === "eq") break
        parts.push(v.text)
        if (toks[j + 1]?.kind === "comma") j += 2
        else {
          j++
          break
        }
      }
      if (parts.length === 0) {
        diags.push({ severity: "error", message: `missing value for property '${key}'`, loc: t.loc })
        return undefined
      }
      if (key in decl.props) diags.push({ severity: "warning", message: `duplicate property '${key}'`, loc: t.loc })
      decl.props[key] = parts.join(",")
      i = j
    } else if ((t.kind === "word" || t.kind === "string") && decl.value === undefined && Object.keys(decl.props).length === 0) {
      decl.value = t.text
      i++
    } else {
      diags.push({ severity: "error", message: `unexpected '${t.text}' in part declaration`, loc: t.loc })
      return undefined
    }
  }
  return decl
}

function parseNet(toks: Token[], diags: Diagnostic[]): NetDecl | undefined {
  const kw = toks[0] as Token
  const name = toks[1]
  if (!name || name.kind !== "word" || name.text.includes(".") || !NET_RE.test(name.text)) {
    diags.push({ severity: "error", message: "expected a net name after 'net'", loc: name?.loc ?? kw.loc })
    return undefined
  }
  const decl: NetDecl = { kind: "net", name: name.text, members: [], loc: kw.loc }
  if (toks.length === 2) return decl
  if (toks[2]?.kind !== "colon") {
    diags.push({ severity: "error", message: "expected ':' after net name", loc: toks[2]?.loc ?? name.loc })
    return undefined
  }
  let i = 3
  while (i < toks.length) {
    const ep = parseEndpoint(toks[i], diags, name.loc)
    if (!ep) return undefined
    decl.members.push(ep)
    i++
    if (i < toks.length) {
      if (toks[i]?.kind !== "comma") {
        diags.push({ severity: "error", message: "expected ',' between net members", loc: toks[i]?.loc })
        return undefined
      }
      i++
      if (i >= toks.length) diags.push({ severity: "error", message: "trailing ','", loc: toks[i - 1]?.loc })
    }
  }
  return decl
}

function parseConnect(toks: Token[], diags: Diagnostic[]): ConnectStmt | undefined {
  const first = toks[0] as Token
  if (toks.length === 1) {
    diags.push({
      severity: "error",
      message: `'${first.text}' is not a statement; expected 'part', 'net', or a connection 'a -- b'`,
      loc: first.loc,
    })
    return undefined
  }
  const endpoints: Endpoint[] = []
  let i = 0
  for (;;) {
    const ep = parseEndpoint(toks[i], diags, toks[i - 1]?.loc ?? first.loc)
    if (!ep) return undefined
    endpoints.push(ep)
    i++
    if (i >= toks.length) break
    if (toks[i]?.kind !== "link") {
      diags.push({ severity: "error", message: `expected '--' but got '${toks[i]?.text}'`, loc: toks[i]?.loc })
      return undefined
    }
    i++
  }
  return { kind: "connect", endpoints, loc: first.loc }
}

export interface ParseResult {
  document: Document
  diagnostics: Diagnostic[]
}

/** Parse source text, collecting diagnostics instead of throwing. */
export function parseWithDiagnostics(source: string): ParseResult {
  const diags: Diagnostic[] = []
  const statements: Statement[] = []
  let title: string | undefined
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  lines.forEach((raw, idx) => {
    const toks = tokenize(stripComment(raw), idx + 1, diags)
    if (toks.length === 0) return
    const head = toks[0] as Token
    const kw = head.kind === "word" ? head.text.toLowerCase() : ""
    if (kw === "circuit" || kw === "circuitext") {
      if (title !== undefined) diags.push({ severity: "warning", message: "duplicate circuit title", loc: head.loc })
      title = toks
        .slice(1)
        .map((t) => t.text)
        .join(" ")
      return
    }
    const stmt = kw === "part" ? parsePart(toks, diags) : kw === "net" ? parseNet(toks, diags) : parseConnect(toks, diags)
    if (stmt) statements.push(stmt)
  })
  return { document: { title: title || undefined, statements }, diagnostics: diags }
}

/** Parse source text; throws {@link CircuitextError} on any error. */
export function parse(source: string): Document {
  const { document, diagnostics } = parseWithDiagnostics(source)
  if (diagnostics.some((d) => d.severity === "error")) throw new CircuitextError(diagnostics)
  return document
}
