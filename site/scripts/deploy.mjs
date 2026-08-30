#!/usr/bin/env node
/**
 * Publish the built site to the `pages` branch.
 *
 * That branch holds build output and nothing else: each deploy replaces its
 * contents wholesale and commits on top of whatever is there, so the push stays
 * a fast-forward and never needs --force.
 *
 *   node scripts/deploy.mjs
 *   node scripts/deploy.mjs --dry-run     build and stage, do not push
 *   node scripts/deploy.mjs --base /foo   override the derived base path
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SITE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const REPO = path.dirname(SITE)
const BRANCH = 'pages'

const dryRun = process.argv.includes('--dry-run')

const git = (args, opts = {}) => {
  // execFileSync returns null when stdio is inherited rather than captured,
  // so only trim what is actually a string.
  const out = execFileSync('git', args, { cwd: REPO, encoding: 'utf8', ...opts })
  return typeof out === 'string' ? out.trim() : ''
}

/** A project page is served from /<repo>; a user or org page from the root. */
function deriveBasePath() {
  const flag = process.argv.indexOf('--base')
  if (flag > -1) return process.argv[flag + 1].replace(/\/+$/, '')

  const remote = git(['remote', 'get-url', 'origin'])
  const match = /[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote)
  if (!match) throw new Error(`cannot parse owner/repo from remote: ${remote}`)
  const [, owner, repo] = match
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '' : `/${repo}`
}

async function emptyDir(dir) {
  for (const entry of await fs.readdir(dir)) {
    if (entry === '.git') continue
    await fs.rm(path.join(dir, entry), { recursive: true, force: true })
  }
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true })
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) await copyDir(src, dest)
    else await fs.copyFile(src, dest)
  }
}

async function main() {
  const dirty = git(['status', '--porcelain'])
  if (dirty) {
    process.stderr.write('deploy: working tree is dirty. Commit or stash first.\n\n')
    process.stderr.write(dirty + '\n')
    process.exitCode = 1
    return
  }

  const base = deriveBasePath()
  process.stdout.write(`deploy: base path ${base || '(root)'}\n`)

  // Build fresh with the right base path rather than trusting whatever dist/ holds.
  execFileSync(process.execPath, ['build.mjs'], {
    cwd: SITE,
    stdio: 'inherit',
    env: { ...process.env, BASE_PATH: base },
  })

  const source = git(['rev-parse', '--short', 'HEAD'])
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-publish-'))
  await fs.rm(worktree, { recursive: true, force: true })

  const remoteHas = (() => {
    try {
      return Boolean(git(['ls-remote', '--exit-code', '--heads', 'origin', BRANCH]))
    } catch {
      return false
    }
  })()

  try {
    if (remoteHas) {
      git(['fetch', 'origin', BRANCH])
      git(['worktree', 'add', worktree, `origin/${BRANCH}`])
    } else {
      git(['worktree', 'add', '--detach', worktree])
    }
    git(['-C', worktree, 'checkout', '-B', BRANCH])

    await emptyDir(worktree)
    await copyDir(path.join(SITE, 'dist'), worktree)

    git(['-C', worktree, 'add', '-A'])
    const staged = git(['-C', worktree, 'status', '--porcelain'])
    if (!staged) {
      process.stdout.write('deploy: output unchanged, nothing to publish.\n')
      return
    }

    git(['-C', worktree, 'commit', '-m', `Deploy documentation site from ${source}`])
    const files = git(['-C', worktree, 'ls-files']).split('\n').filter(Boolean).length

    if (dryRun) {
      process.stdout.write(`deploy: --dry-run, staged ${files} files on ${BRANCH}, not pushed.\n`)
      return
    }
    git(['-C', worktree, 'push', 'origin', BRANCH], { stdio: 'inherit' })
    process.stdout.write(`deploy: published ${files} files to ${BRANCH}.\n`)
  } finally {
    try {
      git(['worktree', 'remove', '--force', worktree])
    } catch {
      await fs.rm(worktree, { recursive: true, force: true })
      git(['worktree', 'prune'])
    }
  }
}

await main()
