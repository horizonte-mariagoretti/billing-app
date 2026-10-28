// Einkaufsliste for the vegetarian lasagne (Veggie). Amounts are per container (one portion).
// Source: the batch recipe makes 4 containers, so every batch amount is divided by 4.
// Agreed changes: zucchini is fried briefly in oil, Emmental instead of Fontina in the sauce.
// Emmental: 9.6 kg for 43 batches (172 containers) = 56 g per container.
// Bolo has no recipe of its own: see BOLO_PER_LASAGNE.
// store: which shop the item is bought at (see SHOP_STORES).
// gramsPerTl: approximate weight of 1 TL, shown next to the TL amount.
// packSize: sheets per Packung (688 sheets ≈ 25.5 packs → 26 to buy, so ~27 sheets per pack).
// Stock on hand is stored in the item's unit (Packungen for sheets) under settings key stockSettingKey().
export const SHOP_STORES = [
  { key: 'duysens', label: 'Duysens' },
  { key: 'colruyt', label: 'Colruyt' },
  { key: 'gerkens', label: 'Gerkens' },
  { key: 'delhaize', label: 'Delhaize' },
];

export const VEGGIE_PER_CONTAINER = [
  { key: 'zucchini', store: 'duysens', unit: 'g', amount: 125, label: 'Zucchini' },
  { key: 'champignons', store: 'duysens', unit: 'g', amount: 100, label: 'Champignons' },
  { key: 'zwiebel', store: 'duysens', unit: 'Stk.', amount: 0.25, label: 'Zwiebeln' },
  { key: 'petersilie', store: 'duysens', unit: 'Bund', amount: 0.25, label: 'Petersilie' },
  { key: 'oel', store: 'colruyt', unit: 'ml', amount: 1.875, label: 'Olivenöl' },
  { key: 'salz', store: 'colruyt', unit: 'TL', amount: 0.1875, gramsPerTl: 6, label: 'Salz' },
  { key: 'muskat', store: 'colruyt', unit: 'TL', amount: 0.0625, gramsPerTl: 2.3, label: 'Muskatnuss' },
  { key: 'kraeuter', store: 'colruyt', unit: 'TL', amount: 0.125, gramsPerTl: 1.5, label: 'Italienische Kräuter' },
  { key: 'emmentaler', store: 'colruyt', unit: 'g', amount: 56, label: 'Emmentaler (Soße)' },
  { key: 'rahm', store: 'colruyt', unit: 'ml', amount: 125, label: 'Rahm / Kochsahne' },
  { key: 'parmesan', store: 'colruyt', unit: 'g', amount: 12.5, label: 'Parmesan (Topping)' },
  { key: 'butter', store: 'colruyt', unit: 'g', amount: 5, label: 'Butter' },
  { key: 'blaetter', store: 'colruyt', unit: 'Packungen', amount: 4, packSize: 27, label: 'Lasagneblätter' },
  { key: 'aluschalen', store: 'gerkens', unit: 'Stk.', amount: 1, label: 'Aluschalen' },
  { key: 'deckel', store: 'gerkens', unit: 'Stk.', amount: 1, label: 'Deckel' },
];

// Bolo has no recipe: each Bolo portion is one ready-made 400 g lasagne bought at Delhaize.
export const BOLO_PER_LASAGNE = [
  { key: 'bolo_lasagne', store: 'delhaize', unit: 'Stk.', amount: 1, label: 'Lasagne 400 g' },
];

export const stockSettingKey = (item) => `lasagna_stock_${item.key}`;

// Amount needed in the item's unit. Whole units (g, ml, Stk., Bund, Packungen) round up; TL stays exact.
export const itemNeed = (item, containers) => {
  const raw = containers * item.amount;
  if (item.packSize) return Math.ceil(raw / item.packSize);
  if (item.unit === 'TL') return raw;
  return Math.ceil(raw);
};

// Unit a row is shown in: g → kg and ml → l once the amount reaches 1000, the item's own unit otherwise.
export const displayUnit = (item, qty) => {
  if ((item.unit === 'g' || item.unit === 'ml') && qty >= 1000) {
    return { unit: item.unit === 'g' ? 'kg' : 'l', factor: 1000 };
  }
  return { unit: item.unit, factor: 1 };
};

// Amount still to buy after subtracting stock on hand (same unit).
export const itemToBuy = (item, need, stock) => {
  const rest = Math.max(0, need - stock);
  return item.unit === 'TL' ? rest : Math.ceil(rest);
};

// Full list for the Veggie and Bolo counts, with the amount needed in each item's unit.
export const shoppingList = ({ veggie, bolo }) => [
  ...VEGGIE_PER_CONTAINER.map((item) => ({ ...item, need: itemNeed(item, veggie) })),
  ...BOLO_PER_LASAGNE.map((item) => ({ ...item, need: itemNeed(item, bolo) })),
];
