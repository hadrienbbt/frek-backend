const fs = require('fs')
const http = require('http')
const https = require('https')
const express = require('express')
const cron = require('node-cron')

const port = process.env.PORT || 8080
const crowdFetcher = require('./src/crowdFetcher')

const getCrowd = async (req, res) => {
  const state = await crowdFetcher.getState()
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
  const keys = require('./.keys/ssl.json')

  const options = {
      cert: fs.readFileSync(keys.cert),
      key: fs.readFileSync(keys.privkey)
  }
  https
      .createServer(options, app)
      .listen(port, _ => console.log('Listening https on port ' + port))
}

// crowdFetcher.fetchAll()
// cron.schedule('0,30 * * * *', async () => await crowdFetcher.fetchAll())

