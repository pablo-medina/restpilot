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

export const iconDuplicate = strokeIcon('<rect x="5" y="4.75" width="8" height="8.25" rx="1.25"/><path d="M3 10.75V3h7.25M7.25 8.9h3.5M9 7.15v3.5"/>', 14);

export const iconRemove = strokeIcon('<path d="M3.25 4.5h9.5M6 2.75h4M4.5 4.5l.5 8.75h6l.5-8.75M6.75 7v3.75M9.25 7v3.75"/>', 14);

export const iconCopy = strokeIcon('<rect x="5" y="5" width="8" height="8.25" rx="1.25"/><path d="M3 10.75V3h7.25"/>');

export const iconStream = strokeIcon('<path d="M2 5.25c1.75 0 1.75-2.25 3.5-2.25S7.25 5.25 9 5.25 10.75 3 12.5 3M3.5 12.75c1.75 0 1.75-2.25 3.5-2.25s1.75 2.25 3.5 2.25 1.75-2.25 3.5-2.25"/>');

export const iconVariables = strokeIcon('<path d="M6 3.25H5c-.8 0-1.25.45-1.25 1.25v1.25c0 1-.45 1.75-1.5 2.25 1.05.5 1.5 1.25 1.5 2.25v1.25c0 .8.45 1.25 1.25 1.25h1M10 3.25h1c.8 0 1.25.45 1.25 1.25v1.25c0 1 .45 1.75 1.5 2.25-1.05.5-1.5 1.25-1.5 2.25v1.25c0 .8-.45 1.25-1.25 1.25h-1"/><circle cx="8" cy="8" r=".8" fill="currentColor" stroke="none"/>');

export const iconLayers = strokeIcon('<path d="m2.5 5.25 5.5-3 5.5 3-5.5 3zM2.5 8.25l5.5 3 5.5-3M2.5 11l5.5 3 5.5-3"/>');

export const iconSettings = strokeIcon('<path d="m8 1.75 1.1 1.35 1.75-.25.55 1.65 1.6.75-.55 1.7L13.75 8l-1.3 1.05.55 1.7-1.6.75-.55 1.65-1.75-.25L8 14.25 6.9 12.9l-1.75.25-.55-1.65-1.6-.75.55-1.7L2.25 8l1.3-1.05L3 5.25l1.6-.75.55-1.65 1.75.25z"/><circle cx="8" cy="8" r="2.1"/>');

export const iconSun = strokeIcon('<circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9"/>');

export const iconMoon = strokeIcon('<path d="M13.5 10.25A5.75 5.75 0 0 1 5.75 2.5a5.75 5.75 0 1 0 7.75 7.75z"/>');

export const iconExport = strokeIcon('<path d="M8 10.5v-8M5.25 5.25 8 2.5l2.75 2.75M3 9.75v3.5h10v-3.5"/>');

export const iconImport = strokeIcon('<path d="M8 2.5v8M5.25 7.75 8 10.5l2.75-2.75M3 9.75v3.5h10v-3.5"/>');

export const iconKey = strokeIcon('<circle cx="5.5" cy="9.5" r="2.5"/><path d="m7.4 7.6 4.85-4.85M10.25 4.75l1 1M11.5 3.5l1 1"/>');

export const iconChevronRight = strokeIcon('<path d="m6 3.75 4.25 4.25L6 12.25"/>', 14);

export const iconChevronLeft = strokeIcon('<path d="m10 3.75-4.25 4.25L10 12.25"/>', 14);

export const iconSearch = strokeIcon('<circle cx="7" cy="7" r="4.25"/><path d="m10.2 10.2 3.3 3.3"/>');

export const iconEye = strokeIcon('<path d="M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>');

export const iconEyeOff = strokeIcon('<path d="M2 2l12 12M3.65 4.15A8.8 8.8 0 0 0 1.5 8S4 12.25 8 12.25c1.05 0 2-.3 2.85-.75M6.35 3.95A6.3 6.3 0 0 1 8 3.75c4 0 6.5 4.25 6.5 4.25a10.2 10.2 0 0 1-1.65 2.15M6.55 6.55A2 2 0 0 0 9.45 9.45"/>');

export const iconFunction = strokeIcon('<path d="m5.5 3.5-3 4.5 3 4.5M10.5 3.5l3 4.5-3 4.5M9 2.75l-2 10.5"/>');

export const iconFunctionAdd = strokeIcon('<path d="m4.75 4.25-2.5 3.75 2.5 3.75M8 4.25 6.5 11.75M11.75 9.5v4M9.75 11.5h4"/>');

export const iconPlus = strokeIcon('<path d="M8 2.75v10.5M2.75 8h10.5"/>');

export const iconMoreHorizontal = strokeIcon('<circle cx="3.25" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="12.75" cy="8" r=".9" fill="currentColor" stroke="none"/>');

export const iconSidebar = strokeIcon('<rect x="2.25" y="2.5" width="11.5" height="11" rx="1.5"/><path d="M5.75 2.75v10.5"/>');

export const iconPlay = solidIcon('<path d="M5 3.15v9.7L12.75 8z"/>');

export const iconBookmark = strokeIcon('<path d="M4 2.5h8v11l-4-2.75L4 13.5z"/>');
