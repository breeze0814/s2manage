import { attachSourceUi } from "./source-ui.js";
import { attachGroupUi } from "./groups-ui.js";
import { attachAccountUi } from "./accounts-ui.js";

const stateLabels = {
  ready: "READY",
  not_configured: "未配置",
  not_implemented: "待接入",
  error: "ERROR",
};
const serviceStatusTargets = {
  api: {
    indicator: qs('[data-service-status="api"]'),
    state: qs("#api-status-state"),
    detail: qs("#api-status-detail"),
  },
  worker: {
    indicator: qs('[data-service-status="worker"]'),
    state: qs("#worker-status-state"),
    detail: qs("#worker-status-detail"),
  },
  bot: {
    indicator: qs('[data-service-status="bot"]'),
    state: qs("#bot-status-state"),
    detail: qs("#bot-status-detail"),
  },
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
  renderServiceStatus(payload.services ?? []);
}

async function getJson(path) {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}
function showLoadError(error) {
  const message = error instanceof Error ? error.message : String(error);
  renderServiceStatus([
    { name: "api", state: "error", detail: message },
    { name: "worker", state: "error", detail: message },
    { name: "bot", state: "error", detail: message },
  ]);
}

function renderServiceStatus(services) {
  for (const service of services) {
    const target = serviceStatusTargets[service.name];
    if (!target) continue;
    const serviceState = String(service.state ?? "unknown");
    target.indicator.dataset.tone = statusTone(serviceState);
    target.state.textContent = stateLabels[serviceState] ?? serviceState;
    target.detail.textContent = String(service.detail ?? "");
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
    clearAdminApiKey: values.clearAdminApiKey === "on",
  };
}

function botSettings() {
  return {
    ...botConnectionSettings(),
    ...botCommandSettings(),
    ...botActiveSettings(),
    ...botInviteActivitySettings(),
  };
}

function botConnectionSettings() {
  const values = formValues(qs("#bot-settings-form"));
  return {
    enabled: values.botEnabled === "on",
    wsUrl: String(values.botWsUrl ?? ""),
    token: String(values.botToken ?? ""),
    clearToken: values.clearBotToken === "on",
    targetGroupId: String(values.botGroupId ?? ""),
    botUserId: String(values.botUserId ?? ""),
  };
}

function botCommandSettings() {
  const values = formValues(qs("#bot-command-settings-form"));
  return {
    mentionCommandEnabled: values.mentionCommandEnabled === "on",
    commandSettings: {
      help: values.commandHelpEnabled === "on",
      rate: values.commandRateEnabled === "on",
      bind: values.commandBindEnabled === "on",
      unbind: values.commandUnbindEnabled === "on",
      inviteHelp: values.commandInviteHelpEnabled === "on",
      inviteMine: values.commandInviteMineEnabled === "on",
      inviteLeaderboard: values.commandInviteLeaderboardEnabled === "on",
    },
  };
}

function botActiveSettings() {
  const values = formValues(qs("#bot-active-settings-form"));
  return {
    activePrivateMessageEnabled: values.activePrivateMessageEnabled === "on",
  };
}

function botInviteActivitySettings() {
  const values = formValues(qs("#bot-stats-settings-form"));
  return {
    scheduledStatsEnabled: values.scheduledStatsEnabled === "on",
    inviteActivityStartDate: String(values.inviteActivityStartDate ?? ""),
    inviteActivityActiveRewardAmount: optionalNumber(values.inviteActivityActiveRewardAmount),
    inviteActivityInactiveRewardAmount: optionalNumber(values.inviteActivityInactiveRewardAmount),
  };
}

function optionalNumber(value) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
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

async function loadRuntimeEvents() {
  const payload = await getJson("/api/runtime/events");
  renderRuntimeEvents(payload.events ?? []);
}

function applyAppConfig(config, sourceUi) {
  applyTargetSettings(config.target);
  applyBotSettings(config.bot);
  renderBotCapabilities(config.bot, config.target);
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
  form.elements.adminApiKey.value = "";
  form.elements.adminApiKey.placeholder = target.adminApiKeySet ? "已保存，留空继续使用" : "用于本次请求";
  form.elements.clearAdminApiKey.checked = false;
}

