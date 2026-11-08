#!/usr/bin/env bash
# Builda HTML5 SDK 离线注入脚本
# 用法: bash 离线安装_HTML5.sh [目标项目根目录]
# 默认目标为当前目录；优先使用技能内 离线SDK_HTML5/ 的实体文件，仅在本地缺失时联网降级。
set -euo pipefail

SITE_ORIGIN="https://builda.cn"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SDK_SRC="${SKILL_ROOT}/离线SDK_HTML5"
TOOL_SRC="${SCRIPT_DIR}/工具链"
TARGET="${1:-$PWD}"

echo "== Builda 离线安装（HTML5） =="
echo "技能目录: ${SKILL_ROOT}"
echo "目标项目: ${TARGET}"

if [ ! -d "${TARGET}" ]; then
  echo "错误: 目标目录不存在: ${TARGET}" >&2
  exit 2
fi
if [ ! -f "${TARGET}/index.html" ] && [ ! -f "${TARGET}/package.json" ]; then
  echo "提示: 目标目录下没有 index.html / package.json，确认这是 HTML5 项目根目录。" >&2
fi

mkdir -p "${TARGET}/.builda-agent"

if [ -f "${SDK_SRC}/builda-sdk.js" ]; then
  echo "-- 使用本地离线 SDK: ${SDK_SRC}"
  mkdir -p "${TARGET}/.builda-agent/sdk/web/mic"
  cp -f "${SDK_SRC}/builda-sdk.js"        "${TARGET}/.builda-agent/sdk/web/builda-sdk.js"
  cp -f "${SDK_SRC}/builda-sdk.d.ts"      "${TARGET}/.builda-agent/sdk/web/builda-sdk.d.ts"
  cp -f "${SDK_SRC}/builda-dev-shell.html" "${TARGET}/.builda-agent/sdk/web/builda-dev-shell.html"
  if [ -f "${SDK_SRC}/mic/builda-mic-worker.js" ]; then
    cp -f "${SDK_SRC}/mic/builda-mic-worker.js" "${TARGET}/.builda-agent/sdk/web/mic/builda-mic-worker.js"
  fi
  printf '0.19.4\n' > "${TARGET}/.builda-agent/sdk-version"

  if [ -f "${TOOL_SRC}/builda" ]; then
    echo "-- 使用本地离线 CLI: ${TOOL_SRC}/builda"
    cp -f "${TOOL_SRC}/builda"     "${TARGET}/.builda-agent/builda"
    cp -f "${TOOL_SRC}/builda.ps1" "${TARGET}/.builda-agent/builda.ps1"
    cp -f "${TOOL_SRC}/builda.cmd" "${TARGET}/.builda-agent/builda.cmd"
    cp -f "${TOOL_SRC}/VERSION"    "${TARGET}/.builda-agent/VERSION"
    chmod +x "${TARGET}/.builda-agent/builda" 2>/dev/null || true
    if [ -d "${TOOL_SRC}/sdk-guidance" ]; then
      mkdir -p "${TARGET}/.builda-agent/sdk-guidance"
      cp -R "${TOOL_SRC}/sdk-guidance/." "${TARGET}/.builda-agent/sdk-guidance/"
    fi
  fi

  echo "-- 校验本地注入结果"
  for f in builda-sdk.js builda-sdk.d.ts; do
    if [ ! -s "${TARGET}/.builda-agent/sdk/web/${f}" ]; then
      echo "错误: 注入后缺少 ${f}" >&2
      exit 1
    fi
  done
  echo "sdk-version=$(cat "${TARGET}/.builda-agent/sdk-version")"
  echo "sdk-web=${TARGET}/.builda-agent/sdk/web"
  if [ -x "${TARGET}/.builda-agent/builda" ]; then
    ( cd "${TARGET}" && ./.builda-agent/builda sdk check ) || true
  fi
else
  echo "-- 本地离线 SDK 缺失，降级联网安装（仅此一次）"
  if [ ! -x "${TARGET}/.builda-agent/builda" ]; then
    curl -fsSL --max-time 60 -o /tmp/builda-install.$$.sh "https://ai.builda.game/agent/releases/0.4.117/install.sh"
    ( cd "${TARGET}" && bash "/tmp/builda-install.$$.sh" --site-origin "${SITE_ORIGIN}" )
    rm -f "/tmp/builda-install.$$.sh"
  fi
  ( cd "${TARGET}" && ./.builda-agent/builda sdk install )
fi

echo "== 完成 =="
echo "下一步: 在游戏 index.html 的 <head> 保留 <script src=\"builda-sdk.js\"></script>，并在入口脚本第一行调用 Builda.runtime.ready()"
