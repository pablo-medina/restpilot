import type { FolderExportSnapshot } from "./folder-snapshot";
import type { HtmlExportVariable } from "./folder-variables";

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const HTML_STYLES = `
:root {
  color-scheme: light;
  --bg: #f3efe6;
  --bg-accent: rgba(61, 127, 111, 0.07);
  --surface: rgba(255, 252, 246, 0.88);
  --surface-muted: rgba(255, 255, 255, 0.55);
  --border: rgba(52, 48, 42, 0.1);
  --border-strong: rgba(52, 48, 42, 0.16);
  --text: #2d2924;
  --muted: #7a7167;
  --accent: #3d7f6f;
  --accent-soft: rgba(61, 127, 111, 0.11);
  --danger: #b54a3a;
  --mono: "Cascadia Code", "Consolas", "SFMono-Regular", monospace;
  --sans: "Segoe UI", system-ui, -apple-system, sans-serif;
  --radius: 10px;
  --inset: 18px;
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  font-family: var(--sans);
  color: var(--text);
  background:
    radial-gradient(circle at 12% 0%, var(--bg-accent), transparent 28%),
    linear-gradient(180deg, #f8f5ef 0%, var(--bg) 100%);
}
button, input, select { font: inherit; }
button { cursor: pointer; }
.app {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  height: 100vh;
  min-height: 0;
}
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--surface-muted);
  backdrop-filter: blur(14px);
}
.brand {
  padding: 20px var(--inset) 14px;
}
.brand h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.brand p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 11px;
}
.tree-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 8px 10px;
}
.vars-wrap {
  border-top: 1px solid var(--border);
  padding: 12px var(--inset) 16px;
  max-height: 34vh;
  overflow: auto;
}
.vars-wrap h2 {
  margin: 0 0 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.tree button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 7px 10px;
  border-radius: 8px;
}
.tree button:hover,
.tree button.active {
  background: var(--accent-soft);
}
.tree .folder {
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.02em;
}
.tree .request-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.method {
  flex-shrink: 0;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.method-get { color: #2f7d4f; }
.method-post { color: #9a6a1f; }
.method-put { color: #2f5f9a; }
.method-patch { color: #7a5a9a; }
.method-delete { color: var(--danger); }
.main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.empty {
  margin: auto;
  max-width: 320px;
  padding: 24px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}
.panel {
  display: none;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.panel.visible { display: flex; }
.workspace-head {
  flex-shrink: 0;
  padding: 18px var(--inset) 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.workspace-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.request-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  min-width: 0;
}
.url-bar {
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-muted);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted);
  word-break: break-all;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.primary {
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 650;
}
.primary:disabled {
  opacity: 0.45;
  cursor: default;
}
.notice {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.45;
}
.workspace-tabs {
  display: flex;
  gap: 4px;
  padding: 10px var(--inset) 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.workspace-tabs button {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
  padding: 8px 2px;
  margin: 0 12px 0 0;
  border-bottom: 2px solid transparent;
}
.workspace-tabs button.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.main-pane {
  display: none;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.main-pane.visible { display: flex; }
.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px var(--inset) 0;
  flex-wrap: wrap;
}
.segmented {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
}
.segmented button {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  padding: 0 12px;
  height: 28px;
  border-radius: 6px;
}
.segmented button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(28, 26, 23, 0.06);
}
.detail-content,
.response-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px var(--inset) var(--inset);
}
.detail-pane {
  display: none;
  min-height: 100%;
}
.detail-pane.visible { display: block; }
.kv {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.kv td {
  padding: 10px 0;
  border-bottom: 1px solid rgba(52, 48, 42, 0.06);
  vertical-align: top;
}
.kv tr:last-child td { border-bottom: 0; }
.kv td:first-child {
  width: 30%;
  padding-right: 16px;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 12px;
}
.code-block {
  margin: 0;
  min-height: 180px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-muted);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.empty-pane {
  margin: 0;
  padding: 28px 8px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
.response-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px var(--inset) 0;
  font-size: 13px;
  color: var(--muted);
}
.status-ok { color: #2f7d4f; font-weight: 700; }
.status-error { color: var(--danger); font-weight: 700; }
.var-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 6px;
}
.var-row input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 9px;
  background: rgba(255, 255, 255, 0.82);
  font-size: 12px;
}
@media (max-width: 860px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    height: auto;
    min-height: 100vh;
  }
  .sidebar {
    max-height: 38vh;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .workspace-head,
  .workspace-tabs,
  .detail-toolbar,
  .detail-content,
  .response-content,
  .response-meta {
    padding-left: 14px;
    padding-right: 14px;
  }
  .brand,
  .vars-wrap {
    padding-left: 14px;
    padding-right: 14px;
  }
}
`;

