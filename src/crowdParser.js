import moment from 'moment'
import FrekWebsiteSuffix from './FrekWebsiteSuffix'
const incrementalArray = size => Array.apply(null, Array(size)).map((_, index) => index)

const parse = (frekId, name, gymHtml, frekHtml) => {
  const crowd = findCrowd(frekHtml)
  const spotsAvailable = findSpotsAvailable(frekHtml)
  const fmi = spotsAvailable + crowd
  const latitude = findLatitude(gymHtml)
  const longitude = findLongitude(gymHtml)
  const state = findState(frekHtml)
  const suffix = FrekWebsiteSuffix[name]
  const datasets = findDatasets(frekHtml)
  return {
    frekId,
    name,
    crowd,
    spotsAvailable,
    fmi,
    latitude,
    longitude,
    state,
    suffix,
    datasets
  } 
}

const findFrekId = html => {
  console.log('\n⏳ Searching for frek id...')
  const frekId = findSubstringBetween(html, 'https://api.cdf.resamania.com/cdf/public/attendances/', '/light?graph=')
  if (!frekId) {
    console.error("❌ Couldn't find frek id")
    return
  }
  console.log('✅ Frek id found: ' + frekId)
  return frekId
}

const findDatasets = html => {
  return incrementalArray(7)
    .map((_, i) => findDataset(i + 1, html))
    .reverse()
    .map((dataset, i) => processDataset(dataset, i))
}

const processDataset = (dataset, index) => {
  if (!dataset) return
  const { minDataset, maxDataset } = dataset
  const arrayMin = JSON
    .parse('[' + minDataset + ']')
    .map(min => parseInt(min) || 0)
  const arrayMax = JSON
    .parse('[' + maxDataset + ']')
    .map(max => parseInt(max) || 0)
  const day = moment().add(-index, 'd').startOf('d').format()
  return {
    day,
    start: arrayMin,
    end: arrayMax,
  }
}

const findDataset = (index, html) => {
  console.log(`\n⏳ Searching for dataset ${index} ..."`)
  const chart = findSubstringBetween(html, `new Chart(canvas${index}`, `options: {`)
  if (!chart) {
    console.error("❌ Couldn't find charts", html)
    return null
  }
  const dataset = findSubstringBetween(chart, `datasets: `, `pointStyle: "line"`)
    .split('\n')
    .join('')
    .split(' ')
    .join('')
  if (!dataset) {
    console.error("❌ Couldn't find datasets", chart)
    return null
  }
  const minDataset = findSubstringBetween(dataset, `[{data:[`, `]`)
  if (!minDataset) {
    console.error("❌ Couldn't find minDataset", dataset)
    return null
  }
  const maxDataset = findSubstringBetween(dataset, `{data:[`, `]`)
  if (!maxDataset) {
    console.error("❌ Couldn't find maxDataset", dataset)
    return null
  }

  console.log("✅ Dataset found ")
  return { minDataset, maxDataset }
}

const findState = html => {
  console.log("\n⏳ Searching for state...")
  const startIndicatorClass = findSubstringBetween(html, "header .indicator {", "}")
  if (!startIndicatorClass) {
    console.error("❌ Couldn't find state")
    return false
  }
  const background = findSubstringBetween(startIndicatorClass, "background: ", " ")
  if (!background) {
    console.error("❌ Couldn't find state")
    return false
  }
  const state = background == "#24B52A"
  console.log("✅ State found: " + state)
  return state
}

const findLatitude = html => {
  console.log('\n⏳ Searching for latitude...')
  const latitudeStr = findSubstringBetween(html, 'latitude&quot;:&quot;', '&quot')
  if (!latitudeStr) {
    console.error("❌ Couldn't find latitude")
    return 0
  }
  console.log("✅ Latitude found: " + latitudeStr)
  return parseFloat(latitudeStr)
}

const findLongitude = html => {
  console.log('\n⏳ Searching for longitude...')
  const longitudeStr = findSubstringBetween(html, 'longitude&quot;:&quot;', '&quot')
  if (!longitudeStr) {
    console.error("❌ Couldn't find longitude")
    return 0
  }
  console.log("✅ Longitude found: " + longitudeStr)
  return parseFloat(longitudeStr)
}

const findSpotsAvailable = html => {
  console.log('\n⏳ Searching for spots available...')
  const valueClass = findSubstringBetween(html, `<span class="value">`, `</span>`)
  if (!valueClass) {
    console.error("❌ Couldn't find spots available")
    return 0
  }
  const strSpots = valueClass.replace(/\D/g, '')
  console.log('✅ spots available found: ' + strSpots)
  return parseInt(strSpots)
}

const findCrowd = html => {
  console.log('\n⏳ Searching for crowd...')
  const attendanceClass = findSubstringBetween(html, `<div class="attendance">`, `</div>`)
  if (!attendanceClass) {
    console.error("❌ Couldn't find crowd")
    return 0
  }
  const strCrowd = attendanceClass.replace(/\D/g, '')
  console.log('✅ Crowd found: ' + strCrowd)
  return parseInt(strCrowd)
}

const findSubstringBetween = (str, start, end) => {
  const startIndex = str.lastIndexOf(start)
  if (startIndex === -1) {
    console.error('❌ Start not found: ' + start)
    return
  }
  const substring = str.substring(startIndex + start.length)
  if (!end) { return substring}
  const endIndex = substring.indexOf(end)
  if (endIndex === -1) {
    console.error('❌ End not found: ' + end)
    return
  }
  return substring.substring(0, endIndex)
}

export { parse, findFrekId }
