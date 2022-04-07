import 'dotenv/config'

import fs from 'fs'
import http from 'http'
import https from 'https'
import express from 'express'
import cron from 'node-cron'

import { getState, fetchAll } from './crowdFetcher'

const port = process.env.PORT || 8080

const getCrowd = async (req, res) => {
  const state = await getState()
  res.status(200).send(state)
}

const app = express()
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*")
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
    res.header("Access-Control-Allow-Methods", "DELETE,GET,HEAD,PATCH,POST,PUT,OPTIONS")
    next()
  })
  .get('/', getCrowd)


if (!process.env.NODE_ENV || process.env.NODE_ENV == 'development') {
  http
      .createServer(app)
      .listen(port, _ => console.log('Listening http on port ' + port))
} else {
  const cert = process.env.SSL_CERT
  const key = process.env.SSL_KEY
  const options = {
      cert: fs.readFileSync(cert),
      key: fs.readFileSync(privkey)
  }
  https
      .createServer(options, app)
      .listen(port, _ => console.log('Listening https on port ' + port))
}

// fetchAll()
// cron.schedule('0,30 * * * *', fetchAll)

