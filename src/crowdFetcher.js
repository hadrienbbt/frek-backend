import admin from 'firebase-admin'

import crowdParser from './crowdParser'
import FrekWebsiteSuffix from './FrekWebsiteSuffix'

const getFrekplaces = async () => {
  const snap = await admin
    .firestore()
    .collection('frekplaces')
    .get()
  return snap.docs.map(doc => doc.data())
}

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
        await saveFrekplaces(frekPlace)
      })
  )
}

const saveFrekplaces = async frekplace => admin
  .firestore()
  .collection('frekplaces')
  .doc(frekplace.frekId)
  .set(frekplace, { merge: true })
  .then(() => console.log('✅ Frek saved successfully', frekplace))
  .catch(e => console.error("❌ Can't update frekplace in firestore" + e))

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

// Uses Node's built-in fetch. Contract kept from the former `request`-based
// version: resolve the body text on 2xx, follow redirects, and reject with no
// reason on network errors or non-2xx statuses.
const fetchHTML = async url => {
  console.log("\n⏳ Fetching html...")
  let response
  try {
    response = await fetch(url)
  } catch (error) {
    // fetch wraps network failures in "TypeError: fetch failed"; log the cause.
    console.error('❌ Error: ' + (error.cause || error))
    return Promise.reject()
  }
  if (response.status < 200 || response.status > 299) {
    console.error('❌ Invalid response or http code: ' + response.status)
    response.body?.cancel().catch(() => {}) // release the connection
    return Promise.reject()
  }
  try {
    return await response.text()
  } catch (error) {
    console.error('❌ Error: ' + (error.cause || error))
    return Promise.reject()
  }
}

export { getFrekplaces, fetchAll, fetchHTML }
