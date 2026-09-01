#!/usr/bin/env node
/**
 * Add a part to the catalogue.
 *
 * A part currently takes four edits in four files, and half-doing them fails in
 * ways that are not obvious: metadata with no component renders as a fallback
 * forever, and a tag without a hyphen throws inside customElements.define and
 * takes every part on the page down with it. This writes all four.
 *
 *   node scripts/new-part.mjs --tag lx-800 --name LX800 --kind display \
 *     --pins 'x0:xbus:left, p0:simple:right' \
 *     --page shenzhen-io/parts/lx800 --title 'LX800 numeric display'
 *
 * Options
 *   --tag      <name>   custom element name. Must contain a hyphen
 *   --name     <text>   what the face says (default: the tag, upper-cased)
 *   --kind     <text>   small line under the name on the face
 *   --cost     <n>      ¥ cost from the datasheet (default 0)
 *   --cols     <n>      footprint width in grid cells (default 3)
 *   --rows     <n>      footprint height in grid cells (default 3)
 *   --pins     <spec>   comma-separated `name:type:side`, type xbus|simple|nc
 *   --page     <path>   content page to create, without .md
 *   --title    <text>   page title
 *   --description <text>  page description
 *   --dry-run           print what would change, write nothing
 *
 * Positions each side's pins evenly down that edge. Behaviour is not
 * generated: the part draws and wires, and the simulator treats it as inert
 * until someone writes it. That is what the roadmap calls device behaviours.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isValidTagName } from './lib/parts-audit.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PARTS = path.join(ROOT, 'assets/shenzhen/parts.js')
const COMPONENTS = path.join(ROOT, 'assets/shenzhen/components.js')
const CIRCUITS = path.join(ROOT, 'assets/shenzhen/circuits.js')

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback
}
const flag = (name) => process.argv.includes('--' + name)

const die = (msg) => { process.stderr.write(`new-part: ${msg}\n`); process.exit(1) }

/** `x0:xbus:left, p0:simple:right` into pin objects, spaced down each edge. */
function parsePins(spec) {
  const raw = spec.split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
    const [name, type = 'simple', side = 'left'] = entry.split(':').map((s) => s.trim())
    if (!name) die(`cannot read pin "${entry}"`)
    if (!['xbus', 'simple', 'nc'].includes(type)) {
      die(`pin "${name}": type must be xbus, simple or nc, not "${type}"`)
    }
    if (!['left', 'right'].includes(side)) {
      die(`pin "${name}": side must be left or right, not "${side}"`)
    }
    return { name, type, side }
  })

  const names = raw.map((p) => p.name)
  const dupe = names.find((n, i) => names.indexOf(n) !== i)
  if (dupe) die(`pin "${dupe}" is listed twice; a wire endpoint names a pin, so they must be unique`)

  // Space each side's pins evenly down that edge.
  for (const side of ['left', 'right']) {
    const onSide = raw.filter((p) => p.side === side)
    onSide.forEach((pin, i) => {
      pin.at = Number(((i + 1) / (onSide.length + 1)).toFixed(2))
    })
  }
  return raw
}

const metaEntry = ({ tag, name, kind, cost, cols, rows, pins }) => {
  const lines = pins.map(
    (p) => `      { name: '${p.name}', type: '${p.type}', side: '${p.side}', at: ${p.at} },`)
  return [
    ``,
    `  '${tag}': {`,
    `    name: '${name}',${kind ? ` kind: '${kind}',` : ''} cost: ${cost}, cols: ${cols}, rows: ${rows},`,
    `    pins: [`,
    ...lines,
    `    ],`,
    `  },`,
  ].join('\n')
}

/** The no-JS fallback, and the figure that replaces it on boot. */
function pageBody({ tag, name, pins, title, description }) {
  const cls = (t) => (t === 'xbus' ? 'x' : t === 'nc' ? 'nc' : 's')
  const col = (side) => pins.filter((p) => p.side === side)
    .map((p) => `<span class="pin pin-${cls(p.type)}">${p.type === 'nc' ? 'N/C' : p.name}</span>`)
    .join('')
  const describe = (p) => `${p.name} ${p.type === 'xbus' ? 'XBus' : p.type === 'nc' ? 'not connected' : 'simple I/O'}`
  const alt = `${name} pin layout. ` +
    ['left', 'right'].map((side) => {
      const on = pins.filter((p) => p.side === side)
      return on.length ? `${side[0].toUpperCase()}${side.slice(1)} side: ${on.map(describe).join(', ')}.` : ''
    }).filter(Boolean).join(' ')

  const rows = pins.map((p) => `| \`${p.name}\` | ${p.type === 'xbus' ? 'XBus' : p.type === 'nc' ? '-' : 'Simple I/O'} | |`)

  return `---
title: ${title}
description: ${description}
board: true
---

## Pin configuration

<div class="chip-figure" data-part="${tag}" aria-label="${alt}">
<div class="pinout" role="img" aria-label="${alt}">
<div class="pinout-col">${col('left')}</div>
<div class="pinout-chip"><span class="pinout-name">${name}</span></div>
<div class="pinout-col">${col('right')}</div>
</div>
</div>

| Pin | Type | Purpose |
| --- | --- | --- |
${rows.join('\n')}

> [!NOTE]
> Fill in what each pin does, and delete this note. The part draws and wires
> on the [workbench](/shenzhen-io/ide/) but does not run yet.
`
}

