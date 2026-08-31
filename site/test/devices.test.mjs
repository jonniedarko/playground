import test from 'node:test'
import assert from 'node:assert/strict'
import { DEVICES } from '../assets/shenzhen/devices.js'
import { PART_META } from '../assets/shenzhen/parts.js'

test('every DEVICES tag exists in PART_META', () => {
  for (const tag of Object.keys(DEVICES)) {
    assert.ok(tag in PART_META, `${tag} is in DEVICES but not PART_META`)
  }
})

test('dx-300 has a device entry', () => {
  assert.ok(DEVICES['dx-300'])
})

test('both memories have a device entry', () => {
  assert.ok(DEVICES['p-100p14'])
  assert.ok(DEVICES['p-200p14'])
})

test('io-terminal has a device entry', () => {
  assert.ok(DEVICES['io-terminal'])
})

test('all four gates have a device entry', () => {
  assert.ok(DEVICES['lc-70g04'])
  assert.ok(DEVICES['lc-70g08'])
  assert.ok(DEVICES['lc-70g32'])
  assert.ok(DEVICES['lc-70g86'])
})
