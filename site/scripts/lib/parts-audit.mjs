/* =========================================================================
   Static audits of the part catalogue, the reference circuits, and the
   figures that reference them.

   All three of these used to be caught only by the browser sweep, minutes
   into a Playwright run, and one of them not at all:

   - a PART_META entry with no component renders as a fallback forever;
   - a tag without a hyphen throws inside customElements.define, which kills
     the whole module and leaves every part on the page a fallback;
   - a circuits.js wire naming a pin that does not exist silently draws one
     wire fewer than the circuit describes;
   - a figure naming a part or circuit that does not exist never upgrades.

   None of that needs a browser to detect. components.js cannot be imported
   here - it touches document at module scope - so it is read as source.

   Pure functions, so scripts/check.mjs and the unit tests can share them.
   ========================================================================= */

/** Tags registered as custom elements, from the source of components.js. */
export function registeredTags(source) {
  const tags = new Set()

  // Literal registrations: customElements.define('mc-4000', MC4000)
  for (const m of source.matchAll(/customElements\.define\(\s*['"]([^'"]+)['"]/g)) {
    tags.add(m[1])
  }

  // Data-driven ones: the FIXED_PARTS list, registered in a loop by definePart.
  const list = /const\s+FIXED_PARTS\s*=\s*\[([\s\S]*?)\]/.exec(source)
  if (list) {
    for (const m of list[1].matchAll(/['"]([^'"]+)['"]/g)) tags.add(m[1])
  }

  return tags
}

/** A custom element name must contain a hyphen, or the registry throws. */
export const isValidTagName = (tag) => /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(tag)

/**
 * Every part in PART_META should have a component, and every registered part
 * should have metadata. Either direction being wrong is a real fault.
 */
export function auditParts({ meta, tags, ignore = [] }) {
  const problems = []
  const skip = new Set(ignore)

  for (const tag of Object.keys(meta)) {
    if (!isValidTagName(tag)) {
      problems.push(`part "${tag}": not a valid custom element name (needs a hyphen)`)
    }
    if (!tags.has(tag)) {
      problems.push(`part "${tag}": in PART_META but never registered in components.js`)
    }
  }

  for (const tag of tags) {
    if (skip.has(tag)) continue
    if (!(tag in meta)) {
      problems.push(`part "${tag}": registered in components.js but absent from PART_META`)
    }
  }

  return problems
}

/**
 * The pin names a part actually answers to.
 *
 * io-terminal resolves its single pin from its label, so the name depends on
 * the instance rather than the model. Anything else uses its metadata.
 */
export function pinNames(spec, meta) {
  const partMeta = meta[spec.t]
  if (!partMeta) return null
  if (spec.t === 'io-terminal') return new Set([spec.label || partMeta.pins[0].name])
  return new Set(partMeta.pins.map((p) => p.name))
}

/**
 * Every wire endpoint in every circuit must name a part index that exists and
 * a pin that part actually has.
 *
 * This is the check that would have caught the packet reverser writing to a0
 * and d0 - the memory's pin names, not the microcontroller's.
 */
export function auditCircuits({ circuits, meta }) {
  const problems = []

  for (const [name, spec] of Object.entries(circuits)) {
    const parts = spec.parts || []

    parts.forEach((part, i) => {
      if (!meta[part.t]) problems.push(`circuit "${name}" part ${i}: unknown part "${part.t}"`)
    })

    for (const wire of spec.wires || []) {
      for (const end of wire) {
        const [rawIndex, pin] = String(end).split(':')
        const index = Number(rawIndex)

        if (!Number.isInteger(index) || index < 0 || index >= parts.length) {
          problems.push(`circuit "${name}" wire "${end}": no part at index ${rawIndex}`)
          continue
        }
        const names = pinNames(parts[index], meta)
        if (!names) continue // already reported as an unknown part
        if (!names.has(pin)) {
          problems.push(
            `circuit "${name}" wire "${end}": ${parts[index].t} has no pin "${pin}" ` +
            `(has ${[...names].join(', ')})`)
        }
      }
    }
  }

  return problems
}

/**
 * Figures in the content name a part or a circuit. Both have to exist, or the
 * figure silently stays whatever fallback markup it was given.
 */
export function auditFigures({ sources, tags, circuits }) {
  const problems = []

  for (const { file, text } of sources) {
    for (const m of text.matchAll(/data-part="([^"]*)"/g)) {
      if (!tags.has(m[1])) problems.push(`${file}: figure names part "${m[1]}", which is not registered`)
    }
    for (const m of text.matchAll(/data-circuit="([^"]*)"/g)) {
      if (!(m[1] in circuits)) problems.push(`${file}: figure names circuit "${m[1]}", which is not in circuits.js`)
    }
  }

  return problems
}
