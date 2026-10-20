// Line icons on a 24px grid in the spirit of SF Symbols, drawn with currentColor.
import { html } from "./html.js";

const PATHS = {
  today: "M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11",
  history: "M4 7a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 7v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18zM4 9.5h16M8.5 2.5v3.5M15.5 2.5v3.5",
  progress: "M4 4v16h16M8 15l3.5-4 3 2.5L20 7",
  split: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  settings: "M20 7h-9M14 17H4M17 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  chevronLeft: "M15 4.5L7.5 12l7.5 7.5",
  chevronRight: "M9 5l7 7-7 7",
  chevronUp: "M6 15l6-6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6L6 18",
  more: "M5.5 12h.01M12 12h.01M18.5 12h.01",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  clock: "M12 7.5V12l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM21 21l-5.2-5.2",
  trophy: "M8 21h8M12 16.5V21M7 4h10v5a5 5 0 0 1-10 0zM17 5.5h3V7a3 3 0 0 1-3 3M7 5.5H4V7a3 3 0 0 0 3 3",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  arrowDown: "M12 5v14M18 13l-6 6-6-6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  note: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  cloud: "M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z",
  moon: "M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z",
  play: "M7 4.5l12 7.5-12 7.5z",
  flame: "M12 22c4 0 7-2.7 7-7 0-4-3-6.5-4-10-2.5 1.5-4 4-4 6.5C9.5 10 9 8.5 9 7c-2 1.5-4 4.5-4 8 0 4.3 3 7 7 7z",
  timer: "M10 2h4M12 14V9.5M19 13.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  upload: "M12 15V4M7 9l5-5 5 5M5 20h14",
  sync: "M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4",
  github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  link: "M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5",
  unlink: "M18.8 13.4l1.3-1.3a5 5 0 0 0-7.1-7.1l-1.3 1.3M5.2 10.6l-1.3 1.3a5 5 0 0 0 7.1 7.1l1.3-1.3M8 2v3M2 8h3M16 22v-3M22 16h-3",
  plates: "M2 12h20M6.5 7.5v9M9.5 5v14M14.5 5v14M17.5 7.5v9",
  scale: "M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 10a4 4 0 0 1 8 0M12 10l1.6-2.2",
  hide: "M3 5h18v10H3zM7 8h.01M10.5 8h.01M14 8h.01M17.5 8h.01M8 11.5h8M9.5 18.5L12 21l2.5-2.5",
  backspace: "M21 5H8.5L2 12l6.5 7H21zM11.5 9l6 6M17.5 9l-6 6",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  peek: "M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  calendarPlus: "M4 7a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 7v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18zM4 9.5h16M12 12.5v5M9.5 15h5"
};

const FILLED = new Set(["play"]);

export function Icon({ name, size = 22, stroke = 2, class: className = "" }) {
  const filled = FILLED.has(name);
  return html`<svg class=${`icon ${className}`} width=${size} height=${size} viewBox="0 0 24 24" fill=${filled ? "currentColor" : "none"} stroke="currentColor" stroke-width=${name === "more" ? stroke + 1.4 : stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${PATHS[name] || ""} /></svg>`;
}
