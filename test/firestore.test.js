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
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
const projectId = process.env.GCLOUD_PROJECT || 'demo-frek'
const skip = !emulatorHost && 'FIRESTORE_EMULATOR_HOST is not set'
const repoRoot = path.join(__dirname, '..')

// A service-account key that looks real but grants nothing anywhere.
const throwawayServiceAccount = () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    type: 'service_account',
    project_id: projectId,
    private_key_id: 'throwaway',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    client_email: `test@${projectId}.iam.gserviceaccount.com`,
    client_id: '0',
    token_uri: 'https://oauth2.googleapis.com/token',
  }
}

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
  initializeApp({ credential: cert(throwawayServiceAccount()) }) // same call as src/index.js
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

  // Copy the build into a temp dir with a throwaway key where index.js
  // expects the real one. The repo's .keys/ is never read or written.
  const entry = fs.readFileSync(path.join(repoRoot, 'lib', 'index.js'), 'utf8')
  const keyFile = entry.match(/require\("\.\.\/\.keys\/([^"]+\.json)"\)/)[1]
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frek-boot-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.cpSync(path.join(repoRoot, 'lib'), path.join(dir, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.keys'))
  fs.writeFileSync(path.join(dir, '.keys', keyFile), JSON.stringify(throwawayServiceAccount()))
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(dir, 'node_modules'), 'dir')

  const port = await new Promise(resolve => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
  // Minimal environment, run from the temp dir so no .env file is loaded.
  const server = spawn(process.execPath, [path.join(dir, 'lib', 'index.js')], {
    cwd: dir,
    env: { PATH: process.env.PATH, NODE_ENV: 'development', PORT: String(port), FIRESTORE_EMULATOR_HOST: emulatorHost },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => server.kill())
  let output = ''
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 15000)
    const onData = chunk => {
      output += chunk
      if (output.includes(`Listening http on port ${port}`)) { clearTimeout(timer); resolve() }
    }
    server.stdout.on('data', onData)
    server.stderr.on('data', onData)
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited with ${code}:\n${output}`)) })
  })

  const response = await fetch(`http://127.0.0.1:${port}/gym`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-powered-by'), null)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await response.json(), [{ frekId: 'a', name: 'Beaubourg', crowd: 1 }])
})