function applyBotSettings(bot) {
  if (!bot) return;
  const form = qs("#bot-settings-form");
  const commandForm = qs("#bot-command-settings-form");
  const activeForm = qs("#bot-active-settings-form");
  const statsForm = qs("#bot-stats-settings-form");
  const commands = bot.commandSettings ?? {};
  form.elements.botEnabled.checked = Boolean(bot.enabled);
  form.elements.botWsUrl.value = bot.wsUrl ?? "";
  form.elements.botToken.value = "";
  form.elements.botToken.placeholder = bot.tokenSet ? "已保存，留空继续使用" : "NapCat access token";
  form.elements.clearBotToken.checked = false;
  form.elements.botGroupId.value = bot.targetGroupId ?? "";
  form.elements.botUserId.value = bot.botUserId ?? "";
  commandForm.elements.mentionCommandEnabled.checked = bot.mentionCommandEnabled !== false;
  commandForm.elements.commandHelpEnabled.checked = commands.help !== false;
  commandForm.elements.commandRateEnabled.checked = commands.rate !== false;
  commandForm.elements.commandBindEnabled.checked = commands.bind !== false;
  commandForm.elements.commandUnbindEnabled.checked = commands.unbind !== false;
  commandForm.elements.commandInviteHelpEnabled.checked = commands.inviteHelp !== false;
  commandForm.elements.commandInviteMineEnabled.checked = commands.inviteMine !== false;
  commandForm.elements.commandInviteLeaderboardEnabled.checked = commands.inviteLeaderboard !== false;
  activeForm.elements.activePrivateMessageEnabled.checked = bot.activePrivateMessageEnabled !== false;
  statsForm.elements.scheduledStatsEnabled.checked = bot.scheduledStatsEnabled !== false;
  statsForm.elements.inviteActivityStartDate.value = bot.inviteActivityStartDate ?? "";
  statsForm.elements.inviteActivityActiveRewardAmount.value = bot.inviteActivityActiveRewardAmount ?? "";
  statsForm.elements.inviteActivityInactiveRewardAmount.value = bot.inviteActivityInactiveRewardAmount ?? "";
}

function renderBotCapabilities(bot, target) {
  const connection = botCapabilityStatus(Boolean(bot?.enabled), [
    [Boolean(String(bot?.wsUrl ?? "").trim()), "NapCat WebSocket"],
    [Boolean(String(bot?.targetGroupId ?? "").trim()), "目标 QQ 群"],
    [Boolean(String(bot?.botUserId ?? "").trim()), "机器人 QQ"],
  ]);
  const passive = botCapabilityStatus(Boolean(bot?.enabled) && bot?.mentionCommandEnabled !== false, [
    [Boolean(bot?.mentionCommandEnabled !== false), "@Bot 指令"],
    [enabledCommandCount(bot?.commandSettings) > 0, "至少 1 条指令"],
    [Boolean(String(bot?.targetGroupId ?? "").trim()), "目标 QQ 群"],
    [Boolean(String(bot?.botUserId ?? "").trim()), "机器人 QQ"],
  ]);
  const active = botCapabilityStatus(Boolean(bot?.enabled) && bot?.activePrivateMessageEnabled !== false, [
    [Boolean(bot?.activePrivateMessageEnabled !== false), "主动私聊开关"],
    [Boolean(String(bot?.wsUrl ?? "").trim()), "NapCat WebSocket"],
  ]);
  const stats = botCapabilityStatus(Boolean(bot?.enabled) && bot?.scheduledStatsEnabled !== false, [
    [Boolean(bot?.scheduledStatsEnabled !== false), "活动开关"],
    [Boolean(String(bot?.inviteActivityStartDate ?? "").trim()), "开始日期"],
    [bot?.inviteActivityActiveRewardAmount !== null && bot?.inviteActivityActiveRewardAmount !== undefined, "活跃奖励"],
    [bot?.inviteActivityInactiveRewardAmount !== null && bot?.inviteActivityInactiveRewardAmount !== undefined, "非活跃奖励"],
    [Boolean(bot?.activePrivateMessageEnabled !== false), "主动私聊"],
    [Boolean(target?.baseUrl && (target?.adminApiKey || target?.adminApiKeySet)), "目标站点"],
  ]);

  setCapabilityStatus("[data-bot-connection-status]", connection);
  setCapabilityStatus("[data-bot-passive-status]", passive);
  setCapabilityStatus("[data-bot-active-status]", active);
  setCapabilityStatus("[data-bot-stats-status]", stats);
  setCapabilityStatus("#bot-overall-status", overallBotStatus([connection, passive, active, stats]));
  qs("#bot-config-summary").textContent = [
    `Bot：${bot?.enabled ? "已启用" : "未启用"}`,
    `群：${bot?.targetGroupId || "-"}`,
    `机器人 QQ：${bot?.botUserId || "-"}`,
    `已启用指令：${enabledCommandCount(bot?.commandSettings)}/7`,
    `主动私聊：${bot?.activePrivateMessageEnabled === false ? "关闭" : "开启"}`,
    `邀请活动：${bot?.scheduledStatsEnabled === false ? "关闭" : "开启"}`,
    `活动日期：${bot?.inviteActivityStartDate || "-"}`,
    `奖励：活跃 ${formatOptionalAmount(bot?.inviteActivityActiveRewardAmount)} / 非活跃 ${formatOptionalAmount(bot?.inviteActivityInactiveRewardAmount)}`,
    `目标站：${target?.name || "-"}`,
  ].join(" / ");
}

