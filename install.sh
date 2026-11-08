#!/usr/bin/env bash
#
# install.sh — 把 builda-offline-h5 技能安装到助手的 skills 目录。
#
# 用法：
#   ./install.sh                     # 安装到 /skills
#   SKILLS_DIR=~/my-skills ./install.sh
#   ./install.sh --force             # 已有同名目录时直接覆盖，不备份
#   ./install.sh --no-check          # 跳过安装后的完整性核对
#
# 目录名必须保持 builda-offline-h5：SKILL.md 里的脚本路径是
# /skills/builda-offline-h5/脚本/... 的绝对路径。

set -euo pipefail

SKILL_NAME="builda-offline-h5"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/$SKILL_NAME"
SKILLS_DIR="${SKILLS_DIR:-/skills}"
DEST="$SKILLS_DIR/$SKILL_NAME"

FORCE=0
DO_CHECK=1
for arg in "$@"; do
  case "$arg" in
    --force|-f)   FORCE=1 ;;
    --no-check)   DO_CHECK=0 ;;
    -h|--help)
      sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "未知参数: $arg（试试 --help）" >&2
      exit 2 ;;
  esac
done

echo "builda-offline-h5 安装器"
echo "  源目录  : $SRC"
echo "  目标目录: $DEST"
echo

if [ ! -d "$SRC" ]; then
  echo "✗ 找不到源目录 $SRC" >&2
  echo "  请在仓库根目录运行本脚本。" >&2
  exit 1
fi

if [ ! -f "$SRC/SKILL.md" ]; then
  echo "✗ $SRC 里没有 SKILL.md，这个仓库不完整。" >&2
  echo "  重新拉一次：git clone https://github.com/frank-bonus18/builda-offline-h5.git" >&2
  exit 1
fi

# 目标父目录
if [ ! -d "$SKILLS_DIR" ]; then
  echo "→ 创建 $SKILLS_DIR"
  if ! mkdir -p "$SKILLS_DIR" 2>/dev/null; then
    echo "✗ 无法创建 $SKILLS_DIR，可能需要管理员权限。" >&2
    echo "  可以改用：SKILLS_DIR=~/my-skills ./install.sh" >&2
    exit 1
  fi
fi

# 写入权限预检
if [ ! -w "$SKILLS_DIR" ]; then
  echo "✗ 没有 $SKILLS_DIR 的写权限。" >&2
  echo "  用 sudo 重跑，或指定别的位置：SKILLS_DIR=~/my-skills ./install.sh" >&2
  exit 1
fi

# 已有安装
if [ -e "$DEST" ]; then
  if [ "$FORCE" -eq 1 ]; then
    echo "→ --force：删除已有安装"
    rm -rf "$DEST"
  else
    # 备份放在点目录里：skills 目录下任何含 SKILL.md 的子目录
    # 都可能被扫描器当成一个技能，备份到同级会凭空多出一个无效技能。
    BACKUP_ROOT="$SKILLS_DIR/.builda-backups"
    mkdir -p "$BACKUP_ROOT"
    BACKUP="$BACKUP_ROOT/$SKILL_NAME-$(date +%Y%m%d-%H%M%S)"
    echo "→ 已有安装，备份到 ${BACKUP#$SKILLS_DIR/}"
    mv "$DEST" "$BACKUP"
  fi
fi

echo "→ 复制技能目录"
mkdir -p "$DEST"
cp -a "$SRC/." "$DEST/"

echo "→ 设置执行权限"
chmod +x "$DEST/脚本/离线安装_HTML5.sh" 2>/dev/null || true
chmod +x "$DEST/脚本/工具链/builda" 2>/dev/null || true

FILES=$(find "$DEST" -type f | wc -l | tr -d ' ')
SIZE=$(du -sh "$DEST" | cut -f1)
echo "  $FILES 个文件，共 $SIZE"

if [ "$DO_CHECK" -eq 1 ]; then
  echo
  echo "→ 核对安装"

  FAILED=0

  数() { find "$1" -type f | wc -l | tr -d ' '; }

  if grep -q '^name: builda-offline-h5' "$DEST/SKILL.md"; then
    echo "  ✓ SKILL.md 名称正确"
  else
    echo "  ✗ SKILL.md 里的 name 不是 builda-offline-h5"
    FAILED=1
  fi

  APIDOC=$(数 "$DEST/参考资料")
  if [ "$APIDOC" -eq 20 ]; then
    echo "  ✓ 参考资料 20 篇"
  else
    echo "  ✗ 参考资料应有 20 篇，实际 $APIDOC 篇"
    FAILED=1
  fi

  GUIDE=$(数 "$DEST/脚本/工具链/sdk-guidance/0.19.4")
  if [ "$GUIDE" -eq 22 ]; then
    echo "  ✓ SDK 指南 22 个文件"
  else
    echo "  ✗ SDK 指南应有 22 个文件，实际 $GUIDE 个"
    FAILED=1
  fi

  MISS_FILE=0
  for REQ in \
    "$DEST/离线SDK_HTML5/builda-sdk.js" \
    "$DEST/离线SDK_HTML5/builda-sdk.d.ts" \
    "$DEST/离线SDK_HTML5/builda-dev-shell.html" \
    "$DEST/离线SDK_HTML5/mic/builda-mic-worker.js" \
    "$DEST/脚本/离线安装_HTML5.sh" \
    "$DEST/脚本/离线安装_HTML5.ps1" \
    "$DEST/脚本/工具链/builda"
  do
    if [ ! -s "$REQ" ]; then
      echo "  ✗ 缺失或为空：${REQ#$DEST/}"
      MISS_FILE=1
      FAILED=1
    fi
  done
  if [ "$MISS_FILE" -eq 0 ]; then
    echo "  ✓ SDK 与工具链文件齐（SDK / 声明 / 调试壳 / 麦克风 worker / 安装脚本 / 工具链）"
  fi

  if [ -x "$DEST/脚本/工具链/builda" ]; then
    echo "  ✓ 工具链可执行"
  else
    echo "  ✗ 工具链没有执行权限，手动补：chmod +x $DEST/脚本/工具链/builda"
    FAILED=1
  fi

  if [ "$FAILED" -ne 0 ]; then
    echo
    echo "✗ 安装完成，但核对未通过。文件已就位：$DEST" >&2
    exit 1
  fi
fi

echo
echo "✓ 安装完成：$DEST"
echo
echo "下一步："
echo "  1. 在助手的技能管理里启用 $SKILL_NAME"
echo "  2. 让它做点相关的事试试，比如「把这个 H5 游戏接进创游」"
echo
echo "手动接入一个项目："
echo "  bash $DEST/脚本/离线安装_HTML5.sh /path/to/游戏项目根"
echo "  cd /path/to/游戏项目根 && ./.builda-agent/builda check"
