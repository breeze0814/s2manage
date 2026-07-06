import { attachSourceUi } from "./source-ui.js";
import { attachGroupUi } from "./groups-ui.js";
import { attachAccountUi } from "./accounts-ui.js";

const stateLabels = {
  ready: "READY",
  not_configured: "未配置",
  not_implemented: "待接入",
};
const fields = {
  api: { state: qs("#api-state"), detail: qs("#api-detail") },
  worker: { state: qs("#worker-state"), detail: qs("#worker-detail") },
  bot: { state: qs("#bot-state"), detail: qs("#bot-detail") },
};
function qs(selector, root = document) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}
async function loadStatus() {
  const response = await fetch("/api/status", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await parseJsonResponse(response);
  for (const service of payload.services ?? []) {
    const target = fields[service.name];
    if (!target) continue;
    target.state.textContent = stateLabels[service.state] ?? service.state;
    target.state.closest(".status-tile").dataset.tone = statusTone(service.state);
    target.detail.textContent = service.detail;
  }
}

async function getJson(path) {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}
function showLoadError(error) {
  const message = error instanceof Error ? error.message : String(error);
  for (const target of Object.values(fields)) {
    target.state.textContent = "ERROR";
    target.state.closest(".status-tile").dataset.tone = "error";
    target.detail.textContent = message;
  }
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setResult(element, value, tone = "info") {
  element.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  element.dataset.tone = tone;
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
}

function targetConfig() {
  const values = formValues(qs("#target-form"));
  return {
    baseUrl: String(values.targetBaseUrl ?? ""),
    adminApiKey: String(values.adminApiKey ?? ""),
  };
}

function targetSettings() {
  const values = formValues(qs("#target-form"));
  return {
    name: String(values.connectionName ?? "主站"),
    ...targetConfig(),
  };
}

function botSettings() {
  const values = formValues(qs("#bot-settings-form"));
  return {
    enabled: values.botEnabled === "on",
    wsUrl: String(values.botWsUrl ?? ""),
    token: String(values.botToken ?? ""),
    targetGroupId: String(values.botGroupId ?? ""),
    mentionCommandEnabled: values.mentionCommandEnabled === "on",
    botUserId: String(values.botUserId ?? ""),
  };
}

function proxySettings() {
  const values = formValues(qs("#proxy-settings-form"));
  return {
    enabled: values.proxyEnabled === "on",
    httpProxy: String(values.httpProxy ?? ""),
    httpsProxy: String(values.httpsProxy ?? ""),
  };
}

function workerSettings() {
  const values = formValues(qs("#worker-settings-form"));
  return {
    intervalSeconds: Number(values.intervalSeconds ?? 600),
  };
}

function activateRoute(route) {
  document.querySelectorAll("[data-route]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.route === route);
  });
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === route);
  });
}

async function loadTargetGroups() {
  setTargetGroupRefreshResult("请求中...");
  await postJson("/api/settings/target", targetSettings());
  const payload = await postJson("/api/target/groups", targetConfig());
  groupUi.setTargetGroups(payload.groups ?? []);
  setTargetGroupRefreshResult(payload, "success");
  activateRoute("groups");
}

function setTargetGroupRefreshResult(value, tone = "info") {
  setResult(qs("#target-result"), value, tone);
  setResult(qs("#rate-update-result"), value, tone);
}

function rateText(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.round(numeric * 100) / 100) : "1";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

async function loadAppConfig(sourceUi) {
  const config = await getJson("/api/app-config");
  applyAppConfig(config, sourceUi);
}

function applyAppConfig(config, sourceUi) {
  applyTargetSettings(config.target);
  applyBotSettings(config.bot);
  applyProxySettings(config.proxy);
  applyWorkerSettings(config.worker);
  groupUi.setGroupRules(config.groupRules ?? []);
  groupUi.setTargetGroups(config.targetGroups ?? []);
  groupUi.setSourceSites(config.sources ?? []);
  sourceUi.setSourceSites(config.sources ?? []);
  accountUi.setAccounts(config.accounts ?? []);
}

