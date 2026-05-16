export const es = {
  app: {
    name: "RestPilot",
    tagline: "Su copiloto sobrio para APIs REST."
  },
  nav: {
    collection: "Colección",
    variables: "Variables",
    settings: "Configuración",
    backToWorkspace: "Volver al espacio de trabajo",
    newFolder: "Nueva carpeta",
    newRequest: "Nueva solicitud"
  },
  tree: {
    newRequest: "Nueva solicitud",
    newFolder: "Nueva carpeta",
    rename: "Renombrar",
    duplicate: "Duplicar",
    delete: "Eliminar"
  },
  request: {
    duplicate: "Duplicar",
    clear: "Limpiar",
    send: "Enviar",
    cancel: "Cancelar",
    headers: "Encabezados",
    raw: "Raw",
    form: "x-form",
    node: "Node",
    rawJson: "JSON",
    rawText: "Texto plano",
    rawJsonHint: "application/json",
    rawTextHint: "text/plain",
    formHint: "application/x-www-form-urlencoded",
    nodeHint: "multipart/form-data",
    addField: "Agregar campo",
    body: "Cuerpo",
    responseHeaders: "Encabezados",
    waitingTitle: "En espera",
    waitingBody: "El servidor está procesando la solicitud. Puede cancelarla en cualquier momento.",
    failedTitle: "La solicitud falló",
    emptyTitle: "Listo cuando lo esté",
    emptyBody: "Envíe una solicitud y la respuesta aparecerá aquí.",
    noTab: "No hay pestañas abiertas"
  },
  variables: {
    title: "Variables",
    description: "Utilícelas como ${name} en URLs, encabezados, cuerpo en texto plano y campos de formulario.",
    add: "Agregar",
    namePlaceholder: "nombre",
    valuePlaceholder: "valor"
  },
  settings: {
    title: "Configuración",
    subtitle: "Preferencias de la aplicación e información general.",
    appearance: "Apariencia",
    theme: "Tema",
    themeLight: "Claro",
    themeDark: "Oscuro",
    languageSection: "Idioma",
    language: "Idioma de la interfaz",
    languageEn: "Inglés",
    languageEs: "Español",
    network: "Red",
    proxy: "Proxy",
    proxyNone: "Sin proxy",
    proxySystem: "Proxy del sistema",
    proxyManual: "Proxy manual",
    proxyHost: "Host",
    proxyPort: "Puerto",
    proxyUsername: "Usuario",
    proxyPassword: "Contraseña",
    about: "Acerca de",
    aboutAuthor: "Autor",
    aboutDescription: "Descripción",
    aboutLicense: "Licencia",
    aboutText:
      "RestPilot es un cliente REST de escritorio, local y ligero, con una interfaz mínima. Las solicitudes se ejecutan de forma nativa, sin las limitaciones CORS del navegador.",
    licenseMit: "Licencia MIT",
    data: "Datos",
    clearData: "Borrar todos los datos",
    clearDataTitle: "Borrar todos los datos",
    clearDataBody:
      "Se eliminarán de forma permanente todas las solicitudes, carpetas, variables y pestañas abiertas. Se conservará la configuración de la aplicación. Esta acción no se puede deshacer."
  },
  dialog: {
    ok: "Aceptar",
    cancel: "Cancelar",
    confirm: "Confirmar",
    save: "Guardar",
    import: "Importar",
    close: "Cerrar",
    maximize: "Maximizar",
    restore: "Restaurar"
  },
  messages: {
    configLoadFailed:
      "No se pudo cargar el archivo de configuración. RestPilot iniciará con una colección vacía.",
    configTitle: "Configuración",
    importCurlTitle: "Importar cURL",
    importCurlFailed: "No se pudo interpretar el comando cURL.",
    importCurlBody: "RestPilot detectó un comando cURL en el portapapeles.",
    renameTitle: "Renombrar",
    renameBody: "Ingrese un título claro.",
    deleteTitle: "Eliminar",
    deleteBody: '¿Desea eliminar "{name}" y su contenido?'
  },
  pairs: {
    header: "Encabezado",
    value: "Valor"
  }
} as const;
