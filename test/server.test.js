// Starts the server against a Firestore stand-in that rejects every call.
// No emulator or network access is needed; nothing reaches a real database.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { startServer, startFailingFirestore } from './helpers/server.js'

test('/gym answers 503 and the server keeps running when Firestore fails', async t => {
  const firestore = await startFailingFirestore(t)
  const server = await startServer(t, { firestoreHost: firestore.host, projectId: 'demo-frek' })

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(`${server.url}/gym`)
    assert.equal(response.status, 503, `attempt ${attempt}`)
    assert.deepEqual(await response.json(), { error: 'Service unavailable' })
  }
  assert.equal(server.child.exitCode, null, 'the server process must still be running')
  assert.ok(firestore.calls >= 2, 'both requests must have reached the Firestore stand-in')
  assert.match(server.output(), /Can't read frekplaces from firestore/)
})
