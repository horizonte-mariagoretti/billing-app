import React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const UiTranslationsContext = createContext(null);

const VALID_LANGS = ['de', 'fr', 'en'];
const COL_MAP = { de: 'value_de', fr: 'value_fr', en: 'value_en' };

export function getUiLang() {
  const raw = localStorage.getItem('app_ui_lang');
  return VALID_LANGS.includes(raw) ? raw : 'de';
}

export function setUiLang(lang) {
  if (VALID_LANGS.includes(lang)) {
    localStorage.setItem('app_ui_lang', lang);
    window.location.reload();
  }
}

export function UiTranslationsProvider({ children }) {
  const [translations, setTranslations] = useState({});

  useEffect(() => {
    if (!window.electron?.db?.query) return;
    const lang = getUiLang();
    const col = COL_MAP[lang];
    window.electron.db.query(`SELECT key, ${col} AS val FROM ui_translations`)
      .then(rows => {
        const map = {};
        rows.forEach(r => { map[r.key] = r.val; });
        setTranslations(map);
      })
      .catch(() => {});
  }, []);

  const t = useCallback((key, fallback) => translations[key] ?? fallback ?? key, [translations]);

  return React.createElement(UiTranslationsContext.Provider, { value: t }, children);
}

export function useT() {
  const ctx = useContext(UiTranslationsContext);
  return ctx ?? ((key, fb) => fb ?? key);
}
