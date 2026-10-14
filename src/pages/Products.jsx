import React, { useState, useEffect, useRef } from 'react';
import useDatabase from '../hooks/useDatabase';
import useSettings from '../hooks/useSettings';
import { useT, getUiLang } from '../hooks/useUiTranslations';
import useFocusTrap from '../hooks/useFocusTrap';
import Button from '../components/Button';
import SegmentedToggle from '../components/SegmentedToggle';
import Input from '../components/Input';
import StyledSelect from '../components/StyledSelect';
import CategoryEditor from '../components/CategoryEditor';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, Search, Package, Edit2, Trash2, Tags, LayoutList,
  ChevronDown, ChevronRight, ArrowUp, ArrowDown, AlertCircle
} from 'lucide-react';
import './Products.css';

const uiLang = getUiLang();

const EMPTY_PRODUCT = {
  name: '', name_de: '', name_fr: '',
  description: '', description_de: '', description_fr: '',
  rate: 0, unit: 'hour', category_id: '',
};

const parseLocaleNumber = (v) => {
  const s = String(v ?? '').trim().replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const Products = () => {
  const { query, run } = useDatabase();
  const { loadSettings } = useSettings();
  const t = useT();
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [activeLang, setActiveLang] = useState('de');
  const [formData, setFormData] = useState(EMPTY_PRODUCT);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // { id, name } | { categoryId, categoryName }

  // Category UI state
  const [showStripEditor, setShowStripEditor] = useState(false);
  const [view, setView] = useState('products'); // 'products' | 'categories'
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [showInlineModalCatEditor, setShowInlineModalCatEditor] = useState(false);

  const modalRef = useRef(null);
  const openBtnRef = useRef(null);
  useFocusTrap(modalRef, { active: showModal, triggerRef: openBtnRef });

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await loadSettings();
        setSettings(s);
      } catch (_e) {
        // ignore; fallback to EUR
      }
    })();
  }, [loadSettings]);

  const fetchAll = async () => {
    try {
      setError(null);
      await Promise.all([fetchProducts(), fetchCategories()]);
    } catch (_err) {
      setError(t('products_load_error', 'Failed to load products. Please restart the app.'));
    }
  };

  const fetchProducts = async () => {
    const data = await query('SELECT * FROM products ORDER BY name ASC');
    setProducts(data);
  };

  const fetchCategories = async () => {
    const data = await query('SELECT * FROM product_categories ORDER BY sort_order ASC, name ASC');
    setCategories(data);
  };

  // ----- product CRUD -----
  const handleSubmit = async (e) => {
    e.preventDefault();
    const id = editingProduct ? editingProduct.id : crypto.randomUUID();

    if (editingProduct) {
      await run(
        `UPDATE products SET
           name = ?, name_de = ?, name_fr = ?,
           description = ?, description_de = ?, description_fr = ?,
           rate = ?, unit = ?, category_id = ?
         WHERE id = ?`,
        [
          formData.name, formData.name_de, formData.name_fr,
          formData.description, formData.description_de, formData.description_fr,
          formData.rate, formData.unit, formData.category_id || null,
          id,
        ]
      );
    } else {
      await run(
        `INSERT INTO products (
           id, name, name_de, name_fr,
           description, description_de, description_fr,
           rate, unit, category_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, formData.name, formData.name_de, formData.name_fr,
          formData.description, formData.description_de, formData.description_fr,
          formData.rate, formData.unit, formData.category_id || null,
        ]
      );
    }

    setShowModal(false);
    setEditingProduct(null);
    setFormData(EMPTY_PRODUCT);
    fetchProducts();
  };

  const handleDelete = (id, name) => setConfirm({ type: 'product', id, name });

  const handleDeleteCategoryRequest = (id, name) => setConfirm({ type: 'category', id, name });

  const handleConfirmed = async () => {
    if (!confirm) return;
    if (confirm.type === 'product') {
      await run('DELETE FROM products WHERE id = ?', [confirm.id]);
      fetchProducts();
    } else if (confirm.type === 'category') {
      await run('UPDATE products SET category_id = NULL WHERE category_id = ?', [confirm.id]);
      await run('DELETE FROM product_categories WHERE id = ?', [confirm.id]);
      fetchAll();
    }
    setConfirm(null);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || '',
      name_de: product.name_de || '',
      name_fr: product.name_fr || '',
      description: product.description || '',
      description_de: product.description_de || '',
      description_fr: product.description_fr || '',
      rate: product.rate || 0,
      unit: product.unit || 'hour',
      category_id: product.category_id || '',
    });
    setShowModal(true);
  };

  const startNewCategory = () => {
    setView('categories');
    setEditingCategoryId(null);
    setShowStripEditor(true);
  };

  const handleNew = (presetCategory) => {
    setEditingProduct(null);
    setFormData({
      ...EMPTY_PRODUCT,
      category_id: presetCategory || '',
    });
    setShowInlineModalCatEditor(false);
    setShowModal(true);
  };

  // ----- category CRUD -----
  const saveCategory = async (data) => {
    if (data.id) {
      await run(
        'UPDATE product_categories SET name = ?, name_de = ?, name_fr = ?, color = ? WHERE id = ?',
        [data.name, data.name_de, data.name_fr, data.color, data.id]
      );
    } else {
      const id = crypto.randomUUID();
      const nextOrder = categories.length;
      await run(
        'INSERT INTO product_categories (id, name, name_de, name_fr, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [id, data.name, data.name_de, data.name_fr, data.color, nextOrder]
      );
      data.id = id;
    }
    await fetchCategories();
    return data;
  };

  const deleteCategory = (id, name) => handleDeleteCategoryRequest(id, name);

  const moveCategory = async (id, direction) => {
    const idx = categories.findIndex(c => c.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= categories.length) return;
    const a = categories[idx];
    const b = categories[swapIdx];
    await run('UPDATE product_categories SET sort_order = ? WHERE id = ?', [b.sort_order, a.id]);
    await run('UPDATE product_categories SET sort_order = ? WHERE id = ?', [a.sort_order, b.id]);
    fetchCategories();
  };

  const handleStripSave = async (data) => {
    await saveCategory(data);
    setShowStripEditor(false);
  };

  const handleManageSave = async (data) => {
    await saveCategory(data);
    setEditingCategoryId(null);
  };

  const handleModalCatSave = async (data) => {
    const saved = await saveCategory(data);
    setFormData((p) => ({ ...p, category_id: saved.id }));
    setShowInlineModalCatEditor(false);
  };

  // ----- filtering -----
  const getLocalizedName = (p) => {
    if (uiLang === 'de') return p.name_de || p.name || p.name_fr || '';
    if (uiLang === 'fr') return p.name_fr || p.name || p.name_de || '';
    return p.name || p.name_de || p.name_fr || '';
  };

  const filteredProducts = products
    .filter((p) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return [p.name, p.name_de, p.name_fr, p.description, p.description_de, p.description_fr]
        .some(v => v?.toLowerCase().includes(s));
    });

  const categoryById = (id) => categories.find(c => c.id === id);

  const groups = [
    ...categories.map((cat) => ({ key: cat.id, cat, items: filteredProducts.filter((p) => p.category_id === cat.id) })),
    { key: 'none', cat: null, items: filteredProducts.filter((p) => !categoryById(p.category_id)) },
  ].filter((g) => g.items.length > 0 || (!search && g.cat));

  const toggleGroup = (key) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className="products-page">
      <div className="page-header">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder={t('products_search', 'Search products/services...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          ref={openBtnRef}
          className="products-header-btn"
          variant="primary"
          icon={Plus}
          onClick={view === 'categories' ? startNewCategory : () => handleNew()}
        >
          <span className="products-header-btn-labels">
            <span className={view === 'products' ? 'on' : ''} aria-hidden={view !== 'products'}>{t('products_add', 'Add Product')}</span>
            <span className={view === 'categories' ? 'on' : ''} aria-hidden={view !== 'categories'}>{t('products_new_category', 'New Category')}</span>
          </span>
        </Button>
      </div>

      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="products-toolbar">
        <SegmentedToggle
          className="seg-toggle-fill"
          ariaLabel={t('products_view_label', 'Ansicht')}
          value={view}
          onChange={setView}
          options={[
            { value: 'products', label: t('products_view_products', 'Produkte'), icon: <LayoutList size={15} /> },
            { value: 'categories', label: t('products_view_categories', 'Kategorien'), icon: <Tags size={15} /> },
          ]}
        />
      </div>

      {view === 'categories' && (
        <div className="products-table-container">
          {categories.length === 0 && !showStripEditor ? (
            <div className="products-empty">
              <Tags size={32} strokeWidth={1.3} />
              <div className="products-empty-title">{t('products_no_categories', 'Noch keine Kategorien')}</div>
            </div>
          ) : (
            <table className="products-table">
              <thead>
                <tr>
                  <th>{t('col_name', 'Name')}</th>
                  <th>{t('products_cat_languages', 'Sprachen')}</th>
                  <th>{t('products_view_products', 'Produkte')}</th>
                  <th>{t('col_actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {showStripEditor && (
                  <tr>
                    <td colSpan={4}>
                      <CategoryEditor
                        initial={null}
                        onSave={handleStripSave}
                        onCancel={() => setShowStripEditor(false)}
                      />
                    </td>
                  </tr>
                )}
                {categories.map((cat, idx) => (
                  editingCategoryId === cat.id ? (
                    <tr key={cat.id}>
                      <td colSpan={4}>
                        <CategoryEditor
                          initial={cat}
                          onSave={handleManageSave}
                          onCancel={() => setEditingCategoryId(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={cat.id} className="product-row-clickable" onClick={() => setEditingCategoryId(cat.id)}>
                      <td>
                        <div className="product-name-cell">
                          <span className="product-cat-dot" style={{ backgroundColor: cat.color }} />
                          <span className="product-name-text">{cat.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="manage-cat-langs">
                          {cat.name_de && <span className="cat-lang-tag">DE</span>}
                          {cat.name_fr && <span className="cat-lang-tag">FR</span>}
                        </span>
                      </td>
                      <td className="product-unit-cell">{products.filter((p) => p.category_id === cat.id).length}</td>
                      <td className="product-actions-cell">
                        <div className="action-btns">
                          <button title={t('products_move_up', 'Move up')} aria-label={t('products_move_up', 'Move up')} disabled={idx === 0} onClick={(e) => { e.stopPropagation(); moveCategory(cat.id, 'up'); }}><ArrowUp size={16} /></button>
                          <button title={t('products_move_down', 'Move down')} aria-label={t('products_move_down', 'Move down')} disabled={idx === categories.length - 1} onClick={(e) => { e.stopPropagation(); moveCategory(cat.id, 'down'); }}><ArrowDown size={16} /></button>
                          <button title={t('btn_edit', 'Edit')} aria-label={`${t('btn_edit', 'Edit')} ${cat.name}`} onClick={(e) => { e.stopPropagation(); setEditingCategoryId(cat.id); }}><Edit2 size={16} /></button>
                          <button title={t('btn_delete', 'Delete')} aria-label={`${t('btn_delete', 'Delete')} ${cat.name}`} onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id, cat.name); }}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === 'products' && (
      <div className="products-table-container">
        {filteredProducts.length === 0 ? (
          <div className="products-empty">
            <Package size={32} strokeWidth={1.3} />
            <div className="products-empty-title">
              {search ? `${t('products_no_match', 'No products match')} "${search}"` : t('products_no_products', 'No products yet')}
            </div>
            <div className="products-empty-desc">
              {search ? t('try_different_search', 'Try a different search term.') : t('products_no_products_hint', 'Add a product or service to quickly populate your invoices.')}
            </div>
          </div>
        ) : (
          <table className="products-table">
            <thead>
              <tr>
                <th>{t('col_name', 'Name')}</th>
                <th>{t('products_field_rate', 'Rate')}</th>
                <th>{t('products_field_unit', 'Unit')}</th>
                <th>{t('col_actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const isCollapsed = collapsed.has(group.key);
                const label = group.cat ? group.cat.name : t('products_uncategorised_group', 'Ohne Kategorie');
                return (
                  <React.Fragment key={group.key}>
                    <tr className="products-group-row">
                      <td colSpan={4}>
                        <div className="products-group-head">
                          <button
                            type="button"
                            className="products-group-toggle"
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleGroup(group.key)}
                          >
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            {group.cat && <span className="product-cat-dot" style={{ backgroundColor: group.cat.color }} />}
                            <span>{label}</span>
                            <span className="products-group-count">{group.items.length}</span>
                          </button>
                          {group.cat && (
                            <button
                              type="button"
                              className="products-group-add"
                              title={t('products_add', 'Add Product')}
                              aria-label={`${t('products_add', 'Add Product')} - ${label}`}
                              onClick={() => handleNew(group.cat.id)}
                            >
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed && group.items.map((product) => {
                      const displayName = getLocalizedName(product);
                      return (
                        <tr key={product.id} className="product-row-clickable" onClick={() => handleEdit(product)}>
                          <td>
                            <div className="product-name-cell">
                              <span className="product-name-text">{displayName || product.name}</span>
                            </div>
                          </td>
                          <td className="product-rate-cell">
                            {product.rate.toLocaleString('de-DE', { style: 'currency', currency: settings?.default_currency || 'EUR' })}
                          </td>
                          <td className="product-unit-cell">{product.unit}</td>
                          <td className="product-actions-cell">
                            <div className="action-btns">
                              <button aria-label={`${t('btn_edit', 'Edit')} ${product.name}`} title={t('btn_edit', 'Edit')} onClick={(e) => { e.stopPropagation(); handleEdit(product); }}><Edit2 size={16} /></button>
                              <button aria-label={`${t('btn_delete', 'Delete')} ${product.name}`} title={t('btn_delete', 'Delete')} onClick={(e) => { e.stopPropagation(); handleDelete(product.id, product.name); }}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {showModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={editingProduct ? t('products_edit_title', 'Edit Product') : t('products_add_title', 'Add Product')}>
          <div className="modal-content" ref={modalRef}>
            <h2>{editingProduct ? t('products_edit_title', 'Edit Product') : t('products_add_title', 'Add Product')}</h2>

            <div className="lang-tabs">
              <button className={activeLang === 'de' ? 'active' : ''} onClick={() => setActiveLang('de')}>DE</button>
              <button className={activeLang === 'fr' ? 'active' : ''} onClick={() => setActiveLang('fr')}>FR</button>
            </div>

            <form onSubmit={handleSubmit}>
              {activeLang === 'de' && (
                <>
                  <Input
                    label={t('products_field_name_de', 'Product Name (DE)')}
                    value={formData.name_de}
                    onChange={(e) => setFormData({ ...formData, name_de: e.target.value })}
                    required
                  />
                  <Input
                    label={t('products_field_desc_de', 'Description (DE)')}
                    value={formData.description_de}
                    onChange={(e) => setFormData({ ...formData, description_de: e.target.value })}
                  />
                </>
              )}
              {activeLang === 'fr' && (
                <>
                  <Input
                    label={t('products_field_name_fr', 'Product Name (FR)')}
                    value={formData.name_fr}
                    onChange={(e) => setFormData({ ...formData, name_fr: e.target.value })}
                  />
                  <Input
                    label={t('products_field_desc_fr', 'Description (FR)')}
                    value={formData.description_fr}
                    onChange={(e) => setFormData({ ...formData, description_fr: e.target.value })}
                  />
                </>
              )}

              <div className="form-row">
                <Input
                  label={t('products_field_rate', 'Rate (EUR)')}
                  decimal
                  min="0"
                  step="0.01"
                  value={formData.rate}
                  onChange={(e) => setFormData({ ...formData, rate: parseLocaleNumber(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                />
                <div className="input-group">
                  <label className="input-label">{t('products_field_unit', 'Unit')}</label>
                  <StyledSelect
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  >
                    <option value="hour">{t('products_unit_hour', 'per hour')}</option>
                    <option value="day">{t('products_unit_day', 'per day')}</option>
                    <option value="item">{t('products_unit_item', 'per item')}</option>
                    <option value="fixed">{t('products_unit_fixed', 'fixed price')}</option>
                  </StyledSelect>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">{t('products_field_category', 'Category')}</label>
                <div className="category-select-row">
                  <StyledSelect
                    value={formData.category_id}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setShowInlineModalCatEditor(true);
                      } else {
                        setFormData({ ...formData, category_id: e.target.value });
                      }
                    }}
                  >
                    <option value="">{t('products_uncategorised', '— Uncategorised —')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    <option value="__new__">{t('products_new_category_option', '+ New category…')}</option>
                  </StyledSelect>
                </div>
                {showInlineModalCatEditor && (
                  <div className="inline-cat-editor-wrap">
                    <CategoryEditor
                      initial={null}
                      onSave={handleModalCatSave}
                      onCancel={() => setShowInlineModalCatEditor(false)}
                      compact
                    />
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <Button variant="ghost" type="button" onClick={() => setShowModal(false)}>{t('btn_cancel', 'Cancel')}</Button>
                <Button variant="primary" type="submit">{t('btn_save', 'Save')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.type === 'category' ? t('products_delete_cat_title', 'Delete category?') : t('products_delete_title', 'Delete product?')}
          message={
            confirm.type === 'category'
              ? `"${confirm.name}" ${t('products_delete_cat_body', 'will be deleted. Products in this category will become uncategorised.')}`
              : `"${confirm.name}" ${t('products_delete_body', 'will be permanently deleted.')}`
          }
          confirmLabel={t('btn_delete', 'Delete')}
          onConfirm={handleConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default Products;
