// Illustrative example data — NOT real current events. In a real deployment, fetchAll()
// would pull from actual sources: Ritzau Finans, company press releases (Novo Nordisk,
// Mærsk, Ørsted, Vestas, DSV etc. all publish investor relations feeds), Erhvervsstyrelsen
// virksomhedsdata, or news APIs. This sandbox can't reach those, so this file exists to
// demonstrate the shape of the data and the map, not to report anything real.

const EVENTS = [
  { id: 1, firma: 'Novo Nordisk', lokation: 'Kalundborg', lat: 55.6784, lng: 11.0929,
    titel: 'Udvidelse af produktionsanlæg (eksempel)', type: 'investering', signal: 'positiv',
    beskrivelse: 'Eksempel: annonceret kapacitetsudvidelse til GLP-1-produktion.' },
  { id: 2, firma: 'Ørsted', lokation: 'Esbjerg', lat: 55.4765, lng: 8.4594,
    titel: 'Forsinkelse i havvindmøllepark (eksempel)', type: 'projekt', signal: 'negativ',
    beskrivelse: 'Eksempel: leverandørforsinkelse skubber idriftsættelse.' },
  { id: 3, firma: 'Vestas', lokation: 'Aarhus', lat: 56.1629, lng: 10.2039,
    titel: 'Ny ordre fra udenlandsk kunde (eksempel)', type: 'ordre', signal: 'positiv',
    beskrivelse: 'Eksempel: rammeaftale om levering af mølleturbiner.' },
  { id: 4, firma: 'Mærsk', lokation: 'København', lat: 55.6761, lng: 12.5683,
    titel: 'Fragtrater under pres (eksempel)', type: 'marked', signal: 'negativ',
    beskrivelse: 'Eksempel: overkapacitet på ruter presser priser.' },
  { id: 5, firma: 'LEGO', lokation: 'Billund', lat: 55.7307, lng: 9.1195,
    titel: 'Ny fabrik annonceret (eksempel)', type: 'investering', signal: 'positiv',
    beskrivelse: 'Eksempel: udvidet produktionskapacitet i Danmark.' },
  { id: 6, firma: 'Danfoss', lokation: 'Sønderborg', lat: 54.9092, lng: 9.7906,
    titel: 'Fyringsrunde i produktion (eksempel)', type: 'organisation', signal: 'negativ',
    beskrivelse: 'Eksempel: tilpasning af arbejdsstyrke efter faldende efterspørgsel.' },
  { id: 7, firma: 'DSV', lokation: 'Hedehusene', lat: 55.6579, lng: 12.0430,
    titel: 'Opkøb af logistikvirksomhed (eksempel)', type: 'M&A', signal: 'positiv',
    beskrivelse: 'Eksempel: overtagelse styrker europæisk markedsposition.' },
  { id: 8, firma: 'Grundfos', lokation: 'Bjerringbro', lat: 56.3711, lng: 9.6572,
    titel: 'Nyt R&D-center (eksempel)', type: 'investering', signal: 'positiv',
    beskrivelse: 'Eksempel: satsning på energieffektive pumpeløsninger.' },
  { id: 9, firma: 'Coloplast', lokation: 'Humlebæk', lat: 55.9644, lng: 12.5219,
    titel: 'Regulatorisk forsinkelse (eksempel)', type: 'regulering', signal: 'negativ',
    beskrivelse: 'Eksempel: godkendelsesproces trækker ud i nøglemarked.' },
  { id: 10, firma: 'Rockwool', lokation: 'Hedehusene', lat: 55.6579, lng: 12.0430,
    titel: 'Prisstigning på råvarer (eksempel)', type: 'marked', signal: 'negativ',
    beskrivelse: 'Eksempel: stigende energipriser presser marginer.' },
];

async function fetchAll() {
  return EVENTS;
}

module.exports = { name: 'market_events', entityType: 'event', fetchAll, EVENTS };
