/**
 * Part-type registry: maps circuitext part types onto tscircuit intrinsic
 * elements, their value prop, default footprint and pin aliases.
 */

export interface ChipDef {
  /** pin number -> label */
  pinLabels: string[]
  left?: string[]
  right?: string[]
  top?: string[]
  bottom?: string[]
  mpn?: string
  footprint?: string
}

export interface PartSpec {
  /** tscircuit intrinsic element name, e.g. "resistor". */
  element: string
  description: string
  /** tscircuit prop that receives the positional value, e.g. "resistance". */
  valueProp?: string
  /** Fixed extra props for the element. */
  defaults?: Record<string, string | number | boolean>
  /** Default footprint when the user doesn't give one. */
  footprint?: string
  /** Number of pins for fixed-pin parts. */
  pinCount?: number
  /** Lower-case alias -> 1-based pin number. Numbers are always accepted. */
  pins?: Record<string, number>
  /** Chip-like part with labelled pins (generic `chip` or a library part). */
  chip?: ChipDef | "dynamic"
  /** Pin header whose pin count comes from `pins=` or the value. */
  header?: boolean
}

const TWO = { "1": 1, "2": 2, left: 1, right: 2, a: 1, b: 2 }
const POLAR = { ...TWO, pos: 1, neg: 2, "+": 1, "-": 2, p: 1, n: 2 }
const DIODE = { ...TWO, anode: 1, cathode: 2, a: 1, k: 2, c: 2, "+": 1, "-": 2 }
const BJT = { c: 1, collector: 1, b: 2, base: 2, e: 3, emitter: 3 }
const FET = { d: 1, drain: 1, s: 2, source: 2, g: 3, gate: 3 }

const passive = (element: string, description: string, valueProp: string, footprint: string, pins = TWO): PartSpec => ({
  element,
  description,
  valueProp,
  footprint,
  pinCount: 2,
  pins,
})

const resistor = passive("resistor", "Resistor", "resistance", "0402")
const capacitor = passive("capacitor", "Capacitor", "capacitance", "0402", POLAR)
const inductor = passive("inductor", "Inductor", "inductance", "0603")
const diode: PartSpec = { element: "diode", description: "Diode", footprint: "sod123", pinCount: 2, pins: DIODE }
const led: PartSpec = {
  element: "led",
  description: "LED (value = color)",
  valueProp: "color",
  footprint: "0603",
  pinCount: 2,
  pins: DIODE,
}
const fuse = passive("fuse", "Fuse (value = current rating)", "currentRating", "1206")
const battery: PartSpec = {
  element: "battery",
  description: "DC source / battery (value = voltage)",
  valueProp: "voltage",
  footprint: "pinrow2",
  pinCount: 2,
  pins: POLAR,
}
const vsource: PartSpec = {
  element: "voltagesource",
  description: "AC voltage source (value = voltage)",
  valueProp: "voltage",
  pinCount: 2,
  pins: POLAR,
}
const isource: PartSpec = {
  element: "currentsource",
  description: "Current source (value = current)",
  valueProp: "current",
  pinCount: 2,
  pins: POLAR,
}
const bjt = (type: "npn" | "pnp"): PartSpec => ({
  element: "transistor",
  description: `${type.toUpperCase()} BJT (pins c, b, e)`,
  defaults: { type },
  footprint: "sot23",
  pinCount: 3,
  pins: BJT,
})
const fet = (channelType: "n" | "p"): PartSpec => ({
  element: "mosfet",
  description: `${channelType.toUpperCase()}-channel MOSFET (pins d, s, g)`,
  defaults: { channelType, mosfetMode: "enhancement" },
  footprint: "sot23",
  pinCount: 3,
  pins: FET,
})
const pot = passive("potentiometer", "Potentiometer (value = max resistance)", "maxResistance", "pinrow2")
const crystal: PartSpec = {
  element: "crystal",
  description: "Crystal (value = frequency)",
  valueProp: "frequency",
  defaults: { loadCapacitance: "18pF" },
  footprint: "pinrow2",
  pinCount: 2,
  pins: TWO,
}
const sw: PartSpec = {
  element: "switch",
  description: "SPST switch",
  defaults: { type: "spst" },
  footprint: "pinrow2",
  pinCount: 2,
  pins: TWO,
}
const button: PartSpec = { element: "pushbutton", description: "Push button (4 pins)", footprint: "pushbutton", pinCount: 4, pins: {} }
const opamp: PartSpec = {
  element: "opamp",
  description: "Op-amp (pins inp, inn, out, vcc, vee)",
  footprint: "soic8",
  pinCount: 5,
  pins: {
    inp: 1,
    "+": 1,
    in_p: 1,
    inn: 2,
    "-": 2,
    in_n: 2,
    out: 3,
    vcc: 4,
    vdd: 4,
    "v+": 4,
    vee: 5,
    vss: 5,
    "v-": 5,
    gnd: 5,
  },
}
const testpoint: PartSpec = { element: "testpoint", description: "Test point (1 pin)", pinCount: 1, pins: { tp: 1 } }
const header: PartSpec = { element: "pinheader", description: "Pin header / connector (value or pins= sets the pin count)", header: true }
const chip: PartSpec = {
  element: "chip",
  description: "Generic IC; declare pins=A,B,C (optional left=/right=/top=/bottom=)",
  chip: "dynamic",
}

/** Built-in library chips. Pin order follows the datasheet pin numbers. */
const ads1115: PartSpec = {
  element: "chip",
  description: "TI ADS1115 16-bit I2C ADC (MSOP-10)",
  chip: {
    pinLabels: ["ADDR", "ALERT", "GND", "AIN0", "AIN1", "AIN2", "AIN3", "VDD", "SDA", "SCL"],
    left: ["AIN0", "AIN1", "AIN2", "AIN3", "ADDR"],
    right: ["VDD", "SDA", "SCL", "ALERT", "GND"],
    mpn: "ADS1115",
    footprint: "msop10",
  },
}
const ne555: PartSpec = {
  element: "chip",
  description: "NE555 timer (SOIC-8)",
  chip: {
    pinLabels: ["GND", "TRIG", "OUT", "RESET", "CTRL", "THR", "DIS", "VCC"],
    left: ["TRIG", "THR", "DIS", "CTRL"],
    right: ["VCC", "RESET", "OUT", "GND"],
    mpn: "NE555",
    footprint: "soic8",
  },
}

export const PART_TYPES: Record<string, PartSpec> = {
  resistor,
  r: resistor,
  res: resistor,
  capacitor,
  c: capacitor,
  cap: capacitor,
  inductor,
  l: inductor,
  diode,
  d: diode,
  led,
  fuse,
  battery,
  dc_source: battery,
  vdc: battery,
  vsource,
  ac_source: vsource,
  isource,
  current_source: isource,
  npn: bjt("npn"),
  pnp: bjt("pnp"),
  nmos: fet("n"),
  pmos: fet("p"),
  potentiometer: pot,
  pot,
  crystal,
  xtal: crystal,
  switch: sw,
  button,
  pushbutton: button,
  opamp,
  testpoint,
  tp: testpoint,
  header,
  connector: header,
  conn: header,
  chip,
  ic: chip,
  ads1115,
  ne555,
}

export function lookupPartType(type: string): PartSpec | undefined {
  return PART_TYPES[type.toLowerCase()]
}
