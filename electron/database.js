const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'invoiceforge.db');
const db = new Database(dbPath);

// Enforce referential integrity on every connection.
db.pragma('foreign_keys = ON');
// Keep page cache efficient.
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    address_street TEXT,
    address_zip TEXT,
    address_city TEXT,
    address_country TEXT,
    vat TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_de TEXT,
    name_fr TEXT,
    description TEXT,
    description_de TEXT,
    description_fr TEXT,
    rate REAL,
    unit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    number TEXT NOT NULL,
    date TEXT,
    due_date TEXT,
    status TEXT,
    client_id TEXT,
    title TEXT,
    notes TEXT,
    currency TEXT DEFAULT 'EUR',
    tax_rate REAL DEFAULT 21,
    discount_value REAL DEFAULT 0,
    discount_type TEXT DEFAULT '%',
    language TEXT DEFAULT 'en',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS document_items (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    description TEXT,
    qty REAL,
    rate REAL,
    sort_order INTEGER,
    FOREIGN KEY (document_id) REFERENCES documents(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL DEFAULT 0
  );
`);

// Ensure version row exists
if (!db.prepare('SELECT version FROM schema_version').get()) {
  db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
}

const getVersion = () => db.prepare('SELECT version FROM schema_version').get().version;
const setVersion = (v) => db.prepare('UPDATE schema_version SET version = ?').run(v);

// Migration 1: address columns, multilingual products, document language
if (getVersion() < 1) {
  try { db.exec("ALTER TABLE clients ADD COLUMN address_street TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE clients ADD COLUMN address_zip TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE clients ADD COLUMN address_city TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE clients ADD COLUMN address_country TEXT;"); } catch(e) {}
  try { db.exec("UPDATE clients SET address_street = address WHERE address_street IS NULL;"); } catch(e) {}
  try { db.exec("ALTER TABLE products ADD COLUMN name_de TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE products ADD COLUMN name_fr TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE products ADD COLUMN description_de TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE products ADD COLUMN description_fr TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN language TEXT DEFAULT 'en';"); } catch(e) {}
  setVersion(1);
}

// Migration 2: client validation flags + product categories
if (getVersion() < 2) {
  try { db.exec("ALTER TABLE clients ADD COLUMN email_valid INTEGER;"); } catch(e) {}
  try { db.exec("ALTER TABLE clients ADD COLUMN phone_valid INTEGER;"); } catch(e) {}
  try { db.exec("ALTER TABLE clients ADD COLUMN address_verified INTEGER;"); } catch(e) {}
  try { db.exec("ALTER TABLE clients ADD COLUMN vat_valid INTEGER;"); } catch(e) {}
  try { db.exec("ALTER TABLE clients ADD COLUMN vat_company_name TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE clients ADD COLUMN vat_validated_at TEXT;"); } catch(e) {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_de TEXT,
        name_fr TEXT,
        color TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch(e) {}
  try { db.exec("ALTER TABLE products ADD COLUMN category_id TEXT REFERENCES product_categories(id);"); } catch(e) {}
  setVersion(2);
}

// Migration 3: document lifecycle, audit log, payments
if (getVersion() < 3) {
  try { db.exec("ALTER TABLE documents ADD COLUMN payment_mode TEXT DEFAULT 'standard';"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN issued_at TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN paid_at TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN cancelled_at TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN locked INTEGER DEFAULT 0;"); } catch(e) {}
  try { db.exec("ALTER TABLE documents ADD COLUMN source_quote_id TEXT;"); } catch(e) {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_events (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );
    `);
  } catch(e) {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT,
        method TEXT,
        paid_at TEXT,
        reference TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );
    `);
  } catch(e) {}
  setVersion(3);
}

// Migration 4: performance indexes
if (getVersion() < 4) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_status      ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_documents_client_id   ON documents(client_id);
    CREATE INDEX IF NOT EXISTS idx_doc_items_document_id ON document_items(document_id);
    CREATE INDEX IF NOT EXISTS idx_payments_document_id  ON payments(document_id);
    CREATE INDEX IF NOT EXISTS idx_events_document_id    ON document_events(document_id);
  `);
  setVersion(4);
}

