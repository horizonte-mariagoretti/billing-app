import React, { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useT } from '../hooks/useUiTranslations';
import './CategoryEditor.css';

const PRESET_COLORS = [
  '#C8FF00', '#22D3EE', '#A78BFA', '#F472B6',
  '#FB923C', '#FACC15', '#4ADE80', '#94A3B8',
];

const EMPTY = { name: '', name_de: '', name_fr: '', color: PRESET_COLORS[0] };

// App is DE/FR only (no English UI) — `name` is a legacy column kept for
// backward-compatible display code (`cat.name` is read directly all over
// Products.jsx), so it's mirrored from the DE field on save rather than
// edited on its own.
const CategoryEditor = ({ initial, onSave, onCancel, autoFocus = true, compact = false }) => {
  const t = useT();
  const [data, setData] = useState(() => ({ ...EMPTY, ...(initial || {}) }));

  useEffect(() => {
    setData({ ...EMPTY, ...(initial || {}) });
  }, [initial?.id]);

  const canSave = data.name_de.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const name_de = data.name_de.trim();
    onSave({ ...data, name_de, name: name_de });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel?.();
    }
  };

  return (
    <div className={`category-editor${compact ? ' compact' : ''}`} onKeyDown={handleKeyDown}>
      <div className="cat-editor-row">
        <input
          autoFocus={autoFocus}
          type="text"
          className="cat-input"
          placeholder={t('cat_field_name', 'Category name')}
          value={data.name_de}
          onChange={(e) => setData({ ...data, name_de: e.target.value })}
        />
        <input
          type="text"
          className="cat-input"
          placeholder={t('cat_field_fr', 'FR')}
          value={data.name_fr}
          onChange={(e) => setData({ ...data, name_fr: e.target.value })}
        />
      </div>
      <div className="cat-editor-row cat-editor-bottom">
        <div className="cat-color-picker">
          {PRESET_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`cat-color-swatch ${data.color === c ? 'active' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => setData({ ...data, color: c })}
              title={c}
            />
          ))}
        </div>
        <div className="cat-editor-actions">
          <button type="button" className="cat-btn-cancel" onClick={onCancel} title={t('btn_cancel', 'Cancel')}>
            <X size={14} />
          </button>
          <button type="button" className="cat-btn-save" disabled={!canSave} onClick={handleSave} title={t('btn_save', 'Save')}>
            <Check size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryEditor;
