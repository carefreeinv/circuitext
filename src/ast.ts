/** Source location (1-based line and column). */
export interface Loc {
  line: number
  col: number
}

/** `REF.pin` — a pin on a declared part. */
export interface PinEndpoint {
  kind: "pin"
  ref: string
  pin: string
  loc: Loc
}

/** A bare identifier such as `GND`, `VCC` or `LOOP_P` — a named net. */
export interface NetEndpoint {
  kind: "net"
  name: string
  loc: Loc
}

export type Endpoint = PinEndpoint | NetEndpoint

export interface PartDecl {
  kind: "part"
  ref: string
  type: string
  value?: string
  props: Record<string, string>
  loc: Loc
}

export interface NetDecl {
  kind: "net"
  name: string
  members: Endpoint[]
  loc: Loc
}

/** `a -- b -- c`: a chain of pairwise connections. */
export interface ConnectStmt {
  kind: "connect"
  endpoints: Endpoint[]
  loc: Loc
}

export type Statement = PartDecl | NetDecl | ConnectStmt

export interface Document {
  title?: string
  statements: Statement[]
}
