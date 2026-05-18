import React, { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useT } from '../hooks/useUiTranslations';
import './CategoryEditor.css';

const PRESET_COLORS = [
  '#C8FF00', '#22D3EE', '#A78BFA', '#F472B6',
  '#FB923C', '#FACC15', '#4ADE80', '#94A3B8',
];

const EMPTY = { name: '', name_de: '', name_fr: '', color: PRESET_COLORS[0] };

const CategoryEditor = ({ initial, onSave, onCancel, autoFocus = true }) => {
  const t = useT();
  const [data, setData] = useState(() => ({ ...EMPTY, ...(initial || {}) }));

  useEffect(() => {
    setData({ ...EMPTY, ...(initial || {}) });
  }, [initial?.id]);

  const canSave = data.name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ ...data, name: data.name.trim() });
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
    <div className="category-editor" onKeyDown={handleKeyDown}>
      <div className="cat-editor-row">
        <input
          autoFocus={autoFocus}
          type="text"
          className="cat-input"
          placeholder={t('cat_field_name_en', 'Category name (EN)')}
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
        />
        <input
          type="text"
          className="cat-input"
          placeholder={t('cat_field_de', 'DE')}
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
          <button type="button" className="cat-btn-cancel" onClick={onCancel} title="Cancel">
            <X size={14} />
          </button>
          <button type="button" className="cat-btn-save" disabled={!canSave} onClick={handleSave} title="Save">
            <Check size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryEditor;
