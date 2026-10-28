// Einkaufsliste for the vegetarian lasagne (Veggie). Amounts are per container (one portion).
// Source: the batch recipe makes 4 containers, so every batch amount is divided by 4.
// Agreed changes: zucchini is fried briefly in oil, Emmental instead of Fontina in the sauce.
// Emmental: 9.6 kg for 43 batches (172 containers) = 56 g per container.
// Bolo has no recipe yet and is not in this list.
// gramsPerTl: approximate weight of 1 TL, shown next to the TL amount.
// packSize: sheets per Packung (688 sheets ≈ 25.5 packs → 26 to buy, so ~27 sheets per pack).
export const VEGGIE_PER_CONTAINER = [
  { key: 'zucchini', unit: 'g', amount: 125, label: 'Zucchini' },
  { key: 'champignons', unit: 'g', amount: 100, label: 'Champignons' },
  { key: 'zwiebel', unit: 'Stk.', amount: 0.25, label: 'Zwiebeln' },
  { key: 'petersilie', unit: 'Bund', amount: 0.25, label: 'Petersilie' },
  { key: 'oel', unit: 'ml', amount: 1.875, label: 'Speiseöl (1/8 EL pro Pilze)' },
  { key: 'salz', unit: 'TL', amount: 0.1875, gramsPerTl: 6, label: 'Salz (Zucchini, Pilze, Soße)' },
  { key: 'muskat', unit: 'TL', amount: 0.0625, gramsPerTl: 2.3, label: 'Muskatnuss, gemahlen' },
  { key: 'kraeuter', unit: 'TL', amount: 0.125, gramsPerTl: 1.5, label: 'Italienische Kräuter' },
  { key: 'emmentaler', unit: 'g', amount: 56, label: 'Emmentaler (Soße)' },
  { key: 'rahm', unit: 'ml', amount: 125, label: 'Rahm / Kochsahne' },
  { key: 'parmesan', unit: 'g', amount: 12.5, label: 'Parmesan (Topping)' },
  { key: 'butter', unit: 'g', amount: 5, label: 'Butter' },
  { key: 'blaetter', unit: 'Packungen', amount: 4, packSize: 27, label: 'Lasagneblätter' },
];

// Total amount per ingredient for a number of Veggie containers (unrounded).
export const veggieShoppingTotals = (containers) =>
  VEGGIE_PER_CONTAINER.map((item) => ({ ...item, total: containers * item.amount }));
