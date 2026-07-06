const DEFAULT_INTERVAL_SECONDS = 3600;

export function attachSourceUi(deps) {
  let sourceSites = [];
  const readSites = () => sourceSites;
  const writeSites = (nextSites) => {
    sourceSites = nextSites;
    renderSourceSites(deps, sourceSites, (source) => refreshSourceSite(deps, source, readSites, writeSites));
    renderSourceBalanceSummary(deps, sourceSites);
    deps.onSourceSitesChanged?.(sourceSites);
  };
  attachDialogActions(deps);
  attachAuthModeToggle(deps);
  attachSourceForm(deps, readSites, writeSites);
  renderSourceSites(deps, sourceSites, (source) => refreshSourceSite(deps, source, readSites, writeSites));
  renderSourceBalanceSummary(deps, sourceSites);
  return { setSourceSites: writeSites };
}

function attachDialogActions({ qs }) {
  qs("#open-source-dialog").addEventListener("click", () => qs("#source-dialog").showModal());
  qs("#close-source-dialog").addEventListener("click", () => qs("#source-dialog").close());
}

function attachAuthModeToggle({ qs }) {
  const form = qs("#source-form");
  form.querySelectorAll('input[name="authMode"]').forEach((input) => {
    input.addEventListener("change", () => syncAuthModeFields(form));
  });
  syncAuthModeFields(form);
}

function syncAuthModeFields(form) {
  const mode = new FormData(form).get("authMode") ?? "manual_token";
  form.querySelectorAll("[data-auth-fields]").forEach((group) => {
    const active = group.dataset.authFields === mode;
    group.hidden = !active;
    group.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !active;
      field.required = active && field.hasAttribute("data-auth-required");
    });
  });
}

function attachSourceForm(deps, readSites, writeSites) {
  deps.qs("#source-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = deps.formValues(event.currentTarget);
    showSourceMessage(deps, "请求中...");
    try {
      const source = await loadSourceOverview(deps, values, readSites());
      writeSites(upsertSourceSite(readSites(), source));
      showSourceMessage(deps, "已保存并读取倍率", "success");
      deps.qs("#source-dialog").close();
    } catch (error) {
      showSourceMessage(deps, errorMessage(error), "error");
    }
  });
}

