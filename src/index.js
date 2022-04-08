import 'dotenv/config'

import fs from 'fs'
import http from 'http'
import https from 'https'
import express from 'express'
import cron from 'node-cron'
import admin from 'firebase-admin'
import serviceAccount from '../.keys/frek-bcee6-firebase-adminsdk-e9ux7-86e9839f98.json'

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

import { getFrekplaces, fetchAll } from './crowdFetcher'

const port = process.env.PORT || 8080

const fetchFrekplaces = async (req, res) => {
  const frekplaces = await getFrekplaces()
  res.status(200).send(frekplaces)
}

const app = express()
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*")
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
    res.header("Access-Control-Allow-Methods", "DELETE,GET,HEAD,PATCH,POST,PUT,OPTIONS")
    next()
  })
  .get('/frekplaces', fetchFrekplaces)

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