const HTML_SCRIPT = `
(function () {
  const data = JSON.parse(document.getElementById("rp-data").textContent || "{}");
  const state = {
    selectedId: null,
    mainTab: "request",
    detailTab: "body",
    responseTab: "body",
    variables: (data.variables || []).map((v) => ({ ...v, enabled: true })),
    lastResponse: null
  };

  const treeEl = document.getElementById("tree");
  const panelEl = document.getElementById("panel");
  const emptyEl = document.getElementById("empty");
  const globalsEl = document.getElementById("globals");
  const sendBtn = document.getElementById("send-btn");

  function effectiveVariables() {
    return state.variables.filter((variable) => String(variable.name || "").trim());
  }

  function applyVars(text, vars) {
    return String(text ?? "").replace(/\\$\\{([^}]+)\\}/g, (_, name) => {
      const variable = vars.find((item) => item.enabled !== false && item.name === String(name).trim());
      return variable ? String(variable.value ?? "") : "";
    });
  }

  function buildUrl(request, vars) {
    const base = applyVars(request.url, vars).trim();
    const params = (request.queryParams || [])
      .filter((pair) => pair.enabled !== false && String(pair.key || "").trim())
      .map((pair) => [applyVars(pair.key, vars), applyVars(pair.value, vars)]);
    let url = base;
    if (params.length) {
      const query = params
        .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
        .join("&");
      url += (url.includes("?") ? "&" : "?") + query;
    }
    if (request.auth?.type === "apikey" && request.auth.apiKeyIn === "query") {
      const name = applyVars(request.auth.apiKeyName || "", vars).trim();
      if (name) {
        const value = applyVars(request.auth.apiKeyValue || "", vars);
        url += (url.includes("?") ? "&" : "?") + encodeURIComponent(name) + "=" + encodeURIComponent(value);
      }
    }
    const hash = applyVars(request.urlHash || "", vars).replace(/^#/, "");
    if (hash) url += "#" + hash;
    return url;
  }

  function buildHeaders(request, vars) {
    const headers = {};
    for (const header of request.headers || []) {
      if (header.enabled === false || !String(header.key || "").trim()) continue;
      headers[applyVars(header.key, vars).trim()] = applyVars(header.value, vars);
    }
    const auth = request.auth || { type: "none" };
    delete headers.Authorization;
    delete headers.authorization;
    if (auth.type === "bearer") {
      const token = applyVars(auth.bearerToken || "", vars).trim();
      if (token) headers.Authorization = "Bearer " + token;
    } else if (auth.type === "basic") {
      const user = applyVars(auth.basicUsername || "", vars);
      const pass = applyVars(auth.basicPassword || "", vars);
      if (user || pass) headers.Authorization = "Basic " + btoa(user + ":" + pass);
    } else if (auth.type === "apikey" && auth.apiKeyIn !== "query") {
      const name = applyVars(auth.apiKeyName || "", vars).trim();
      if (name) headers[name] = applyVars(auth.apiKeyValue || "", vars);
    }
    return headers;
  }

  function ensureContentType(request, headers) {
    const has = Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
    if (has) return headers;
    if (request.bodyMode === "form") return { ...headers, "Content-Type": "application/x-www-form-urlencoded" };
    if (request.bodyMode === "graphql") return { ...headers, "Content-Type": "application/json" };
    if (request.bodyMode === "raw" && String(request.body || "").trim()) {
      if (request.rawType === "json") return { ...headers, "Content-Type": "application/json" };
      if (request.rawType === "xml") return { ...headers, "Content-Type": "application/xml" };
      return { ...headers, "Content-Type": "text/plain" };
    }
    return headers;
  }

  function buildBody(request, vars) {
    if (request.bodyMode === "none") return undefined;
    if (request.bodyMode === "raw") return applyVars(request.body || "", vars);
    if (request.bodyMode === "graphql") {
      let variables = {};
      if (request.graphqlVariables) {
        try { variables = JSON.parse(applyVars(request.graphqlVariables, vars)); } catch (_) {}
      }
      return JSON.stringify({ query: applyVars(request.body || "", vars), variables });
    }
    if (request.bodyMode === "form") {
      const params = new URLSearchParams();
      for (const field of request.form || []) {
        if (field.enabled === false || !String(field.key || "").trim()) continue;
        params.append(applyVars(field.key, vars), applyVars(field.value, vars));
      }
      return params.toString();
    }
    return null;
  }

  function methodClass(method) {
    const key = String(method || "GET").toLowerCase();
    return "method method-" + (["get", "post", "put", "patch", "delete"].includes(key) ? key : "get");
  }

  function requestById(id) {
    return (data.requests || []).find((item) => item.id === id) || null;
  }

  function hasBodyContent(request) {
    if (request.bodyMode === "raw" || request.bodyMode === "graphql") {
      return Boolean(String(request.body || "").trim() || String(request.graphqlVariables || "").trim());
    }
    if (request.bodyMode === "form" || request.bodyMode === "multipart") {
      return (request.form || []).some((field) => field.enabled !== false && String(field.key || "").trim());
    }
    if (request.bodyMode === "binary") return Boolean(request.binaryFilePath);
    return request.bodyMode !== "none";
  }

  function hasParams(request) {
    return (request.queryParams || []).some((pair) => pair.enabled !== false && String(pair.key || "").trim());
  }

  function hasHeaders(request) {
    return (request.headers || []).some((pair) => pair.enabled !== false && String(pair.key || "").trim());
  }

  function defaultDetailTab(request) {
    if (hasBodyContent(request)) return "body";
    if (hasParams(request)) return "params";
    if (hasHeaders(request)) return "headers";
    if (request.auth?.type && request.auth.type !== "none") return "auth";
    return "body";
  }

  function setMainTab(tab) {
    state.mainTab = tab;
    document.querySelectorAll("[data-main-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mainTab === tab);
    });
    document.getElementById("main-request").classList.toggle("visible", tab === "request");
    document.getElementById("main-response").classList.toggle("visible", tab === "response");
  }

  function setDetailTab(tab) {
    state.detailTab = tab;
    document.querySelectorAll("[data-detail-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.detailTab === tab);
    });
    document.querySelectorAll(".detail-pane").forEach((pane) => {
      pane.classList.toggle("visible", pane.id === "pane-" + tab);
    });
  }

  function setResponseTab(tab) {
    state.responseTab = tab;
    document.querySelectorAll("[data-response-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.responseTab === tab);
    });
    document.getElementById("response-body-pane").classList.toggle("visible", tab === "body");
    document.getElementById("response-headers-pane").classList.toggle("visible", tab === "headers");
  }

  function renderTree() {
    treeEl.innerHTML = "";
    for (const node of data.tree || []) renderTreeNode(node, 0);
  }

  function renderTreeNode(node, depth) {
    if (node.kind === "folder") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "folder";
      btn.style.paddingLeft = (10 + depth * 12) + "px";
      btn.textContent = node.title;
      treeEl.appendChild(btn);
      for (const child of node.children || []) renderTreeNode(child, depth + 1);
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.requestId = node.id;
    btn.className = state.selectedId === node.id ? "active" : "";
    btn.style.paddingLeft = (10 + depth * 12) + "px";
    btn.innerHTML =
      '<span class="' + methodClass(node.method) + '">' + escapeHtml(node.method || "GET") + "</span>" +
      '<span class="request-label">' + escapeHtml(node.title) + "</span>";
    btn.addEventListener("click", () => selectRequest(node.id));
    treeEl.appendChild(btn);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pairsTable(pairs) {
    const rows = (pairs || [])
      .filter((pair) => pair.enabled !== false && (String(pair.key || "").trim() || String(pair.value || "").trim()))
      .map((pair) => "<tr><td>" + escapeHtml(pair.key) + "</td><td>" + escapeHtml(pair.value) + "</td></tr>")
      .join("");
    return rows
      ? '<table class="kv"><tbody>' + rows + "</tbody></table>"
      : '<p class="empty-pane">No values</p>';
  }

  function requestBodyText(request) {
    if (request.bodyMode === "form" || request.bodyMode === "multipart") {
      return JSON.stringify(request.form || [], null, 2);
    }
    if (request.bodyMode === "graphql" && request.graphqlVariables) {
      return (request.body || "") + "\\n\\n" + (request.graphqlVariables || "");
    }
    return request.body || "";
  }

  function renderResponse() {
    const meta = document.getElementById("response-meta");
    const bodyEl = document.getElementById("response-body");
    const headersEl = document.getElementById("response-headers");
    const response = state.lastResponse;

    if (!response) {
      meta.innerHTML = "";
      bodyEl.textContent = "Send a request to see the response here.";
      headersEl.textContent = "";
      return;
    }

    if (response.pending) {
      meta.innerHTML = "<span>Sending…</span>";
      bodyEl.textContent = "";
      headersEl.textContent = "";
      return;
    }

    if (response.error) {
      meta.innerHTML = '<span class="status-error">Request failed</span><span>' + escapeHtml(response.duration) + " ms</span>";
      bodyEl.textContent = response.error;
      headersEl.textContent = "";
      setResponseTab("body");
      return;
    }

    const statusClass = response.ok ? "status-ok" : "status-error";
    meta.innerHTML =
      '<span class="' + statusClass + '">' + response.status + " " + escapeHtml(response.statusText) + "</span>" +
      "<span>" + response.duration + " ms</span>";
    bodyEl.textContent = response.body || "";
    headersEl.textContent = response.headersText || "";
  }

  function selectRequest(id) {
    state.selectedId = id;
    state.mainTab = "request";
    state.lastResponse = null;
    renderTree();
    const request = requestById(id);
    if (!request) return;

    emptyEl.style.display = "none";
    panelEl.classList.add("visible");
    document.getElementById("request-title").textContent = request.title || "Request";
    document.getElementById("request-method").className = methodClass(request.method);
    document.getElementById("request-method").textContent = request.method || "GET";
    document.getElementById("request-url").textContent = request.url || "";
    document.getElementById("params-table").innerHTML = pairsTable(request.queryParams);
    document.getElementById("headers-table").innerHTML = pairsTable(request.headers);
    document.getElementById("auth-body").textContent = JSON.stringify(request.auth || { type: "none" }, null, 2);
    document.getElementById("body-pre").textContent = requestBodyText(request) || "No body";

    const unsupported = request.bodyMode === "multipart" || request.bodyMode === "binary";
    document.getElementById("unsupported-note").style.display = unsupported ? "block" : "none";
    sendBtn.disabled = unsupported;

    setDetailTab(defaultDetailTab(request));
    setMainTab("request");
    renderResponse();
  }

  function renderVariables() {
    if (!globalsEl) return;
    globalsEl.innerHTML = "";
    for (const variable of state.variables) {
      const row = document.createElement("div");
      row.className = "var-row";
      const name = document.createElement("input");
      name.value = variable.name || "";
      name.readOnly = true;
      const value = document.createElement("input");
      value.value = variable.value || "";
      value.addEventListener("input", () => { variable.value = value.value; });
      row.append(name, value);
      globalsEl.appendChild(row);
    }
  }

  async function sendSelected() {
    const request = requestById(state.selectedId);
    if (!request) return;
    const vars = effectiveVariables();
    const url = buildUrl(request, vars);
    const headers = ensureContentType(request, buildHeaders(request, vars));
    const body = buildBody(request, vars);
    sendBtn.disabled = true;
    state.lastResponse = { pending: true };
    renderResponse();
    const started = performance.now();
    try {
      const init = { method: request.method || "GET", headers };
      if (body !== undefined && body !== null && request.method !== "GET" && request.method !== "HEAD") {
        init.body = body;
      }
      const response = await fetch(url, init);
      const text = await response.text();
      const duration = Math.round(performance.now() - started);
      const headersText = Array.from(response.headers.entries()).map(([k, v]) => k + ": " + v).join("\\n");
      state.lastResponse = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        duration,
        headersText,
        body: text
      };
    } catch (error) {
      state.lastResponse = {
        error: String(error?.message || error),
        duration: Math.round(performance.now() - started) + " ms"
      };
    } finally {
      const current = requestById(state.selectedId);
      const blocked = current && (current.bodyMode === "multipart" || current.bodyMode === "binary");
      sendBtn.disabled = Boolean(blocked);
      renderResponse();
      setResponseTab("body");
      setMainTab("response");
    }
  }

  document.querySelectorAll("[data-main-tab]").forEach((button) => {
    button.addEventListener("click", () => setMainTab(button.dataset.mainTab));
  });
  document.querySelectorAll("[data-detail-tab]").forEach((button) => {
    button.addEventListener("click", () => setDetailTab(button.dataset.detailTab));
  });
  document.querySelectorAll("[data-response-tab]").forEach((button) => {
    button.addEventListener("click", () => setResponseTab(button.dataset.responseTab));
  });
  sendBtn.addEventListener("click", () => { void sendSelected(); });

  setResponseTab("body");
  renderVariables();
  renderTree();
})();
`;

