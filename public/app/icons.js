// Line icons on a 24px grid, drawn with currentColor.
import { html } from "./html.js";

const PATHS = {
  today: "M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11",
  history: "M4 5.5h16v15H4zM4 10h16M8.5 3v4M15.5 3v4",
  progress: "M3 17l6-6 4 4 8-8M15 7h6v6",
  split: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  settings: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  clock: "M12 7.5V12l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  right: "M9 6l6 6-6 6",
  left: "M15 6l-6 6 6 6",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  x: "M6 6l12 12M18 6L6 18",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5.5h3V7a3 3 0 0 1-3 3M7 5.5H4V7a3 3 0 0 0 3 3",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  note: "M4 4h16v11l-5 5H4zM15 20v-5h5",
  cloud: "M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z",
  cloudOff: "M3 3l18 18M8.5 8.2A5 5 0 0 0 7 18h10M19.8 16.7A4 4 0 0 0 19.5 10a6 6 0 0 0-8.7-4.6",
  moon: "M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z",
  play: "M7 4.5l12 7.5-12 7.5z",
  edit: "M4 20h4L19.5 8.5l-4-4L4 16zM13.5 6.5l4 4",
  flame: "M12 22c4 0 7-2.7 7-7 0-4-3-6.5-4-10-2.5 1.5-4 4-4 6.5C9.5 10 9 8.5 9 7c-2 1.5-4 4.5-4 8 0 4.3 3 7 7 7z",
  timer: "M10 2h4M12 14V9M19 13a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  upload: "M12 20V9M7 14l5-5 5 5M5 4h14",
  sync: "M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4",
  github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  copy: "M8 8h12v12H8zM16 8V4H4v12h4"
};

export function Icon({ name, size = 22, stroke = 2, class: className = "" }) {
  return html`<svg class=${`icon ${className}`} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${name === "more" ? 3.2 : stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${PATHS[name] || ""} /></svg>`;
}
