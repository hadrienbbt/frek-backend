import request from 'request'
import mongojs from 'mongojs'
const db = mongojs(process.env.MONGO_URL || 'mongodb://localhost:27017/frek')
const frekPlaces = db.collection('frekPlaces')

import crowdParser from './crowdParser'
import FrekWebsiteSuffix from './FrekWebsiteSuffix'

const getState = () => new Promise(resolve => {
  frekPlaces.find((err, docs) => {
    if (err) {
      console.error("❌ Can't get frekplaces in db" + err)
      reject()
      return
    }
    resolve(docs)
  })
})

const fetchAll = async () => {
  await Promise.all(
    Object
      .keys(FrekWebsiteSuffix)
      .map(async name => {
        const gymHtml = await fetchGymHTML(FrekWebsiteSuffix[name])
        if (!gymHtml) {
          console.error("❌ Can't find gymHtml for Frekplace: " + name)
          return
        }
        const frekId = crowdParser.findFrekId(gymHtml)
        if (!frekId) {
          console.error("❌ Can't find id for frekplace: " + name)
            return
        }
        const frekHtml = await fetchFrekHTML(frekId)
        if (!frekHtml) {
          console.error("❌ Can't find gymHtml for Frekplace: " + frekId)
          return
        }
        const frekPlace = crowdParser.parse(frekId, name, gymHtml, frekHtml)
        if (!frekPlace) {
            console.error("❌ Can't create Frekplace with id: " + frekId)
            return
        }
        console.log(frekPlace)
        await saveFrekPlace(frekPlace)
        console.log('✅ Frek saved successfully', frekPlace)
      })
  )
}

const saveFrekPlace = frekPlace => new Promise((resolve, reject) => {
  const query = { frekId: frekPlace.frekId }
  const update = { $set: frekPlace }
  frekPlaces.findAndModify({ query, update, new: true, upsert: true }, err => {
    if (err) {
      console.error("❌ Can't update frekplace in db" + err)
      reject()
      return
    }
    resolve()
  })
})

const fetchGymHTML = async suffix => {
  const url = `https://www.cerclesdelaforme.com/salle-de-sport/${suffix}/`
  try {
    return await fetchHTML(url)
  } catch(e) {
    console.error(await fetchHTML(url))
    return
  }
   
}

const fetchFrekHTML = async id => {
  const url = `https://api.cdf.resamania.com/cdf/public/attendances/${id}/light?graph=true`
  return await fetchHTML(url)
}

const fetchHTML = async url => new Promise((resolve, reject) => {
  console.log("\n⏳ Fetching html...")
  request(url, (error, response, body) => {
    if (error) {
      console.error('❌ Error: ' + error)
      reject()
      return
    }
    if (response.statusCode < 200 || response.statusCode > 299) {
      console.error('❌ Invalid response or http code: ' + response.statusCode)
      reject()
      return
    }
    resolve(body)
  })
})

export { getState, fetchAll }
