export function attachAccountUi(deps) {
  let accounts = [];
  const readAccounts = () => accounts;
  const writeAccounts = (nextAccounts) => {
    accounts = nextAccounts;
    renderAccounts(deps, accounts, (account) => toggleAccount(deps, account, readAccounts, writeAccounts));
  };
  deps.qs("#load-accounts").addEventListener("click", () => refreshAccounts(deps, writeAccounts));
  renderAccounts(deps, accounts, (account) => toggleAccount(deps, account, readAccounts, writeAccounts));
  return { setAccounts: writeAccounts };
}

async function refreshAccounts(deps, writeAccounts) {
  const result = deps.qs("#accounts-result");
  deps.setResult(result, "请求中...");
  try {
    const payload = await deps.postJson("/api/target/accounts", deps.targetConfig());
    writeAccounts(payload.accounts ?? []);
    deps.setResult(result, payload, "success");
  } catch (error) {
    deps.setResult(result, errorMessage(error), "error");
  }
}

async function toggleAccount(deps, account, readAccounts, writeAccounts) {
  const result = deps.qs("#accounts-result");
  deps.setResult(result, "请求中...");
  try {
    const payload = await deps.postJson("/api/target/account-schedulable", {
      ...deps.targetConfig(),
      accountId: account.id,
      schedulable: !account.schedulable,
    });
    writeAccounts(upsertAccount(readAccounts(), payload.account));
    deps.setResult(result, payload, "success");
  } catch (error) {
    deps.setResult(result, errorMessage(error), "error");
  }
}

export function renderAccounts(deps, accounts, onToggle) {
  const list = deps.qs("#accounts-list");
  if (accounts.length === 0) {
    list.innerHTML = '<article class="empty-state">先配置目标站点，再刷新账号调度数据。</article>';
    return;
  }
  list.innerHTML = accountLayoutHtml(deps, accounts);
  list.querySelectorAll("[data-toggle-account]").forEach((button) => {
    button.addEventListener("click", () => onToggle(accountById(accounts, button.dataset.toggleAccount)));
  });
}

function accountLayoutHtml(deps, accounts) {
  return `
    <section class="account-overview" aria-label="账号调度概览">
      ${renderAccountStats(deps, accounts)}
    </section>
    <section class="account-table" role="table" aria-label="账号调度列表">
      <div class="account-row account-row-head" role="row">
        <span role="columnheader">账号</span>
        <span role="columnheader">平台</span>
        <span role="columnheader">状态</span>
        <span role="columnheader">调度</span>
        <span role="columnheader">倍率</span>
        <span role="columnheader">优先级</span>
        <span role="columnheader">分组</span>
        <span role="columnheader">操作</span>
      </div>
      ${accounts.map((account) => accountRowHtml(deps, account)).join("")}
    </section>
  `;
}

function renderAccountStats(deps, accounts) {
  const enabled = accounts.filter((account) => account.schedulable).length;
  return [
    statItem(deps, "账号总数", accounts.length, "neutral"),
    statItem(deps, "可调度", enabled, "success"),
    statItem(deps, "已停用", accounts.length - enabled, "error"),
    statItem(deps, "平均倍率", averageRate(accounts), "neutral"),
  ].join("");
}

function statItem(deps, label, value, tone) {
  return `<span class="${tone}"><small>${deps.escapeHtml(label)}</small><strong>${deps.escapeHtml(value)}</strong></span>`;
}

function accountRowHtml(deps, account) {
  return `
    <div class="account-row" role="row">
      <span class="account-name" role="cell">
        <strong>${deps.escapeHtml(account.name)}</strong>
        <small>#${account.id}</small>
      </span>
      <span role="cell">${deps.escapeHtml(account.platform)}</span>
      <span role="cell">${deps.escapeHtml(account.status)}</span>
      <span role="cell">${accountState(deps, account)}</span>
      <strong role="cell">${account.rateMultiplier ?? "-"}</strong>
      <strong role="cell">${account.priority ?? "-"}</strong>
      <strong role="cell">${(account.groupIds ?? []).length}</strong>
      <span role="cell">
        <button class="account-action" type="button" data-toggle-account="${account.id}">
          ${account.schedulable ? "停用" : "启用"}
        </button>
      </span>
    </div>
  `;
}

function accountState(deps, account) {
  const tone = account.schedulable ? "success" : "error";
  const label = account.schedulable ? "可调度" : "已停用";
  return `<span class="account-state ${tone}">${deps.escapeHtml(label)}</span>`;
}

function averageRate(accounts) {
  const rates = accounts.map((account) => Number(account.rateMultiplier)).filter((value) => Number.isFinite(value));
  if (rates.length === 0) return "-";
  return String(Math.round((rates.reduce((total, rate) => total + rate, 0) / rates.length) * 100) / 100);
}

function accountById(accounts, id) {
  const account = accounts.find((item) => String(item.id) === String(id));
  if (!account) throw new Error(`Missing account: ${String(id)}`);
  return account;
}

function upsertAccount(accounts, account) {
  return [...accounts.filter((item) => Number(item.id) !== Number(account.id)), account]
    .sort((left, right) => Number(left.id) - Number(right.id));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
