// Illustrative example vessel positions in Danish waters — NOT real AIS data. A real
// deployment would swap fetchAll() for a call to Søfartsstyrelsens AIS-data (ais.dk)
// or a provider like MarineTraffic/VesselFinder — this sandbox can't reach those.

const SHIPS = [
  { id: 's1', navn: 'Nordic Carrier', type: 'Containerskib', lat: 55.33, lng: 11.05, retning: 'Nordgående gennem Storebælt (eksempel)' },
  { id: 's2', navn: 'Baltic Trader', type: 'Tankskib', lat: 55.70, lng: 12.65, retning: 'På vej mod København havn (eksempel)' },
  { id: 's3', navn: 'Skagerrak Star', type: 'Bulkcarrier', lat: 57.60, lng: 10.55, retning: 'Passerer Skagen (eksempel)' },
  { id: 's4', navn: 'Kattegat Pioneer', type: 'RoRo-færge', lat: 56.60, lng: 11.10, retning: 'Krydser Kattegat mod Aarhus (eksempel)' },
  { id: 's5', navn: 'Vesterhav Runner', type: 'Fragtskib', lat: 55.45, lng: 8.30, retning: 'Ind mod Esbjerg havn (eksempel)' },
  { id: 's6', navn: 'Øresund Link', type: 'Containerskib', lat: 55.62, lng: 12.75, retning: 'Sydgående gennem Øresund (eksempel)' },
];

async function fetchAll() {
  return SHIPS;
}

module.exports = { name: 'ships', entityType: 'skib', fetchAll, SHIPS };
