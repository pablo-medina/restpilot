export const en = {
  app: {
    name: "RestPilot",
    tagline: "Your calm co-pilot for REST APIs."
  },
  nav: {
    collection: "Collection",
    variables: "Variables",
    settings: "Settings",
    backToWorkspace: "Back to workspace",
    newFolder: "New folder",
    newRequest: "New request"
  },
  tree: {
    newRequest: "New request",
    newFolder: "New folder",
    rename: "Rename",
    duplicate: "Duplicate",
    delete: "Delete"
  },
  request: {
    duplicate: "Duplicate",
    clear: "Clear",
    send: "Send",
    cancel: "Cancel",
    headers: "Headers",
    raw: "Raw",
    form: "x-form",
    node: "Node",
    rawJson: "JSON",
    rawText: "Plain text",
    rawJsonHint: "application/json",
    rawTextHint: "text/plain",
    formHint: "application/x-www-form-urlencoded",
    nodeHint: "multipart/form-data",
    addField: "Add field",
    body: "Body",
    responseHeaders: "Headers",
    waitingTitle: "Waiting",
    waitingBody: "The server has the floor. You may cancel at any time.",
    failedTitle: "Request failed",
    emptyTitle: "Ready when you are",
    emptyBody: "Send a request and the response will appear here.",
    noTab: "No tab open"
  },
  variables: {
    title: "Variables",
    description: "Use them as ${name} in URLs, headers, raw body, and form fields.",
    add: "Add",
    namePlaceholder: "name",
    valuePlaceholder: "value"
  },
  settings: {
    title: "Settings",
    subtitle: "Application preferences and information.",
    appearance: "Appearance",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    languageSection: "Language",
    language: "Display language",
    languageEn: "English",
    languageEs: "Spanish",
    network: "Network",
    proxy: "Proxy",
    proxyNone: "No proxy",
    proxySystem: "System proxy",
    proxyManual: "Manual proxy",
    proxyHost: "Host",
    proxyPort: "Port",
    proxyUsername: "Username",
    proxyPassword: "Password",
    about: "About",
    aboutAuthor: "Author",
    aboutDescription: "Description",
    aboutLicense: "License",
    aboutText:
      "RestPilot is a lightweight, local-first desktop REST API client with a minimal interface. Requests run natively without browser CORS limits.",
    licenseMit: "MIT License",
    data: "Data",
    clearData: "Clear all data",
    clearDataTitle: "Clear all data",
    clearDataBody:
      "This will permanently remove all requests, folders, variables, and open tabs. Application settings will be kept. This action cannot be undone."
  },
  dialog: {
    ok: "OK",
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save",
    import: "Import",
    close: "Close",
    maximize: "Maximize",
    restore: "Restore"
  },
  messages: {
    configLoadFailed:
      "The configuration file could not be loaded. RestPilot will start with an empty collection.",
    configTitle: "Configuration",
    importCurlTitle: "Import cURL",
    importCurlFailed: "The cURL command could not be parsed.",
    importCurlBody: "RestPilot detected a cURL command in the clipboard.",
    renameTitle: "Rename",
    renameBody: "Enter a clear title.",
    deleteTitle: "Delete",
    deleteBody: 'Delete "{name}" and its contents?'
  },
  pairs: {
    header: "Header",
    value: "Value"
  }
} as const;
