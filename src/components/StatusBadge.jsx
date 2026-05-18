import React from 'react';
import { useT } from '../hooks/useUiTranslations';
import './StatusBadge.css';

const STATUS_EN_FALLBACKS = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  converted: 'Converted',
};

const StatusBadge = ({ status }) => {
  const t = useT();
  const key = (status || 'draft').toLowerCase();
  const label = t(`status_${key}`, STATUS_EN_FALLBACKS[key] || status);
  const knownKey = STATUS_EN_FALLBACKS[key] ? key : 'unknown';
  return <span className={`status-badge status-${knownKey}`}>{label}</span>;
};

export default StatusBadge;
