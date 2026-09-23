// Integration test against the local Firestore emulator. It is skipped unless
// FIRESTORE_EMULATOR_HOST is set. Run it with `npm run test:emulator`, which
// needs firebase-tools and Java installed.
//
// It can never reach the production database:
// - it refuses to run unless the emulator is on a loopback address and the
//   project id starts with "demo-";
// - it authenticates with a throwaway key that has no access to any project;
// - it clears data through the emulator-only reset endpoint, which does not
//   exist on the real Firestore service.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
const projectId = process.env.GCLOUD_PROJECT || 'demo-frek'
const skip = !emulatorHost && 'FIRESTORE_EMULATOR_HOST is not set'

const clearEmulator = async () => {
  const url = `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`
  const response = await fetch(url, { method: 'DELETE' })
  assert.equal(response.status, 200, `emulator reset failed: ${response.status}`)
}

test('initializes like index.js and reads the frekplaces collection', { skip }, async () => {
  assert.match(emulatorHost, /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/, 'the emulator must run on a loopback address')
  assert.match(projectId, /^demo-/, 'the emulator test only runs against a demo- project')

  const { initializeApp, cert } = require('firebase-admin/app')
  const { getFirestore } = require('firebase-admin/firestore')
  const { getFrekplaces } = require('../lib/crowdFetcher.js')

  // Same call as src/index.js, with a throwaway key instead of the real one.
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: `test@${projectId}.iam.gserviceaccount.com`,
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
  })

  await clearEmulator()
  const frekplaces = getFirestore().collection('frekplaces')

  await frekplaces.doc('b').set({ frekId: 'b', name: 'Bastille', crowd: 3, datasets: [null] })
  await frekplaces.doc('a').set({ frekId: 'a', name: 'Beaubourg', crowd: 1 })
  await frekplaces.doc('a').set({ crowd: 2, state: true }, { merge: true }) // as saveFrekplaces does

  assert.deepEqual(await getFrekplaces(), [
    { frekId: 'a', name: 'Beaubourg', crowd: 2, state: true },
    { frekId: 'b', name: 'Bastille', crowd: 3, datasets: [null] },
  ])
})