function formatOptionalAmount(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function enabledCommandCount(commandSettings) {
  const commands = commandSettings ?? {};
  return ["help", "rate", "bind", "unbind", "inviteHelp", "inviteMine", "inviteLeaderboard"]
    .filter((key) => commands[key] !== false).length;
}

function botCapabilityStatus(enabled, requirements) {
  if (!enabled) return { tone: "warning", label: "未启用" };
  const missing = requirements.filter(([ok]) => !ok).map(([, label]) => label);
  if (missing.length === 0) return { tone: "success", label: "可用" };
  return { tone: "warning", label: `缺少 ${missing.join("、")}` };
}

function overallBotStatus(statuses) {
  if (statuses.every((status) => status.tone === "success")) return { tone: "success", label: "能力就绪" };
  if (statuses.every((status) => status.label === "未启用")) return { tone: "warning", label: "未启用" };
  return { tone: "warning", label: "配置中" };
}

function setCapabilityStatus(selector, status) {
  const element = qs(selector);
  element.textContent = status.label;
  element.classList.remove("success", "warning", "error", "neutral");
  element.classList.add(status.tone);
  element.closest(".bot-action-button, .bot-capability")?.setAttribute("data-tone", status.tone);
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

function showBotMessage(message, tone = "info") {
  const element = qs("#bot-message");
  element.textContent = message;
  element.dataset.tone = tone;
}

async function loadInviteActivityPreview() {
  const target = targetConfig();
  const bot = botSettings();
  const payload = await postJson("/api/bot/invite-activity", {
    ...target,
    activityEnabled: bot.scheduledStatsEnabled,
    startDate: bot.inviteActivityStartDate,
    activeRewardAmount: bot.inviteActivityActiveRewardAmount,
    inactiveRewardAmount: bot.inviteActivityInactiveRewardAmount,
  });
  renderInviteActivityPreview(payload.summary);
  renderInviteActivityStatus(payload.activityStatus);
  showBotMessage("邀请排行榜已刷新", "success");
}

function renderInviteActivityPreview(summary) {
  const list = qs("#invite-activity-leaderboard");
  if (!summary) {
    list.innerHTML = '<article class="empty-state">暂无邀请活动数据。</article>';
    return;
  }
  const rows = summary.leaderboard ?? [];
  const header = `
    <div class="invite-activity-summary">
      <span>周期 ${escapeHtml(summary.period?.startDate ?? "-")} 至 ${escapeHtml(summary.period?.endDate ?? "-")}</span>
      <strong>${summary.affiliateEnabled ? "活动开启" : "活动关闭"}</strong>
      <span>总计 ${summary.periodInviteeCount ?? 0} / 活跃 ${summary.activeInviteeCount ?? 0} / 非活跃 ${summary.inactiveInviteeCount ?? 0}</span>
    </div>
  `;
  if (rows.length === 0) {
    list.innerHTML = `${header}<article class="empty-state">暂无邀请数据。</article>`;
    return;
  }
  list.innerHTML = `${header}${rows.map(inviteLeaderboardRow).join("")}`;
}

function renderInviteActivityStatus(status) {
  const list = qs("#invite-activity-status");
  if (!status?.currentPeriod) {
    list.innerHTML = '<article class="empty-state">配置活动开始日期后展示周期信息。</article>';
    return;
  }
  const settlement = status.settlementPeriod
    ? `${escapeHtml(status.settlementPeriod.startDate)} 至 ${escapeHtml(status.settlementPeriod.endDate)}`
    : "首个周期尚未结束";
  list.innerHTML = `
    <div class="invite-activity-summary">
      <span>当前周期 ${escapeHtml(status.currentPeriod.startDate)} 至 ${escapeHtml(status.currentPeriod.endDate)}</span>
      <strong>可结算：${settlement}</strong>
      <span>下次结算日期 ${escapeHtml(status.nextSettlementDate ?? "-")}</span>
    </div>
  `;
}

function renderRuntimeEvents(events) {
  const list = qs("#runtime-events");
  if (events.length === 0) {
    list.innerHTML = '<article class="empty-state">暂无运行事件。</article>';
    return;
  }
  list.replaceChildren(...events.map(runtimeEventItem));
}

function runtimeEventItem(event) {
  const article = document.createElement("article");
  article.className = "runtime-event";
  article.dataset.tone = event.status === "failed" ? "error" : event.status === "success" ? "success" : "warning";
  const createdAt = event.createdAt ? new Date(event.createdAt).toLocaleString("zh-CN", { hour12: false }) : "-";
  article.innerHTML = `
    <strong>${escapeHtml(event.service)} / ${escapeHtml(event.eventType)}</strong>
    <span>${escapeHtml(event.message)}</span>
    <small>${escapeHtml(createdAt)}</small>
  `;
  return article;
}

function inviteLeaderboardRow(entry, index) {
  return `
    <article class="invite-leaderboard-row">
      <strong>#${index + 1}</strong>
      <span>${escapeHtml(entry.inviterUsername || entry.inviterEmail)}</span>
      <span>总计 ${entry.total}</span>
      <span>活跃 ${entry.activeInviteeCount}</span>
      <span>非活跃 ${entry.inactiveInviteeCount}</span>
      <strong>奖励 ${formatOptionalAmount(entry.rewardAmount)}</strong>
    </article>
  `;
}

function openBotDialog(selector) {
  const dialog = qs(selector);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeBotDialog(selector) {
  const dialog = qs(selector);
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function openBotConnectionDialog() {
  openBotDialog("#bot-settings-dialog");
}

function openBotCommandDialog() {
  openBotDialog("#bot-command-dialog");
}

function openBotActiveDialog() {
  openBotDialog("#bot-active-dialog");
}

function openBotStatsDialog() {
  openBotDialog("#bot-stats-dialog");
}

function statusTone(state) {
  if (state === "ready") return "success";
  if (state === "error") return "error";
  if (state === "not_configured" || state === "not_implemented") return "warning";
  return "neutral";
}

async function withPendingButton(button, label, task) {
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function refreshDashboard() {
  await loadStatus();
  await loadAppConfig(sourceUi);
  await loadRuntimeEvents();
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
function saveBotSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  withPendingButton(button, "保存中...", async () => {
    await postJson(botSettingsEndpoint(form.id), botSettingsPayload(form.id));
    await loadAppConfig(sourceUi);
    closeBotDialog(`#${form.closest("dialog").id}`);
    showBotMessage("机器人配置已保存", "success");
  })
    .catch((error) => showBotMessage(error.message, "error"));
}

function botSettingsEndpoint(formId) {
  return ({
    "bot-settings-form": "/api/settings/bot/connection",
    "bot-command-settings-form": "/api/settings/bot/commands",
    "bot-active-settings-form": "/api/settings/bot/active",
    "bot-stats-settings-form": "/api/settings/bot/invite-activity",
  })[formId] ?? "/api/settings/bot";
}

function botSettingsPayload(formId) {
  return ({
    "bot-settings-form": botConnectionSettings,
    "bot-command-settings-form": botCommandSettings,
    "bot-active-settings-form": botActiveSettings,
    "bot-stats-settings-form": botInviteActivitySettings,
  })[formId]?.() ?? botSettings();
}

qs("#bot-settings-form").addEventListener("submit", saveBotSettings);
qs("#bot-command-settings-form").addEventListener("submit", saveBotSettings);
qs("#bot-active-settings-form").addEventListener("submit", saveBotSettings);
qs("#bot-stats-settings-form").addEventListener("submit", saveBotSettings);
qs("#open-bot-connection-settings").addEventListener("click", openBotConnectionDialog);
qs("#open-bot-command-settings").addEventListener("click", openBotCommandDialog);
qs("#open-bot-active-settings").addEventListener("click", openBotActiveDialog);
qs("#open-bot-stats-settings").addEventListener("click", openBotStatsDialog);
qs("#load-invite-activity").addEventListener("click", () => {
  withPendingButton(qs("#load-invite-activity"), "刷新中...", loadInviteActivityPreview)
    .catch((error) => showBotMessage(error.message, "error"));
});
qs("#close-bot-settings").addEventListener("click", () => closeBotDialog("#bot-settings-dialog"));
qs("#close-bot-command-settings").addEventListener("click", () => closeBotDialog("#bot-command-dialog"));
qs("#close-bot-active-settings").addEventListener("click", () => closeBotDialog("#bot-active-dialog"));
qs("#close-bot-stats-settings").addEventListener("click", () => closeBotDialog("#bot-stats-dialog"));
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
qs("#refresh-runtime-events").addEventListener("click", () => {
  withPendingButton(qs("#refresh-runtime-events"), "刷新中...", loadRuntimeEvents)
    .catch((error) => showDashboardError(error));
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
