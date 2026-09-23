// Test helpers that start the real built server (lib/index.js) in isolation.
// The server runs from a temp copy with a throwaway service-account key where
// index.js expects the real one, so the repo's .keys/ is never read or written,
// and Firestore traffic goes to whatever FIRESTORE_EMULATOR_HOST the test gives.
const crypto = require('node:crypto')
const fs = require('node:fs')
const http2 = require('node:http2')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const repoRoot = path.join(__dirname, '..', '..')

// A service-account key that looks real but grants nothing anywhere.
const throwawayServiceAccount = projectId => {
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

const freePort = () => new Promise(resolve => {
  const probe = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close(() => resolve(port))
  })
})

// Starts lib/index.js and resolves once it listens. Stopped when the test ends.
const startServer = async (t, { firestoreHost, projectId }) => {
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(firestoreHost)) throw new Error('Firestore host must be on loopback')
  if (!/^demo-/.test(projectId)) throw new Error('project id must start with demo-')

  const entry = fs.readFileSync(path.join(repoRoot, 'lib', 'index.js'), 'utf8')
  const keyFile = entry.match(/require\("\.\.\/\.keys\/([^"]+\.json)"\)/)[1]
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frek-server-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.cpSync(path.join(repoRoot, 'lib'), path.join(dir, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.keys'))
  fs.writeFileSync(path.join(dir, '.keys', keyFile), JSON.stringify(throwawayServiceAccount(projectId)))
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(dir, 'node_modules'), 'dir')

  const port = await freePort()
  // Minimal environment, run from the temp dir so no .env file is loaded.
  const child = spawn(process.execPath, [path.join(dir, 'lib', 'index.js')], {
    cwd: dir,
    env: { PATH: process.env.PATH, NODE_ENV: 'development', PORT: String(port), FIRESTORE_EMULATOR_HOST: firestoreHost },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => child.kill())
  let output = ''
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 15000)
    const onData = chunk => {
      output += chunk
      if (output.includes(`Listening http on port ${port}`)) { clearTimeout(timer); resolve() }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited with ${code}:\n${output}`)) })
  })
  return { url: `http://127.0.0.1:${port}`, child, output: () => output }
}

// A local stand-in for Firestore that rejects every call with
// PERMISSION_DENIED, which the client does not retry, so reads fail at once.
const startFailingFirestore = async t => {
  const server = http2.createServer()
  const state = { calls: 0 }
  const sessions = new Set()
  server.on('session', session => {
    sessions.add(session)
    session.on('close', () => sessions.delete(session))
  })
  server.on('stream', stream => {
    state.calls++
    stream.respond({ ':status': 200, 'content-type': 'application/grpc' }, { waitForTrailers: true })
    stream.on('wantTrailers', () => stream.sendTrailers({ 'grpc-status': '7', 'grpc-message': 'denied by test' }))
    stream.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => {
    // close() waits for open sessions, and the client keeps its connection.
    for (const session of sessions) session.destroy()
    server.close(resolve)
  }))
  state.host = `127.0.0.1:${server.address().port}`
  return state
}

module.exports = { throwawayServiceAccount, startServer, startFailingFirestore }
