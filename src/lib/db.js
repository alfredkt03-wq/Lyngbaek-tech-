const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', '..', 'platform.json');

function load() {
  if (!fs.existsSync(DB_FILE)) return { entities: {}, audit_log: [] };
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function save(state) {
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

function upsertEntity({ id, entityType, source, sourceRef, name, data, rawData }) {
  const state = load();
  const now = new Date().toISOString();
  const existing = state.entities[id];

  if (!existing) {
    state.entities[id] = {
      id, entity_type: entityType, source, source_ref: sourceRef, name,
      data, raw_data: rawData, first_seen: now, last_synced: now,
    };
    state.audit_log.push({ entity_id: id, action: 'created', changed_fields: null, timestamp: now });
    save(state);
    return { status: 'created' };
  }

  const changed = diffFields(existing.data, data);
  state.entities[id] = { ...existing, name, data, raw_data: rawData, last_synced: now };

  if (Object.keys(changed).length > 0) {
    state.audit_log.push({ entity_id: id, action: 'updated', changed_fields: changed, timestamp: now });
    save(state);
    return { status: 'updated', changed };
  } else {
    state.audit_log.push({ entity_id: id, action: 'synced_no_change', changed_fields: null, timestamp: now });
    save(state);
    return { status: 'no_change' };
  }
}

function diffFields(oldObj, newObj) {
  const changed = {};
  const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
  for (const key of keys) {
    if (JSON.stringify(oldObj?.[key]) !== JSON.stringify(newObj?.[key])) {
      changed[key] = { from: oldObj?.[key], to: newObj?.[key] };
    }
  }
  return changed;
}

function getEntity(id) {
  const state = load();
  return state.entities[id] || null;
}

function listEntities({ entityType, source, limit = 50 } = {}) {
  const state = load();
  let rows = Object.values(state.entities);
  if (entityType) rows = rows.filter(r => r.entity_type === entityType);
  if (source) rows = rows.filter(r => r.source === source);
  rows.sort((a, b) => (a.last_synced < b.last_synced ? 1 : -1));
  return rows.slice(0, limit).map(({ id, entity_type, source, name, last_synced }) => ({ id, entity_type, source, name, last_synced }));
}

function getAuditLog(entityId) {
  const state = load();
  return state.audit_log.filter(r => r.entity_id === entityId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

module.exports = { upsertEntity, getEntity, listEntities, getAuditLog };
