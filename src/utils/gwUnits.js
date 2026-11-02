// Plural forms of the Glühwein units (shared list in gw_units). Used wherever a unit stands next to a quantity:
// "1 Kasten" but "5 Kästen", "1 Flasche" but "5 Flaschen". Units not in the map stay unchanged.
const PLURAL = {
  Stk: 'Stk',
  Glas: 'Gläser',
  Becher: 'Becher',
  Tasse: 'Tassen',
  Flasche: 'Flaschen',
  Shot: 'Shots',
  Kasten: 'Kästen',
  Kiste: 'Kisten',
  Paket: 'Pakete',
  Fass: 'Fässer',
  Pack: 'Packs',
  Dose: 'Dosen',
  Liter: 'Liter',
  l: 'l',
};

/** Unit text for a quantity: singular for exactly 1, plural otherwise. Empty or unknown units are returned as they are. */
export const pluralUnit = (unit, qty) => {
  const name = String(unit ?? '').trim();
  if (!name) return name;
  const n = Number(String(qty ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n === 1) return name;
  return PLURAL[name] ?? name;
};
