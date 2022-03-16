const fs = require('fs')
const express = require('express')
const cron = require('node-cron')

const port = process.env.PORT || 8080
const options = {
  cert: fs.readFileSync(`/etc/letsencrypt/live/fedutia.fr/cert.pem`),
  key: fs.readFileSync(`/etc/letsencrypt/live/fedutia.fr/privkey.pem`)
}

const crowdFetcher = require('./crowdFetcher')

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

const https = require('https')
    .createServer(options, app)
    .listen(port, _ => console.log('Listening https on port ' + port))

// crowdFetcher.fetchAll()
// cron.schedule('0,30 * * * *', async () => await crowdFetcher.fetchAll())

