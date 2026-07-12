#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PM2_BIN="${SCRIPT_DIR}/node_modules/.bin/pm2"
readonly ECOSYSTEM_FILE="${SCRIPT_DIR}/ecosystem.config.cjs"

cd "${SCRIPT_DIR}"

if [[ ! -f .env ]]; then
  echo "部署失败：项目根目录缺少 .env" >&2
  exit 1
fi

echo "[1/5] 拉取最新代码"
git pull --ff-only

echo "[2/5] 安装生产依赖"
npm ci

echo "[3/5] 构建 Next.js"
npm run build

echo "[4/5] 配置 PM2 日志轮转"
npm run pm2:setup

echo "[5/5] 启动或重载 PM2 服务"
if "${PM2_BIN}" describe s2a-rate-web >/dev/null 2>&1; then
  "${PM2_BIN}" reload "${ECOSYSTEM_FILE}" --update-env
else
  "${PM2_BIN}" start "${ECOSYSTEM_FILE}"
fi

"${PM2_BIN}" save
"${PM2_BIN}" status

echo "部署完成"