// Migration 5: enforce uniqueness on document numbers
if (getVersion() < 5) {
  // Skip duplicates (if any exist) by suffixing with rowid before creating index.
  // This is defensive — fresh installs have no duplicates.
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_type_number
        ON documents(type, number);
    `);
  } catch (e) {
    console.error('Migration 5 failed (likely existing duplicates):', e.message);
    // Don't throw — let app continue; admin can fix duplicates manually.
  }
  setVersion(5);
}

// Migration 6: UI translations table (German-first)
if (getVersion() < 6) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ui_translations (
        key TEXT PRIMARY KEY,
        value_de TEXT NOT NULL,
        value_fr TEXT,
        value_en TEXT
      );
    `);
    db.exec(`
      INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES
        ('nav_dashboard','Dashboard','Dashboard'),
        ('nav_invoices','Rechnungen','Invoices'),
        ('nav_quotes','Angebote','Quotes'),
        ('nav_clients','Kunden','Clients'),
        ('nav_products','Produkte','Products'),
        ('nav_settings','Einstellungen','Settings'),
        ('nav_new_invoice','Neue Rechnung','New Invoice'),
        ('sidebar_expand','Seitenleiste erweitern','Expand sidebar'),
        ('sidebar_collapse','Seitenleiste einklappen','Collapse sidebar'),
        ('nav_general','Allgemein','General'),
        ('status_draft','Entwurf','Draft'),
        ('status_sent','Gesendet','Sent'),
        ('status_paid','Bezahlt','Paid'),
        ('status_overdue','Überfällig','Overdue'),
        ('status_accepted','Akzeptiert','Accepted'),
        ('status_declined','Abgelehnt','Declined'),
        ('status_cancelled','Storniert','Cancelled'),
        ('status_converted','Umgewandelt','Converted'),
        ('btn_cancel','Abbrechen','Cancel'),
        ('btn_save','Speichern','Save'),
        ('btn_delete','Löschen','Delete'),
        ('btn_edit','Bearbeiten','Edit'),
        ('btn_new_invoice','Neue Rechnung','New Invoice'),
        ('btn_new_quote','Neues Angebot','New Quote'),
        ('col_number','Nummer','Number'),
        ('col_client','Kunde','Client'),
        ('col_date','Datum','Date'),
        ('col_status','Status','Status'),
        ('col_amount','Betrag','Amount'),
        ('col_actions','Aktionen','Actions'),
        ('col_description','Beschreibung','Description'),
        ('col_qty','Menge','Qty'),
        ('col_rate','Preis','Rate'),
        ('col_total','Gesamt','Total'),
        ('col_method','Methode','Method'),
        ('col_reference','Referenz','Reference'),
        ('loading','Laden…','Loading…'),
        ('try_different_search','Anderen Suchbegriff versuchen.','Try a different search term.'),
        ('greeting_morning','Guten Morgen','Good morning'),
        ('greeting_afternoon','Guten Tag','Good afternoon'),
        ('greeting_evening','Guten Abend','Good evening'),
        ('kpi_total_revenue','Umsatz','Total Revenue'),
        ('kpi_paid_invoices','Bezahlte Rechnungen','Paid Invoices'),
        ('kpi_pending_quotes','Offene Angebote','Pending Quotes'),
        ('kpi_total_clients','Kunden gesamt','Total Clients'),
        ('hero_title','Verwalte deine Abrechnung wie ein Profi','Run your billing like a pro'),
        ('hero_subtitle','Umsätze verfolgen, Rechnungen senden und alle Angebote im Blick behalten – alles an einem Ort.','Track revenue, send invoices, and stay on top of every quote — all in one place.'),
        ('chart_title','Umsatzübersicht','Revenue overview'),
        ('chart_mode_daily','täglich','daily'),
        ('chart_mode_paid','bezahlte Rechnungen','paid invoices'),
        ('chart_empty','Noch keine bezahlten Rechnungen – dein Umsatz erscheint hier.','No paid invoices yet — your revenue will appear here.'),
        ('recent_docs_title','Letzte Dokumente','Recent Documents'),
        ('recent_docs_subtitle','Letzte Aktivität','Latest activity'),
        ('recent_docs_empty','Noch keine Dokumente. Erstelle deine erste Rechnung!','No documents yet. Create your first invoice!'),
        ('doc_no_client','Kein Kunde','No Client'),
        ('this_month','Diesen Monat','This month'),
        ('quick_actions','Schnellaktionen','Quick actions'),
        ('doclist_search_invoices','Rechnungen suchen…','Search invoices...'),
        ('doclist_search_quotes','Angebote suchen…','Search quotes...'),
        ('doclist_new','Neu','New'),
        ('doclist_load_error','Laden fehlgeschlagen. Bitte App neu starten.','Failed to load. Please restart the app.'),
        ('doclist_no_match','Keine Übereinstimmung für','No match for'),
        ('doclist_no_docs_yet','Noch keine Dokumente','No documents yet'),
        ('doclist_create_first_invoice','Klicke auf „Neue Rechnung", um die erste zu erstellen.','Click "New Invoice" to create your first one.'),
        ('doclist_create_first_quote','Klicke auf „Neues Angebot", um das erste zu erstellen.','Click "New Quote" to create your first one.'),
        ('doclist_delete_title','Löschen?','Delete?'),
        ('doclist_delete_body','wird dauerhaft gelöscht, einschließlich aller Positionen und Zahlungseinträge.','will be permanently deleted along with all its line items and payment records.'),
        ('editor_item_description','Artikelbeschreibung…','Item description...'),
        ('editor_select_client','Kunden auswählen…','Select a client...'),
        ('editor_doc_title','Dokumenttitel / Betreff','Document Title / Subject'),
        ('editor_doc_title_placeholder','z.B. Webdesign-Projekt','e.g. Website Design Project'),
        ('editor_doc_number','Dokumentnummer','Document Number'),
        ('editor_field_date','Datum','Date'),
        ('editor_valid_until','Gültig bis','Valid Until'),
        ('editor_due_date','Fälligkeitsdatum','Due Date'),
        ('editor_line_items','Positionen','Line Items'),
        ('editor_add_from_products','Aus Produkten hinzufügen…','Add from Products...'),
        ('editor_add_item','Position hinzufügen','Add item'),
        ('editor_add_first_item','Erste Position hinzufügen','Add First Item'),
        ('editor_notes_terms','Notizen & Bedingungen','Notes & Terms'),
        ('editor_notes_placeholder','Zahlungsbedingungen, Projektnotizen…','Payment terms, project notes...'),
        ('editor_payment_mode','Zahlungsart','Payment mode'),
        ('editor_standard','Standard','Standard'),
        ('editor_cash','Bar','Cash'),
        ('editor_subtotal','Zwischensumme','Subtotal'),
        ('editor_discount','Rabatt','Discount'),
        ('editor_fixed','Fest','Fixed'),
        ('editor_tax','MwSt.','Tax'),
        ('editor_total','Gesamt','Total'),
        ('editor_payments','Zahlungen','Payments'),
        ('editor_locked_notice','Dieses Dokument ist gesperrt. Klicke auf „Zum Bearbeiten entsperren", um Änderungen vorzunehmen.','This document is locked. Click "Unlock for Edit" to make changes.'),
        ('editor_create','Dokument erstellen','Create Document'),
        ('editor_edit','Dokument bearbeiten','Edit Document'),
        ('editor_back_to_editor','Zurück zum Editor','Back to Editor'),
        ('editor_preview','Vorschau','Preview'),
        ('editor_export_pdf','PDF exportieren','Export PDF'),
        ('editor_save','Dokument speichern','Save Document'),
        ('editor_mark_sent','Als gesendet markieren','Mark as Sent'),
        ('editor_unlock_edit','Zum Bearbeiten entsperren','Unlock for Edit'),
        ('editor_mark_paid','Als bezahlt markieren','Mark as Paid'),
        ('editor_cancel_invoice','Rechnung stornieren','Cancel Invoice'),
        ('editor_mark_declined','Als abgelehnt markieren','Mark Declined'),
        ('editor_mark_accepted','Als akzeptiert markieren','Mark Accepted'),
        ('editor_convert_to_invoice','In Rechnung umwandeln','Convert to Invoice'),
        ('editor_unsaved_title','Ungespeicherte Änderungen','Unsaved changes'),
        ('editor_unsaved_body','Du hast ungespeicherte Änderungen. Ohne Speichern verlassen?','You have unsaved changes. Leave without saving?'),
        ('editor_leave','Verlassen','Leave'),
        ('editor_notice','Hinweis','Notice'),
        ('editor_preview_first','Wechsle zur Vorschau, bevor du das PDF exportierst.','Switch to Preview before exporting the PDF.'),
        ('editor_save_before_status','Speichere das Dokument, bevor du den Status änderst.','Save the document before changing its status.'),
        ('editor_save_before_convert','Speichere das Angebot, bevor du es umwandelst.','Save the quote before converting it.'),
        ('editor_invoice_label','Rechnung','Invoice'),
        ('editor_quote_label','Angebot','Quote'),
        ('clients_search','Kunden suchen…','Search clients...'),
        ('clients_add','Kunde hinzufügen','Add Client'),
        ('clients_load_error','Laden fehlgeschlagen. Bitte App neu starten.','Failed to load clients. Please restart the app.'),
        ('clients_col_name','Name','Name'),
        ('clients_col_email','E-Mail','Email'),
        ('clients_col_phone','Telefon','Phone'),
        ('clients_col_city','Stadt','City'),
        ('clients_col_vat','USt-ID','VAT'),
        ('clients_col_documents','Dokumente','Documents'),
        ('clients_no_match','Keine Kunden für','No clients match'),
        ('clients_no_clients','Noch keine Kunden','No clients yet'),
        ('clients_no_clients_hint','Füge deinen ersten Kunden hinzu, um Rechnungen und Angebote zu erstellen.','Add your first client to start creating invoices and quotes.'),
        ('clients_edit_title','Kunde bearbeiten','Edit Client'),
        ('clients_add_title','Neuen Kunden hinzufügen','Add New Client'),
        ('clients_field_name','Name','Name'),
        ('clients_field_email','E-Mail','Email'),
        ('clients_field_phone','Telefon','Phone'),
        ('clients_field_street','Straße & Hausnummer','Street & Number'),
        ('clients_field_zip','Postleitzahl','Zip-Code'),
        ('clients_field_city','Stadt','City'),
        ('clients_field_country','Land','Country'),
        ('clients_field_vat','USt-ID','VAT Number'),
        ('clients_vat_placeholder','z.B. BE0123456789','e.g. BE0123456789'),
        ('clients_invalid_email','Ungültiges E-Mail-Format','Invalid email format'),
        ('clients_invalid_phone','Ungültiges Telefonformat','Invalid phone format'),
        ('clients_validating','Wird validiert…','Validating…'),
        ('clients_save','Kunde speichern','Save Client'),
        ('clients_delete_title','Kunde löschen?','Delete client?'),
        ('clients_delete_body','wird dauerhaft gelöscht. Verknüpfte Dokumente bleiben erhalten, werden aber nicht mehr zugeordnet.','will be permanently deleted. Any linked documents will be kept but unlinked.'),
        ('clients_valid','Gültig','Valid'),
        ('clients_invalid','Ungültig','Invalid'),
        ('clients_service_unavailable','Dienst nicht verfügbar','Service unavailable'),
        ('clients_checking','Wird geprüft…','Checking...'),
        ('clients_addr_verified','Adresse verifiziert','Address verified'),
        ('clients_addr_failed','Adresse konnte nicht verifiziert werden','Could not verify address'),
        ('clients_addr_unavailable','Adressdienst nicht verfügbar','Address service unavailable'),
        ('products_search','Produkte/Dienstleistungen suchen…','Search products/services...'),
        ('products_add','Produkt hinzufügen','Add Product'),
        ('products_load_error','Laden fehlgeschlagen. Bitte App neu starten.','Failed to load products. Please restart the app.'),
        ('products_all','Alle','All'),
        ('products_new_category','Neue Kategorie','New Category'),
        ('products_create_category','Kategorie erstellen','Create category'),
        ('products_manage_categories','Kategorien verwalten','Manage categories'),
        ('products_hide','Ausblenden','Hide'),
        ('products_move_up','Nach oben','Move up'),
        ('products_move_down','Nach unten','Move down'),
        ('products_delete_cat_title','Kategorie löschen?','Delete category?'),
        ('products_delete_cat_body','wird gelöscht. Produkte dieser Kategorie werden nicht mehr zugeordnet.','will be deleted. Products in this category will become uncategorised.'),
        ('products_delete_title','Produkt löschen?','Delete product?'),
        ('products_no_match','Keine Produkte für','No products match'),
        ('products_no_products','Noch keine Produkte','No products yet'),
        ('products_no_products_hint','Füge ein Produkt oder eine Dienstleistung hinzu, um Rechnungen schnell auszufüllen.','Add a product or service to quickly populate your invoices.'),
        ('products_edit_title','Produkt bearbeiten','Edit Product'),
        ('products_add_title','Produkt hinzufügen','Add Product'),
        ('products_field_name_en','Produktname (EN)','Product Name (EN)'),
        ('products_field_desc_en','Beschreibung (EN)','Description (EN)'),
        ('products_field_name_de','Produktname (DE)','Product Name (DE)'),
        ('products_field_desc_de','Beschreibung (DE)','Description (DE)'),
        ('products_field_name_fr','Produktname (FR)','Product Name (FR)'),
        ('products_field_desc_fr','Beschreibung (FR)','Description (FR)'),
        ('products_field_rate','Preis (EUR)','Rate (EUR)'),
        ('products_field_unit','Einheit','Unit'),
        ('products_unit_hour','pro Stunde','per hour'),
        ('products_unit_day','pro Tag','per day'),
        ('products_unit_item','pro Stück','per item'),
        ('products_unit_fixed','Festpreis','fixed price'),
        ('products_field_category','Kategorie','Category'),
        ('products_uncategorised','Ohne Kategorie','— Uncategorised —'),
        ('products_new_category_option','+ Neue Kategorie…','+ New category…'),
        ('settings_tab_company','Unternehmen','Company Info'),
        ('settings_tab_billing','Abrechnung','Billing'),
        ('settings_tab_numbering','Nummerierung','Numbering'),
        ('settings_tab_translations','Übersetzungen','Translations'),
        ('settings_company_title','Unternehmensidentität','Company Identity'),
        ('settings_company_desc','Konfiguriere, wie dein Unternehmen auf allen Dokumenten dargestellt wird.','Configure how your business is presented on all generated documents.'),
        ('settings_field_legal_name','Firmenname','Legal Name'),
        ('settings_field_email','E-Mail für Anfragen','Email for Inquiries'),
        ('settings_field_phone','Kontaktnummer','Contact Number'),
        ('settings_field_vat_id','USt-ID','VAT ID'),
        ('settings_field_address','Offizielle Firmenadresse','Official Registered Address'),
        ('settings_billing_title','Finanzielle Standardwerte','Financial Defaults'),
        ('settings_billing_desc','Standardwährungen und Steuersätze für die Dokumentenerstellung.','Set default currencies and tax rates to streamline your document creation process.'),
        ('settings_field_currency','Hauptwährung','Primary Currency'),
        ('settings_field_tax_rate','Standard-Steuersatz (%)','Standard Tax Rate (%)'),
        ('settings_payment_title','Zahlungsabwicklung','Payment Settlement'),
        ('settings_payment_desc','Diese Bankdaten werden im PDF-Footer angezeigt.','These bank details will be included in the footer of your PDFs for easy payments.'),
        ('settings_field_iban','IBAN','IBAN'),
        ('settings_field_bic','BIC / SWIFT','BIC / SWIFT'),
        ('settings_numbering_title','Intelligente Dokumentennummerierung','Smart Document Numbering'),
        ('settings_numbering_desc','Definiere automatisierte Regeln für die Benennung deiner Dokumente.','Define automated rules for naming your documents. Mix text, dates, and counters.'),
        ('settings_invoice_numbering','Rechnungsnummerierung','Invoice Numbering'),
        ('settings_quote_numbering','Angebotsnummerierung','Quote Numbering'),
        ('settings_unsaved','Ungespeicherte Änderungen erkannt. Vergiss nicht, die neue Konfiguration zu speichern.','Unsaved changes detected. Remember to save your new configuration.'),
        ('settings_pdf_title','PDF-Lokalisierung','PDF Localization'),
        ('settings_pdf_desc','Passe PDF-Beschriftungen für verschiedene Sprachen an.','Customise how your PDF labels appear in different languages.'),
        ('settings_doc_label','Dokumentbezeichnung','Document Label'),
        ('settings_lang_en','Englisch (EN)','English (EN)'),
        ('settings_lang_de','Deutsch (DE)','Deutsch (DE)'),
        ('settings_lang_fr','Französisch (FR)','Français (FR)'),
        ('settings_save','Einstellungen speichern','Save Settings'),
        ('settings_saved','Gespeichert!','Saved!'),
        ('settings_error_empty_pattern','Das Nummerierungsmuster darf nicht leer sein.','Invoice/Quote numbering pattern cannot be empty.'),
        ('settings_error_save','Fehler beim Speichern der Einstellungen','Failed to save settings'),
        ('settings_seg_static','Statischer Text','Static Text'),
        ('settings_seg_date','Datumskomponente','Date Component'),
        ('settings_seg_counter','Zähler','Counter'),
        ('settings_seg_text_placeholder','Text eingeben (z.B. RE_)','Enter text (e.g. INV_)'),
        ('settings_seg_today','Heutiges Datum','Today''s Date'),
        ('settings_seg_creation','Erstellungsdatum','Creation Date'),
        ('settings_seg_live_preview','Livevorschau','Live Preview'),
        ('settings_seg_empty','(Leeres Muster)','(Empty Pattern)'),
        ('settings_seg_four_digits','Vier Stellen (0001)','Four Digits (0001)'),
        ('settings_seg_three_digits','Drei Stellen (001)','Three Digits (001)'),
        ('settings_seg_two_digits','Zwei Stellen (01)','Two Digits (01)'),
        ('settings_seg_no_padding','Keine Auffüllung (1)','No Padding (1)'),
        ('settings_seg_build','Dokumentnummerierungsmuster aufbauen','Build your document numbering pattern'),
        ('settings_seg_add','Segment hinzufügen','Add segment below'),
        ('settings_seg_remove','Segment entfernen','Remove segment'),
        ('sync_synced','Synchronisiert','Synced'),
        ('sync_unsaved','Nicht gespeichert','Unsaved'),
        ('sync_saving','Wird gespeichert…','Saving…'),
        ('sync_saved','Gespeichert','Saved'),
        ('sync_conflict','Konflikt','Conflict'),
        ('sync_error','Sync-Fehler','Sync error'),
        ('sync_click_to_save','Jetzt speichern','Click to save now'),
        ('sync_conflict_title','Sync-Konflikt','Sync conflict'),
        ('sync_conflict_desc','Ein anderes Gerät hat Änderungen gespeichert, nachdem du angefangen hast zu bearbeiten. Deine lokalen Änderungen wurden noch nicht auf GitHub gespeichert.','Another device pushed changes after you started editing. Your local changes have not been saved to GitHub yet.'),
        ('sync_pick','Wähle eine Option:','Pick one:'),
        ('sync_discard','Meine Änderungen verwerfen & neu laden','Discard my changes & reload'),
        ('sync_overwrite','Remote mit meiner Version überschreiben','Overwrite remote with my version'),
        ('sync_decide_later','Später entscheiden','Decide later'),
        ('auth_connect_title','Mit GitHub verbinden','Connect to GitHub'),
        ('auth_desc','InvoiceForge speichert deine Daten in einem privaten GitHub-Repository. Melde dich an, um Rechnungen zu lesen und zu speichern.','InvoiceForge stores your data in a private GitHub repository. Sign in to read and save invoices.'),
        ('auth_error','Authentifizierung fehlgeschlagen. Bitte erneut versuchen.','Authentication failed. Please try again.'),
        ('auth_advanced','Erweitert – Repository','Advanced — repository'),
        ('auth_field_owner','Eigentümer','Owner'),
        ('auth_field_repo','Repository','Repo'),
        ('auth_field_branch','Branch','Branch'),
        ('auth_login','Mit GitHub anmelden','Login with GitHub'),
        ('cat_field_name_en','Kategoriename (EN)','Category name (EN)'),
        ('cat_field_de','DE','DE'),
        ('cat_field_fr','FR','FR');
    `);
  } catch (e) {
    console.error('Migration 6 failed:', e.message);
  }
  setVersion(6);
}

// Lightweight startup maintenance — reclaim space and refresh query planner stats.
try { db.exec('PRAGMA analysis_limit=400; ANALYZE;'); } catch (_e) {}

module.exports = db;