function applyTargetSettings(target) {
  if (!target) return;
  const form = qs("#target-form");
  form.elements.connectionName.value = target.name ?? "";
  form.elements.targetBaseUrl.value = target.baseUrl ?? "";
  form.elements.adminApiKey.value = target.adminApiKey ?? "";
}

function applyBotSettings(bot) {
  if (!bot) return;
  const form = qs("#bot-settings-form");
  form.elements.botEnabled.checked = Boolean(bot.enabled);
  form.elements.botWsUrl.value = bot.wsUrl ?? "";
  form.elements.botToken.value = bot.token ?? "";
  form.elements.botGroupId.value = bot.targetGroupId ?? "";
  form.elements.botUserId.value = bot.botUserId ?? "";
  form.elements.mentionCommandEnabled.checked = bot.mentionCommandEnabled !== false;
}

function applyProxySettings(proxy) {
  if (!proxy) return;
  const form = qs("#proxy-settings-form");
  form.elements.httpProxy.value = proxy.httpProxy ?? "";
  form.elements.httpsProxy.value = proxy.httpsProxy ?? "";
  form.elements.proxyEnabled.checked = Boolean(proxy.enabled);
}

function applyWorkerSettings(worker) {
  if (!worker) return;
  const form = qs("#worker-settings-form");
  form.elements.intervalSeconds.value = String(worker.intervalSeconds ?? 600);
}

function showSettingsMessage(message, tone = "info") {
  const element = qs("#settings-message");
  element.textContent = message;
  element.dataset.tone = tone;
}

function statusTone(state) {
  if (state === "ready") return "success";
  if (state === "error") return "error";
  if (state === "not_configured" || state === "not_implemented") return "warning";
  return "neutral";
}

async function refreshDashboard() {
  await loadStatus();
  await loadAppConfig(sourceUi);
}

function showDashboardError(error) {
  showLoadError(error);
  showSettingsMessage(error instanceof Error ? error.message : String(error), "error");
}

document.querySelectorAll("[data-route]").forEach((tab) => {
  tab.addEventListener("click", () => activateRoute(tab.dataset.route));
});
qs("#target-form").addEventListener("submit", (event) => {
  event.preventDefault();
  loadTargetGroups().catch((error) => setTargetGroupRefreshResult(error.message, "error"));
});
qs("#bot-settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  postJson("/api/settings/bot", botSettings())
    .then(() => showSettingsMessage("机器人信息已保存", "success"))
    .catch((error) => showSettingsMessage(error.message, "error"));
});
qs("#proxy-settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  postJson("/api/settings/proxy", proxySettings())
    .then(() => showSettingsMessage("代理信息已保存", "success"))
    .catch((error) => showSettingsMessage(error.message, "error"));
});
qs("#worker-settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  postJson("/api/settings/worker", workerSettings())
    .then(() => showSettingsMessage("Worker 设置已保存", "success"))
    .catch((error) => showSettingsMessage(error.message, "error"));
});
qs("#load-groups").addEventListener("click", () => {
  loadTargetGroups().catch((error) => setTargetGroupRefreshResult(error.message, "error"));
});

const groupUi = attachGroupUi({ qs, postJson, setResult, escapeHtml, rateText, targetConfig });
const sourceUi = attachSourceUi({
  qs,
  formValues,
  postJson,
  setResult,
  escapeHtml,
  rateText,
  onSourceSitesChanged: (sites) => groupUi.setSourceSites(sites),
});
const accountUi = attachAccountUi({ qs, postJson, setResult, escapeHtml, targetConfig });
qs("#refresh").addEventListener("click", () => refreshDashboard().catch(showDashboardError));
refreshDashboard().catch(showDashboardError);
