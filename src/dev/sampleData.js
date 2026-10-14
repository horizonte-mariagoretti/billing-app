// Sample data for every section of the app (settings, categories, products,
// clients, Horis, Arbeiten, offers, invoices, payments, audit events).
// Pure: returns a list of { sql, params } statements, run against the
// in-memory dev database by Bootstrap (Vite web dev only).
// Dates are relative to "today".

/* eslint-disable object-property-newline */
export function buildSampleStatements() {
  /* ── helpers ─────────────────────────────────────────────── */
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dayStr = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const ts = (offset, time = '10:00:00') => `${dayStr(offset)}T${time}.000Z`;
  const ymd = (offset) => dayStr(offset).replace(/-/g, '');

  const statements = [];
  const insert = (table, row) => {
    const keys = Object.keys(row);
    statements.push({
      sql: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      params: keys.map((k) => (row[k] === undefined ? null : row[k])),
    });
  };
  const setting = (key, value) => statements.push({
    sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    params: [key, String(value)],
  });

  /* ── settings ────────────────────────────────────────────── */
  Object.entries({
    company_name: 'Jugendlager Maria Goretti VoG',
    company_address: 'Klosterstraße 12\n4700 Eupen\nBelgien',
    company_email: 'info@mg-lager.example',
    company_phone: '+32 87 55 01 23',
    company_vat: 'BE0123456749',
    company_iban: 'BE68 5390 0754 7034',
    company_bic: 'BBRUBEBB',
    default_currency: 'EUR',
    default_tax_rate: '21',
    camp_base_contribution: '120',
    camp_min_contribution: '30',
    camp_reduction_per_percent: '4',
  }).forEach(([k, v]) => setting(k, v));

  /* ── categories ──────────────────────────────────────────── */
  const categories = [
    { id: 'cat-care', name: 'Betreuung', name_de: 'Betreuung', name_fr: 'Encadrement', color: '#6366F1' },
    { id: 'cat-work', name: 'Workshops', name_de: 'Workshops', name_fr: 'Ateliers', color: '#10B981' },
    { id: 'cat-mat', name: 'Material', name_de: 'Material', name_fr: 'Matériel', color: '#F59E0B' },
    { id: 'cat-trans', name: 'Transport', name_de: 'Transport', name_fr: 'Transport', color: '#EF4444' },
    { id: 'cat-admin', name: 'Verwaltung', name_de: 'Verwaltung', name_fr: 'Administration', color: '#8B5CF6' },
  ];
  categories.forEach((c, i) => insert('product_categories', { ...c, sort_order: i }));

  /* ── products ────────────────────────────────────────────── */
  const products = [
    { id: 'p-care-h', name: 'Childcare (per hour)', name_de: 'Kinderbetreuung (Stunde)', name_fr: 'Garde d\'enfants (heure)', description: 'Supervised childcare by trained helpers', description_de: 'Beaufsichtigte Kinderbetreuung durch geschulte Helfer', description_fr: 'Garde d\'enfants par des animateurs formés', rate: 18, unit: 'hour', category_id: 'cat-care' },
    { id: 'p-care-d', name: 'Childcare (full day)', name_de: 'Kinderbetreuung (Tag)', name_fr: 'Garde d\'enfants (journée)', description: 'Up to 8 hours', description_de: 'Bis zu 8 Stunden', description_fr: 'Jusqu\'à 8 heures', rate: 135, unit: 'day', category_id: 'cat-care' },
    { id: 'p-event', name: 'Event supervision', name_de: 'Veranstaltungsbetreuung', name_fr: 'Encadrement d\'événement', description: '', description_de: 'Aufsicht bei Festen und Veranstaltungen', description_fr: 'Surveillance lors de fêtes et événements', rate: 22, unit: 'hour', category_id: 'cat-care' },
    { id: 'p-night', name: 'Night watch', name_de: 'Nachtwache', name_fr: 'Veille de nuit', description: '', description_de: 'Nachtwache bei Übernachtungen', description_fr: 'Veille de nuit lors des nuitées', rate: 90, unit: 'fixed', category_id: 'cat-care' },
    { id: 'p-craft', name: 'Craft workshop', name_de: 'Bastelworkshop', name_fr: 'Atelier bricolage', description: '', description_de: 'Kreativer Bastelnachmittag inkl. Anleitung', description_fr: 'Après-midi bricolage avec encadrement', rate: 160, unit: 'fixed', category_id: 'cat-work' },
    { id: 'p-sport', name: 'Sports day', name_de: 'Sporttag', name_fr: 'Journée sportive', description: '', description_de: 'Spiele und Sport im Freien', description_fr: 'Jeux et sports en plein air', rate: 220, unit: 'day', category_id: 'cat-work' },
    { id: 'p-cook', name: 'Cooking workshop', name_de: 'Kochworkshop', name_fr: 'Atelier cuisine', description: '', description_de: 'Gemeinsames Kochen mit Kindern', description_fr: 'Cuisine en groupe avec les enfants', rate: 180, unit: 'fixed', category_id: 'cat-work' },
    { id: 'p-mat-kit', name: 'Material kit', name_de: 'Materialpaket', name_fr: 'Kit de matériel', description: '', description_de: 'Bastel- und Spielmaterial', description_fr: 'Matériel de bricolage et de jeu', rate: 12.5, unit: 'item', category_id: 'cat-mat' },
    { id: 'p-mat-snack', name: 'Snack & drinks', name_de: 'Snacks & Getränke', name_fr: 'Collations & boissons', description: '', description_de: 'Verpflegung pro Kind', description_fr: 'Restauration par enfant', rate: 3.8, unit: 'item', category_id: 'cat-mat' },
    { id: 'p-trans-km', name: 'Mileage', name_de: 'Fahrtkosten (km)', name_fr: 'Frais de déplacement (km)', description: '', description_de: 'Pro gefahrenem Kilometer', description_fr: 'Par kilomètre parcouru', rate: 0.42, unit: 'item', category_id: 'cat-trans' },
    { id: 'p-trans-bus', name: 'Bus rental', name_de: 'Busmiete', name_fr: 'Location de bus', description: '', description_de: 'Kleinbus mit Fahrer', description_fr: 'Minibus avec chauffeur', rate: 240, unit: 'day', category_id: 'cat-trans' },
    { id: 'p-admin', name: 'Administration fee', name_de: 'Verwaltungspauschale', name_fr: 'Frais administratifs', description: '', description_de: 'Planung, Abrechnung, Versicherung', description_fr: 'Planification, facturation, assurance', rate: 25, unit: 'fixed', category_id: 'cat-admin' },
    { id: 'p-misc', name: 'Miscellaneous', name_de: 'Sonstiges', name_fr: 'Divers', description: '', description_de: 'Nicht kategorisierte Leistung', description_fr: 'Prestation non catégorisée', rate: 50, unit: 'fixed', category_id: null },
  ];
  products.forEach((p) => insert('products', p));
  const P = Object.fromEntries(products.map((p) => [p.id, p]));

  /* ── clients ─────────────────────────────────────────────── */
  const clients = [
    { id: 'c-1', name: 'Familie Schmitz', email: 'schmitz@example.be', phone: '+32 470 12 34 56', street: 'Hauptstraße 4', zip: '4700', city: 'Eupen', country: 'Belgien', vat: '', valid: [1, 1, 1, 0] },
    { id: 'c-2', name: 'Gemeinde Kelmis', email: 'jugend@kelmis.example', phone: '+32 87 63 90 00', street: 'Rathausplatz 1', zip: '4720', city: 'Kelmis', country: 'Belgien', vat: 'BE0207654321', valid: [1, 1, 1, 1], vatName: 'Gemeinde Kelmis' },
    { id: 'c-3', name: 'Kita Sonnenschein', email: 'leitung@sonnenschein.example', phone: '+32 87 74 11 22', street: 'Gartenweg 9', zip: '4730', city: 'Raeren', country: 'Belgien', vat: 'BE0412345678', valid: [1, 1, 1, 1], vatName: 'Kita Sonnenschein VoG' },
    { id: 'c-4', name: 'Dupont Événements SPRL', email: 'contact@dupont-evenements.example', phone: '+32 4 222 33 44', street: 'Rue de la Gare 22', zip: '4800', city: 'Verviers', country: 'Belgique', vat: 'BE0556677889', valid: [1, 1, 1, 1], vatName: 'DUPONT EVENEMENTS SPRL' },
    { id: 'c-5', name: 'Schule St. Vith', email: 'sekretariat@schule-stvith.example', phone: '+32 80 22 80 10', street: 'Schulstraße 3', zip: '4780', city: 'St. Vith', country: 'Belgien', vat: '', valid: [1, 1, 1, 0] },
    { id: 'c-6', name: 'Familie Lejeune', email: 'lejeune@example.be', phone: '+32 478 99 88 77', street: 'Rue des Fleurs 15', zip: '4850', city: 'Plombières', country: 'Belgique', vat: '', valid: [1, 0, 0, 0] },
    { id: 'c-7', name: 'Bäckerei Mertens', email: 'info@baeckerei-mertens.example', phone: '+32 87 55 62 30', street: 'Marktplatz 7', zip: '4700', city: 'Eupen', country: 'Belgien', vat: 'BE0698765432', valid: [1, 1, 1, 0] },
    { id: 'c-8', name: 'Pfarrgemeinde Lontzen', email: 'pfarre@lontzen.example', phone: '', street: 'Kirchstraße 2', zip: '4710', city: 'Lontzen', country: 'Belgien', vat: '', valid: [1, 0, 1, 0] },
    { id: 'c-9', name: 'Familie Hoffmann', email: 'hoffmann@example.be', phone: '+32 499 11 22 33', street: 'Waldstraße 31', zip: '4731', city: 'Eynatten', country: 'Belgien', vat: '', valid: [1, 1, 1, 0] },
    { id: 'c-10', name: 'Sportverein Eupen 08', email: 'vorstand@sv-eupen.example', phone: '+32 87 74 50 08', street: 'Stadionweg 1', zip: '4700', city: 'Eupen', country: 'Belgien', vat: 'BE0455566677', valid: [0, 1, 1, 1], vatName: 'SV EUPEN 08 VOG' },
  ];
  clients.forEach((c) => insert('clients', {
    id: c.id, name: c.name, email: c.email, phone: c.phone,
    address: c.street, address_street: c.street, address_zip: c.zip, address_city: c.city, address_country: c.country,
    vat: c.vat, email_valid: c.valid[0], phone_valid: c.valid[1], address_verified: c.valid[2], vat_valid: c.valid[3],
    vat_company_name: c.vatName || null, vat_validated_at: c.vatName ? ts(-30) : null,
  }));

  /* ── horis (helpers) ─────────────────────────────────────── */
  const birth = (age, month) => `${today.getFullYear() - age}-${String(month).padStart(2, '0')}-${String(10 + month).padStart(2, '0')}`;
  const horis = [
    ['h-1', 'Lena', 'Müller', 17, 3, 1], ['h-2', 'Noah', 'Schmitz', 16, 7, 1], ['h-3', 'Emma', 'Dupont', 18, 1, 1],
    ['h-4', 'Louis', 'Mertens', 15, 9, 1], ['h-5', 'Mia', 'Hoffmann', 16, 11, 1], ['h-6', 'Jonas', 'Lejeune', 17, 5, 1],
    ['h-7', 'Sophie', 'Kleinen', 14, 2, 1], ['h-8', 'Felix', 'Backes', 19, 12, 1], ['h-9', 'Clara', 'Jansen', 15, 6, 1],
    ['h-10', 'Tim', 'Radermacher', 16, 4, 1], ['h-11', 'Hanna', 'Peters', 17, 8, 1], ['h-12', 'Paul', 'Meessen', 20, 10, 0],
    ['h-13', 'Lisa', 'Heinen', 21, 2, 0], ['h-14', 'Ben', 'Wintgens', 14, 9, 1],
  ].map(([id, first_name, last_name, age, month, active]) => ({ id, first_name, last_name, birth_date: birth(age, month), active }));
  horis.forEach((h) => insert('horis', h));

  /* ── documents (declared first so jobs can link to them) ─── */
  const docs = [];
  let invSeq = 0;
  let qteSeq = 0;
  const numberFor = (type, offset) => (type === 'invoice'
    ? `INV_${ymd(offset)}_${String(++invSeq).padStart(4, '0')}`
    : `QTE_${ymd(offset)}_${String(++qteSeq).padStart(4, '0')}`);

  const it = (productId, qty = 1, duration = 1, over = {}) => {
    const p = P[productId];
    return { name: p.name_de, nameEn: p.name, nameFr: p.name_fr, description: p.description_de, qty, rate: p.rate, duration, ...over };
  };

  /* eslint-disable object-property-newline */
  const mkDoc = (o) => {
    const doc = {
      tax_rate: 21, discount_value: 0, discount_type: '%', currency: 'EUR', language: 'de',
      payment_mode: 'standard', locked: 0, notes: '', ...o,
    };
    doc.number = doc.number || numberFor(doc.type, doc.dateOffset);
    doc.date = dayStr(doc.dateOffset);
    doc.due_date = doc.dueOffset != null ? dayStr(doc.dueOffset) : null;
    docs.push(doc);
    return doc;
  };

  // Quotes
  const q1 = mkDoc({ id: 'd-q1', type: 'quote', client_id: 'c-2', title: 'Sommerferienbetreuung', status: 'converted', locked: 1, dateOffset: -75, dueOffset: -45, issued_at: ts(-75), items: [it('p-care-d', 5, 1), it('p-mat-kit', 20, 1), it('p-admin')], notes: 'Betreuung in den Sommerferien, 5 Tage, 20 Kinder.' });
  const q2 = mkDoc({ id: 'd-q2', type: 'quote', client_id: 'c-3', title: 'Bastelnachmittag Herbst', status: 'accepted', locked: 1, dateOffset: -20, dueOffset: 10, issued_at: ts(-20), items: [it('p-craft'), it('p-mat-kit', 12, 1), it('p-mat-snack', 12, 1)], discount_value: 5 });
  const q3 = mkDoc({ id: 'd-q3', type: 'quote', client_id: 'c-4', title: 'Sommerfest Betreuung', status: 'sent', locked: 1, dateOffset: -6, dueOffset: 24, issued_at: ts(-6), language: 'fr', items: [it('p-event', 6, 1), it('p-night'), it('p-trans-km', 80, 1)] });
  const q4 = mkDoc({ id: 'd-q4', type: 'quote', client_id: 'c-5', title: 'Sporttag Schule', status: 'draft', dateOffset: -2, dueOffset: 28, items: [it('p-sport'), it('p-trans-bus'), it('p-mat-snack', 40, 1)] });
  const q5 = mkDoc({ id: 'd-q5', type: 'quote', client_id: 'c-10', title: 'Vereinsfest Kinderprogramm', status: 'declined', locked: 1, dateOffset: -40, dueOffset: -10, issued_at: ts(-40), items: [it('p-care-h', 4, 6), it('p-craft')], discount_value: 50, discount_type: 'fixed' });
  const q6 = mkDoc({ id: 'd-q6', type: 'quote', client_id: 'c-9', title: 'Geburtstagsfeier Betreuung', status: 'sent', locked: 1, dateOffset: -3, dueOffset: 27, issued_at: ts(-3), language: 'en', items: [it('p-care-h', 2, 4), it('p-cook')] });
  const q7 = mkDoc({ id: 'd-q7', type: 'quote', client_id: 'c-1', title: 'Kochworkshop Familienfest', status: 'draft', dateOffset: 0, dueOffset: 30, items: [it('p-cook'), it('p-mat-snack', 15, 1)] });

  // Invoices
  const i1 = mkDoc({ id: 'd-i1', type: 'invoice', client_id: 'c-2', title: 'Sommerferienbetreuung', status: 'paid', locked: 1, dateOffset: -45, dueOffset: -15, issued_at: ts(-45), paid_at: ts(-28), source_quote_id: q1.id, items: q1.items });
  const i2 = mkDoc({ id: 'd-i2', type: 'invoice', client_id: 'c-1', title: 'Kinderbetreuung Juli', status: 'paid', locked: 1, dateOffset: -60, dueOffset: -30, issued_at: ts(-60), paid_at: ts(-52), items: [it('p-care-h', 2, 12), it('p-trans-km', 40, 1)] });
  const i3 = mkDoc({ id: 'd-i3', type: 'invoice', client_id: 'c-3', title: 'Bastelnachmittag Frühling', status: 'paid', locked: 1, dateOffset: -90, dueOffset: -60, issued_at: ts(-90), paid_at: ts(-70), language: 'de', items: [it('p-craft'), it('p-mat-kit', 15, 1)] });
  const i4 = mkDoc({ id: 'd-i4', type: 'invoice', client_id: 'c-4', title: 'Firmenfest Betreuung', status: 'sent', locked: 1, dateOffset: -12, dueOffset: 18, issued_at: ts(-12), language: 'fr', items: [it('p-event', 5, 6), it('p-night')] });
  const i5 = mkDoc({ id: 'd-i5', type: 'invoice', client_id: 'c-7', title: 'Kinderanimation Hoffest', status: 'sent', locked: 1, dateOffset: -50, dueOffset: -20, issued_at: ts(-50), items: [it('p-care-h', 2, 5), it('p-craft')] }); // overdue
  const i6 = mkDoc({ id: 'd-i6', type: 'invoice', client_id: 'c-8', title: 'Pfarrfest Spielprogramm', status: 'sent', locked: 1, dateOffset: -35, dueOffset: -5, issued_at: ts(-35), items: [it('p-sport'), it('p-mat-snack', 30, 1)] }); // overdue
  const i7 = mkDoc({ id: 'd-i7', type: 'invoice', client_id: 'c-5', title: 'Projekttag Schule', status: 'draft', dateOffset: -1, dueOffset: 29, items: [it('p-cook'), it('p-mat-kit', 25, 1), it('p-admin')] });
  const i8 = mkDoc({ id: 'd-i8', type: 'invoice', client_id: 'c-6', title: 'Nachhilfe-Betreuung (storniert)', status: 'cancelled', locked: 1, dateOffset: -70, dueOffset: -40, issued_at: ts(-70), cancelled_at: ts(-65), items: [it('p-care-h', 1, 10)] });
  const i9 = mkDoc({ id: 'd-i9', type: 'invoice', client_id: 'c-9', title: 'Barzahlung Ausflug', status: 'paid', locked: 1, dateOffset: -25, dueOffset: -25, issued_at: ts(-25), paid_at: ts(-25), payment_mode: 'cash', tax_rate: 0, items: [it('p-care-h', 2, 4), it('p-mat-snack', 8, 1)] });
  const i10 = mkDoc({ id: 'd-i10', type: 'invoice', client_id: 'c-10', title: 'Vereinsfest Sporttag', status: 'paid', locked: 1, dateOffset: -100, dueOffset: -70, issued_at: ts(-100), paid_at: ts(-80), language: 'en', discount_value: 10, items: [it('p-sport'), it('p-trans-bus')] });
  const i11 = mkDoc({ id: 'd-i11', type: 'invoice', client_id: 'c-3', title: 'Bastelnachmittag Herbst', status: 'draft', dateOffset: 0, dueOffset: 30, source_quote_id: q2.id, items: q2.items, discount_value: 5 });

  const docTotal = (d) => {
    const sub = d.items.reduce((s, x) => s + x.qty * x.rate * x.duration, 0);
    const disc = d.discount_type === 'fixed' ? d.discount_value : (sub * d.discount_value) / 100;
    const net = Math.max(0, sub - disc);
    return Math.round((net + (net * d.tax_rate) / 100) * 100) / 100;
  };

  docs.forEach((d) => {
    const colsVisible = JSON.stringify({ qty: true, duration: true, rate: true, total: true });
    insert('documents', {
      id: d.id, type: d.type, number: d.number, date: d.date, due_date: d.due_date, status: d.status,
      client_id: d.client_id, title: d.title, notes: d.notes, currency: d.currency, tax_rate: d.tax_rate,
      discount_value: d.discount_value, discount_type: d.discount_type, language: d.language,
      payment_mode: d.payment_mode, issued_at: d.issued_at || null, paid_at: d.paid_at || null,
      cancelled_at: d.cancelled_at || null, locked: d.locked, source_quote_id: d.source_quote_id || null,
      visible_columns: colsVisible,
    });
    d.items.forEach((x, i) => insert('document_items', {
      id: `${d.id}-it${i}`, document_id: d.id, name: x.name, description: x.description || '', qty: x.qty, rate: x.rate, duration: x.duration, sort_order: i,
    }));

    // audit trail
    const ev = (offset, type, payload) => insert('document_events', {
      id: `${d.id}-ev${Math.abs(offset)}-${type.replace(/\W/g, '')}`, document_id: d.id, event_type: type,
      payload_json: JSON.stringify(payload), created_at: ts(offset),
    });
    ev(d.dateOffset, 'created', { number: d.number });
    if (d.issued_at) ev(d.dateOffset, 'status:draft->sent', { from: 'draft', to: 'sent' });
    if (d.status === 'accepted' || d.status === 'converted') ev(d.dateOffset + 5, 'status:sent->accepted', { from: 'sent', to: 'accepted' });
    if (d.status === 'converted') ev(d.dateOffset + 30, 'status:accepted->converted', { from: 'accepted', to: 'converted', invoice_id: 'd-i1' });
    if (d.status === 'declined') ev(d.dateOffset + 8, 'status:sent->declined', { from: 'sent', to: 'declined' });
    if (d.status === 'paid') ev(Math.round((new Date(d.paid_at) - today) / 86400000), 'status:sent->paid', { from: 'sent', to: 'paid' });
    if (d.status === 'cancelled') ev(-65, 'status:sent->cancelled', { from: 'sent', to: 'cancelled' });

    // payments
    if (d.status === 'paid') {
      insert('payments', {
        id: `${d.id}-pay`, document_id: d.id, amount: docTotal(d), currency: d.currency,
        method: d.payment_mode === 'cash' ? 'cash' : 'bank_transfer', paid_at: d.paid_at,
        reference: d.payment_mode === 'cash' ? null : `Ref ${d.number}`, notes: null,
      });
    }
  });

  /* ── Arbeiten (jobs) + assignments ───────────────────────── */
  // [id, title, dayOffset, start, end, client, quote, invoice, status, notes, [[hori, planned, actual], …]]
  const jobs = [
    ['j-1', 'Sommerferienbetreuung Woche 1', -70, '08:00', '16:00', 'c-2', q1.id, i1.id, 'done', 'Gemeindehalle Kelmis', [['h-1', 8, 8], ['h-2', 8, 7.5], ['h-3', 8, 8], ['h-4', 6, 6], ['h-8', 8, 8]]],
    ['j-2', 'Sommerferienbetreuung Woche 2', -63, '08:00', '16:00', 'c-2', q1.id, i1.id, 'done', '', [['h-1', 8, 8], ['h-5', 8, 8], ['h-6', 8, 7], ['h-9', 6, 6]]],
    ['j-3', 'Bastelnachmittag Frühling', -88, '14:00', '18:00', 'c-3', null, i3.id, 'done', '', [['h-3', 4, 4], ['h-7', 4, 4], ['h-10', 4, 3.5]]],
    ['j-4', 'Kinderbetreuung Familie Schmitz', -58, '09:00', '17:00', 'c-1', null, i2.id, 'done', '', [['h-2', 8, 8], ['h-11', 8, 8]]],
    ['j-5', 'Hoffest Kinderanimation', -48, '13:00', '19:00', 'c-7', null, i5.id, 'done', '', [['h-4', 6, 6], ['h-5', 6, 6], ['h-9', 6, 5.5], ['h-14', 4, 4]]],
    ['j-6', 'Pfarrfest Spielprogramm', -33, '10:00', '17:00', 'c-8', null, i6.id, 'done', 'Spiele im Pfarrgarten', [['h-1', 7, 7], ['h-6', 7, 7], ['h-8', 7, 7], ['h-10', 7, 6]]],
    ['j-7', 'Ausflug Barzahlung', -25, '09:00', '15:00', 'c-9', null, i9.id, 'done', '', [['h-7', 6, 6], ['h-11', 6, 6]]],
    ['j-8', 'Firmenfest Betreuung', -11, '15:00', null, 'c-4', q3.id, i4.id, 'done', 'Offenes Ende, Aufräumen dabei', [['h-3', 6, 8.5], ['h-5', 6, 8.5], ['h-8', 6, 8], ['h-14', 4, 5]]],
    ['j-9', 'Sporttag Schule St. Vith', 4, '08:30', '15:30', 'c-5', q4.id, null, 'planned', 'Treffpunkt Parkplatz', [['h-1', 7, null], ['h-2', 7, null], ['h-4', 7, null], ['h-6', 7, null]]],
    ['j-10', 'Bastelnachmittag Kita', 9, '14:00', '18:00', 'c-3', q2.id, i11.id, 'planned', '', [['h-7', 4, null], ['h-9', 4, null], ['h-11', 4, null]]],
    ['j-11', 'Sommerfest Betreuung', 16, '16:00', null, 'c-4', q3.id, null, 'planned', 'Offenes Ende', [['h-3', 6, null], ['h-5', 6, null], ['h-8', 6, null], ['h-10', 6, null], ['h-14', 4, null]]],
    ['j-12', 'Geburtstagsfeier Betreuung', 23, '13:00', '18:00', 'c-9', q6.id, null, 'planned', '', [['h-2', 5, null], ['h-11', 5, null]]],
    ['j-13', 'Kochworkshop Familienfest', 30, '10:00', '15:00', 'c-1', q7.id, null, 'planned', '', []],
    ['j-14', 'Helferplanung Herbst', 2, null, null, null, null, null, 'planned', 'Interner Termin, ohne Kunde', [['h-1', 2, null], ['h-3', 2, null], ['h-8', 2, null]]],
  ];
  let asg = 0;
  jobs.forEach(([id, title, off, start, end, client, quote, invoice, status, notes, team]) => {
    insert('jobs', {
      id, title, date: dayStr(off), start_time: start, end_time: end, open_end: start && !end ? 1 : 0,
      client_id: client, quote_id: quote, invoice_id: invoice, notes, status,
    });
    team.forEach(([hori, planned, actual]) => insert('job_assignments', {
      id: `a-${++asg}`, job_id: id, hori_id: hori, planned_hours: planned, actual_hours: actual,
    }));
  });

  /* ── numbering counters follow the generated docs ────────── */
  setting('invoice_next_number', invSeq + 1);
  setting('quote_next_number', qteSeq + 1);

  return statements;
}
