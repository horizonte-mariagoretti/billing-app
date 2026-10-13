import { useState, useEffect } from 'react';
import useDatabase from './useDatabase';
import useSettings from './useSettings';
import { productLabel, pickDefaultProduct, DEFAULT_JOB_LINE_NAME } from '../utils/jobDocumentLines';

/**
 * State for the "where does the hourly wage come from" block:
 * 'product' → name + rate from a product (preselects "Hori Arbeitsstunden"),
 * 'manual'  → free line name + wage typed in the dialog.
 * Exposes the resolved { name, rate, productId } plus the setters the
 * <JobRateSource> component needs.
 */
const useJobRateSource = () => {
  const { query } = useDatabase();
  const { loadSettings } = useSettings();
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState('product');
  const [productId, setProductId] = useState('');
  const [manualName, setManualName] = useState(DEFAULT_JOB_LINE_NAME);
  const [manualRate, setManualRate] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rows, s] = await Promise.all([
          query('SELECT id, name, name_de, name_fr, rate, unit FROM products ORDER BY name'),
          loadSettings().catch(() => ({})),
        ]);
        if (cancelled) return;
        const list = rows || [];
        setProducts(list);
        setProductId(pickDefaultProduct(list)?.id ?? '');
        setMode(list.length ? 'product' : 'manual');
        setCurrency(s?.default_currency || 'EUR');
      } catch (_e) {
        if (!cancelled) { setLoadError(true); setMode('manual'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const product = products.find((p) => String(p.id) === String(productId)) || null;
  const isProduct = mode === 'product';
  const rateNum = Number(isProduct ? product?.rate : manualRate);

  return {
    products, currency, loading, loadError,
    mode, setMode, selectedProductId: productId, setProductId, manualName, setManualName, manualRate, setManualRate,
    product,
    // Resolved values for buildJobItems / onConfirm.
    name: isProduct ? (productLabel(product) || DEFAULT_JOB_LINE_NAME) : (manualName.trim() || DEFAULT_JOB_LINE_NAME),
    rate: Number.isFinite(rateNum) && rateNum > 0 ? Math.round(rateNum * 100) / 100 : 0,
    productId: isProduct ? (product?.id ?? null) : null,
  };
};

export default useJobRateSource;
