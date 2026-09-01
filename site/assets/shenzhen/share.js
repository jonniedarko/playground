/* ============================================================== share.js
   Encode a circuit-board's toJSON() shape into a URL-safe string, and back.

   No compression library — none is installable, the network is locked down,
   and CompressionStream is off the table too (see R12-R15-PLAN.md Task
   14.1). What is here instead is a flat, versioned byte layout — a one-byte
   index into a fixed part-tag table, coordinates, a flag byte for which of
   label/type/side are present and what they say, length-prefixed UTF-8 text
   for label/pin-name/program — fed through a base64url alphabet written by
   hand rather than reached for from btoa/atob (which want a binary string,
   not a byte array, and disagree on how to get there in a way that survives
   both Node and a browser).

   `toJSON()`/`load()` on circuit-board (components.js) is the shape this
   speaks: encodeBoard(board.toJSON()) round-trips through decodeBoard()
   back into exactly what board.load() expects — same keys, same
   conditional presence of label/type/side (a plain io-terminal carries all
   three; nothing else carries any of them).

   Pure — no DOM — so it is exercised directly under node
   (test/share.test.mjs). ide.js is the only caller from a real page.
   ========================================================================= */

import { PART_META } from './parts.js'

const VERSION = 1

/** Canonical tag order for the one-byte tag index. Sorted rather than
    left in PART_META's own insertion order, so the table does not silently
    reshuffle if parts.js is ever reordered — the number written into a link
    today has to still mean the same tag when that link is opened later. */
const TAGS = Object.keys(PART_META).sort()
const TAG_INDEX = new Map(TAGS.map((t, i) => [t, i]))

if (TAGS.length > 255) {
  throw new Error('share.js: more than 255 part tags — the tag index no longer fits a byte')
}

/** Characters of the *encoded* string a share link may carry. Past this,
    ide.js's Share control refuses to hand back a URL at all — see its own
    doc comment for why silently truncating one downstream is worse than
    saying no. */
const SHARE_BUDGET = 2000

/* -------------------------------------------------------------- base64url
   Standard 4-char-per-3-byte base64, the URL-safe alphabet, no padding —
   the byte count is implicit in the string length (mod 4 is never 1, which
   decode treats as corruption), so there is nothing a trailing `=` would be
   protecting here. Written over a plain byte array rather than through
   btoa/atob so the same code runs unchanged under Node (tests) and a
   browser (ide.js), with no binary-string conversion in between. */
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64_INDEX = new Map([...B64URL].map((c, i) => [c, i]))

function base64urlEncode(bytes) {
  let out = ''
  let i = 0
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63] + B64URL[n & 63]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i] << 16
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63]
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63]
  }
  return out
}

function decodeChar(c) {
  const v = B64_INDEX.get(c)
  if (v === undefined) throw new Error(`share: "${c}" is not a valid character in a share link`)
  return v
}

function base64urlDecode(str) {
  const out = []
  let i = 0
  for (; i + 4 <= str.length; i += 4) {
    const n = (decodeChar(str[i]) << 18) | (decodeChar(str[i + 1]) << 12) |
      (decodeChar(str[i + 2]) << 6) | decodeChar(str[i + 3])
    out.push((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff)
  }
  const rem = str.length - i
  if (rem === 2) {
    const n = (decodeChar(str[i]) << 18) | (decodeChar(str[i + 1]) << 12)
    out.push((n >> 16) & 0xff)
  } else if (rem === 3) {
    const n = (decodeChar(str[i]) << 18) | (decodeChar(str[i + 1]) << 12) | (decodeChar(str[i + 2]) << 6)
    out.push((n >> 16) & 0xff, (n >> 8) & 0xff)
  } else if (rem === 1) {
    throw new Error('share: truncated share link')
  }
  return Uint8Array.from(out)
}

/* ---------------------------------------------------------------- fields
   Length-prefixed text rather than a delimiter: a program is free text and
   may contain newlines, `#` comments, and non-ASCII — anything picked as a
   separator could appear inside it. A byte count in front of the UTF-8
   bytes needs no escaping and cannot be confused with content. */
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })

class ByteWriter {
  constructor() { this.bytes = [] }

  u8(n) {
    if (!Number.isInteger(n) || n < 0 || n > 0xff) {
      throw new Error(`share: value ${n} does not fit in a byte`)
    }
    this.bytes.push(n)
  }

  u16(n) {
    if (!Number.isInteger(n) || n < 0 || n > 0xffff) {
      throw new Error(`share: value ${n} does not fit in 16 bits`)
    }
    this.bytes.push((n >> 8) & 0xff, n & 0xff)
  }

  raw(arr) { for (const b of arr) this.bytes.push(b) }

  /** Length-prefixed UTF-8, 1-byte length (labels, pin names). */
  str8(s) {
    const enc = textEncoder.encode(s)
    if (enc.length > 0xff) {
      throw new Error(`share: "${s.slice(0, 24)}…" is ${enc.length} bytes, over the 255-byte field limit`)
    }
    this.u8(enc.length)
    this.raw(enc)
  }