/** Insert before the closing brace of the PART_META object literal. */
function addToPartMeta(source, entry) {
  const open = source.indexOf('export const PART_META = {')
  if (open === -1) die('cannot find PART_META in parts.js')
  let depth = 0
  for (let i = source.indexOf('{', open); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(0, i) + entry + '\n' + source.slice(i)
    }
  }
  return die('PART_META object is not closed')
}

function addToFixedParts(source, tag) {
  const m = /const FIXED_PARTS = \[([\s\S]*?)\];/.exec(source)
  if (!m) die('cannot find FIXED_PARTS in components.js')
  const body = m[1].replace(/\s+$/, '')
  return source.replace(m[0], `const FIXED_PARTS = [${body}\n  '${tag}',\n];`)
}

/** Drop the part into the catalogue, on a fresh row under everything else.
    Scoped to the catalogue by name: three circuits end with an empty wires
    list, and matching the first of those put the part in the gate figure. */
function addToCatalogue(source, tag, rows) {
  const start = source.indexOf('const catalogue = {')
  if (start === -1) die('cannot find the catalogue circuit in circuits.js')
  const listEnd = source.indexOf('\n  ],', start)
  if (listEnd === -1) die('cannot find the end of the catalogue parts list')

  const body = source.slice(start, listEnd)
  const ys = [...body.matchAll(/y: (\d+)/g)].map((m) => Number(m[1]))
  if (!ys.length) die('the catalogue has no parts to place under')
  // Three cells of clearance: a pin's trace label sticks out past the part.
  const y = Math.max(...ys) + rows + 3

  return source.slice(0, listEnd) +
    `\n    { t: '${tag}', x: 0, y: ${y} },` +
    source.slice(listEnd)
}

async function main() {
  const tag = arg('tag')
  if (!tag) die('need --tag, e.g. --tag lx-800')
  if (!isValidTagName(tag)) {
    die(`"${tag}" is not a valid custom element name. It needs a hyphen, or\n` +
        '  customElements.define throws and every part on the page stays a fallback.')
  }

  const partsSource = await fs.readFile(PARTS, 'utf8')
  if (new RegExp(`'${tag}':`).test(partsSource)) die(`"${tag}" is already in PART_META`)

  const name = arg('name', tag.toUpperCase().replace(/-/g, ''))
  const kind = arg('kind', '')
  const cost = Number(arg('cost', '0'))
  const cols = Number(arg('cols', '3'))
  const rows = Number(arg('rows', '3'))
  const pins = parsePins(arg('pins', 'x0:xbus:left'))
  const page = arg('page', '')
  const title = arg('title', name)
  const description = arg('description', `${name} datasheet.`)

  const edits = []

  edits.push([PARTS, addToPartMeta(partsSource, metaEntry({ tag, name, kind, cost, cols, rows, pins }))])
  edits.push([COMPONENTS, addToFixedParts(await fs.readFile(COMPONENTS, 'utf8'), tag)])
  edits.push([CIRCUITS, addToCatalogue(await fs.readFile(CIRCUITS, 'utf8'), tag, rows)])

  let pageFile = null
  if (page) {
    pageFile = path.join(ROOT, 'content', page.replace(/\.md$/, '') + '.md')
    if (await fs.stat(pageFile).then(() => true).catch(() => false)) {
      die(`${path.relative(ROOT, pageFile)} already exists`)
    }
    edits.push([pageFile, pageBody({ tag, name, pins, title, description })])
  }

  if (flag('dry-run')) {
    process.stdout.write(`new-part: would touch ${edits.length} file(s)\n`)
    for (const [file] of edits) process.stdout.write(`  ${path.relative(ROOT, file)}\n`)
    if (pageFile) {
      process.stdout.write(`\n--- ${path.relative(ROOT, pageFile)} ---\n`)
      process.stdout.write(edits[edits.length - 1][1])
    }
    return
  }

  for (const [file, contents] of edits) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, contents)
  }

  process.stdout.write(`new-part: added ${tag} (${pins.length} pin(s))\n`)
  for (const [file] of edits) process.stdout.write(`  ${path.relative(ROOT, file)}\n`)
  process.stdout.write('\nNext: run `npm run check` to confirm, then fill in the datasheet.\n')
  process.stdout.write('The part draws and wires; giving it behaviour is a simulator change.\n')
}

await main()
