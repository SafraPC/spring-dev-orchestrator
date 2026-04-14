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
  FolderImport: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <path d="M1.5 3.5a1 1 0 011-1h3l1.5 1.5h5.5a1 1 0 011 1v7a1 1 0 01-1 1h-10a1 1 0 01-1-1v-8.5z" />
      <path d="M8 6.5v4M6 8.5l2 2 2-2" />
    </svg>
  ),
  Palette: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="none" stroke="currentColor" {...s}>
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="6" cy="5.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="8.5" r="1" fill="currentColor" stroke="none" />
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
  Grip: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5.5" cy="4" r="1" />
      <circle cx="10.5" cy="4" r="1" />
      <circle cx="5.5" cy="8" r="1" />
      <circle cx="10.5" cy="8" r="1" />
      <circle cx="5.5" cy="12" r="1" />
      <circle cx="10.5" cy="12" r="1" />
    </svg>
  ),
  Java: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.851 18.56s-.917.534.653.714c1.902.218 2.874.187 4.969-.211 0 0 .552.346 1.321.646-4.699 2.015-10.633-.118-6.943-1.149m-.575-2.627s-1.028.761.542.924c2.032.209 3.636.227 6.413-.308 0 0 .384.389.987.602-5.679 1.661-12.007.13-7.942-1.218" />
      <path d="M13.116 11.475c1.158 1.333-.304 2.533-.304 2.533s2.939-1.518 1.589-3.418c-1.261-1.772-2.228-2.652 3.007-5.688 0 0-8.216 2.051-4.292 6.573" />
      <path d="M19.33 20.504s.679.559-.747.991c-2.712.822-11.288 1.069-13.669.033-.856-.373.75-.89 1.254-.998.527-.114.828-.093.828-.093-.953-.671-6.156 1.317-2.643 1.886 9.578 1.554 17.462-.7 14.977-1.819M9.292 13.21s-4.362 1.036-1.544 1.412c1.189.159 3.561.123 5.77-.062 1.806-.152 3.618-.477 3.618-.477s-.637.272-1.098.587c-4.429 1.165-12.986.623-10.522-.568 2.082-1.006 3.776-.892 3.776-.892m7.824 4.374c4.503-2.34 2.421-4.589.968-4.285-.356.074-.515.138-.515.138s.132-.207.385-.297c2.875-1.011 5.086 2.981-.929 4.562 0 0 .07-.062.091-.118" />
      <path d="M14.401 0s2.494 2.494-2.365 6.33c-3.896 3.077-.889 4.832 0 6.836-2.274-2.053-3.943-3.858-2.824-5.54 1.644-2.469 6.197-3.665 5.189-7.626" />
      <path d="M9.734 23.924c4.322.277 10.959-.154 11.116-2.198 0 0-.302.775-3.572 1.391-3.688.694-8.239.613-10.937.168 0 0 .553.457 3.393.639" />
    </svg>
  ),
  Next: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.5 12.3L6.2 5.5V11H5V4h1.2l4.9 6.3V4H12v8.3h-.5z" />
    </svg>
  ),
  Nest: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.2 1c-.4 0-.8.2-1 .5.6.2 1 .7 1.1 1.3.1.6-.1 1.2-.5 1.5.1.1.1.2.1.4 0 .6-.5 1-1 1-.2 0-.3 0-.5-.1-.9 1-2.5 1.4-3.8 1-.8-.3-1.4-.8-1.8-1.5-.1.3-.2.6-.2 1 0 2.5 2 4.6 4.5 4.9h.5c2.8 0 5-2.2 5-5C11.5 2.7 10.5 1 9.2 1zM8 14.5c-3.6 0-6.5-2.9-6.5-6.5 0-1.3.4-2.6 1.1-3.6.5 1.3 1.5 2.3 2.9 2.8 1.2.4 2.5.3 3.6-.3C9 7 9 7.1 9 7.2c0 .6-.5 1-1 1-.3 0-.6-.1-.7-.4-.8.8-1.3 1.9-1.3 3.1 0 2.2 1.6 4 3.7 4.3-.5.2-1.1.3-1.7.3z" />
    </svg>
  ),
  ReactIcon: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="1.5" />
      <ellipse cx="8" cy="8" rx="7" ry="2.8" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <ellipse cx="8" cy="8" rx="7" ry="2.8" fill="none" stroke="currentColor" strokeWidth="0.8" transform="rotate(60 8 8)" />
      <ellipse cx="8" cy="8" rx="7" ry="2.8" fill="none" stroke="currentColor" strokeWidth="0.8" transform="rotate(120 8 8)" />
    </svg>
  ),
  Vue: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.8 1H12L8 8 4 1h2.2L8 4.3 9.8 1z" />
      <path d="M4 1L8 8l4-7h-2.2L8 4.3 6.2 1H4z" opacity="0.6" />
      <path d="M1 1l7 13L15 1h-3l-4 7-4-7H1z" opacity="0.3" />
    </svg>
  ),
};
