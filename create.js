#!/usr/bin/env node

const [ , , source] = process.argv

if (!source) {
  console.error("Please provide file or URL to import.")
  process.exit(1)
}

const anystream = require("json-anystream")
const MiniSearch = require("minisearch")
const fs = require("fs")

const miniSearch = new MiniSearch({
  idField: "uri",
  fields: ["notation", "prefLabel"],
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
})

;(async () => {
  console.time("read and create index")
  const stream = await anystream.make(source)
  stream.on("data", object => {
    try {
      miniSearch.add(object)
    } catch (error) {
      console.error("Error adding document:", object)
      console.log(error)
    }
  })
  stream.on("end", () => {
    console.timeEnd("read and create index")
    console.time("search")
    console.log(miniSearch.search("Zirkulation"))
    console.timeEnd("search")
    fs.writeFileSync("./index.json", JSON.stringify(miniSearch))
  })
  stream.on("error", error => {
    console.log(error)
  })
})()
