#!/usr/bin/env node

/**
 * Testing Typesense as a search backend
 *
 * Currently requires a running Typesense server on localhost:8108 with apiKey "xyz".
 *
 * Usage:
 * ./typesense.js create /file/to/concepts.ndjson
 * ./typesense.js search searchterm
 *
 * Currently, everything is saved in a collection named "test" and the "create" action will drop that collection before importing data.
 */

const [ , , action, param] = process.argv

if (!action) {
  console.error("Please provide an action as first parameter (create, search).")
  process.exit(1)
}
if (!param) {
  console.error("Please provide a parameter as second parameter (source file for create, search term for search)")
  process.exit(1)
}

const Typesense = require("typesense")
let client = new Typesense.Client({
  nodes: [{
    host: "localhost",
    port: "8108",
    protocol: "http",
  }],
  apiKey: "xyz",
  connectionTimeoutSeconds: 15,
})
const collection = "test"

/**
 * Maps a concept to a document for importing it into Typesense. The document will have the following structure:
 *
 * {
 *    id: string (URI),
 *    concept: unmodified JSKOS concept data,
 *    identifier: list of strings (URI, identifier, notations),
 *    prefLabel: list of strings (all preferred labels); empty for combined concepts,
 *    altLabel: list of strings (all alternative labels); empty for combined concepts,
 *    notes: list of strings (notes = scopeNote and editorialNote); empty for combined concepts,
 * }
 */
function mapConcept(concept) {
  if (!concept || !concept.uri || !concept.prefLabel) {
    return null
  }
  const document = {
    id: concept.uri,
    concept,
    identifier: [concept.uri].concat(concept.identifier || [], concept.notation),
    prefLabel: [],
    altLabel: [],
    notes: [],
  }
  if (!(concept.type || []).includes("http://rdf-vocabulary.ddialliance.org/xkos#CombinedConcept")) {
    document.prefLabel = Object.values(concept.prefLabel)
    document.altLabel = [].concat(...Object.values(concept.altLabel || {}))
    document.notes = [].concat(...Object.values(concept.scopeNote || {}), ...Object.values(concept.editorialNote || {}))
  }
  return document
}

const anystream = require("json-anystream")

const actions = {
  async create() {
    console.time("Delete and recreate collection")
    try {
      await client.collections(collection).delete()
      console.log(`- Collection ${collection} deleted.`)
    } catch (error) {
      // ignore
    }
    const schema = {
      name: collection,
      fields: [
        { name: "identifier", type: "string[]", infix: true },
        { name: "prefLabel", type: "string[]", infix: true },
        { name: "altLabel", type: "string[]", infix: true },
        { name: "notes", type: "string[]", infix: true },
      ]
    }
    await client.collections().create(schema)
    console.log(`- Collection ${collection} created.`)
    console.timeEnd("Delete and recreate collection")
    console.time("Import documents")
    let count = 0
    let current = []
    const stream = await anystream.make(param)
    for await (const concept of stream) {
      const document = mapConcept(concept)
      if (!document) {
        continue
      }
      current.push(document)
      count += 1
      if (count % 10000 === 0) {
        await client.collections(collection).documents().import(current, { action: "create" })
        console.log(`- ${count} documents imported.`)
        current = []
      }
    }
    await client.collections(collection).documents().import(current, { action: "create" })
    console.log(`- ${count} documents imported.`)
    console.timeEnd("Import documents")
  },
  async search() {
    console.time("Search")
    const results = await client.collections(collection).documents().search({
      q: param,
      query_by: "identifier,prefLabel,altLabel,notes",
      infix: "always",
      per_page: 250,
    })
    for (const result of results.hits.map(h => h.document).slice(0, 10)) {
      console.log(result.identifier[result.identifier.length - 1])
      console.log(" ", result.prefLabel[0])
    }
    console.log()
    console.log(`${results.found} total results`)
    console.timeEnd("Search")
  },
}

if (!actions[action]) {
  console.error(`Action ${action} not found. Available actions: ${Object.keys(actions).join(", ")}`)
  process.exit(1)
}

actions[action]()
