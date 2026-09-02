// This one IS real — a snapshot fetched from a live weather source on 24. august 2026,
// not fabricated example data like the other connectors. It's static here because this
// sandbox can't make outbound calls to a weather API at request-time, so fetchAll() just
// returns the snapshot below instead of calling out live. In a real deployment, fetchAll()
// would call a real weather API (e.g. Open-Meteo, DMI) on every request or on a schedule.

const FETCHED_AT = '2026-08-24';

const WEATHER = [
  { id: 'w1', by: 'København', lat: 55.6761, lng: 12.5683, temp: 20.5, forhold: 'Sol', hoej: 21.4, lav: 10.7 },
  { id: 'w2', by: 'Aarhus', lat: 56.1629, lng: 10.2039, temp: 19.3, forhold: 'Mestendels sol', hoej: 21.7, lav: 10.8 },
  { id: 'w3', by: 'Odense', lat: 55.4038, lng: 10.4024, temp: 18.5, forhold: 'Sol', hoej: 21.1, lav: 10.5 },
  { id: 'w4', by: 'Aalborg', lat: 57.0488, lng: 9.9217, temp: 20.6, forhold: 'Delvist skyet', hoej: 22.5, lav: 9.8 },
  { id: 'w5', by: 'Esbjerg', lat: 55.4765, lng: 8.4594, temp: 17.4, forhold: 'Delvist skyet', hoej: 18.3, lav: 9.2 },
];

async function fetchAll() {
  return WEATHER;
}

module.exports = { name: 'weather', entityType: 'vejr', fetchAll, WEATHER, fetchedAt: FETCHED_AT };
