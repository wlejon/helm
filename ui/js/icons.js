/**
 * Helm Vector Icon Substrate
 * Provides crisp, pixel-perfect 16x16 and 20x20 monochrome SVG vector icons
 * for native desktop operating system UI components, replacing all emojis.
 */

const SVG_ICONS = {
  // Navigation & Window Controls
  search: '<path d="M21 21l-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0 0116 0z"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',

  // Categories
  audio: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/>',
  display: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  network: '<path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>',
  power: '<path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/>',
  appearance: '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0110 10 3 3 0 01-3 3h-1a2 2 0 00-2 2 2 2 0 01-2 2 10 10 0 01-2-17z"/>',
  shortcuts: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8"/>',
  system: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>',
  command: '<path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z"/>',
  pin: '<path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>',

  // Audio Endpoints & Controls
  speaker: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>',
  mic: '<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>',
  micMute: '<path d="M1 1l22 22M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a6.97 6.97 0 01-1.1 3.75M12 19v4M8 23h8"/>',
  volumeMute: '<path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',

  // Network & Connectivity
  wifi: '<path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>',
  wifiLock: '<path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0"/><rect x="15" y="14" width="7" height="6" rx="1"/><path d="M17 14v-2a1.5 1.5 0 013 0v2"/>',
  ethernet: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 8v4M15 8v4M9 16h6"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>',

  // Power & Hardware
  battery: '<rect x="1" y="6" width="18" height="12" rx="2"/><path d="M23 10v4"/>',
  batteryCharging: '<rect x="1" y="6" width="18" height="12" rx="2"/><path d="M23 10v4M11 9l-3 4h4l-2 4"/>',
  desktopAc: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M10 9h4"/>',
  plug: '<path d="M18 10h-2V7a2 2 0 00-2-2H10a2 2 0 00-2 2v3H6a2 2 0 00-2 2v2a2 2 0 002 2h12a2 2 0 002-2v-2a2 2 0 00-2-2zM9 2v3M15 2v3M12 17v5"/>',
  sleep: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
  restart: '<path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3L21.5 8M22 12.5a10 10 0 01-18.8 4.2L2.5 16"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
  shutdown: '<path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/>',
  performance: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  balanced: '<path d="M12 3v18M3 9l9-6 9 6M3 9a6 6 0 0012 0M15 9a6 6 0 006 0"/>',
  eco: '<path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.5 21 2c-.5 4-1 5.5-2.1 11.2A7 7 0 0111 20zM2 21c0-4 3-7 8-8"/>',

  // Appearance & Themes
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  moon: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
  autoTheme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 000 18z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',

  // Hardware Chips
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/>',
  gpu: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h4v4H6zM14 10h4v4h-4zM2 12h2M20 12h2"/>',
  ram: '<rect x="2" y="6" width="20" height="12" rx="1"/><path d="M6 18v2M10 18v2M14 18v2M18 18v2M6 6v2M10 6v2M14 6v2M18 6v2"/>',
  uptime: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',

  // Shell & Panel
  bell: '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>',
  window: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20"/>',
  terminal: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  app: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
};

/**
 * Returns raw SVG string for an icon.
 */
export function getIconSvg(name, size = 16, className = '') {
  const content = SVG_ICONS[name] || SVG_ICONS.app;
  const cls = className ? `class="helm-icon ${className}"` : 'class="helm-icon"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${cls}>${content}</svg>`;
}

/**
 * Creates and returns an SVG element for direct DOM insertion.
 */
export function createIcon(name, size = 16, className = '') {
  const wrapper = document.createElement('span');
  wrapper.className = `icon-wrap ${className}`.trim();
  wrapper.innerHTML = getIconSvg(name, size);
  return wrapper.firstElementChild;
}
