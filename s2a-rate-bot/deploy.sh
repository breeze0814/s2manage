#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PM2_BIN="${SCRIPT_DIR}/node_modules/.bin/pm2"
readonly ECOSYSTEM_FILE="${SCRIPT_DIR}/ecosystem.config.cjs"
readonly COMPOSE_FILE="${SCRIPT_DIR}/compose.dev.yml"
readonly ENV_FILE="${SCRIPT_DIR}/.env"

deployment_mode="pm2"
mode_selected=false
migrate_sqlite=false

usage() {
  cat <<'EOF'
用法: ./deploy.sh [--pm2 | --docker] [--migrate-sqlite]

  --pm2            使用外部 PostgreSQL/Redis，通过 PM2 部署应用（默认）
  --docker         使用 Docker Compose 管理 PostgreSQL/Redis，通过 PM2 部署应用
  --migrate-sqlite 停止已有 PM2 服务并执行一次 SQLite 数据导入
  -h, --help       显示帮助
EOF
}

select_deployment_mode() {
  if [[ "${mode_selected}" == true ]]; then
    echo "部署失败：--pm2 和 --docker 只能选择一个" >&2
    exit 2
  fi
  deployment_mode="$1"
  mode_selected=true
}

parse_arguments() {
  while (($#)); do
    case "$1" in
      --pm2) select_deployment_mode pm2 ;;
      --docker) select_deployment_mode docker ;;
      --migrate-sqlite) migrate_sqlite=true ;;
      -h|--help) usage; exit 0 ;;
      *) echo "未知参数: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
  done
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "部署失败：缺少命令 $1" >&2
    exit 1
  fi
}

start_infrastructure() {
  echo "==> 校验并启动 PostgreSQL/Redis"
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" config --quiet
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" pull
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --wait
}

stop_pm2_for_migration() {
  local application
  for application in s2a-rate-web s2a-rate-worker; do
    if "${PM2_BIN}" describe "${application}" >/dev/null 2>&1; then
      "${PM2_BIN}" stop "${application}"
    fi
  done
}

deploy_pm2() {
  echo "==> 配置并启动 PM2 服务"
  npm run pm2:setup
  "${PM2_BIN}" startOrReload "${ECOSYSTEM_FILE}" --update-env
  "${PM2_BIN}" save
  "${PM2_BIN}" status
}

parse_arguments "$@"

cd "${SCRIPT_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "部署失败：项目根目录缺少 .env" >&2
  exit 1
fi

require_command git
require_command npm
if [[ "${deployment_mode}" == docker ]]; then
  require_command docker
  docker compose version >/dev/null
fi

echo "==> 拉取最新代码"
git pull --ff-only

echo "==> 安装依赖"
npm ci

if [[ "${deployment_mode}" == docker ]]; then
  start_infrastructure
else
  echo "==> 使用外部 PostgreSQL/Redis"
fi

echo "==> 迁移 s2a-rate-bot PostgreSQL 数据库"
npm run db:migrate

echo "==> 检查数据库版本和基础设施连接"
npm run check:infrastructure

echo "==> 构建 Next.js"
npm run build

if [[ "${migrate_sqlite}" == true ]]; then
  echo "==> 停止旧服务并迁移 SQLite 数据"
  stop_pm2_for_migration
  npm run migrate:postgres
fi

deploy_pm2

echo "部署完成"
