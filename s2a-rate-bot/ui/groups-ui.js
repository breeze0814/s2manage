const DEFAULT_RULE = {
  mode: "max",
  offset: 0,
  multiplier: 1,
  formula: "avg",
  sourceGroupIds: [],
};

export function attachGroupUi(deps) {
  let targetGroups = [];
  let groupRules = [];
  let sourceSites = [];
  const render = () => renderTargetGroups(deps, targetGroups, groupRules, sourceSites, updateRule);
  const updateRule = (rule, group) => {
    groupRules = upsertGroupRule(groupRules, rule);
    targetGroups = group ? upsertTargetGroup(targetGroups, group) : targetGroups;
    render();
  };
  return {
    setTargetGroups: (groups) => {
      targetGroups = groups;
      render();
    },
    setGroupRules: (rules) => {
      groupRules = rules;
      render();
    },
    setSourceSites: (sites) => {
      sourceSites = sites;
      render();
    },
  };
}

export function renderTargetGroups(deps, groups, rules, sources, onRuleSaved) {
  const list = deps.qs("#groups-list");
  if (groups.length === 0) {
    list.innerHTML = '<article class="empty-state">目标站没有返回分组。</article>';
    return;
  }
  list.replaceChildren(...groups.map((group) => groupCard(deps, group, rules, sources, onRuleSaved)));
}

function groupCard(deps, group, rules, sources, onRuleSaved) {
  const article = document.createElement("article");
  article.className = "group-card rule-card";
  const rule = normalizedRule(groupRuleFor(rules, group.id));
  article.innerHTML = groupCardHtml(deps, group, rule, sources);
  fillRuleValues(deps, article, rule);
  article.addEventListener("input", () => updateRuleInputs(deps, article, group, sources));
  article.addEventListener("change", () => updateRuleInputs(deps, article, group, sources));
  deps.qs("[data-update-group]", article).addEventListener("click", () => updateGroupRate(deps, article, group, sources, onRuleSaved));
  updateRuleInputs(deps, article, group, sources);
  return article;
}

function groupCardHtml(deps, group, rule, sources) {
  return `
    <div class="group-card-head">
      <div>
        <strong>${deps.escapeHtml(group.name ?? `Group #${group.id}`)}</strong>
        <small>目标组 #${group.id}</small>
      </div>
      <span class="pill neutral">${deps.escapeHtml(group.status ?? "active")}</span>
    </div>
    <div class="group-metric-strip">
      <span><small>当前倍率</small><strong>${deps.rateText(group.rate_multiplier)}</strong></span>
      <span><small>已绑定</small><strong>${rule.sourceGroupIds.length}</strong></span>
      <span><small>规则</small><strong>${ruleModeLabel(rule.mode)}</strong></span>
    </div>
    <div class="rule-layout">
      <section class="rule-panel binding-panel">
        <div class="rule-section-title">绑定采集站分组</div>
        ${bindingOptions(deps, sources, rule)}
      </section>
      <section class="rule-panel rule-config-panel">
        <div class="rule-section-title">规则计算</div>
        <div class="group-rule-grid advanced-rule-grid">
          ${ruleModeSelect()}
          <label>平均公式<input data-rule-formula type="text" placeholder="10*avg" /></label>
          <label>固定加值<input data-rule-offset type="number" step="0.01" /></label>
          <label>固定放大<input data-rule-multiplier type="number" min="0.01" step="0.01" /></label>
        </div>
      </section>
      <section class="rule-panel rule-execution-panel">
        <div class="rule-section-title">执行结果</div>
        <div class="rule-action-row">
          <label>目标倍率<input data-group-rate type="number" min="0.01" step="0.01" value="${deps.rateText(group.rate_multiplier)}" readonly /></label>
          <output class="rule-preview" data-rule-preview>等待选择来源</output>
          <button type="button" data-update-group="${group.id}">按规则计算并更新</button>
        </div>
      </section>
    </div>
  `;
}

function bindingOptions(deps, sources, rule) {
  const options = sourceRateOptions(sources);
  if (options.length === 0) {
    return `<label data-source-binding>来源分组<input data-source-group-id type="text" placeholder="多个 ID 用英文逗号分隔" value="${deps.escapeHtml(rule.sourceGroupIds.join(","))}" /></label>`;
  }
  return `
    <details class="source-multiselect" data-source-binding data-source-multiselect>
      <summary data-source-summary>${deps.escapeHtml(sourceBindingSummary(options, rule.sourceGroupIds))}</summary>
      <div class="source-dropdown-panel" data-source-dropdown>
        ${options.map((option) => bindingChoice(deps, option, rule.sourceGroupIds)).join("")}
      </div>
    </details>
  `;
}

function bindingChoice(deps, option, selectedIds) {
  const checked = selectedIds.includes(option.id) ? "checked" : "";
  return `
    <label class="binding-choice">
      <input data-source-group-id type="checkbox" value="${deps.escapeHtml(option.id)}" ${checked} />
      <span>
        <strong>${deps.escapeHtml(option.name)}</strong>
        <small>${deps.escapeHtml(option.meta)}</small>
      </span>
    </label>
  `;
}

function sourceRateOptions(sources) {
  return sources.flatMap((source) => (source.rates ?? []).map((rate) => ({
    id: `${source.id}:${rate.groupId}`,
    groupId: rate.groupId,
    name: `${source.name} / ${rate.groupName || rate.groupId}`,
    meta: `${rate.platform || "-"} / ${rate.groupId} / 倍率 ${rate.effectiveRate}`,
    rate: Number(rate.effectiveRate),
  })));
}

function ruleModeSelect() {
  return `
    <label>规则预设
      <select data-rule-mode>
        <option value="max">最大值</option>
        <option value="min">最小值</option>
        <option value="avg_formula">平均公式</option>
      </select>
    </label>
  `;
}

function ruleModeLabel(mode) {
  return ({ max: "最大值", min: "最小值", avg_formula: "平均公式" })[mode] ?? "最大值";
}

function fillRuleValues(deps, article, rule) {
  deps.qs("[data-rule-mode]", article).value = rule.mode;
  deps.qs("[data-rule-formula]", article).value = rule.formula;
  deps.qs("[data-rule-offset]", article).value = String(rule.offset);
  deps.qs("[data-rule-multiplier]", article).value = String(rule.multiplier);
}

function updateRuleInputs(deps, article, group, sources) {
  syncBindingSummary(article, sources);
  refreshRulePreview(deps, article, group, sources);
}

function syncBindingSummary(article, sources) {
  const summary = article.querySelector("[data-source-summary]");
  if (!summary) return;
  summary.textContent = sourceBindingSummary(sourceRateOptions(sources), selectedSourceGroupIds(article));
}

async function updateGroupRate(deps, article, group, sources, onRuleSaved) {
  const result = deps.qs("#rate-update-result");
  deps.setResult(result, "请求中...");
  try {
    refreshRulePreview(deps, article, group, sources);
    const payload = await deps.postJson("/api/groups/apply-rule", applyRulePayload(deps, article, group));
    onRuleSaved(payload.rule, payload.group);
    deps.setResult(result, payload);
  } catch (error) {
    deps.setResult(result, error instanceof Error ? error.message : String(error));
  }
}

function applyRulePayload(deps, article, group) {
  return {
    ...deps.targetConfig(),
    ...ruleDraft(deps, article, group),
  };
}

function ruleDraft(deps, article, group) {
  return {
    targetGroupId: Number(group.id),
    targetGroupName: String(group.name ?? `Group #${group.id}`),
    currentRate: Number(group.rate_multiplier ?? deps.qs("[data-group-rate]", article).value),
    enabled: true,
    mode: deps.qs("[data-rule-mode]", article).value,
    offset: Number(deps.qs("[data-rule-offset]", article).value),
    multiplier: Number(deps.qs("[data-rule-multiplier]", article).value),
    formula: deps.qs("[data-rule-formula]", article).value,
    sourceGroupIds: selectedSourceGroupIds(article),
  };
}

