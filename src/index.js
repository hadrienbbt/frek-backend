import 'dotenv/config'

import fs from 'fs'
import http from 'http'
import https from 'https'
import express from 'express'
import cron from 'node-cron'
import { initializeApp, cert } from 'firebase-admin/app'
import serviceAccount from '../.keys/frek-bcee6-firebase-adminsdk-e9ux7-86e9839f98.json'

initializeApp({
  credential: cert(serviceAccount)
})

import { getFrekplaces, fetchAll } from './crowdFetcher'

const port = process.env.PORT || 8080

// A failed Firestore read (quota exhausted, network error) used to reject
// outside Express 4's error handling, and Node 22 exits on unhandled
// rejections, so one failed read took the whole server down.
const fetchFrekplaces = async (req, res) => {
  try {
    const frekplaces = await getFrekplaces()
    res.status(200).send(frekplaces)
  } catch (error) {
    console.error("❌ Can't read frekplaces from firestore: " + error)
    res.status(503).send({ error: 'Service unavailable' })
  }
}

const app = express()
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*")
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
    res.header("Access-Control-Allow-Methods", "DELETE,GET,HEAD,PATCH,POST,PUT,OPTIONS")
    next()
  })
  .get('/gym', fetchFrekplaces)

if (!process.env.NODE_ENV || process.env.NODE_ENV == 'development') {
  http
      .createServer(app)
      .listen(port, _ => console.log('Listening http on port ' + port))
} else {
  const cert = process.env.SSL_CERT
  const key = process.env.SSL_KEY
  const options = {
      cert: fs.readFileSync(cert),
      key: fs.readFileSync(key)
  }
  https
      .createServer(options, app)
      .listen(port, _ => console.log('Listening https on port ' + port))
}

// fetchAll()
// cron.schedule('0,30 * * * *', fetchAll)

