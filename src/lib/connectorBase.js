// Every connector (CVR, a kommune's sagssystem, a styrelse's API, whatever comes next)
// implements this same shape. That's the whole point of the platform:
// new source system = new file in src/connectors/, everything else stays the same.
//
// A connector must export:
//   name        -> string, unique id for this source, e.g. "cvr"
//   entityType  -> string, what kind of thing this connector produces, e.g. "virksomhed"
//   fetchOne(sourceRef) -> raw data from the source system for one record
//   normalize(rawData)  -> { id, name, data } shaped for the common ontology table
//
// The sync engine (src/lib/sync.js) only ever talks to connectors through this shape,
// never to the source systems directly.

function makeEntityId(connectorName, sourceRef) {
  return `${connectorName}:${sourceRef}`;
}

module.exports = { makeEntityId };