function refreshRulePreview(deps, article, group, sources) {
  const preview = deps.qs("[data-rule-preview]", article);
  const rates = selectedSourceRates(sources, article);
  const rate = calculateRuleRate(ruleDraft(deps, article, group), rates);
  preview.textContent = rate === null ? "选择来源后计算" : `预览倍率 ${deps.rateText(rate)}`;
  if (rate !== null) deps.qs("[data-group-rate]", article).value = deps.rateText(rate);
}

function selectedSourceRates(sources, article) {
  const options = sourceRateOptions(sources);
  return selectedSourceGroupIds(article)
    .map((id) => options.find((option) => option.id === id || option.groupId === id)?.rate)
    .filter((value) => Number.isFinite(value));
}

function calculateRuleRate(rule, rates) {
  if (rates.length === 0) return null;
  const base = baseRuleRate(rule, rates);
  const next = base * numericRuleValue(rule.multiplier, 1) + numericRuleValue(rule.offset, 0);
  return Number.isFinite(next) && next > 0 ? Math.round(next * 100) / 100 : null;
}

function baseRuleRate(rule, rates) {
  if (rule.mode === "min") return Math.min(...rates);
  if (rule.mode === "avg_formula") return formulaPreview(rule.formula, averageRate(rates));
  return Math.max(...rates);
}

function formulaPreview(formula, avg) {
  const value = String(formula || "avg").trim();
  if (value === "avg") return avg;
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)\s*\*\s*avg$/);
  return match ? Number(match[1]) * avg : avg;
}

function averageRate(rates) {
  return rates.reduce((total, value) => total + value, 0) / rates.length;
}

function numericRuleValue(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sourceBindingSummary(options, selectedIds) {
  const selected = options.filter((option) => selectedIds.includes(option.id));
  if (selected.length === 0) return "选择采集站分组";
  if (selected.length === 1) return selected[0].name;
  return `已选择 ${selected.length} 个采集站分组`;
}

function selectedSourceGroupIds(article) {
  return [...article.querySelectorAll("[data-source-group-id]")]
    .flatMap((input) => input.type === "checkbox" ? checkedValue(input) : textValues(input.value));
}

function checkedValue(input) {
  return input.checked ? [input.value] : [];
}

function textValues(value) {
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function groupRuleFor(rules, groupId) {
  return rules.find((rule) => Number(rule.targetGroupId) === Number(groupId));
}

function normalizedRule(rule) {
  return {
    ...DEFAULT_RULE,
    ...rule,
    sourceGroupIds: rule?.sourceGroupIds ?? legacySourceGroupIds(rule),
  };
}

function legacySourceGroupIds(rule) {
  return rule?.sourceGroupId ? [rule.sourceGroupId] : [];
}

function upsertGroupRule(rules, rule) {
  return [...rules.filter((item) => Number(item.targetGroupId) !== Number(rule.targetGroupId)), rule];
}

function upsertTargetGroup(groups, group) {
  return [...groups.filter((item) => Number(item.id) !== Number(group.id)), group];
}
