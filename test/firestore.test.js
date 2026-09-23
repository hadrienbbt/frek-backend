// Integration tests against the local Firestore emulator. They are skipped
// unless FIRESTORE_EMULATOR_HOST is set. Run them with `npm run test:emulator`,
// which needs firebase-tools and Java installed.
//
// They can never reach the production database:
// - they refuse to run unless the emulator is on a loopback address and the
//   project id starts with "demo-";
// - they authenticate with a throwaway key that has no access to any project;
// - they clear data through the emulator-only reset endpoint, which does not
//   exist on the real Firestore service.
const { test, before, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

const { throwawayServiceAccount, startServer } = require('./helpers/server.js')

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
const projectId = process.env.GCLOUD_PROJECT || 'demo-frek'
const skip = !emulatorHost && 'FIRESTORE_EMULATOR_HOST is not set'

const clearEmulator = async () => {
  const url = `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`
  const response = await fetch(url, { method: 'DELETE' })
  assert.equal(response.status, 200, `emulator reset failed: ${response.status}`)
}

let crowdFetcher
let frekplaces

before(() => {
  if (skip) return
  assert.match(emulatorHost, /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/, 'the emulator must run on a loopback address')
  assert.match(projectId, /^demo-/, 'the emulator tests only run against a demo- project')

  const { initializeApp, cert } = require('firebase-admin/app')
  const { getFirestore } = require('firebase-admin/firestore')
  initializeApp({ credential: cert(throwawayServiceAccount(projectId)) }) // same call as src/index.js
  crowdFetcher = require('../lib/crowdFetcher.js')
  frekplaces = getFirestore().collection('frekplaces')
})

let restoreConsole
beforeEach(async () => {
  if (skip) return
  await clearEmulator()
  const { log, error } = console
  console.log = () => {}
  console.error = () => {}
  restoreConsole = () => { console.log = log; console.error = error }
})
afterEach(() => restoreConsole?.())

test('getFrekplaces reads every document of the frekplaces collection', { skip }, async () => {
  await frekplaces.doc('b').set({ frekId: 'b', name: 'Bastille', crowd: 3, datasets: [null] })
  await frekplaces.doc('a').set({ frekId: 'a', name: 'Beaubourg', crowd: 1 })

  assert.deepEqual(await crowdFetcher.getFrekplaces(), [
    { frekId: 'a', name: 'Beaubourg', crowd: 1 },
    { frekId: 'b', name: 'Bastille', crowd: 3, datasets: [null] },
  ])
})

test('saveFrekplaces merges into the existing document', { skip }, async () => {
  await frekplaces.doc('x').set({ frekId: 'x', id: 'kept', crowd: 1 })

  await crowdFetcher.saveFrekplaces({ frekId: 'x', name: 'Nation', crowd: 5 })

  assert.deepEqual((await frekplaces.doc('x').get()).data(), { frekId: 'x', id: 'kept', name: 'Nation', crowd: 5 })
})

test('the built server boots like production and serves /gym', { skip }, async t => {
  await frekplaces.doc('a').set({ frekId: 'a', name: 'Beaubourg', crowd: 1 })

  const server = await startServer(t, { firestoreHost: emulatorHost, projectId })

  const response = await fetch(`${server.url}/gym`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-powered-by'), null)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await response.json(), [{ frekId: 'a', name: 'Beaubourg', crowd: 1 }])
})
