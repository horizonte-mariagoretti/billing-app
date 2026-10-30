import { useState, useEffect, useMemo, useRef } from 'react';
import { CalendarPlus, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import Button from './Button';
import GluehweinShiftModal from './GluehweinShiftModal';
import {
  DAY_MIN, buildTimeScale, fmtMinutes, groupDaysIntoBlocks, layoutShifts, shiftSpan,
} from '../utils/shiftLayout';
import './GluehweinShiftCalendar.css';

const HOUR_H = 56; // px per hour
const BAND_H = 44; // px of a day row (label + actions)
const EMPTY_H = 56; // extra px of an empty day ("Keine Schichten")
const PAUSE_H = 24; // px of a collapsed gap without shifts (> 3 h)
const SHORT_BLOCK = 70; // below this height the Horis are listed as text, editing happens in the popover

const isActive = (h) => h.active === 1 || h.active === true || h.active === '1';
const horiName = (h) => [h.first_name, h.last_name].filter(Boolean).join(' ') || '—';
const firstName = (h) => h.first_name || horiName(h);
const fmtTime = (t) => String(t ?? '').slice(0, 5);

// "Do 05.12."
const fmtDayHead = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const wd = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return `${wd} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
};
const fmtDayLong = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};

const people = (n) => `${n} ${n === 1 ? 'Hori' : 'Horis'}`;
const shiftsLabel = (n) => `${n} ${n === 1 ? 'Schicht' : 'Schichten'}`;
const slotTime = (slot, openEnd) => `${fmtTime(slot.start_time)}–${openEnd ? '?' : fmtTime(slot.end_time)}`;

/**
 * Shift calendar of a Verkaufsaktion. Consecutive Verkaufstage form one block with one continuous vertical time
 * line (utils/shiftLayout.js): every day gets a row with its actions (day 0 on top, the others at their midnight),
 * a shift crossing midnight is drawn once over that row, gaps over 3 h without shifts collapse into a "Pause" strip.
 * Overlapping shifts share the width (lanes). Separate blocks (e.g. two weekends) are drawn one under the other.
 *
 * Props: days, shiftsByDay (Map day_id → shifts), horiById (Map), activeHoris, templates ("HH:MM-HH:MM"[]),
 * disabled, yearLocked, busy, onAssign(shiftId, horiId), onUnassign(shiftId, horiId), onAddTemplates(dayId),
 * onSaveSlot(dayId, slotId | null, start, end) → Promise (throws Error(code)), onCopySlots(fromDayId, toDayId),
 * onRemoveSlot(slot, label), onRemoveDay(day, label).
 */
const GluehweinShiftCalendar = ({
  days, shiftsByDay, horiById, activeHoris, templates,
  disabled, yearLocked, busy,
  onAssign, onUnassign, onAddTemplates, onSaveSlot, onCopySlots, onRemoveSlot, onRemoveDay,
}) => {
  const [popover, setPopover] = useState(null); // shift id
  const [copyMenu, setCopyMenu] = useState(null); // day id with the "Schichten kopieren von…" menu open
  const [modal, setModal] = useState(null); // { day, slot | null }
  const popRef = useRef(null);

  const blocks = useMemo(() => groupDaysIntoBlocks(days), [days]);

  // Close the popover / copy menu on outside click / Escape.
  useEffect(() => {
    if (!popover && !copyMenu) return undefined;
    const close = () => { setPopover(null); setCopyMenu(null); };
    const onDown = (e) => { if (popRef.current && !popRef.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popover, copyMenu]);

  const openModal = (day, slot = null) => {
    if (yearLocked) return;
    setPopover(null);
    setCopyMenu(null);
    setModal({ day, slot });
  };

  const renderChip = (slot, id) => {
    const h = horiById.get(id);
    const name = h ? horiName(h) : 'Unbekannt';
    const inactive = h && !isActive(h);
    return (
      <span key={id} className={`gw-cal-chip${inactive ? ' is-inactive' : ''}`} title={name}>
        <span className="gw-cal-chip-name">{name}{inactive && ' (inaktiv)'}</span>
        {!yearLocked && (
          <button
            type="button"
            className="gw-cal-chip-remove"
            disabled={busy}
            aria-label={`${name} austragen`}
            title="Austragen"
            onClick={(e) => { e.stopPropagation(); onUnassign(slot.id, id); }}
          >
            <X size={12} />
          </button>
        )}
      </span>
    );
  };

  const renderPopover = (item, bodyHeight) => {
    const { shift: slot } = item;
    const time = slotTime(slot, item.openEnd);
    const assigned = slot.horis || [];
    const options = activeHoris.filter((h) => !assigned.includes(h.id));
    const lower = item.top > bodyHeight / 2;
    const alignRight = item.lanes > 1 && item.lane === item.lanes - 1;
    const style = {
      ...(alignRight ? { right: 4 } : { left: `calc(${(item.lane / item.lanes) * 100}% + 4px)` }),
      ...(lower ? { bottom: bodyHeight - (item.top + item.height) } : { top: item.top }),
    };
    return (
      <div ref={popRef} className="gw-cal-popover" style={style} role="dialog" aria-label={`Schicht ${time}`}>
        <div className="gw-cal-popover-head">
          <span className="gw-cal-time">{time}</span>
          <button type="button" className="gw-cal-icon-btn" aria-label="Schließen" onClick={() => setPopover(null)}>
            <X size={14} />
          </button>
        </div>
        <div className="gw-cal-popover-list">
          {assigned.length === 0
            ? <span className="gw-cal-muted">Niemand eingeteilt</span>
            : assigned.map((id) => renderChip(slot, id))}
        </div>
        {!yearLocked && options.length > 0 && (
          <select
            className="input-field gw-cal-picker"
            aria-label={`Hori zur Schicht ${time} hinzufügen`}
            value=""
            disabled={busy}
            onChange={(e) => { if (e.target.value) onAssign(slot.id, e.target.value); }}
          >
            <option value="">+ Hori…</option>
            {options.map((h) => <option key={h.id} value={h.id}>{horiName(h)}</option>)}
          </select>
        )}
      </div>
    );
  };

  const renderBlock = (item, day) => {
    const { shift: slot } = item;
    const assigned = slot.horis || [];
    const options = activeHoris.filter((h) => !assigned.includes(h.id));
    const time = slotTime(slot, item.openEnd);
    const short = item.height < SHORT_BLOCK;
    const names = assigned.map((id) => { const h = horiById.get(id); return h ? firstName(h) : '?'; });
    const summary = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
    const cls = [
      'gw-cal-block',
      assigned.length === 0 && 'is-empty',
      item.openEnd && 'is-open-end',
      short && 'is-short',
      popover === slot.id && 'is-open',
    ].filter(Boolean).join(' ');
    const open = () => setPopover((p) => (p === slot.id ? null : slot.id));
    const label = `${fmtDayLong(day.date)}, ${time}`;
    return (
      <div
        key={slot.id}
        className={cls}
        style={{
          top: item.top + 1,
          height: item.height - 3, // small gap between back-to-back shifts
          left: `calc(${(item.lane / item.lanes) * 100}% + 4px)`,
          width: `calc(${100 / item.lanes}% - 8px)`,
        }}
        onClick={(e) => { if (!e.target.closest('button, select')) open(); }}
        onDoubleClick={(e) => { if (!e.target.closest('button, select')) openModal(day, slot); }}
      >
        <div className="gw-cal-block-head">
          <span className="gw-cal-time">{time}</span>
          {item.nextDay && <span className="gw-cal-nextday" title="Endet am Folgetag">+1 Tag</span>}
          <span className="gw-cal-count">· {people(assigned.length)}</span>
          {!yearLocked && (
            <span className="gw-cal-block-tools">
              <button
                type="button"
                className="gw-cal-icon-btn"
                disabled={disabled}
                aria-label={`Schicht ${label} bearbeiten`}
                title="Zeiten bearbeiten"
                onClick={() => openModal(day, slot)}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                className="gw-cal-icon-btn"
                disabled={disabled}
                aria-label={`Schicht ${label} löschen`}
                title="Schicht löschen"
                onClick={() => onRemoveSlot(slot, label)}
              >
                <Trash2 size={13} />
              </button>
            </span>
          )}
        </div>
        {short ? (
          <button type="button" className="gw-cal-summary" onClick={open} aria-label={`Horis der Schicht ${time} bearbeiten`}>
            {summary || 'Niemand eingeteilt'}
          </button>
        ) : (
          <div className="gw-cal-chips">
            {assigned.length === 0 && <span className="gw-cal-muted">Niemand eingeteilt</span>}
            {assigned.map((id) => renderChip(slot, id))}
            {!yearLocked && options.length > 0 && (
              <button
                type="button"
                className="gw-cal-add"
                disabled={busy}
                aria-label={`Hori zur Schicht ${time} hinzufügen`}
                title="Hori einteilen"
                onClick={open}
              >
                <Plus size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCopyMenu = (day) => {
    const sources = days.filter((d) => d.id !== day.id && (shiftsByDay.get(d.id) || []).length > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return (
      <div ref={popRef} className="gw-cal-menu" role="menu" aria-label="Schichten kopieren von">
        <div className="gw-cal-menu-title">Schichten kopieren von…</div>
        {sources.length === 0 && <div className="gw-cal-menu-empty">Kein anderer Tag hat Schichten.</div>}
        {sources.map((d) => (
          <button
            key={d.id}
            type="button"
            role="menuitem"
            className="gw-cal-menu-item"
            disabled={disabled}
            onClick={() => { setCopyMenu(null); onCopySlots(d.id, day.id); }}
          >
            <span>{fmtDayHead(d.date)}</span>
            <span className="gw-cal-muted">{shiftsLabel((shiftsByDay.get(d.id) || []).length)}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderBand = (band, day) => {
    const slots = shiftsByDay.get(day.id) || [];
    const missing = templates.filter((tpl) => !slots.some((s) => fmtTime(s.start_time) === tpl.split('-')[0]));
    const open = slots.filter((s) => !(s.horis || []).length).length;
    const label = fmtDayLong(day.date);
    return (
      <div
        key={`band-${day.id}`}
        className={`gw-cal-band${band.dayIndex > 0 ? ' is-midnight' : ''}`}
        style={{ top: band.y, height: band.height }}
      >
        <div className="gw-cal-band-row">
          <span className="gw-cal-daypill">
            {band.dayIndex > 0 && <span className="gw-cal-midnight">Mitternacht · </span>}
            <span className="gw-cal-dayname">{fmtDayHead(day.date)}</span>
          </span>
          <span className="gw-cal-daymeta">
            <span className="gw-cal-daymeta-count">{shiftsLabel(slots.length)}</span>
            {slots.length > 0 && (
              open > 0
                ? <span className="gw-cal-badge is-warn" title="Schichten ohne eingeteilte Horis">{open} offen</span>
                : <span className="gw-cal-badge is-ok" title="Alle Schichten sind besetzt">besetzt</span>
            )}
          </span>
          {!yearLocked && (
            <span className="gw-cal-dayactions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gw-cal-fill"
                disabled={disabled || missing.length === 0}
                title={missing.length === 0 ? 'Alle Schichten aus den Einstellungen sind angelegt.' : `Legt an: ${missing.join(', ')}`}
                aria-label={`Schichten am ${label} anlegen`}
                onClick={() => onAddTemplates(day.id)}
              >
                <CalendarPlus size={14} /> <span className="gw-cal-fill-label">Schichten anlegen</span>
              </Button>
              <button
                type="button"
                className="gw-cal-icon-btn"
                disabled={disabled}
                aria-label={`Schicht am ${label} hinzufügen`}
                title="Schicht hinzufügen"
                onClick={() => openModal(day)}
              >
                <Plus size={15} />
              </button>
              <span className="gw-cal-menu-anchor">
                <button
                  type="button"
                  className="gw-cal-icon-btn"
                  disabled={disabled}
                  aria-label={`Schichten von einem anderen Tag zum ${label} kopieren`}
                  aria-haspopup="menu"
                  aria-expanded={copyMenu === day.id}
                  title="Schichten kopieren von…"
                  onClick={() => { setPopover(null); setCopyMenu((c) => (c === day.id ? null : day.id)); }}
                >
                  <Copy size={14} />
                </button>
                {copyMenu === day.id && renderCopyMenu(day)}
              </span>
              <button
                type="button"
                className="gw-cal-icon-btn"
                disabled={disabled}
                aria-label={`Tag ${label} löschen`}
                title="Tag löschen"
                onClick={() => onRemoveDay(day, label)}
              >
                <Trash2 size={14} />
              </button>
            </span>
          )}
        </div>
        {band.empty && <div className="gw-cal-band-empty">Keine Schichten</div>}
      </div>
    );
  };

  const renderGroup = (block) => {
    const blockDays = block.days;
    const dayIndex = new Map(blockDays.map((d, i) => [d.id, i]));
    const dayById = new Map(blockDays.map((d) => [d.id, d]));
    const slots = blockDays.flatMap((d) => shiftsByDay.get(d.id) || []);
    const offsetOf = (s) => (dayIndex.get(s.day_id) || 0) * DAY_MIN;
    const spans = slots.map((s) => {
      const sp = shiftSpan(s);
      return sp && { start: sp.start + offsetOf(s), end: sp.end + offsetOf(s) };
    }).filter(Boolean);
    const emptyDays = blockDays.map((d, i) => ((shiftsByDay.get(d.id) || []).length ? null : i)).filter((i) => i != null);
    const scale = buildTimeScale({
      dayCount: blockDays.length, spans, emptyDays,
      hourHeight: HOUR_H, bandHeight: BAND_H, emptyHeight: EMPTY_H, pauseHeight: PAUSE_H,
    });
    const items = layoutShifts(slots, { offsetOf, toY: scale.toY, hourHeight: HOUR_H });
    const popItem = items.find((it) => it.shift.id === popover);
    const first = blockDays[0];
    const last = blockDays[blockDays.length - 1];
    const title = blockDays.length > 1 ? `${fmtDayHead(first.date)} – ${fmtDayHead(last.date)}` : fmtDayHead(first.date);

    return (
      <section key={first.id} className="gw-cal card" aria-label={`Schichten ${title}`}>
        <header className="gw-cal-head">
          <span className="gw-cal-title">{title}</span>
          <span className="gw-cal-head-meta">
            {blockDays.length > 1 && `${blockDays.length} Tage · `}{shiftsLabel(slots.length)}
          </span>
        </header>
        <div className="gw-cal-body" style={{ height: scale.height }}>
          <div className="gw-cal-axis" aria-hidden="true">
            {scale.hours.map((h) => (
              <span key={h.min} className={`gw-cal-hour${h.belowBand ? ' is-below-band' : ''}`} style={{ top: h.y }}>
                {fmtMinutes(h.min)}
              </span>
            ))}
          </div>
          <div className="gw-cal-lanes">
            {scale.hours.map((h) => <div key={h.min} className="gw-cal-line" style={{ top: h.y }} />)}
            {scale.pauses.map((p) => (
              <div key={`p-${p.from}`} className="gw-cal-pause" style={{ top: p.y, height: p.height }}>
                Pause · {fmtMinutes(p.from)}–{fmtMinutes(p.to)}
              </div>
            ))}
            {items.map((it) => renderBlock(it, dayById.get(it.shift.day_id) || first))}
            {items.flatMap((it) => scale.bands
              .filter((b) => b.dayIndex > 0 && b.at > it.start && b.at < it.end)
              .filter((b) => scale.toY(it.end, 'end') - (b.y + b.height) >= 20) // room for one line below the row
              .map((b) => (
                <div
                  key={`cont-${it.shift.id}-${b.dayIndex}`}
                  className={`gw-cal-cont${(it.shift.horis || []).length ? '' : ' is-empty'}`}
                  style={{
                    top: b.y + b.height + 2,
                    left: `calc(${(it.lane / it.lanes) * 100}% + 4px)`,
                    width: `calc(${100 / it.lanes}% - 8px)`,
                  }}
                  aria-hidden="true"
                >
                  ↑ Fortsetzung <span className="gw-cal-time">{slotTime(it.shift, it.openEnd)}</span>
                </div>
              )))}
            {popItem && renderPopover(popItem, scale.height)}
          </div>
          {scale.bands.map((b) => renderBand(b, blockDays[b.dayIndex]))}
        </div>
      </section>
    );
  };

  const modalSlots = modal ? (shiftsByDay.get(modal.day.id) || []) : [];
  const lastSlot = [...modalSlots].sort((a, b) => fmtTime(a.start_time).localeCompare(fmtTime(b.start_time))).pop();

  return (
    <div className="gw-cal-stack">
      {blocks.map(renderGroup)}
      {modal && (
        <GluehweinShiftModal
          dayLabel={fmtDayLong(modal.day.date)}
          slot={modal.slot}
          defaultStart={lastSlot?.end_time && fmtTime(lastSlot.end_time) > fmtTime(lastSlot.start_time) ? fmtTime(lastSlot.end_time) : ''}
          existingStarts={modalSlots.filter((s) => s.id !== modal.slot?.id).map((s) => fmtTime(s.start_time))}
          onCancel={() => setModal(null)}
          onSave={async (start, end) => {
            await onSaveSlot(modal.day.id, modal.slot?.id ?? null, start, end);
            setModal(null);
          }}
        />
      )}
    </div>
  );
};

export default GluehweinShiftCalendar;
