import { Circle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { statusMeta } from '../utils/baseballSponsors';
import './SponsorStatusIcon.css';

const ICONS = { circle: Circle, clock: Clock, check: CheckCircle2, cross: XCircle };

/**
 * Status of a Baseball sponsor row as an icon only (no text). Label as title + aria-label.
 * Props: status (DB value of baseball_sponsors.status; unknown values show as 'offen'), size (default 18).
 */
const SponsorStatusIcon = ({ status, size = 18, className = '' }) => {
  const meta = statusMeta(status);
  const Icon = ICONS[meta.icon] || Circle;
  return (
    <span
      className={`sponsor-status-icon sponsor-status-icon--${meta.tone}${className ? ` ${className}` : ''}`}
      title={meta.label}
      aria-label={meta.label}
      role="img"
    >
      <Icon size={size} aria-hidden="true" />
    </span>
  );
};

export default SponsorStatusIcon;