  /** Length-prefixed UTF-8, 2-byte length (program text). */
  str16(s) {
    const enc = textEncoder.encode(s)
    if (enc.length > 0xffff) {
      throw new Error(`share: program text is ${enc.length} bytes, over the 65535-byte field limit`)
    }
    this.u16(enc.length)
    this.raw(enc)
  }

  toBytes() { return Uint8Array.from(this.bytes) }
}

class ByteReader {
  constructor(bytes) { this.bytes = bytes; this.i = 0 }

  _need(n) {
    if (this.i + n > this.bytes.length) throw new Error('share: truncated share link')
  }

  u8() { this._need(1); return this.bytes[this.i++] }

  u16() {
    this._need(2)
    const n = (this.bytes[this.i] << 8) | this.bytes[this.i + 1]
    this.i += 2
    return n
  }

  str8() { return this._str(this.u8()) }
  str16() { return this._str(this.u16()) }

  _str(len) {
    this._need(len)
    const slice = this.bytes.subarray(this.i, this.i + len)
    this.i += len
    return textDecoder.decode(slice)
  }
}

/* ------------------------------------------------------------- the codec
   Flags for a part: which of label/type/side toJSON() set (it sets them
   only `if (p.hasAttribute(a))` — see components.js — so an mc-4000 carries
   none of the three and an io-terminal carries all three), and — packed
   into the same byte, since each is a single bit once presence is known —
   what type/side actually say. Getting this wrong is the R14.1 trap named
   in the plan: drop `side` and a restored io-terminal resolves the wrong
   pin (IOTerminal's `get meta()`, components.js) and loses every wire that
   named it. */
const FLAG_LABEL = 1
const FLAG_TYPE = 2
const FLAG_SIDE = 4
const FLAG_XBUS = 8 // meaningful only alongside FLAG_TYPE
const FLAG_LEFT = 16 // meaningful only alongside FLAG_SIDE

/** board.toJSON() → a URL-safe string. Throws rather than truncating on a
    part tag this table does not know (should not happen — every placeable
    tag is a PART_META key) or a text field too long for its length prefix
    (a program is already clamped to its chip's line count by setCode(), so
    this is a backstop, not a path normal use reaches). */
function encodeBoard(json) {
  const w = new ByteWriter()
  w.u8(VERSION)
  w.u8(Math.round(json.cell))
  w.u16(json.parts.length)
  for (const p of json.parts) {
    const tagIndex = TAG_INDEX.get(p.tag)
    if (tagIndex === undefined) throw new Error(`share: unknown part tag "${p.tag}"`)
    w.u8(tagIndex)
    w.u16(Math.round(p.x))
    w.u16(Math.round(p.y))
    let flags = 0
    if (p.label !== undefined) flags |= FLAG_LABEL
    if (p.type !== undefined) {
      flags |= FLAG_TYPE
      if (p.type === 'xbus') flags |= FLAG_XBUS
    }
    if (p.side !== undefined) {
      flags |= FLAG_SIDE
      if (p.side === 'left') flags |= FLAG_LEFT
    }
    w.u8(flags)
    if (p.label !== undefined) w.str8(p.label)
    w.str16(p.code || '')
  }
  w.u16(json.wires.length)
  for (const wire of json.wires) {
    w.u16(Math.round(wire.a[0]))
    w.str8(wire.a[1])
    w.u16(Math.round(wire.b[0]))
    w.str8(wire.b[1])
  }
  return base64urlEncode(w.toBytes())
}

/** The inverse of encodeBoard() — a string back into board.toJSON()'s
    shape, ready for circuit-board's own load(). */
function decodeBoard(str) {
  const r = new ByteReader(base64urlDecode(str))
  const version = r.u8()
  if (version !== VERSION) throw new Error(`share: share link is version ${version}, this page reads version ${VERSION}`)
  const cell = r.u8()
  const partCount = r.u16()
  const parts = []
  for (let i = 0; i < partCount; i += 1) {
    const tagIndex = r.u8()
    const tag = TAGS[tagIndex]
    if (tag === undefined) throw new Error(`share: unknown part index ${tagIndex} in share link`)
    const x = r.u16()
    const y = r.u16()
    const flags = r.u8()
    const part = { tag, x, y }
    if (flags & FLAG_LABEL) part.label = r.str8()
    part.code = r.str16()
    if (flags & FLAG_TYPE) part.type = (flags & FLAG_XBUS) ? 'xbus' : 'simple'
    if (flags & FLAG_SIDE) part.side = (flags & FLAG_LEFT) ? 'left' : 'right'
    parts.push(part)
  }
  const wireCount = r.u16()
  const wires = []
  for (let i = 0; i < wireCount; i += 1) {
    const ai = r.u16()
    const an = r.str8()
    const bi = r.u16()
    const bn = r.str8()
    wires.push({ a: [ai, an], b: [bi, bn] })
  }
  return { cell, parts, wires }
}

export { encodeBoard, decodeBoard, SHARE_BUDGET, TAGS, base64urlEncode, base64urlDecode }
