// Runtime-agnostic schema + migrations for InvoiceForge.
// Mirrors electron/database.js but expressed as a list so it can run against
// sql.js (browser) the same way the Electron path runs against better-sqlite3.

const BASE_SCHEMA = `
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
`;

const MIGRATIONS = [
  {
    version: 1,
    up: (exec) => {
      const stmts = [
        "ALTER TABLE clients ADD COLUMN address_street TEXT;",
        "ALTER TABLE clients ADD COLUMN address_zip TEXT;",
        "ALTER TABLE clients ADD COLUMN address_city TEXT;",
        "ALTER TABLE clients ADD COLUMN address_country TEXT;",
        "UPDATE clients SET address_street = address WHERE address_street IS NULL;",
        "ALTER TABLE products ADD COLUMN name_de TEXT;",
        "ALTER TABLE products ADD COLUMN name_fr TEXT;",
        "ALTER TABLE products ADD COLUMN description_de TEXT;",
        "ALTER TABLE products ADD COLUMN description_fr TEXT;",
        "ALTER TABLE documents ADD COLUMN language TEXT DEFAULT 'en';",
      ];
      stmts.forEach(s => { try { exec(s); } catch (_e) {} });
    },
  },
  {
    version: 2,
    up: (exec) => {
      const stmts = [
        "ALTER TABLE clients ADD COLUMN email_valid INTEGER;",
        "ALTER TABLE clients ADD COLUMN phone_valid INTEGER;",
        "ALTER TABLE clients ADD COLUMN address_verified INTEGER;",
        "ALTER TABLE clients ADD COLUMN vat_valid INTEGER;",
        "ALTER TABLE clients ADD COLUMN vat_company_name TEXT;",
        "ALTER TABLE clients ADD COLUMN vat_validated_at TEXT;",
      ];
      stmts.forEach(s => { try { exec(s); } catch (_e) {} });
      try {
        exec(`
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
      } catch (_e) {}
      try { exec("ALTER TABLE products ADD COLUMN category_id TEXT REFERENCES product_categories(id);"); } catch (_e) {}
    },
  },
  {
    version: 3,
    up: (exec) => {
      const stmts = [
        "ALTER TABLE documents ADD COLUMN payment_mode TEXT DEFAULT 'standard';",
        "ALTER TABLE documents ADD COLUMN issued_at TEXT;",
        "ALTER TABLE documents ADD COLUMN paid_at TEXT;",
        "ALTER TABLE documents ADD COLUMN cancelled_at TEXT;",
        "ALTER TABLE documents ADD COLUMN locked INTEGER DEFAULT 0;",
        "ALTER TABLE documents ADD COLUMN source_quote_id TEXT;",
      ];
      stmts.forEach(s => { try { exec(s); } catch (_e) {} });
      try {
        exec(`
          CREATE TABLE IF NOT EXISTS document_events (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id)
          );
        `);
      } catch (_e) {}
      try {
        exec(`
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
      } catch (_e) {}
    },
  },
  {
    version: 4,
    up: (exec) => {
      exec(`
        CREATE INDEX IF NOT EXISTS idx_documents_status      ON documents(status);
        CREATE INDEX IF NOT EXISTS idx_documents_client_id   ON documents(client_id);
        CREATE INDEX IF NOT EXISTS idx_doc_items_document_id ON document_items(document_id);
        CREATE INDEX IF NOT EXISTS idx_payments_document_id  ON payments(document_id);
        CREATE INDEX IF NOT EXISTS idx_events_document_id    ON document_events(document_id);
      `);
    },
  },
  {
    version: 5,
    up: (exec) => {
      try {
        exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_type_number
            ON documents(type, number);
        `);
      } catch (e) {
        console.error('Migration 5 failed (likely existing duplicates):', e.message);
      }
    },
  },
  {
    version: 6,
    up: (exec) => {
      try {
        exec(`
          CREATE TABLE IF NOT EXISTS ui_translations (
            key TEXT PRIMARY KEY,
            value_de TEXT NOT NULL,
            value_fr TEXT,
            value_en TEXT
          );
        `);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('nav_dashboard','Dashboard','Dashboard');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('nav_invoices','Rechnungen','Invoices');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('nav_quotes','Angebote','Quotes');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('nav_clients','Kunden','Clients');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('nav_products','Produkte','Products');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('nav_settings','Einstellungen','Settings');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('nav_new_invoice','Neue Rechnung','New Invoice');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sidebar_expand','Seitenleiste erweitern','Expand sidebar');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sidebar_collapse','Seitenleiste einklappen','Collapse sidebar');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('nav_general','Allgemein','General');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('status_draft','Entwurf','Draft');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('status_sent','Gesendet','Sent');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('status_paid','Bezahlt','Paid');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('status_overdue','Überfällig','Overdue');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('status_accepted','Akzeptiert','Accepted');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('status_declined','Abgelehnt','Declined');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('status_cancelled','Storniert','Cancelled');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('status_converted','Umgewandelt','Converted');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('btn_cancel','Abbrechen','Cancel');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('btn_save','Speichern','Save');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('btn_delete','Löschen','Delete');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('btn_edit','Bearbeiten','Edit');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('btn_new_invoice','Neue Rechnung','New Invoice');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('btn_new_quote','Neues Angebot','New Quote');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_number','Nummer','Number');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_client','Kunde','Client');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_date','Datum','Date');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_status','Status','Status');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_amount','Betrag','Amount');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_actions','Aktionen','Actions');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_description','Beschreibung','Description');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_qty','Menge','Qty');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_rate','Preis','Rate');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_total','Gesamt','Total');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_method','Methode','Method');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('col_reference','Referenz','Reference');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('loading','Laden…','Loading…');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('try_different_search','Anderen Suchbegriff versuchen.','Try a different search term.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('greeting_morning','Guten Morgen','Good morning');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('greeting_afternoon','Guten Tag','Good afternoon');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('greeting_evening','Guten Abend','Good evening');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('kpi_total_revenue','Umsatz','Total Revenue');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('kpi_paid_invoices','Bezahlte Rechnungen','Paid Invoices');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('kpi_pending_quotes','Offene Angebote','Pending Quotes');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('kpi_total_clients','Kunden gesamt','Total Clients');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('hero_title','Verwalte deine Abrechnung wie ein Profi','Run your billing like a pro');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('hero_subtitle','Umsätze verfolgen, Rechnungen senden und alle Angebote im Blick behalten – alles an einem Ort.','Track revenue, send invoices, and stay on top of every quote — all in one place.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('chart_title','Umsatzübersicht','Revenue overview');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('chart_mode_daily','täglich','daily');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('chart_mode_paid','bezahlte Rechnungen','paid invoices');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('chart_empty','Noch keine bezahlten Rechnungen – dein Umsatz erscheint hier.','No paid invoices yet — your revenue will appear here.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('recent_docs_title','Letzte Dokumente','Recent Documents');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('recent_docs_subtitle','Letzte Aktivität','Latest activity');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('recent_docs_empty','Noch keine Dokumente. Erstelle deine erste Rechnung!','No documents yet. Create your first invoice!');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doc_no_client','Kein Kunde','No Client');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('this_month','Diesen Monat','This month');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('quick_actions','Schnellaktionen','Quick actions');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_search_invoices','Rechnungen suchen…','Search invoices...');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_search_quotes','Angebote suchen…','Search quotes...');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_new','Neu','New');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_load_error','Laden fehlgeschlagen. Bitte App neu starten.','Failed to load. Please restart the app.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_no_match','Keine Übereinstimmung für','No match for');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_no_docs_yet','Noch keine Dokumente','No documents yet');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_create_first_invoice','Klicke auf „Neue Rechnung", um die erste zu erstellen.','Click "New Invoice" to create your first one.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_create_first_quote','Klicke auf „Neues Angebot", um das erste zu erstellen.','Click "New Quote" to create your first one.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_delete_title','Löschen?','Delete?');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('doclist_delete_body','wird dauerhaft gelöscht, einschließlich aller Positionen und Zahlungseinträge.','will be permanently deleted along with all its line items and payment records.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_item_description','Artikelbeschreibung…','Item description...');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_select_client','Kunden auswählen…','Select a client...');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_doc_title','Dokumenttitel / Betreff','Document Title / Subject');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_doc_title_placeholder','z.B. Webdesign-Projekt','e.g. Website Design Project');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_doc_number','Dokumentnummer','Document Number');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_field_date','Datum','Date');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_valid_until','Gültig bis','Valid Until');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_due_date','Fälligkeitsdatum','Due Date');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_line_items','Positionen','Line Items');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_add_from_products','Aus Produkten hinzufügen…','Add from Products...');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_add_item','Position hinzufügen','Add item');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_add_first_item','Erste Position hinzufügen','Add First Item');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_notes_terms','Notizen & Bedingungen','Notes & Terms');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_notes_placeholder','Zahlungsbedingungen, Projektnotizen…','Payment terms, project notes...');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_payment_mode','Zahlungsart','Payment mode');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_standard','Standard','Standard');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_cash','Bar','Cash');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_subtotal','Zwischensumme','Subtotal');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_discount','Rabatt','Discount');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_fixed','Fest','Fixed');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_tax','MwSt.','Tax');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_total','Gesamt','Total');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_payments','Zahlungen','Payments');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_locked_notice','Dieses Dokument ist gesperrt. Klicke auf „Zum Bearbeiten entsperren", um Änderungen vorzunehmen.','This document is locked. Click Unlock for Edit to make changes.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_create','Dokument erstellen','Create Document');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_edit','Dokument bearbeiten','Edit Document');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_back_to_editor','Zurück zum Editor','Back to Editor');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_preview','Vorschau','Preview');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_export_pdf','PDF exportieren','Export PDF');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_save','Dokument speichern','Save Document');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_mark_sent','Als gesendet markieren','Mark as Sent');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_unlock_edit','Zum Bearbeiten entsperren','Unlock for Edit');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_mark_paid','Als bezahlt markieren','Mark as Paid');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_cancel_invoice','Rechnung stornieren','Cancel Invoice');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_mark_declined','Als abgelehnt markieren','Mark Declined');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_mark_accepted','Als akzeptiert markieren','Mark Accepted');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_convert_to_invoice','In Rechnung umwandeln','Convert to Invoice');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_unsaved_title','Ungespeicherte Änderungen','Unsaved changes');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_unsaved_body','Du hast ungespeicherte Änderungen. Ohne Speichern verlassen?','You have unsaved changes. Leave without saving?');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_leave','Verlassen','Leave');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_notice','Hinweis','Notice');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_preview_first','Wechsle zur Vorschau, bevor du das PDF exportierst.','Switch to Preview before exporting the PDF.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_save_before_status','Speichere das Dokument, bevor du den Status änderst.','Save the document before changing its status.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_save_before_convert','Speichere das Angebot, bevor du es umwandelst.','Save the quote before converting it.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_invoice_label','Rechnung','Invoice');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('editor_quote_label','Angebot','Quote');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_search','Kunden suchen…','Search clients...');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_add','Kunde hinzufügen','Add Client');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_load_error','Laden fehlgeschlagen. Bitte App neu starten.','Failed to load clients. Please restart the app.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_col_name','Name','Name');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_col_email','E-Mail','Email');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_col_phone','Telefon','Phone');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_col_city','Stadt','City');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_col_vat','USt-ID','VAT');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_col_documents','Dokumente','Documents');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_no_match','Keine Kunden für','No clients match');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_no_clients','Noch keine Kunden','No clients yet');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_no_clients_hint','Füge deinen ersten Kunden hinzu, um Rechnungen und Angebote zu erstellen.','Add your first client to start creating invoices and quotes.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_edit_title','Kunde bearbeiten','Edit Client');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_add_title','Neuen Kunden hinzufügen','Add New Client');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_field_name','Name','Name');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_field_email','E-Mail','Email');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_field_phone','Telefon','Phone');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_field_street','Straße & Hausnummer','Street & Number');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_field_zip','Postleitzahl','Zip-Code');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_field_city','Stadt','City');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_field_country','Land','Country');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_field_vat','USt-ID','VAT Number');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_vat_placeholder','z.B. BE0123456789','e.g. BE0123456789');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_invalid_email','Ungültiges E-Mail-Format','Invalid email format');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_invalid_phone','Ungültiges Telefonformat','Invalid phone format');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_validating','Wird validiert…','Validating…');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_save','Kunde speichern','Save Client');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_delete_title','Kunde löschen?','Delete client?');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_delete_body','wird dauerhaft gelöscht. Verknüpfte Dokumente bleiben erhalten, werden aber nicht mehr zugeordnet.','will be permanently deleted. Any linked documents will be kept but unlinked.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_valid','Gültig','Valid');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_invalid','Ungültig','Invalid');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_service_unavailable','Dienst nicht verfügbar','Service unavailable');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_checking','Wird geprüft…','Checking...');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_addr_verified','Adresse verifiziert','Address verified');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_addr_failed','Adresse konnte nicht verifiziert werden','Could not verify address');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('clients_addr_unavailable','Adressdienst nicht verfügbar','Address service unavailable');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_search','Produkte/Dienstleistungen suchen…','Search products/services...');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_add','Produkt hinzufügen','Add Product');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_load_error','Laden fehlgeschlagen. Bitte App neu starten.','Failed to load products. Please restart the app.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_all','Alle','All');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_new_category','Neue Kategorie','New Category');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_create_category','Kategorie erstellen','Create category');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_manage_categories','Kategorien verwalten','Manage categories');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_hide','Ausblenden','Hide');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_move_up','Nach oben','Move up');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_move_down','Nach unten','Move down');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_delete_cat_title','Kategorie löschen?','Delete category?');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_delete_cat_body','wird gelöscht. Produkte dieser Kategorie werden nicht mehr zugeordnet.','will be deleted. Products in this category will become uncategorised.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_delete_title','Produkt löschen?','Delete product?');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_no_match','Keine Produkte für','No products match');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_no_products','Noch keine Produkte','No products yet');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_no_products_hint','Füge ein Produkt oder eine Dienstleistung hinzu, um Rechnungen schnell auszufüllen.','Add a product or service to quickly populate your invoices.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_edit_title','Produkt bearbeiten','Edit Product');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_add_title','Produkt hinzufügen','Add Product');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_field_name_en','Produktname (EN)','Product Name (EN)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_field_desc_en','Beschreibung (EN)','Description (EN)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_field_name_de','Produktname (DE)','Product Name (DE)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_field_desc_de','Beschreibung (DE)','Description (DE)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_field_name_fr','Produktname (FR)','Product Name (FR)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_field_desc_fr','Beschreibung (FR)','Description (FR)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_field_rate','Preis (EUR)','Rate (EUR)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_field_unit','Einheit','Unit');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_unit_hour','pro Stunde','per hour');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_unit_day','pro Tag','per day');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_unit_item','pro Stück','per item');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_unit_fixed','Festpreis','fixed price');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_field_category','Kategorie','Category');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_uncategorised','Ohne Kategorie','— Uncategorised —');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('products_new_category_option','+ Neue Kategorie…','+ New category…');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_tab_company','Unternehmen','Company Info');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_tab_billing','Abrechnung','Billing');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_tab_numbering','Nummerierung','Numbering');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_tab_translations','Übersetzungen','Translations');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_company_title','Unternehmensidentität','Company Identity');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_company_desc','Konfiguriere, wie dein Unternehmen auf allen Dokumenten dargestellt wird.','Configure how your business is presented on all generated documents.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_field_legal_name','Firmenname','Legal Name');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_field_email','E-Mail für Anfragen','Email for Inquiries');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_field_phone','Kontaktnummer','Contact Number');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_field_vat_id','USt-ID','VAT ID');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_field_address','Offizielle Firmenadresse','Official Registered Address');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_billing_title','Finanzielle Standardwerte','Financial Defaults');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_billing_desc','Standardwährungen und Steuersätze für die Dokumentenerstellung.','Set default currencies and tax rates to streamline your document creation process.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_field_currency','Hauptwährung','Primary Currency');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_field_tax_rate','Standard-Steuersatz (%)','Standard Tax Rate (%)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_payment_title','Zahlungsabwicklung','Payment Settlement');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_payment_desc','Diese Bankdaten werden im PDF-Footer angezeigt.','These bank details will be included in the footer of your PDFs for easy payments.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_field_iban','IBAN','IBAN');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_field_bic','BIC / SWIFT','BIC / SWIFT');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_numbering_title','Intelligente Dokumentennummerierung','Smart Document Numbering');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_numbering_desc','Definiere automatisierte Regeln für die Benennung deiner Dokumente.','Define automated rules for naming your documents. Mix text, dates, and counters.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_invoice_numbering','Rechnungsnummerierung','Invoice Numbering');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_quote_numbering','Angebotsnummerierung','Quote Numbering');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_unsaved','Ungespeicherte Änderungen erkannt. Vergiss nicht, die neue Konfiguration zu speichern.','Unsaved changes detected. Remember to save your new configuration.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_pdf_title','PDF-Lokalisierung','PDF Localization');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_pdf_desc','Passe PDF-Beschriftungen für verschiedene Sprachen an.','Customise how your PDF labels appear in different languages.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_doc_label','Dokumentbezeichnung','Document Label');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_lang_en','Englisch (EN)','English (EN)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_lang_de','Deutsch (DE)','Deutsch (DE)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_lang_fr','Französisch (FR)','Français (FR)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_save','Einstellungen speichern','Save Settings');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_saved','Gespeichert!','Saved!');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_error_empty_pattern','Das Nummerierungsmuster darf nicht leer sein.','Invoice/Quote numbering pattern cannot be empty.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_error_save','Fehler beim Speichern der Einstellungen','Failed to save settings');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_static','Statischer Text','Static Text');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_date','Datumskomponente','Date Component');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_counter','Zähler','Counter');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_text_placeholder','Text eingeben (z.B. RE_)','Enter text (e.g. INV_)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_today','Heutiges Datum','Today''s Date');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_creation','Erstellungsdatum','Creation Date');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_live_preview','Livevorschau','Live Preview');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_empty','(Leeres Muster)','(Empty Pattern)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_four_digits','Vier Stellen (0001)','Four Digits (0001)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_three_digits','Drei Stellen (001)','Three Digits (001)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_two_digits','Zwei Stellen (01)','Two Digits (01)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_no_padding','Keine Auffüllung (1)','No Padding (1)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_build','Dokumentnummerierungsmuster aufbauen','Build your document numbering pattern');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_add','Segment hinzufügen','Add segment below');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('settings_seg_remove','Segment entfernen','Remove segment');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_synced','Synchronisiert','Synced');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_unsaved','Nicht gespeichert','Unsaved');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_saving','Wird gespeichert…','Saving…');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_saved','Gespeichert','Saved');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_conflict','Konflikt','Conflict');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_error','Sync-Fehler','Sync error');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_click_to_save','Jetzt speichern','Click to save now');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_conflict_title','Sync-Konflikt','Sync conflict');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_conflict_desc','Ein anderes Gerät hat Änderungen gespeichert, nachdem du angefangen hast zu bearbeiten. Deine lokalen Änderungen wurden noch nicht auf GitHub gespeichert.','Another device pushed changes after you started editing. Your local changes have not been saved to GitHub yet.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_pick','Wähle eine Option:','Pick one:');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_discard','Meine Änderungen verwerfen & neu laden','Discard my changes & reload');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_overwrite','Remote mit meiner Version überschreiben','Overwrite remote with my version');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('sync_decide_later','Später entscheiden','Decide later');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('auth_connect_title','Mit GitHub verbinden','Connect to GitHub');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('auth_desc','InvoiceForge speichert deine Daten in einem privaten GitHub-Repository. Melde dich an, um Rechnungen zu lesen und zu speichern.','InvoiceForge stores your data in a private GitHub repository. Sign in to read and save invoices.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('auth_error','Authentifizierung fehlgeschlagen. Bitte erneut versuchen.','Authentication failed. Please try again.');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('auth_advanced','Erweitert – Repository','Advanced — repository');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('auth_field_owner','Eigentümer','Owner');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('auth_field_repo','Repository','Repo');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('auth_field_branch','Branch','Branch');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('auth_login','Mit GitHub anmelden','Login with GitHub');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('cat_field_name_en','Kategoriename (EN)','Category name (EN)');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('cat_field_de','DE','DE');`);
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES ('cat_field_fr','FR','FR');`);
      } catch (e) {
        console.error('Migration 6 failed:', e.message);
      }
    },
  },
];

// adapter shape:
//   exec(sql) -> void
//   getVersion() -> number
//   setVersion(n) -> void
export function runMigrations(adapter) {
  adapter.exec(BASE_SCHEMA);
  const hasRow = adapter.hasVersionRow();
  if (!hasRow) adapter.insertVersionRow();
  for (const m of MIGRATIONS) {
    if (adapter.getVersion() < m.version) {
      m.up((sql) => adapter.exec(sql));
      adapter.setVersion(m.version);
    }
  }
}

export const TARGET_SCHEMA_VERSION = 6;
