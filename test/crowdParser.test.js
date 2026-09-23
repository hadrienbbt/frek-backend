// Characterization tests: they pin the parser's current output so dependency
// upgrades (moment) or module-format changes cannot change it silently.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { parse, findFrekId } from '../src/crowdParser.js'

// Set before any Date is created; Node applies TZ changes at runtime.
process.env.TZ = 'UTC'

const fixture = name => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8')
const gymHtml = fixture('gym.html')
const attendanceHtml = fixture('attendance.html')

let restoreConsole
beforeEach(() => {
  const { log, error } = console
  console.log = () => {}
  console.error = () => {}
  restoreConsole = () => { console.log = log; console.error = error }
})
afterEach(() => restoreConsole())

test('findFrekId takes the id from the last attendance link', () => {
  assert.equal(findFrekId(gymHtml), 'TEST-frek-0001')
  assert.equal(findFrekId('<html></html>'), undefined)
})

test('parse extracts every field from the gym and attendance pages', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-15T12:34:56Z') })

  const frekplace = parse('TEST-frek-0001', 'Beaubourg', gymHtml, attendanceHtml)

  assert.deepEqual(frekplace, {
    frekId: 'TEST-frek-0001',
    name: 'Beaubourg',
    crowd: 42,
    spotsAvailable: 158,
    fmi: 200,
    latitude: 48.8615727,
    longitude: 2.3523834999999735,
    state: true,
    suffix: 'beaubourg',
    datasets: [
      { day: '2026-01-15T00:00:00+00:00', start: [7, 14, 0, 21], end: [70, 140, 210, 0] },
      { day: '2026-01-14T00:00:00+00:00', start: [6, 12, 0, 18], end: [60, 120, 180, 0] },
      { day: '2026-01-13T00:00:00+00:00', start: [5, 10, 0, 15], end: [50, 100, 150, 0] },
      undefined, // canvas4 is missing from the fixture on purpose
      { day: '2026-01-11T00:00:00+00:00', start: [3, 6, 0, 9], end: [30, 60, 90, 0] },
      { day: '2026-01-10T00:00:00+00:00', start: [2, 4, 0, 6], end: [20, 40, 60, 0] },
      { day: '2026-01-09T00:00:00+00:00', start: [1, 2, 0, 3], end: [10, 20, 30, 0] },
    ],
  })
})

test('parse falls back to defaults when markers are missing', () => {
  const frekplace = parse('id', 'Nation', '<html></html>', '<html></html>')

  assert.deepEqual(frekplace, {
    frekId: 'id',
    name: 'Nation',
    crowd: 0,
    spotsAvailable: 0,
    fmi: 0,
    latitude: 0,
    longitude: 0,
    state: false,
    suffix: 'nation-12eme',
    datasets: [undefined, undefined, undefined, undefined, undefined, undefined, undefined],
  })
})

test('parse reports a closed gym when the indicator is not green', () => {
  const closed = attendanceHtml.replace('background: #24B52A ;', 'background: #D0021B ;')
  assert.equal(parse('id', 'Beaubourg', gymHtml, closed).state, false)
})
