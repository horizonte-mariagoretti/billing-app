export const DOC_TYPES = {
  INVOICE: 'invoice',
  QUOTE: 'quote',
};

export const LANGUAGES = ['de', 'fr', 'en'];

export const CURRENCIES = [
  { value: 'EUR', label: 'EUR — Euro (€)' },
  { value: 'USD', label: 'USD — US Dollar ($)' },
  { value: 'GBP', label: 'GBP — British Pound (£)' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
];

export const DOC_STATUSES = ['draft', 'sent', 'paid', 'overdue'];

export const UNITS = ['hour', 'day', 'item', 'fixed'];

export const DUE_DATE_MONTHS = {
  [DOC_TYPES.INVOICE]: 1,
  [DOC_TYPES.QUOTE]: 2,
};
