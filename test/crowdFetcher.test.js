// Pins fetchHTML's contract with a local HTTP server: resolve the body text on
// 2xx, reject with no reason on non-2xx or network errors, follow redirects.
import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { fetchHTML } from '../src/crowdFetcher.js'

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
      case '/redirect-without-location':
        res.writeHead(302)
        return res.end('moved')
      case '/truncated':
        // Promise 100 bytes, send 10, then drop the connection.
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': '100' })
        return res.write('0123456789', () => res.destroy())
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

for (const [path, status] of [['/redirect-without-location', 302], ['/bad-request', 400], ['/missing', 404], ['/server-error', 500]]) {
  test(`rejects without a reason on HTTP ${status}`, async () => {
    assert.deepEqual(await rejectionOf(fetchHTML(`${baseUrl}${path}`)), { rejected: true, reason: undefined })
    assert.deepEqual(logs.error, [`❌ Invalid response or http code: ${status}`])
  })
}

test('rejects without a reason when the connection is refused', async () => {
  assert.deepEqual(await rejectionOf(fetchHTML(closedPortUrl)), { rejected: true, reason: undefined })
  assert.equal(logs.error.length, 1)
  assert.match(logs.error[0], /^❌ Error: .*ECONNREFUSED/) // the cause, not just "fetch failed"
})

test('rejects without a reason when the connection drops mid-body', async () => {
  assert.deepEqual(await rejectionOf(fetchHTML(`${baseUrl}/truncated`)), { rejected: true, reason: undefined })
  assert.equal(logs.error.length, 1)
  assert.match(logs.error[0], /^❌ Error: /)
})
