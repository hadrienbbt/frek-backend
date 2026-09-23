// Integration test against the local Firestore emulator. It is skipped unless
// FIRESTORE_EMULATOR_HOST is set. Run it with `npm run test:emulator`, which
// needs firebase-tools and Java installed. It never touches a real project:
// it refuses to run unless the project id starts with "demo-".
const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const projectId = process.env.GCLOUD_PROJECT || 'demo-frek'
const skip = !process.env.FIRESTORE_EMULATOR_HOST && 'FIRESTORE_EMULATOR_HOST is not set'

test('initializes like index.js and reads the frekplaces collection', { skip }, async () => {
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

  const frekplaces = getFirestore().collection('frekplaces')
  const existing = await frekplaces.get()
  await Promise.all(existing.docs.map(doc => doc.ref.delete()))

  await frekplaces.doc('b').set({ frekId: 'b', name: 'Bastille', crowd: 3, datasets: [null] })
  await frekplaces.doc('a').set({ frekId: 'a', name: 'Beaubourg', crowd: 1 })
  await frekplaces.doc('a').set({ crowd: 2, state: true }, { merge: true }) // as saveFrekplaces does

  assert.deepEqual(await getFrekplaces(), [
    { frekId: 'a', name: 'Beaubourg', crowd: 2, state: true },
    { frekId: 'b', name: 'Bastille', crowd: 3, datasets: [null] },
  ])
})
