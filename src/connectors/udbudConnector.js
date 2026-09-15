// Shaped like public tender records (udbud.dk-style): each tender has a set of bidders,
// their bid amounts, and a winner. Real deployment would pull this from udbud.dk's public
// data or TED (EU tenders), but that's not reachable from this sandbox, so it's hardcoded
// here — with a deliberate cartel pattern planted in the "Vejvedligehold" tenders so the
// detection logic below has something real to find.

const TENDERS = [
  { id: 'UDB-2024-011', title: 'Vejvedligehold Nordsjælland', year: 2024,
    bids: [{ firma: 'AsfaltTeam A/S', beloeb: 4200000 }, { firma: 'Nordvej Entreprise', beloeb: 4550000 }, { firma: 'Vejcompagniet ApS', beloeb: 4610000 }],
    vinder: 'AsfaltTeam A/S' },
  { id: 'UDB-2024-034', title: 'Vejvedligehold Hovedstadsregion', year: 2024,
    bids: [{ firma: 'Nordvej Entreprise', beloeb: 5100000 }, { firma: 'AsfaltTeam A/S', beloeb: 5380000 }, { firma: 'Vejcompagniet ApS', beloeb: 5420000 }],
    vinder: 'Nordvej Entreprise' },
  { id: 'UDB-2025-002', title: 'Vejvedligehold Vestegnen', year: 2025,
    bids: [{ firma: 'Vejcompagniet ApS', beloeb: 3900000 }, { firma: 'AsfaltTeam A/S', beloeb: 4120000 }, { firma: 'Nordvej Entreprise', beloeb: 4180000 }],
    vinder: 'Vejcompagniet ApS' },
  { id: 'UDB-2025-019', title: 'Vejvedligehold Sydsjælland', year: 2025,
    bids: [{ firma: 'AsfaltTeam A/S', beloeb: 6300000 }, { firma: 'Nordvej Entreprise', beloeb: 6510000 }, { firma: 'Vejcompagniet ApS', beloeb: 6580000 }],
    vinder: 'AsfaltTeam A/S' },
  { id: 'UDB-2025-027', title: 'Vejvedligehold Fyn', year: 2025,
    bids: [{ firma: 'Nordvej Entreprise', beloeb: 2900000 }, { firma: 'Vejcompagniet ApS', beloeb: 3050000 }, { firma: 'AsfaltTeam A/S', beloeb: 3110000 }],
    vinder: 'Nordvej Entreprise' },

  // Unrelated tenders with normal, competitive bidding patterns — no cartel signal here,
  // this is what the detector should NOT flag.
  { id: 'UDB-2024-055', title: 'IT-drift Region Midtjylland', year: 2024,
    bids: [{ firma: 'DataDrift A/S', beloeb: 8100000 }, { firma: 'SystemPartner ApS', beloeb: 7400000 }, { firma: 'ITKonsortiet', beloeb: 8900000 }],
    vinder: 'SystemPartner ApS' },
  { id: 'UDB-2025-008', title: 'Rengøring kommunale bygninger', year: 2025,
    bids: [{ firma: 'RenPartner A/S', beloeb: 1200000 }, { firma: 'CleanService', beloeb: 980000 }, { firma: 'NordRent', beloeb: 1350000 }],
    vinder: 'CleanService' },
  { id: 'UDB-2025-031', title: 'Kantinedrift skoler', year: 2025,
    bids: [{ firma: 'SkoleMad ApS', beloeb: 2100000 }, { firma: 'Kantinepartner', beloeb: 1950000 }],
    vinder: 'Kantinepartner' },
];

async function fetchAll() {
  return TENDERS;
}

module.exports = { name: 'udbud', entityType: 'udbud', fetchAll, TENDERS };
