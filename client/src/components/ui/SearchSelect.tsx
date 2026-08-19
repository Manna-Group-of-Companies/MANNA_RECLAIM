import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { cn } from '@/utils/cn';

export interface SearchSelectOption {
  value: string;
  label: string;
}

export interface SearchSelectFieldProps {
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  label?: ReactNode;
  note?: ReactNode;
  hint?: ReactNode;
  /** What the picker calls itself. Falls back to the field's own label. */
  sheetTitle?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  /** Shown when no option matches the current value. */
  placeholder?: string;
  fieldClassName?: string;
}

/**
 * A select for a list too long to be a dropdown - the twin of the app's
 * SearchSelectRow, and here for the same reason it exists there.
 *
 * A `<select>` is the right control up to about a screenful. The History tab's
 * batch picker is not: the plant is at 468 numbers and counting, every one of
 * them has to stay on the list, and the number somebody wants is invariably the
 * one below the fold. Reading the first screen and concluding the list has not
 * got your batch is the correct reading of a dropdown that long.
 *
 * So it reads as the field it replaces - it sits in a row beside three ordinary
 * dropdowns and should not look like a different kind of question - and opens
 * as a search over the whole list. Nothing is capped: type 3079 and there it
 * is, or scroll the lot for the crew reading down the numbers rather than
 * looking one up.
 */
export function SearchSelectField({
  value,
  options,
  onChange,
  label,
  note,
  hint,
  sheetTitle,
  searchLabel = 'Find',
  searchPlaceholder,
  placeholder,
  fieldClassName,
}: SearchSelectFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // A fresh search every time it opens: the last one narrowed the list to the
  // batch that was picked, which is the least useful list to reopen on.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const current = options.find((o) => o.value === value)?.label ?? placeholder ?? '';

  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle
        ? options.filter(
            (o) =>
              o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle),
          )
        : options,
    [options, needle],
  );

  const pick = (next: string) => {
    setOpen(false);
    onChange(next);
  };

  return (
    <div className={cn('field', fieldClassName)}>
      {label && (
        <label htmlFor={id}>
          {label}
          {note && <span className="muted normal-case tracking-normal"> {note}</span>}
        </label>
      )}
      <button
        type="button"
        id={id}
        className="searchsel"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="cur">{current}</span>
        <Icon name="search" size={17} className="text-ink-faint" />
      </button>
      {hint && <div className="hint">{hint}</div>}

      <BottomSheet
        open={open}
        title={sheetTitle ?? (typeof label === 'string' ? label : 'Choose')}
        onClose={() => setOpen(false)}
      >
        {/* Only while it is open: this list is every batch the plant has ever
            run, and there is no reason for it to sit in the document behind a
            closed sheet. */}
        {open && (
          <>
            <div className="field">
              <label htmlFor={`${id}-q`}>{searchLabel}</label>
              <input
                id={`${id}-q`}
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>
            {matches.length ? (
              <div className="picklist">
                {matches.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={cn('pickopt', o.value === value && 'sel')}
                    onClick={() => pick(o.value)}
                  >
                    <span>{o.label}</span>
                    {o.value === value && <span aria-hidden>✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="hint">Nothing matches “{query.trim()}”.</div>
            )}
          </>
        )}
      </BottomSheet>
    </div>
  );
}

export default SearchSelectField;