type HtmlTreeNode =
  | { kind: "folder"; title: string; children: HtmlTreeNode[] }
  | { kind: "request"; id: string; title: string; method: string };

function buildHtmlTree(parentId: string, items: FolderExportSnapshot["items"]): HtmlTreeNode[] {
  const children = items.filter((item) => item.parentId === parentId);
  const nodes: HtmlTreeNode[] = [];

  for (const child of children) {
    if (child.kind === "folder") {
      nodes.push({
        kind: "folder",
        title: child.title,
        children: buildHtmlTree(child.id, items)
      });
      continue;
    }
    nodes.push({
      kind: "request",
      id: child.id,
      title: child.title,
      method: child.method
    });
  }

  return nodes;
}

export function buildFolderHtmlBundle(snapshot: FolderExportSnapshot, variables: HtmlExportVariable[] = []): string {
  const requests = snapshot.items.filter((item) => item.kind === "request");
  const payload = {
    title: snapshot.folderName,
    tree: buildHtmlTree("/", snapshot.items),
    requests: requests.map((request) => ({
      id: request.id,
      title: request.title,
      description: request.description ?? "",
      method: request.method,
      url: request.url,
      urlHash: request.urlHash ?? "",
      queryParams: request.queryParams,
      headers: request.headers,
      bodyMode: request.bodyMode,
      rawType: request.rawType,
      body: request.body,
      form: request.form,
      graphqlVariables: request.graphqlVariables ?? "",
      auth: request.auth
    })),
    variables
  };

  const variablesSection =
    variables.length > 0
      ? `
      <div class="vars-wrap">
        <h2>Variables</h2>
        <div id="globals"></div>
      </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(snapshot.folderName)} — RestPilot</title>
  <style>${HTML_STYLES}</style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <h1>${escapeHtml(snapshot.folderName)}</h1>
        <p>Exported from RestPilot</p>
      </div>
      <div class="tree-wrap">
        <nav id="tree" class="tree" aria-label="Requests"></nav>
      </div>${variablesSection}
    </aside>
    <main class="main">
      <div id="empty" class="empty">Select a request to inspect it and send it from your browser.</div>
      <section id="panel" class="panel">
        <header class="workspace-head">
          <h2 id="request-title"></h2>
          <div class="request-line">
            <span id="request-method" class="method"></span>
            <div id="request-url" class="url-bar"></div>
          </div>
          <div class="toolbar">
            <button id="send-btn" class="primary" type="button">Send</button>
            <p id="unsupported-note" class="notice" style="display:none">
              Multipart and binary requests cannot be sent from this HTML bundle.
            </p>
            <p class="notice">Runs in your browser. CORS may block some calls.</p>
          </div>
        </header>
        <div class="workspace-tabs" role="tablist" aria-label="Workspace">
          <button type="button" data-main-tab="request" class="active">Request</button>
          <button type="button" data-main-tab="response">Response</button>
        </div>
        <section id="main-request" class="main-pane visible" aria-label="Request details">
          <div class="detail-toolbar">
            <div class="segmented" role="tablist" aria-label="Request sections">
              <button type="button" data-detail-tab="params">Params</button>
              <button type="button" data-detail-tab="headers">Headers</button>
              <button type="button" data-detail-tab="auth">Auth</button>
              <button type="button" data-detail-tab="body" class="active">Body</button>
            </div>
          </div>
          <div class="detail-content">
            <div id="pane-params" class="detail-pane">
              <div id="params-table"></div>
            </div>
            <div id="pane-headers" class="detail-pane">
              <div id="headers-table"></div>
            </div>
            <div id="pane-auth" class="detail-pane">
              <pre id="auth-body" class="code-block"></pre>
            </div>
            <div id="pane-body" class="detail-pane visible">
              <pre id="body-pre" class="code-block"></pre>
            </div>
          </div>
        </section>
        <section id="main-response" class="main-pane" aria-label="Response">
          <div id="response-meta" class="response-meta"></div>
          <div class="detail-toolbar">
            <div class="segmented" role="tablist" aria-label="Response sections">
              <button type="button" data-response-tab="body" class="active">Body</button>
              <button type="button" data-response-tab="headers">Headers</button>
            </div>
          </div>
          <div class="response-content">
            <div id="response-body-pane" class="detail-pane visible">
              <pre id="response-body" class="code-block"></pre>
            </div>
            <div id="response-headers-pane" class="detail-pane">
              <pre id="response-headers" class="code-block"></pre>
            </div>
          </div>
        </section>
      </section>
    </main>
  </div>
  <script id="rp-data" type="application/json">${jsonForScript(payload)}</script>
  <script>${HTML_SCRIPT}</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