function showSourceMessage(deps, message, tone = "info") {
  const element = deps.qs("#source-message");
  element.textContent = message;
  element.dataset.tone = tone;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function loadSourceOverview(deps, values, sourceSites) {
  const config = sourceRequest(deps, values, sourceSites);
  const payload = await deps.postJson("/api/source/overview", config);
  return payload.source ?? {
    id: config.sourceSiteId,
    name: String(values.sourceName ?? `采集站 ${config.sourceSiteId}`),
    siteType: config.siteType,
    baseUrl: config.baseUrl,
    intervalSeconds: Number(values.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS),
    rechargeRatio: config.rechargeRatio,
    account: payload.account,
    rates: payload.rates ?? [],
    updatedAt: new Date().toISOString(),
  };
}

async function refreshSourceSite(deps, source, readSites, writeSites) {
  showSourceMessage(deps, `正在刷新 ${source.name}...`);
  try {
    const refreshed = await loadSourceOverview(deps, sourceValues(source), readSites());
    writeSites(upsertSourceSite(readSites(), refreshed));
    showSourceMessage(deps, `${source.name} 已刷新`, "success");
  } catch (error) {
    showSourceMessage(deps, errorMessage(error), "error");
  }
}

function sourceRequest(deps, values, sourceSites) {
  const proxyUrl = sourceProxyUrl(deps);
  const useProxy = wantsProxy(values.useProxy) && Boolean(proxyUrl);
  return {
    sourceSiteId: Number(values.sourceSiteId ?? nextSourceSiteId(sourceSites)),
    name: String(values.sourceName ?? ""),
    siteType: String(values.siteType ?? "sub2api"),
    baseUrl: String(values.sourceBaseUrl ?? ""),
    authMode: String(values.authMode ?? "manual_token"),
    accessToken: String(values.accessToken ?? ""),
    rtToken: String(values.rtToken ?? ""),
    username: String(values.username ?? ""),
    password: String(values.password ?? ""),
    rechargeRatio: Number(values.rechargeRatio ?? 1),
    intervalSeconds: Number(values.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS),
    useProxy,
    proxyUrl: useProxy ? proxyUrl : undefined,
  };
}

function sourceValues(source) {
  return {
    sourceSiteId: source.id,
    sourceName: source.name,
    siteType: source.siteType,
    sourceBaseUrl: source.baseUrl,
    authMode: source.authMode,
    accessToken: source.accessToken,
    rtToken: source.rtToken,
    username: source.username,
    password: source.password,
    rechargeRatio: source.rechargeRatio,
    intervalSeconds: source.intervalSeconds,
    useProxy: source.useProxy,
  };
}

function wantsProxy(value) {
  return value === "on" || value === true;
}

function sourceProxyUrl(deps) {
  const values = deps.formValues(deps.qs("#proxy-settings-form"));
  if (values.proxyEnabled !== "on") return "";
  return String(values.httpsProxy || values.httpProxy || "").trim();
}

function nextSourceSiteId(sourceSites) {
  return sourceSites.reduce((max, site) => Math.max(max, site.id), 0) + 1;
}

function upsertSourceSite(sourceSites, source) {
  return [...sourceSites.filter((site) => site.id !== source.id), source];
}

export function renderSourceSites(deps, sourceSites, onRefresh = null) {
  const list = deps.qs("#source-list");
  if (sourceSites.length === 0) {
    list.innerHTML = '<article class="empty-state">还没有采集站。点击“新建采集站”添加。</article>';
    return;
  }
  list.replaceChildren(...sourceSites.map((source) => sourceCard(deps, source, onRefresh)));
}

function sourceCard(deps, source, onRefresh) {
  const article = document.createElement("article");
  article.className = "source-card";
  article.innerHTML = `
    <div class="source-card-head">
      <div>
        <strong>${deps.escapeHtml(source.name)}</strong>
        <small>${sourceMeta(deps, source)}</small>
      </div>
      <div class="source-card-actions">
        <span class="pill neutral">${source.rates.length} 个分组</span>
        <button type="button" data-refresh-source="${source.id}">刷新</button>
      </div>
    </div>
    <div class="rate-table" role="table" aria-label="${deps.escapeHtml(source.name)} 分组倍率">
      <div class="rate-row rate-head" role="row">
        <span role="columnheader">分组</span>
        <span role="columnheader">平台</span>
        <span role="columnheader">ID</span>
        <span role="columnheader">倍率</span>
      </div>
      ${source.rates.map((rate) => sourceRateRow(deps, rate)).join("")}
    </div>
  `;
  article.querySelector("[data-refresh-source]")?.addEventListener("click", () => onRefresh?.(source));
  return article;
}

function sourceMeta(deps, source) {
  const balance = balanceText(deps, source.account?.balance);
  const label = deps.escapeHtml(source.account?.label ?? "-");
  return `${deps.escapeHtml(source.siteType)} / ${label} / 余额 ${balance}`;
}

function sourceRateRow(deps, rate) {
  return `
    <div class="rate-row" role="row">
      <span role="cell">${deps.escapeHtml(rate.groupName || rate.groupId)}</span>
      <span role="cell">${deps.escapeHtml(rate.platform || "-")}</span>
      <span role="cell">${deps.escapeHtml(rate.groupId)}</span>
      <strong role="cell">${deps.rateText(rate.effectiveRate)}</strong>
    </div>
  `;
}

function renderSourceBalanceSummary(deps, sourceSites) {
  const list = deps.qs("#source-balance-list");
  const balanceItems = renderSourceBalanceItems(deps, sourceSites);
  if (balanceItems.length === 0) {
    list.innerHTML = '<span class="balance-empty">尚未读取采集站</span>';
  } else {
    list.replaceChildren(...balanceItems);
  }
  deps.qs("#source-balance-detail").textContent = balanceItems.length
    ? `${balanceItems.length} 个采集站余额`
    : "尚未读取采集站";
}

function renderSourceBalanceItems(deps, sourceSites) {
  return sourceSites.map((site) => sourceBalanceItem(deps, site));
}

function sourceBalanceItem(deps, source) {
  const item = document.createElement("span");
  item.className = "balance-item";
  item.setAttribute("role", "listitem");
  item.innerHTML = `
    <span>${deps.escapeHtml(source.name)}</span>
    <strong>${balanceText(deps, source.account?.balance)}</strong>
  `;
  return item;
}

function balanceText(deps, value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? deps.rateText(numeric) : "-";
}
