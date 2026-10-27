// These packages ship raw .ts sources that don't type-check under NodeNext.
// @tscircuit/core's declarations reference them; we don't use them directly.
declare const anything: any
export = anything
