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
  {
    version: 7,
    up: (exec) => {
      try {
        exec("ALTER TABLE document_items ADD COLUMN name TEXT;");
        exec(`
          UPDATE document_items
            SET name = CASE WHEN instr(description, char(10)) > 0
                            THEN substr(description, 1, instr(description, char(10)) - 1)
                            ELSE description END,
                description = CASE WHEN instr(description, char(10)) > 0
                                   THEN substr(description, instr(description, char(10)) + 1)
                                   ELSE '' END
          WHERE name IS NULL;
        `);
      } catch (e) {
        console.error('Migration 7 failed:', e.message);
      }
    },
  },
  {
    version: 8,
    up: (exec) => {
      exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES
        ('pdf_export_title','PDF exportieren','Export PDF'),
        ('pdf_export_filename','Dateiname','File name'),
        ('pdf_export_web_note','Datei wird im Downloads-Ordner gespeichert.','File will be saved to your Downloads folder.'),
        ('pdf_export_language','Sprache','Language'),
        ('pdf_export_save','Exportieren','Export'),
        ('editor_pdf_export_failed','PDF-Export fehlgeschlagen','PDF export failed'),
        ('editor_transition_failed','Statuswechsel fehlgeschlagen','Transition failed');
      `);
    },
  },
  {
    version: 9,
    up: (exec) => {
      try { exec("ALTER TABLE document_items ADD COLUMN duration REAL DEFAULT 1;"); } catch(e) {}
      try { exec("ALTER TABLE documents ADD COLUMN visible_columns TEXT;"); } catch(e) {}
      try {
        exec(`INSERT OR IGNORE INTO ui_translations (key, value_de, value_en) VALUES
          ('col_duration','Dauer (h)','Duration (h)'),
          ('col_columns','Spalten','Columns');
        `);
      } catch(e) {}
    },
  },
  {
    version: 10,
    up: (exec) => {
      // Backfill French (value_fr) for every existing ui_translations key --
      // it was never populated before this migration (only value_de/value_en
      // were ever inserted), so selecting French silently fell back to
      // English everywhere in the app chrome.
      try {
        exec(`
          UPDATE ui_translations SET value_fr = 'Tableau de bord' WHERE key = 'nav_dashboard';
          UPDATE ui_translations SET value_fr = 'Factures' WHERE key = 'nav_invoices';
          UPDATE ui_translations SET value_fr = 'Devis' WHERE key = 'nav_quotes';
          UPDATE ui_translations SET value_fr = 'Clients' WHERE key = 'nav_clients';
          UPDATE ui_translations SET value_fr = 'Produits' WHERE key = 'nav_products';
          UPDATE ui_translations SET value_fr = 'Paramètres' WHERE key = 'nav_settings';
          UPDATE ui_translations SET value_fr = 'Nouvelle facture' WHERE key = 'nav_new_invoice';
          UPDATE ui_translations SET value_fr = 'Développer la barre latérale' WHERE key = 'sidebar_expand';
          UPDATE ui_translations SET value_fr = 'Réduire la barre latérale' WHERE key = 'sidebar_collapse';
          UPDATE ui_translations SET value_fr = 'Général' WHERE key = 'nav_general';
          UPDATE ui_translations SET value_fr = 'Brouillon' WHERE key = 'status_draft';
          UPDATE ui_translations SET value_fr = 'Envoyée' WHERE key = 'status_sent';
          UPDATE ui_translations SET value_fr = 'Payée' WHERE key = 'status_paid';
          UPDATE ui_translations SET value_fr = 'En retard' WHERE key = 'status_overdue';
          UPDATE ui_translations SET value_fr = 'Acceptée' WHERE key = 'status_accepted';
          UPDATE ui_translations SET value_fr = 'Refusée' WHERE key = 'status_declined';
          UPDATE ui_translations SET value_fr = 'Annulée' WHERE key = 'status_cancelled';
          UPDATE ui_translations SET value_fr = 'Convertie' WHERE key = 'status_converted';
          UPDATE ui_translations SET value_fr = 'Annuler' WHERE key = 'btn_cancel';
          UPDATE ui_translations SET value_fr = 'Enregistrer' WHERE key = 'btn_save';
          UPDATE ui_translations SET value_fr = 'Supprimer' WHERE key = 'btn_delete';
          UPDATE ui_translations SET value_fr = 'Modifier' WHERE key = 'btn_edit';
          UPDATE ui_translations SET value_fr = 'Nouvelle facture' WHERE key = 'btn_new_invoice';
          UPDATE ui_translations SET value_fr = 'Nouveau devis' WHERE key = 'btn_new_quote';
          UPDATE ui_translations SET value_fr = 'Numéro' WHERE key = 'col_number';
          UPDATE ui_translations SET value_fr = 'Client' WHERE key = 'col_client';
          UPDATE ui_translations SET value_fr = 'Date' WHERE key = 'col_date';
          UPDATE ui_translations SET value_fr = 'Statut' WHERE key = 'col_status';
          UPDATE ui_translations SET value_fr = 'Montant' WHERE key = 'col_amount';
          UPDATE ui_translations SET value_fr = 'Actions' WHERE key = 'col_actions';
          UPDATE ui_translations SET value_fr = 'Description' WHERE key = 'col_description';
          UPDATE ui_translations SET value_fr = 'Qté' WHERE key = 'col_qty';
          UPDATE ui_translations SET value_fr = 'Prix' WHERE key = 'col_rate';
          UPDATE ui_translations SET value_fr = 'Total' WHERE key = 'col_total';
          UPDATE ui_translations SET value_fr = 'Méthode' WHERE key = 'col_method';
          UPDATE ui_translations SET value_fr = 'Référence' WHERE key = 'col_reference';
          UPDATE ui_translations SET value_fr = 'Chargement…' WHERE key = 'loading';
          UPDATE ui_translations SET value_fr = 'Essayez un autre terme de recherche.' WHERE key = 'try_different_search';
          UPDATE ui_translations SET value_fr = 'Bonjour' WHERE key = 'greeting_morning';
          UPDATE ui_translations SET value_fr = 'Bon après-midi' WHERE key = 'greeting_afternoon';
          UPDATE ui_translations SET value_fr = 'Bonsoir' WHERE key = 'greeting_evening';
          UPDATE ui_translations SET value_fr = 'Chiffre d''affaires' WHERE key = 'kpi_total_revenue';
          UPDATE ui_translations SET value_fr = 'Factures payées' WHERE key = 'kpi_paid_invoices';
          UPDATE ui_translations SET value_fr = 'Devis en attente' WHERE key = 'kpi_pending_quotes';
          UPDATE ui_translations SET value_fr = 'Total clients' WHERE key = 'kpi_total_clients';
          UPDATE ui_translations SET value_fr = 'Gère ta facturation comme un pro' WHERE key = 'hero_title';
          UPDATE ui_translations SET value_fr = 'Suis tes revenus, envoie tes factures et garde une vue d''ensemble sur tous tes devis — le tout au même endroit.' WHERE key = 'hero_subtitle';
          UPDATE ui_translations SET value_fr = 'Aperçu du chiffre d''affaires' WHERE key = 'chart_title';
          UPDATE ui_translations SET value_fr = 'quotidien' WHERE key = 'chart_mode_daily';
          UPDATE ui_translations SET value_fr = 'factures payées' WHERE key = 'chart_mode_paid';
          UPDATE ui_translations SET value_fr = 'Aucune facture payée pour l''instant — ton chiffre d''affaires apparaîtra ici.' WHERE key = 'chart_empty';
          UPDATE ui_translations SET value_fr = 'Documents récents' WHERE key = 'recent_docs_title';
          UPDATE ui_translations SET value_fr = 'Activité récente' WHERE key = 'recent_docs_subtitle';
          UPDATE ui_translations SET value_fr = 'Aucun document pour l''instant. Crée ta première facture !' WHERE key = 'recent_docs_empty';
          UPDATE ui_translations SET value_fr = 'Aucun client' WHERE key = 'doc_no_client';
          UPDATE ui_translations SET value_fr = 'Ce mois-ci' WHERE key = 'this_month';
          UPDATE ui_translations SET value_fr = 'Actions rapides' WHERE key = 'quick_actions';
          UPDATE ui_translations SET value_fr = 'Rechercher des factures…' WHERE key = 'doclist_search_invoices';
          UPDATE ui_translations SET value_fr = 'Rechercher des devis…' WHERE key = 'doclist_search_quotes';
          UPDATE ui_translations SET value_fr = 'Nouveau' WHERE key = 'doclist_new';
          UPDATE ui_translations SET value_fr = 'Échec du chargement. Veuillez redémarrer l''application.' WHERE key = 'doclist_load_error';
          UPDATE ui_translations SET value_fr = 'Aucun résultat pour' WHERE key = 'doclist_no_match';
          UPDATE ui_translations SET value_fr = 'Aucun document pour l''instant' WHERE key = 'doclist_no_docs_yet';
          UPDATE ui_translations SET value_fr = 'Clique sur « Nouvelle facture » pour créer la première.' WHERE key = 'doclist_create_first_invoice';
          UPDATE ui_translations SET value_fr = 'Clique sur « Nouveau devis » pour créer le premier.' WHERE key = 'doclist_create_first_quote';
          UPDATE ui_translations SET value_fr = 'Supprimer ?' WHERE key = 'doclist_delete_title';
          UPDATE ui_translations SET value_fr = 'sera supprimé définitivement, y compris toutes les lignes et tous les paiements.' WHERE key = 'doclist_delete_body';
          UPDATE ui_translations SET value_fr = 'Description de l''article…' WHERE key = 'editor_item_description';
          UPDATE ui_translations SET value_fr = 'Sélectionner un client…' WHERE key = 'editor_select_client';
          UPDATE ui_translations SET value_fr = 'Titre du document / Objet' WHERE key = 'editor_doc_title';
          UPDATE ui_translations SET value_fr = 'p.ex. Projet de conception web' WHERE key = 'editor_doc_title_placeholder';
          UPDATE ui_translations SET value_fr = 'Numéro de document' WHERE key = 'editor_doc_number';
          UPDATE ui_translations SET value_fr = 'Date' WHERE key = 'editor_field_date';
          UPDATE ui_translations SET value_fr = 'Valable jusqu''au' WHERE key = 'editor_valid_until';
          UPDATE ui_translations SET value_fr = 'Date d''échéance' WHERE key = 'editor_due_date';
          UPDATE ui_translations SET value_fr = 'Lignes' WHERE key = 'editor_line_items';
          UPDATE ui_translations SET value_fr = 'Ajouter depuis les produits…' WHERE key = 'editor_add_from_products';
          UPDATE ui_translations SET value_fr = 'Ajouter une ligne' WHERE key = 'editor_add_item';
          UPDATE ui_translations SET value_fr = 'Ajouter la première ligne' WHERE key = 'editor_add_first_item';
          UPDATE ui_translations SET value_fr = 'Notes et conditions' WHERE key = 'editor_notes_terms';
          UPDATE ui_translations SET value_fr = 'Conditions de paiement, notes de projet…' WHERE key = 'editor_notes_placeholder';
          UPDATE ui_translations SET value_fr = 'Mode de paiement' WHERE key = 'editor_payment_mode';
          UPDATE ui_translations SET value_fr = 'Standard' WHERE key = 'editor_standard';
          UPDATE ui_translations SET value_fr = 'Comptant' WHERE key = 'editor_cash';
          UPDATE ui_translations SET value_fr = 'Sous-total' WHERE key = 'editor_subtotal';
          UPDATE ui_translations SET value_fr = 'Remise' WHERE key = 'editor_discount';
          UPDATE ui_translations SET value_fr = 'Fixe' WHERE key = 'editor_fixed';
          UPDATE ui_translations SET value_fr = 'TVA' WHERE key = 'editor_tax';
          UPDATE ui_translations SET value_fr = 'Total' WHERE key = 'editor_total';
          UPDATE ui_translations SET value_fr = 'Paiements' WHERE key = 'editor_payments';
          UPDATE ui_translations SET value_fr = 'Ce document est verrouillé. Clique sur « Déverrouiller pour modifier » pour apporter des changements.' WHERE key = 'editor_locked_notice';
          UPDATE ui_translations SET value_fr = 'Créer le document' WHERE key = 'editor_create';
          UPDATE ui_translations SET value_fr = 'Modifier le document' WHERE key = 'editor_edit';
          UPDATE ui_translations SET value_fr = 'Retour à l''éditeur' WHERE key = 'editor_back_to_editor';
          UPDATE ui_translations SET value_fr = 'Aperçu' WHERE key = 'editor_preview';
          UPDATE ui_translations SET value_fr = 'Exporter en PDF' WHERE key = 'editor_export_pdf';
          UPDATE ui_translations SET value_fr = 'Enregistrer le document' WHERE key = 'editor_save';
          UPDATE ui_translations SET value_fr = 'Marquer comme envoyée' WHERE key = 'editor_mark_sent';
          UPDATE ui_translations SET value_fr = 'Déverrouiller pour modifier' WHERE key = 'editor_unlock_edit';
          UPDATE ui_translations SET value_fr = 'Marquer comme payée' WHERE key = 'editor_mark_paid';
          UPDATE ui_translations SET value_fr = 'Annuler la facture' WHERE key = 'editor_cancel_invoice';
          UPDATE ui_translations SET value_fr = 'Marquer comme refusé' WHERE key = 'editor_mark_declined';
          UPDATE ui_translations SET value_fr = 'Marquer comme accepté' WHERE key = 'editor_mark_accepted';
          UPDATE ui_translations SET value_fr = 'Convertir en facture' WHERE key = 'editor_convert_to_invoice';
          UPDATE ui_translations SET value_fr = 'Modifications non enregistrées' WHERE key = 'editor_unsaved_title';
          UPDATE ui_translations SET value_fr = 'Tu as des modifications non enregistrées. Quitter sans enregistrer ?' WHERE key = 'editor_unsaved_body';
          UPDATE ui_translations SET value_fr = 'Quitter' WHERE key = 'editor_leave';
          UPDATE ui_translations SET value_fr = 'Remarque' WHERE key = 'editor_notice';
          UPDATE ui_translations SET value_fr = 'Passe à l''aperçu avant d''exporter le PDF.' WHERE key = 'editor_preview_first';
          UPDATE ui_translations SET value_fr = 'Enregistre le document avant de changer son statut.' WHERE key = 'editor_save_before_status';
          UPDATE ui_translations SET value_fr = 'Enregistre le devis avant de le convertir.' WHERE key = 'editor_save_before_convert';
          UPDATE ui_translations SET value_fr = 'Facture' WHERE key = 'editor_invoice_label';
          UPDATE ui_translations SET value_fr = 'Devis' WHERE key = 'editor_quote_label';
          UPDATE ui_translations SET value_fr = 'Rechercher des clients…' WHERE key = 'clients_search';
          UPDATE ui_translations SET value_fr = 'Ajouter un client' WHERE key = 'clients_add';
          UPDATE ui_translations SET value_fr = 'Échec du chargement. Veuillez redémarrer l''application.' WHERE key = 'clients_load_error';
          UPDATE ui_translations SET value_fr = 'Nom' WHERE key = 'clients_col_name';
          UPDATE ui_translations SET value_fr = 'E-mail' WHERE key = 'clients_col_email';
          UPDATE ui_translations SET value_fr = 'Téléphone' WHERE key = 'clients_col_phone';
          UPDATE ui_translations SET value_fr = 'Ville' WHERE key = 'clients_col_city';
          UPDATE ui_translations SET value_fr = 'N° TVA' WHERE key = 'clients_col_vat';
          UPDATE ui_translations SET value_fr = 'Documents' WHERE key = 'clients_col_documents';
          UPDATE ui_translations SET value_fr = 'Aucun client pour' WHERE key = 'clients_no_match';
          UPDATE ui_translations SET value_fr = 'Aucun client pour l''instant' WHERE key = 'clients_no_clients';
          UPDATE ui_translations SET value_fr = 'Ajoute ton premier client pour commencer à créer des factures et des devis.' WHERE key = 'clients_no_clients_hint';
          UPDATE ui_translations SET value_fr = 'Modifier le client' WHERE key = 'clients_edit_title';
          UPDATE ui_translations SET value_fr = 'Ajouter un nouveau client' WHERE key = 'clients_add_title';
          UPDATE ui_translations SET value_fr = 'Nom' WHERE key = 'clients_field_name';
          UPDATE ui_translations SET value_fr = 'E-mail' WHERE key = 'clients_field_email';
          UPDATE ui_translations SET value_fr = 'Téléphone' WHERE key = 'clients_field_phone';
          UPDATE ui_translations SET value_fr = 'Rue et numéro' WHERE key = 'clients_field_street';
          UPDATE ui_translations SET value_fr = 'Code postal' WHERE key = 'clients_field_zip';
          UPDATE ui_translations SET value_fr = 'Ville' WHERE key = 'clients_field_city';
          UPDATE ui_translations SET value_fr = 'Pays' WHERE key = 'clients_field_country';
          UPDATE ui_translations SET value_fr = 'Numéro de TVA' WHERE key = 'clients_field_vat';
          UPDATE ui_translations SET value_fr = 'p.ex. BE0123456789' WHERE key = 'clients_vat_placeholder';
          UPDATE ui_translations SET value_fr = 'Format d''e-mail invalide' WHERE key = 'clients_invalid_email';
          UPDATE ui_translations SET value_fr = 'Format de téléphone invalide' WHERE key = 'clients_invalid_phone';
          UPDATE ui_translations SET value_fr = 'Validation en cours…' WHERE key = 'clients_validating';
          UPDATE ui_translations SET value_fr = 'Enregistrer le client' WHERE key = 'clients_save';
          UPDATE ui_translations SET value_fr = 'Supprimer le client ?' WHERE key = 'clients_delete_title';
          UPDATE ui_translations SET value_fr = 'sera supprimé définitivement. Les documents liés seront conservés mais ne seront plus associés.' WHERE key = 'clients_delete_body';
          UPDATE ui_translations SET value_fr = 'Valide' WHERE key = 'clients_valid';
          UPDATE ui_translations SET value_fr = 'Invalide' WHERE key = 'clients_invalid';
          UPDATE ui_translations SET value_fr = 'Service indisponible' WHERE key = 'clients_service_unavailable';
          UPDATE ui_translations SET value_fr = 'Vérification en cours…' WHERE key = 'clients_checking';
          UPDATE ui_translations SET value_fr = 'Adresse vérifiée' WHERE key = 'clients_addr_verified';
          UPDATE ui_translations SET value_fr = 'L''adresse n''a pas pu être vérifiée' WHERE key = 'clients_addr_failed';
          UPDATE ui_translations SET value_fr = 'Service d''adresse indisponible' WHERE key = 'clients_addr_unavailable';
          UPDATE ui_translations SET value_fr = 'Rechercher des produits/services…' WHERE key = 'products_search';
          UPDATE ui_translations SET value_fr = 'Ajouter un produit' WHERE key = 'products_add';
          UPDATE ui_translations SET value_fr = 'Échec du chargement. Veuillez redémarrer l''application.' WHERE key = 'products_load_error';
          UPDATE ui_translations SET value_fr = 'Tous' WHERE key = 'products_all';
          UPDATE ui_translations SET value_fr = 'Nouvelle catégorie' WHERE key = 'products_new_category';
          UPDATE ui_translations SET value_fr = 'Créer la catégorie' WHERE key = 'products_create_category';
          UPDATE ui_translations SET value_fr = 'Gérer les catégories' WHERE key = 'products_manage_categories';
          UPDATE ui_translations SET value_fr = 'Masquer' WHERE key = 'products_hide';
          UPDATE ui_translations SET value_fr = 'Monter' WHERE key = 'products_move_up';
          UPDATE ui_translations SET value_fr = 'Descendre' WHERE key = 'products_move_down';
          UPDATE ui_translations SET value_fr = 'Supprimer la catégorie ?' WHERE key = 'products_delete_cat_title';
          UPDATE ui_translations SET value_fr = 'sera supprimée. Les produits de cette catégorie ne seront plus associés.' WHERE key = 'products_delete_cat_body';
          UPDATE ui_translations SET value_fr = 'Supprimer le produit ?' WHERE key = 'products_delete_title';
          UPDATE ui_translations SET value_fr = 'Aucun produit pour' WHERE key = 'products_no_match';
          UPDATE ui_translations SET value_fr = 'Aucun produit pour l''instant' WHERE key = 'products_no_products';
          UPDATE ui_translations SET value_fr = 'Ajoute un produit ou un service pour remplir tes factures plus rapidement.' WHERE key = 'products_no_products_hint';
          UPDATE ui_translations SET value_fr = 'Modifier le produit' WHERE key = 'products_edit_title';
          UPDATE ui_translations SET value_fr = 'Ajouter un produit' WHERE key = 'products_add_title';
          UPDATE ui_translations SET value_fr = 'Nom du produit (EN)' WHERE key = 'products_field_name_en';
          UPDATE ui_translations SET value_fr = 'Description (EN)' WHERE key = 'products_field_desc_en';
          UPDATE ui_translations SET value_fr = 'Nom du produit (DE)' WHERE key = 'products_field_name_de';
          UPDATE ui_translations SET value_fr = 'Description (DE)' WHERE key = 'products_field_desc_de';
          UPDATE ui_translations SET value_fr = 'Nom du produit (FR)' WHERE key = 'products_field_name_fr';
          UPDATE ui_translations SET value_fr = 'Description (FR)' WHERE key = 'products_field_desc_fr';
          UPDATE ui_translations SET value_fr = 'Prix (EUR)' WHERE key = 'products_field_rate';
          UPDATE ui_translations SET value_fr = 'Unité' WHERE key = 'products_field_unit';
          UPDATE ui_translations SET value_fr = 'par heure' WHERE key = 'products_unit_hour';
          UPDATE ui_translations SET value_fr = 'par jour' WHERE key = 'products_unit_day';
          UPDATE ui_translations SET value_fr = 'par pièce' WHERE key = 'products_unit_item';
          UPDATE ui_translations SET value_fr = 'prix fixe' WHERE key = 'products_unit_fixed';
          UPDATE ui_translations SET value_fr = 'Catégorie' WHERE key = 'products_field_category';
          UPDATE ui_translations SET value_fr = 'Sans catégorie' WHERE key = 'products_uncategorised';
          UPDATE ui_translations SET value_fr = '+ Nouvelle catégorie…' WHERE key = 'products_new_category_option';
          UPDATE ui_translations SET value_fr = 'Entreprise' WHERE key = 'settings_tab_company';
          UPDATE ui_translations SET value_fr = 'Facturation' WHERE key = 'settings_tab_billing';
          UPDATE ui_translations SET value_fr = 'Numérotation' WHERE key = 'settings_tab_numbering';
          UPDATE ui_translations SET value_fr = 'Traductions' WHERE key = 'settings_tab_translations';
          UPDATE ui_translations SET value_fr = 'Identité de l''entreprise' WHERE key = 'settings_company_title';
          UPDATE ui_translations SET value_fr = 'Configure la façon dont ton entreprise apparaît sur tous les documents générés.' WHERE key = 'settings_company_desc';
          UPDATE ui_translations SET value_fr = 'Raison sociale' WHERE key = 'settings_field_legal_name';
          UPDATE ui_translations SET value_fr = 'E-mail pour les demandes' WHERE key = 'settings_field_email';
          UPDATE ui_translations SET value_fr = 'Numéro de contact' WHERE key = 'settings_field_phone';
          UPDATE ui_translations SET value_fr = 'Numéro de TVA' WHERE key = 'settings_field_vat_id';
          UPDATE ui_translations SET value_fr = 'Adresse légale de l''entreprise' WHERE key = 'settings_field_address';
          UPDATE ui_translations SET value_fr = 'Valeurs financières par défaut' WHERE key = 'settings_billing_title';
          UPDATE ui_translations SET value_fr = 'Devise et taux de TVA par défaut pour la création de documents.' WHERE key = 'settings_billing_desc';
          UPDATE ui_translations SET value_fr = 'Devise principale' WHERE key = 'settings_field_currency';
          UPDATE ui_translations SET value_fr = 'Taux de TVA standard (%)' WHERE key = 'settings_field_tax_rate';
          UPDATE ui_translations SET value_fr = 'Modalités de paiement' WHERE key = 'settings_payment_title';
          UPDATE ui_translations SET value_fr = 'Ces coordonnées bancaires apparaîtront dans le pied de page de tes PDF.' WHERE key = 'settings_payment_desc';
          UPDATE ui_translations SET value_fr = 'IBAN' WHERE key = 'settings_field_iban';
          UPDATE ui_translations SET value_fr = 'BIC / SWIFT' WHERE key = 'settings_field_bic';
          UPDATE ui_translations SET value_fr = 'Numérotation intelligente des documents' WHERE key = 'settings_numbering_title';
          UPDATE ui_translations SET value_fr = 'Définis des règles automatisées pour nommer tes documents.' WHERE key = 'settings_numbering_desc';
          UPDATE ui_translations SET value_fr = 'Numérotation des factures' WHERE key = 'settings_invoice_numbering';
          UPDATE ui_translations SET value_fr = 'Numérotation des devis' WHERE key = 'settings_quote_numbering';
          UPDATE ui_translations SET value_fr = 'Modifications non enregistrées détectées. N''oublie pas d''enregistrer la nouvelle configuration.' WHERE key = 'settings_unsaved';
          UPDATE ui_translations SET value_fr = 'Localisation des PDF' WHERE key = 'settings_pdf_title';
          UPDATE ui_translations SET value_fr = 'Personnalise les libellés de tes PDF pour chaque langue.' WHERE key = 'settings_pdf_desc';
          UPDATE ui_translations SET value_fr = 'Libellé du document' WHERE key = 'settings_doc_label';
          UPDATE ui_translations SET value_fr = 'Anglais (EN)' WHERE key = 'settings_lang_en';
          UPDATE ui_translations SET value_fr = 'Allemand (DE)' WHERE key = 'settings_lang_de';
          UPDATE ui_translations SET value_fr = 'Français (FR)' WHERE key = 'settings_lang_fr';
          UPDATE ui_translations SET value_fr = 'Enregistrer les paramètres' WHERE key = 'settings_save';
          UPDATE ui_translations SET value_fr = 'Enregistré !' WHERE key = 'settings_saved';
          UPDATE ui_translations SET value_fr = 'Le modèle de numérotation ne peut pas être vide.' WHERE key = 'settings_error_empty_pattern';
          UPDATE ui_translations SET value_fr = 'Échec de l''enregistrement des paramètres' WHERE key = 'settings_error_save';
          UPDATE ui_translations SET value_fr = 'Texte statique' WHERE key = 'settings_seg_static';
          UPDATE ui_translations SET value_fr = 'Composant de date' WHERE key = 'settings_seg_date';
          UPDATE ui_translations SET value_fr = 'Compteur' WHERE key = 'settings_seg_counter';
          UPDATE ui_translations SET value_fr = 'Saisir un texte (p.ex. FA_)' WHERE key = 'settings_seg_text_placeholder';
          UPDATE ui_translations SET value_fr = 'Date du jour' WHERE key = 'settings_seg_today';
          UPDATE ui_translations SET value_fr = 'Date de création' WHERE key = 'settings_seg_creation';
          UPDATE ui_translations SET value_fr = 'Aperçu en direct' WHERE key = 'settings_seg_live_preview';
          UPDATE ui_translations SET value_fr = '(Modèle vide)' WHERE key = 'settings_seg_empty';
          UPDATE ui_translations SET value_fr = 'Quatre chiffres (0001)' WHERE key = 'settings_seg_four_digits';
          UPDATE ui_translations SET value_fr = 'Trois chiffres (001)' WHERE key = 'settings_seg_three_digits';
          UPDATE ui_translations SET value_fr = 'Deux chiffres (01)' WHERE key = 'settings_seg_two_digits';
          UPDATE ui_translations SET value_fr = 'Sans zéro (1)' WHERE key = 'settings_seg_no_padding';
          UPDATE ui_translations SET value_fr = 'Construis ton modèle de numérotation' WHERE key = 'settings_seg_build';
          UPDATE ui_translations SET value_fr = 'Ajouter un segment' WHERE key = 'settings_seg_add';
          UPDATE ui_translations SET value_fr = 'Supprimer le segment' WHERE key = 'settings_seg_remove';
          UPDATE ui_translations SET value_fr = 'Synchronisé' WHERE key = 'sync_synced';
          UPDATE ui_translations SET value_fr = 'Non enregistré' WHERE key = 'sync_unsaved';
          UPDATE ui_translations SET value_fr = 'Enregistrement en cours…' WHERE key = 'sync_saving';
          UPDATE ui_translations SET value_fr = 'Enregistré' WHERE key = 'sync_saved';
          UPDATE ui_translations SET value_fr = 'Conflit' WHERE key = 'sync_conflict';
          UPDATE ui_translations SET value_fr = 'Erreur de synchro' WHERE key = 'sync_error';
          UPDATE ui_translations SET value_fr = 'Enregistrer maintenant' WHERE key = 'sync_click_to_save';
          UPDATE ui_translations SET value_fr = 'Conflit de synchronisation' WHERE key = 'sync_conflict_title';
          UPDATE ui_translations SET value_fr = 'Un autre appareil a enregistré des modifications après que tu as commencé à éditer. Tes modifications locales n''ont pas encore été enregistrées sur GitHub.' WHERE key = 'sync_conflict_desc';
          UPDATE ui_translations SET value_fr = 'Choisis une option :' WHERE key = 'sync_pick';
          UPDATE ui_translations SET value_fr = 'Annuler mes modifications et recharger' WHERE key = 'sync_discard';
          UPDATE ui_translations SET value_fr = 'Écraser la version distante avec la mienne' WHERE key = 'sync_overwrite';
          UPDATE ui_translations SET value_fr = 'Décider plus tard' WHERE key = 'sync_decide_later';
          UPDATE ui_translations SET value_fr = 'Se connecter à GitHub' WHERE key = 'auth_connect_title';
          UPDATE ui_translations SET value_fr = 'InvoiceForge stocke tes données dans un dépôt GitHub privé. Connecte-toi pour lire et enregistrer tes factures.' WHERE key = 'auth_desc';
          UPDATE ui_translations SET value_fr = 'Échec de l''authentification. Veuillez réessayer.' WHERE key = 'auth_error';
          UPDATE ui_translations SET value_fr = 'Avancé — dépôt' WHERE key = 'auth_advanced';
          UPDATE ui_translations SET value_fr = 'Propriétaire' WHERE key = 'auth_field_owner';
          UPDATE ui_translations SET value_fr = 'Dépôt' WHERE key = 'auth_field_repo';
          UPDATE ui_translations SET value_fr = 'Branche' WHERE key = 'auth_field_branch';
          UPDATE ui_translations SET value_fr = 'Se connecter avec GitHub' WHERE key = 'auth_login';
          UPDATE ui_translations SET value_fr = 'Nom de catégorie (EN)' WHERE key = 'cat_field_name_en';
          UPDATE ui_translations SET value_fr = 'DE' WHERE key = 'cat_field_de';
          UPDATE ui_translations SET value_fr = 'FR' WHERE key = 'cat_field_fr';
          UPDATE ui_translations SET value_fr = 'Exporter en PDF' WHERE key = 'pdf_export_title';
          UPDATE ui_translations SET value_fr = 'Nom du fichier' WHERE key = 'pdf_export_filename';
          UPDATE ui_translations SET value_fr = 'Le fichier sera enregistré dans le dossier Téléchargements.' WHERE key = 'pdf_export_web_note';
          UPDATE ui_translations SET value_fr = 'Langue' WHERE key = 'pdf_export_language';
          UPDATE ui_translations SET value_fr = 'Exporter' WHERE key = 'pdf_export_save';
          UPDATE ui_translations SET value_fr = 'Échec de l''export PDF' WHERE key = 'editor_pdf_export_failed';
          UPDATE ui_translations SET value_fr = 'Échec du changement de statut' WHERE key = 'editor_transition_failed';
          UPDATE ui_translations SET value_fr = 'Durée (h)' WHERE key = 'col_duration';
          UPDATE ui_translations SET value_fr = 'Colonnes' WHERE key = 'col_columns';
        `);
      } catch (e) {
        console.error('Migration 10 failed:', e.message);
      }
    },
  },
  {
    version: 11,
    up: (exec) => {
      // New tokens for previously-hardcoded strings found in a full-app i18n audit
      // (DatePicker, ErrorBoundary, BottomNav, editor odds and ends, Settings
      // placeholders, etc). All three languages seeded together this time.
      try {
        exec(`
          INSERT OR IGNORE INTO ui_translations (key, value_de, value_fr, value_en) VALUES
            ('date_weekdays_short','Mo,Di,Mi,Do,Fr,Sa,So','Lu,Ma,Me,Je,Ve,Sa,Di','Mo,Tu,We,Th,Fr,Sa,Su'),
            ('date_months','Januar,Februar,März,April,Mai,Juni,Juli,August,September,Oktober,November,Dezember','janvier,février,mars,avril,mai,juin,juillet,août,septembre,octobre,novembre,décembre','January,February,March,April,May,June,July,August,September,October,November,December'),
            ('date_input_placeholder','TT.MM.JJJJ','JJ.MM.AAAA','DD.MM.YYYY'),
            ('date_open_calendar','Kalender öffnen','Ouvrir le calendrier','Open calendar'),
            ('date_picker_dialog','Datumsauswahl','Sélecteur de date','Date picker'),
            ('date_prev_month','Vorheriger Monat','Mois précédent','Previous month'),
            ('date_next_month','Nächster Monat','Mois suivant','Next month'),
            ('error_title','Etwas ist schiefgelaufen','Une erreur est survenue','Something went wrong'),
            ('error_body','Die Anwendung hat einen unerwarteten Fehler festgestellt. Versuche es erneut — deine Daten sind sicher in der lokalen Datenbank.','L''application a rencontré une erreur inattendue. Réessaie — tes données sont en sécurité dans la base de données locale.','The application hit an unexpected error. Try recovering — your data is safe in the local database.'),
            ('error_try_again','Erneut versuchen','Réessayer','Try again'),
            ('error_reload_app','App neu laden','Recharger l''application','Reload app'),
            ('nav_primary','Primäre Navigation','Navigation principale','Primary navigation'),
            ('editor_go_back','Zurück','Retour','Go back'),
            ('editor_panel_aria','Editor-Bereich','Zone d''édition','Editor panel'),
            ('editor_create_new_client','Neuen Kunden anlegen','Créer un nouveau client','Create new client'),
            ('editor_item_name_placeholder','Artikelname…','Nom de l''article…','Item name…'),
            ('editor_item_desc_placeholder','Beschreibung… (optional)','Description… (facultatif)','Description… (optional)'),
            ('editor_add_item_below','Position darunter hinzufügen','Ajouter une ligne en dessous','Add item below'),
            ('editor_remove_item','Position entfernen','Supprimer la ligne','Remove item'),
            ('editor_search_products','Produkt suchen…','Rechercher un produit…','Search products…'),
            ('editor_no_products','Keine Produkte','Aucun produit','No products'),
            ('btn_ok','OK','OK','OK'),
            ('clients_email_valid','Gültige E-Mail','E-mail valide','Valid email'),
            ('clients_email_invalid','Ungültige E-Mail','E-mail invalide','Invalid email'),
            ('clients_phone_valid','Gültige Telefonnummer','Téléphone valide','Valid phone'),
            ('clients_phone_invalid','Ungültige Telefonnummer','Téléphone invalide','Invalid phone'),
            ('clients_vat_valid','USt-ID gültig','N° TVA valide','VAT valid'),
            ('clients_vat_invalid','USt-ID ungültig','N° TVA invalide','VAT invalid'),
            ('products_delete_body','wird dauerhaft gelöscht.','sera supprimé définitivement.','will be permanently deleted.'),
            ('settings_drag_reorder','Zum Neuanordnen ziehen','Glisser pour réorganiser','Drag to reorder'),
            ('settings_ph_legal_name','z.B. Michel Munhoven Design','p.ex. Michel Munhoven Design','e.g. Michel Munhoven Design'),
            ('settings_ph_email','deine@email.com','ton@email.com','your@email.com'),
            ('settings_ph_phone','+32 ...','+32 ...','+32 ...'),
            ('settings_ph_vat','BE0000.000.000','BE0000.000.000','BE0000.000.000'),
            ('settings_ph_address','Straße und Hausnummer' || char(10) || 'Stadt, Postleitzahl' || char(10) || 'Land','Rue et numéro' || char(10) || 'Ville, code postal' || char(10) || 'Pays','Street and number' || char(10) || 'City, Postal Code' || char(10) || 'Country'),
            ('settings_ph_iban','BE00 0000 0000 0000','BE00 0000 0000 0000','BE00 0000 0000 0000'),
            ('settings_ph_bic','GEBABEBB','GEBABEBB','GEBABEBB'),
            ('settings_cash_note_label','Barverkaufshinweis','Mention vente au comptant','Cash sale note'),
            ('nav_main_menu','Hauptmenü','Menu principal','Main menu'),
            ('nav_toggle','Navigation umschalten','Basculer la navigation','Toggle navigation'),
            ('btn_close','Schließen','Fermer','Close'),
            ('dashboard_chart_aria','Umsatz-Liniendiagramm','Graphique linéaire du chiffre d''affaires','Revenue line chart'),
            ('dashboard_range_custom','Benutzerdefiniert','Personnalisé','Custom'),
            ('dashboard_range_all','ALLE','TOUT','ALL'),
            ('clients_name_required','Name ist erforderlich','Le nom est requis','Name is required'),
            ('clients_detected_prefix','Erkannt: ','Détecté : ','Detected: '),
            ('clients_registered_to_prefix','Registriert auf: ','Enregistré au nom de : ','Registered to: ');
        `);
      } catch (e) {
        console.error('Migration 11 failed:', e.message);
      }
    },
  },
  {
    version: 12,
    up: (exec) => {
      // A few keys missed on the first audit pass, plus two keys
      // (editor_create_quote/editor_create_invoice) that DocumentEditor.jsx
      // already called via t() but were never actually seeded -- so they
      // silently rendered the English fallback in every language.
      try {
        exec(`
          INSERT OR IGNORE INTO ui_translations (key, value_de, value_fr, value_en) VALUES
            ('chart_months_short','Jan,Feb,Mär,Apr,Mai,Jun,Jul,Aug,Sep,Okt,Nov,Dez','janv.,févr.,mars,avr.,mai,juin,juil.,août,sept.,oct.,nov.,déc.','Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec'),
            ('settings_load_error','Einstellungen konnten nicht geladen werden','Échec du chargement des paramètres','Settings failed to load'),
            ('editor_create_quote','Neues Angebot','Nouveau devis','New Quote'),
            ('editor_create_invoice','Neue Rechnung','Nouvelle facture','New Invoice'),
            ('currency_eur_name','Euro','euro','Euro'),
            ('currency_usd_name','US-Dollar','dollar américain','US Dollar'),
            ('currency_gbp_name','Britisches Pfund','livre sterling britannique','British Pound'),
            ('currency_chf_name','Schweizer Franken','franc suisse','Swiss Franc');
        `);
      } catch (e) {
        console.error('Migration 12 failed:', e.message);
      }
    },
  },
  {
    version: 13,
    up: (exec) => {
      // More keys called via t() but never seeded, found by cross-referencing
      // every t(key, ...) call site in src/ against every seeded key (the
      // preview collapse/expand/fullsize buttons, app-language section
      // labels, a couple column headers).
      try {
        exec(`
          INSERT OR IGNORE INTO ui_translations (key, value_de, value_fr, value_en) VALUES
            ('col_name','Name','Nom','Name'),
            ('col_line_total','Zeilensumme','Total ligne','Line Total'),
            ('editor_currency','Währung','Devise','Currency'),
            ('editor_add_line','Neue Zeile hinzufügen','Ajouter une nouvelle ligne','Add New Line'),
            ('editor_preview_collapse','Vorschau einklappen','Réduire l''aperçu','Collapse preview'),
            ('editor_preview_expand','Vorschau ausklappen','Développer l''aperçu','Expand preview'),
            ('editor_preview_fullsize','In voller Größe öffnen','Ouvrir en taille réelle','Open full size'),
            ('settings_ui_lang_title','App-Sprache','Langue de l''application','App Language'),
            ('settings_ui_lang_desc','Legt die Sprache der App-Oberfläche fest. Änderungen wirken sich sofort aus.','Définit la langue de l''interface de l''application. Les modifications prennent effet immédiatement.','Controls the language of the app interface. Changes take effect immediately.');
        `);
      } catch (e) {
        console.error('Migration 13 failed:', e.message);
      }
    },
  },
  {
    version: 14,
    up: (exec) => {
      // Scout-year dashboard range pills (H1/H2/current/last scout year)
      // replaced the old rolling 1M/3M/6M/1Y/ALL set — new pill labels need translations.
      try {
        exec(`
          INSERT OR IGNORE INTO ui_translations (key, value_de, value_fr, value_en) VALUES
            ('dashboard_range_h1','1. Halbjahr','1er semestre','H1'),
            ('dashboard_range_h2','2. Halbjahr','2e semestre','H2'),
            ('dashboard_range_current','Aktuelles Pfadfinderjahr','Année scoute actuelle','Current Year'),
            ('dashboard_range_last','Letztes Pfadfinderjahr','Année scoute précédente','Last Year');
        `);
      } catch (e) {
        console.error('Migration 14 failed:', e.message);
      }
    },
  },
  {
    version: 15,
    up: (exec) => {
      // Category editor dropped its leftover English name field (app is
      // DE/FR only) — the remaining primary field needed a non-English label.
      try {
        exec(`
          INSERT OR IGNORE INTO ui_translations (key, value_de, value_fr, value_en) VALUES
            ('cat_field_name','Kategoriename','Nom de catégorie','Category name');
        `);
      } catch (e) {
        console.error('Migration 15 failed:', e.message);
      }
    },
  },
  {
    version: 16,
    up: (exec) => {
      // Dashboard scout-year pills shortened to plain H1/H2/Dieses Jahr/
      // Letztes Jahr/Eigene Dauer — the original wording was too long for
      // the pill row.
      try {
        exec(`
          UPDATE ui_translations SET value_de = 'H1' WHERE key = 'dashboard_range_h1';
          UPDATE ui_translations SET value_de = 'H2' WHERE key = 'dashboard_range_h2';
          UPDATE ui_translations SET value_de = 'Dieses Jahr' WHERE key = 'dashboard_range_current';
          UPDATE ui_translations SET value_de = 'Letztes Jahr' WHERE key = 'dashboard_range_last';
          UPDATE ui_translations SET value_de = 'Eigene Dauer' WHERE key = 'dashboard_range_custom';
        `);
      } catch (e) {
        console.error('Migration 16 failed:', e.message);
      }
    },
  },
  {
    version: 17,
    up: (exec) => {
      // Numbering-pattern segment type dropdown shortened to plain
      // Text/Datum/Zahl, and the counter format options dropped their
      // descriptive text entirely — just the raw digit pattern (0001/001/01/1).
      try {
        exec(`
          UPDATE ui_translations SET value_de = 'Text', value_fr = 'Texte' WHERE key = 'settings_seg_static';
          UPDATE ui_translations SET value_de = 'Datum', value_fr = 'Date' WHERE key = 'settings_seg_date';
          UPDATE ui_translations SET value_de = 'Zahl', value_fr = 'Numéro' WHERE key = 'settings_seg_counter';
          UPDATE ui_translations SET value_de = '0001', value_fr = '0001' WHERE key = 'settings_seg_four_digits';
          UPDATE ui_translations SET value_de = '001', value_fr = '001' WHERE key = 'settings_seg_three_digits';
          UPDATE ui_translations SET value_de = '01', value_fr = '01' WHERE key = 'settings_seg_two_digits';
          UPDATE ui_translations SET value_de = '1', value_fr = '1' WHERE key = 'settings_seg_no_padding';
        `);
      } catch (e) {
        console.error('Migration 17 failed:', e.message);
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

export const TARGET_SCHEMA_VERSION = 13;
