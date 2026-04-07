const s = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.5 };

export const Icon = {
  Play: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.5 2.5a.75.75 0 011.137-.643l8 4.8a.75.75 0 010 1.286l-8 4.8A.75.75 0 014.5 12.1V2.5z" />
    </svg>
  ),
  Stop: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
    </svg>
  ),
  Restart: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M2.5 3v3.5H6M13.5 13V9.5H10" />
      <path d="M4.2 9.5A4.5 4.5 0 018 4a4.5 4.5 0 013.8 2.1m0 0M11.8 6.5A4.5 4.5 0 018 12a4.5 4.5 0 01-3.8-2.1" />
    </svg>
  ),
  Trash: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M5.5 2.5h5M2.5 4.5h11M10.5 4.5v7.5a1 1 0 01-1 1h-3a1 1 0 01-1-1v-7.5M6.5 7v3.5M9.5 7v3.5" />
    </svg>
  ),
  Plus: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
  Search: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <circle cx="7" cy="7" r="4" />
      <path d="M13 13l-3-3" />
    </svg>
  ),
  Copy: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <rect x="5.5" y="5.5" width="7" height="7" rx="1" />
      <path d="M3.5 10.5v-7a1 1 0 011-1h7" />
    </svg>
  ),
  Folder: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M2.5 4.5v7a1 1 0 001 1h9a1 1 0 001-1v-5a1 1 0 00-1-1H8L6.5 4h-3a1 1 0 00-1 .5z" />
    </svg>
  ),
  Terminal: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M4 5l3 3-3 3M8.5 11H12" />
    </svg>
  ),
  Code: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" />
    </svg>
  ),
  Globe: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M2.5 8h11M8 2.5c-2 2-2 9 0 11M8 2.5c2 2 2 9 0 11" />
    </svg>
  ),
  Dots: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3.5" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="8" cy="12.5" r="1.25" />
    </svg>
  ),
  Chevron: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M10 4l-4 4 4 4" />
    </svg>
  ),
  Scan: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M2 5V3a1 1 0 011-1h2M11 2h2a1 1 0 011 1v2M14 11v2a1 1 0 01-1 1h-2M5 14H3a1 1 0 01-1-1v-2M5 8h6M8 5v6" />
    </svg>
  ),
  Eraser: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M4 12h8M5 8l6-6M3.5 9.5l3 3 7-7-3-3-7 7z" />
    </svg>
  ),
  ArrowDown: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M8 3v10M4 9l4 4 4-4" />
    </svg>
  ),
  Box: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M14 5L8 2 2 5v6l6 3 6-3V5zM2 5l6 3M8 14V8M14 5l-6 3" />
    </svg>
  ),
  Import: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M8 2v8M4 6l4 4 4-4M2.5 11v1.5a1 1 0 001 1h9a1 1 0 001-1V11" />
    </svg>
  ),
  Log: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M4 4h8M4 7h6M4 10h8M4 13h4" />
    </svg>
  ),
  Check: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M3.5 8.5l3 3 6-6" />
    </svg>
  ),
  X: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  ),
  Settings: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
    </svg>
  ),
  ZoomIn: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <circle cx="7" cy="7" r="4" />
      <path d="M13 13l-3-3M7 5v4M5 7h4" />
    </svg>
  ),
  Pencil: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" />
    </svg>
  ),
  ZoomOut: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <circle cx="7" cy="7" r="4" />
      <path d="M13 13l-3-3M5 7h4" />
    </svg>
  ),
};
