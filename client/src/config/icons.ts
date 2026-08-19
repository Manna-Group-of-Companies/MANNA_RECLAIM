/**
 * The prototype's inline icons, kept as raw 24x24 `<path>` markup so the tab
 * bar and the empty states draw exactly the same glyphs the crew already know.
 * Rendered with `stroke: currentColor; fill: none`.
 */
export const icons = {
  machines:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  batches: '<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 17l9 5 9-5"/><path d="M3 12l9 5 9-5"/>',
  weigh:
    '<path d="M12 3v3"/><path d="M5 6h14"/><path d="M5 6 2 14a4 4 0 0 0 6 0L5 6Z"/><path d="M19 6l-3 8a4 4 0 0 0 6 0l-3-8Z"/><path d="M9 20h6"/><path d="M12 6v14"/>',
  packing: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  dispatch:
    '<path d="M1 3h13v10H1z"/><path d="M14 7h4l3 3v3h-7z"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  quality:
    '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  bearing: '<path d="M12 14.5V6"/><circle cx="12" cy="17.5" r="3.4"/><path d="M9 6a3 3 0 0 1 6 0"/>',
  reports: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09A1.65 1.65 0 0 0 20.91 10H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  /** A docket: what the app asked the server for - see the Diagnostic log. */
  log: '<path d="M5 3h11l3 3v15l-2.5-1.5L14 21l-2.5-1.5L9 21l-2.5-1.5L5 21Z"/><path d="M8.5 8h7"/><path d="M8.5 12h7"/><path d="M8.5 16h4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5Z"/>',
  thermo: '<path d="M12 14.8V6"/><circle cx="12" cy="17.5" r="3.2"/>',
  scale:
    '<path d="M12 3v3M5 7h14M5 7 2 15a4 4 0 0 0 6 0L5 7Zm14 0-3 8a4 4 0 0 0 6 0l-3-8ZM9 21h6M12 6v15"/>',
  /** On the field that opens as a search rather than a dropdown - see SearchSelectField. */
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  /** Beside a name that was switched away from the account signed in here. */
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
} as const;

export type IconName = keyof typeof icons;

export default icons;
