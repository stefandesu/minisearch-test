#!/usr/bin/env node

const [ , , action, ...params] = process.argv

if (!action) {
  console.error("Please provide an action as first parameter (create, search).")
  process.exit(1)
}

const MiniSearch = require("minisearch")
const fs = require("fs")
const anystream = require("json-anystream")
const indexFile = "./minisearch-index.json"

const options = {
  idField: "uri",
  fields: ["notation", "prefLabel", "searchKeys"],
  boost: {
    notation: 5,
  },
  combinedWith: "AND",
  weights: { fuzzy: 0.2, prefix: 0.5 },
  storeFields: ["notation", "prefLabel"],
  extractField: (document, fieldName) => {
    switch (fieldName) {
      case "notation":
        return document.notation && document.notation[0]
      case "prefLabel":
        return document.prefLabel && document.prefLabel.de
      default:
        return document[fieldName]
    }
  },
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
  },
}

function makeSuffixes(values) {
  var results = []
  values.forEach(function (val) {
    val = val.toUpperCase().trim()
    var tmp, hasSuffix
    for (var i = 0; i < val.length - 1; i++) {
      tmp = val.substr(i)
      hasSuffix = results.includes(tmp)
      if (!hasSuffix) results.push(tmp)
    }
  })
  return results
}

const actions = {
  async create(file) {
    if (!file) {
      throw new Error("Requires file to be imported as argument.")
    }
    const miniSearch = new MiniSearch(options)
    const stream = await anystream.make(file)
    for await (const object of stream) {
      object.searchKeys = object.prefLabel && makeSuffixes(Object.values(object.prefLabel))
      try {
        miniSearch.add(object)
      } catch (error) {
        console.error("Error adding document:", object, error)
      }
    }
    console.timeEnd("read and create index")
    fs.writeFileSync("./index.json", JSON.stringify(miniSearch))
  },
  async search(query) {
    if (!query) {
      throw new Error("Search query required.")
    }
    console.time("loading index from file into minisearch")
    const miniSearch = MiniSearch.loadJSON(fs.readFileSync(indexFile, "utf-8"), options)
    console.timeEnd("loading index from file into minisearch")

    console.time("search")
    const results = miniSearch.search(query)
    console.log(results.slice(0, 3))
    console.log(`${results.length} results in total.`)
    console.log(results.findIndex(v => v.notation === query))
    console.timeEnd("search")
  },
}

if (!actions[action]) {
  console.error(`Action ${action} not found. Available actions: ${Object.keys(actions).join(", ")}`)
  process.exit(1)
}

actions[action](...params)
  .catch(console.error)
