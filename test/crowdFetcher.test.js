// Pins fetchHTML's contract with a local HTTP server: resolve the body text on
// 2xx, reject with no reason on non-2xx or network errors, follow redirects.
const { test, before, after, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const { fetchHTML } = require('../lib/crowdFetcher.js')

const BODY = '<html><body>Salle de sport · Châtelet 4ème — places : 42</body></html>'

let server
let baseUrl
let closedPortUrl

before(async () => {
  server = http.createServer((req, res) => {
    switch (req.url) {
      case '/ok':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' })
        return res.end(BODY)
      case '/created':
        res.writeHead(201, { 'Content-Type': 'text/html' })
        return res.end('created')
      case '/redirect':
        res.writeHead(302, { Location: '/ok' })
        return res.end()
      case '/bad-request':
        res.writeHead(400, { 'Content-Type': 'text/html' })
        return res.end('<title>An Error Occurred: Bad Request</title>')
      case '/server-error':
        res.writeHead(500)
        return res.end('boom')
      default:
        res.writeHead(404)
        return res.end('not found')
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`

  // Reserve a port, then free it, so connecting to it is refused.
  const probe = http.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  closedPortUrl = `http://127.0.0.1:${probe.address().port}/`
  await new Promise(resolve => probe.close(resolve))
})

after(() => new Promise(resolve => server.close(resolve)))

let logs
let restoreConsole
beforeEach(() => {
  logs = { log: [], error: [] }
  const { log, error } = console
  console.log = (...args) => logs.log.push(args.join(' '))
  console.error = (...args) => logs.error.push(args.join(' '))
  restoreConsole = () => { console.log = log; console.error = error }
})
afterEach(() => restoreConsole())

const rejectionOf = async promise => {
  try {
    await promise
  } catch (reason) {
    return { rejected: true, reason }
  }
  return { rejected: false }
}

test('resolves the decoded body on 200', async () => {
  assert.equal(await fetchHTML(`${baseUrl}/ok`), BODY)
  assert.deepEqual(logs.log, ['\n⏳ Fetching html...'])
  assert.deepEqual(logs.error, [])
})

test('resolves on any 2xx status', async () => {
  assert.equal(await fetchHTML(`${baseUrl}/created`), 'created')
})

test('follows redirects', async () => {
  assert.equal(await fetchHTML(`${baseUrl}/redirect`), BODY)
})

for (const [path, status] of [['/bad-request', 400], ['/missing', 404], ['/server-error', 500]]) {
  test(`rejects without a reason on HTTP ${status}`, async () => {
    assert.deepEqual(await rejectionOf(fetchHTML(`${baseUrl}${path}`)), { rejected: true, reason: undefined })
    assert.deepEqual(logs.error, [`❌ Invalid response or http code: ${status}`])
  })
}

test('rejects without a reason when the connection is refused', async () => {
  assert.deepEqual(await rejectionOf(fetchHTML(closedPortUrl)), { rejected: true, reason: undefined })
  assert.equal(logs.error.length, 1)
  assert.match(logs.error[0], /^❌ Error: /)
})
