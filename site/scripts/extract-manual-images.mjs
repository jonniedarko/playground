#!/usr/bin/env node
/**
 * Extract figures from the SHENZHEN I/O manual PDF into site/assets/img/shenzhen.
 *
 * Thin wrapper over lib/pdf_images.py, which does the real work with only the
 * Python standard library (no PyPI access in this environment). The wrapper
 * exists so the extraction is one documented command rather than a one-off.
 *
 *   node scripts/extract-manual-images.mjs --pdf ~/manual.pdf
 *   node scripts/extract-manual-images.mjs --pdf ~/manual.pdf --only mc4000-pins
 *   node scripts/extract-manual-images.mjs --list
 *
 * Prefer a live component over an extracted image wherever one can draw the
 * figure - see CLAUDE.md. These are for artwork components cannot express.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url))
const SITE = path.dirname(SCRIPTS)
const PY = path.join(SCRIPTS, 'lib', 'pdf_images.py')
const DEFAULT_OUT = path.join(SITE, 'assets', 'img', 'shenzhen')

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i > -1 ? argv[i + 1] : undefined
}

const listOnly = argv.includes('--list')
const pdf = flag('--pdf')
const only = flag('--only')
const out = flag('--out') || DEFAULT_OUT

if (!listOnly && !pdf) {
  process.stderr.write('extract-manual-images: --pdf <file> is required (or --list).\n')
  process.exit(1)
}
if (pdf && !existsSync(pdf)) {
  process.stderr.write(`extract-manual-images: no such file: ${pdf}\n`)
  process.exit(1)
}

const args = [PY]
if (listOnly) {
  // The Python side still wants --pdf even for --list; give it the flag it needs.
  args.push('--pdf', pdf || PY, '--list')
} else {
  args.push('--pdf', pdf, '--out', out)
  if (only) args.push('--only', only)
}

const run = spawnSync('python3', args, { stdio: 'inherit' })
if (run.error && run.error.code === 'ENOENT') {
  process.stderr.write('extract-manual-images: python3 not found on PATH.\n')
  process.exit(1)
}
process.exit(run.status ?? 1)
