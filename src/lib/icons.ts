/** Compact icon family built on a consistent 16 × 16 grid. */

function strokeIcon(body: string, size = 16): string {
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function solidIcon(body: string, size = 16): string {
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${body}</svg>`;
}

export const iconFolderAdd = strokeIcon('<path d="M2.25 5.25h4l1.3 1.5h6.2v6H2.25z"/><path d="M2.25 5.25v-1.5h3.5L7 5.25"/><path d="M9 9.75h3M10.5 8.25v3"/>');

export const iconRequestAdd = strokeIcon('<path d="M4 2.25h5l3 3v8.5H4z"/><path d="M9 2.25v3h3M6.25 9.5h3.5M8 7.75v3.5"/>');

export const iconRename = strokeIcon('<path d="m3 13 .65-2.65 7.4-7.4 2 2-7.4 7.4zM9.8 4.2l2 2"/>', 14);

export const iconCopy = strokeIcon('<rect x="5" y="5" width="8" height="8.25" rx="1.25"/><path d="M3 10.75V3h7.25"/>');

export const iconSettings = strokeIcon('<path d="m8 1.75 1.1 1.35 1.75-.25.55 1.65 1.6.75-.55 1.7L13.75 8l-1.3 1.05.55 1.7-1.6.75-.55 1.65-1.75-.25L8 14.25 6.9 12.9l-1.75.25-.55-1.65-1.6-.75.55-1.7L2.25 8l1.3-1.05L3 5.25l1.6-.75.55-1.65 1.75.25z"/><circle cx="8" cy="8" r="2.1"/>');

export const iconExport = strokeIcon('<path d="M8 10.5v-8M5.25 5.25 8 2.5l2.75 2.75M3 9.75v3.5h10v-3.5"/>');

export const iconImport = strokeIcon('<path d="M8 2.5v8M5.25 7.75 8 10.5l2.75-2.75M3 9.75v3.5h10v-3.5"/>');

export const iconClipboard = strokeIcon('<rect x="4" y="3.5" width="8" height="10.5" rx="1.25"/><path d="M6 3.5V2.75a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V3.5"/><path d="M6.25 7.5h3.5M6.25 10h3.5"/>');

/** Collection root — a stack of sheets, i.e. the whole collection rather than one folder. */
export const iconCollection = strokeIcon('<path d="M4.5 2.75h7M2.75 5.25h10.5"/><rect x="2.25" y="7.75" width="11.5" height="5.5" rx="1.25"/>', 14);

export const iconChevronRight = strokeIcon('<path d="m6 3.75 4.25 4.25L6 12.25"/>', 14);

export const iconChevronLeft = strokeIcon('<path d="m10 3.75-4.25 4.25L10 12.25"/>', 14);

export const iconSearch = strokeIcon('<circle cx="7" cy="7" r="4.25"/><path d="m10.2 10.2 3.3 3.3"/>');

export const iconEye = strokeIcon('<path d="M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>');

export const iconEyeOff = strokeIcon('<path d="M2 2l12 12M3.65 4.15A8.8 8.8 0 0 0 1.5 8S4 12.25 8 12.25c1.05 0 2-.3 2.85-.75M6.35 3.95A6.3 6.3 0 0 1 8 3.75c4 0 6.5 4.25 6.5 4.25a10.2 10.2 0 0 1-1.65 2.15M6.55 6.55A2 2 0 0 0 9.45 9.45"/>');

/** Funnel — an extractor narrows a response down to one value. */
export const iconExtractor = strokeIcon('<path d="M2.75 3.5h10.5L9.25 8.25v4.9l-2.5-1.65V8.25z"/>');

export const iconPlus = strokeIcon('<path d="M8 2.75v10.5M2.75 8h10.5"/>');

export const iconMoreHorizontal = strokeIcon('<circle cx="3.25" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="12.75" cy="8" r=".9" fill="currentColor" stroke="none"/>');

export const iconSidebar = strokeIcon('<rect x="2.25" y="2.5" width="11.5" height="11" rx="1.5"/><path d="M5.75 2.75v10.5"/>');

export const iconPlay = solidIcon('<path d="M5 3.15v9.7L12.75 8z"/>');

export const iconBookmark = strokeIcon('<path d="M4 2.5h8v11l-4-2.75L4 13.5z"/>');

export const iconOpenExternal = strokeIcon('<path d="M9.25 2.75h4v4M8 8l5.25-5.25"/><path d="M12 9.25v4H2.75V4h4"/>', 14);

export const iconCross = strokeIcon('<path d="m4 4 8 8M12 4l-8 8"/>', 14);

/** Window chrome controls, on a 12 × 12 grid — shared by the title bar and dialog headers. */
function windowIcon(body: string): string {
  return `<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const iconWindowMinimize = windowIcon('<path d="M2 6h8"/>');

export const iconWindowMaximize = windowIcon('<rect x="2.5" y="2.5" width="7" height="7" rx="1"/>');

export const iconWindowRestore = windowIcon('<path d="M4 4.5V3.5a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1V8a1 1 0 0 1-1 1h-1"/><rect x="1.5" y="4.5" width="7" height="6" rx="1"/>');

export const iconWindowClose = windowIcon('<path d="m3 3 6 6M9 3l-6 6"/>');
