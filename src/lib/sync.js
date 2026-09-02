const { upsertEntity } = require('./db');

// The sync engine is the "hele tiden" part — it doesn't care which connector it's
// running, it just calls fetchOne + normalize and writes the result into the shared
// entities table with a full audit trail. Add a new connector, and this code doesn't change.
async function syncOne(connector, sourceRef) {
  const raw = await connector.fetchOne(sourceRef);
  const normalized = connector.normalize(raw);

  const result = upsertEntity({
    id: normalized.id,
    entityType: connector.entityType,
    source: connector.name,
    sourceRef: normalized.sourceRef,
    name: normalized.name,
    data: normalized.data,
    rawData: normalized.rawData,
  });

  return { id: normalized.id, ...result };
}

async function syncMany(connector, sourceRefs) {
  const results = [];
  for (const ref of sourceRefs) {
    try {
      results.push(await syncOne(connector, ref));
    } catch (err) {
      results.push({ sourceRef: ref, status: 'error', error: err.message });
    }
  }
  return results;
}

module.exports = { syncOne, syncMany };
