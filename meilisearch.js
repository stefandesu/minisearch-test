#!/usr/bin/env node

/**
 * Testing Meilisearch as a search backend
 *
 * Currently requires a Meilisearch instance running on http://localhost:7700. However, search for some reason doesn't work.
 *
 * Usage:
 * ./meilisearch.js create /file/to/concepts.ndjson
 * ./meilisearch.js search searchterm
 */

const [ , , action, ...params] = process.argv

if (!action) {
  console.error("Please provide an action as first parameter (create, search).")
  process.exit(1)
}

const { MeiliSearch } = require("meilisearch")
const client = new MeiliSearch({ host: "http://localhost:7700" })
const anystream = require("json-anystream")
const collection = "movies"

const actions = {
  async create(file) {
    if (!file) {
      throw new Error("Requires file to be imported as argument.")
    }
    client.index(collection).deleteAllDocuments()
    client.index(collection).updateSearchableAttributes([
      "notation.0",
      "prefLabel.de",
      "altLabel.de",
    ])
    console.time("read and create index")
    const stream = await anystream.make(file)
    let objects = []
    for await (const object of stream) {
      objects.push(object)
      if (objects.length === 1000) {
        await client.index(collection).addDocuments(objects)
        objects = []
      }
    }
    await client.index(collection).addDocuments(objects)
    console.timeEnd("read and create index")
  },
  async search(query) {
    if (!query) {
      throw new Error("Search query required.")
    }
    const result = await client.index(collection).search(query)
    console.log(result)
  },
}

if (!actions[action]) {
  console.error(`Action ${action} not found. Available actions: ${Object.keys(actions).join(", ")}`)
  process.exit(1)
}

actions[action](...params)
  .catch(console.error)
