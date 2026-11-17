import { useEffect, useRef, useState } from 'react';
import { parsePhoneNumberFromString, isValidPhoneNumber } from 'libphonenumber-js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export const validateEmail = (email) => {
  const trimmed = (email || '').trim();
  if (!trimmed) return { valid: null };
  return { valid: EMAIL_RE.test(trimmed) };
};

export const validatePhone = (phone, defaultCountry = 'BE') => {
  const trimmed = (phone || '').trim();
  if (!trimmed) return { valid: null };
  try {
    const valid = isValidPhoneNumber(trimmed, defaultCountry);
    if (!valid) return { valid: false };
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
    return {
      valid: true,
      formatted: parsed?.formatInternational() || trimmed,
      country: parsed?.country || defaultCountry,
    };
  } catch (_e) {
    return { valid: false };
  }
};

const fetchWithTimeout = (url, timeoutMs = 5000) =>
  fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

export const lookupAddress = async (street, city) => {
  const street_ = (street || '').trim();
  if (!street_) return { valid: null };
  try {
    const q = encodeURIComponent(street_ + (city ? ' ' + city : ''));
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?format=json&q=${q}&addressdetails=1&limit=1`
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return { valid: false };
    const a = data[0].address || {};
    return {
      valid: true,
      address_street: (a.road || '') + (a.house_number ? ' ' + a.house_number : ''),
      address_zip: a.postcode || '',
      address_city: a.city || a.town || a.village || '',
      address_country: a.country || '',
    };
  } catch (_e) {
    return { valid: null, error: 'service_unavailable' };
  }
};

const VAT_RE = /^[A-Z]{2}[A-Z0-9]+$/i;

export const validateVAT = async (vatNumber) => {
  const cleaned = (vatNumber || '').replace(/\s+/g, '').toUpperCase();
  if (!cleaned) return { valid: null };
  if (!VAT_RE.test(cleaned)) return { valid: false, reason: 'format' };
  try {
    const res = await fetchWithTimeout(`https://controlapi.vatcomply.com/vat?vat_number=${encodeURIComponent(cleaned)}`);
    if (!res.ok) return { valid: null, reason: 'service_unavailable' };
    const data = await res.json();
    if (!data.valid) return { valid: false, reason: 'not_registered' };
    return {
      valid: true,
      name: data.name || '',
      address: data.address || '',
      countryCode: data.country_code || cleaned.slice(0, 2),
    };
  } catch (_e) {
    return { valid: null, reason: 'service_unavailable' };
  }
};

/**
 * Runs an async validator whenever the input changes, debounced.
 * Cancels in-flight results when the input changes again.
 */
export const useDebouncedValidator = (value, fn, delay = 600) => {
  const [state, setState] = useState({ status: 'idle', result: null });
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (value == null || value === '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- local draft follows its prop
      setState({ status: 'idle', result: null });
      return undefined;
    }
    const id = ++reqIdRef.current;
    setState((s) => ({ status: 'pending', result: s.result }));
    const handle = setTimeout(async () => {
      try {
        const result = await fn(value);
        if (reqIdRef.current !== id) return;
        if (!result || result.valid === null) {
          // null means "no result" (empty input) or service unavailable — don't block the user.
          const isServiceError = result?.error === 'service_unavailable' || result?.reason === 'service_unavailable';
          setState({ status: isServiceError ? 'error' : 'idle', result: result || null });
        } else {
          setState({ status: result.valid ? 'valid' : 'invalid', result });
        }
      } catch (_e) {
        if (reqIdRef.current !== id) return;
        setState({ status: 'error', result: { valid: null, reason: 'service_unavailable' } });
      }
    }, delay);
    return () => clearTimeout(handle);
  }, [value, delay, fn]);

  return state;
};
