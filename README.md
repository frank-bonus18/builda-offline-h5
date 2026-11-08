# builda-offline-h5

给 AI 助手用的 **Builda（BuildaGame / 创游世界）HTML5 游戏接入技能**，全离线版。

装上之后，助手知道怎么把 Builda SDK 注入游戏、怎么查接口契约、怎么本地 mock 调试、怎么打包校验、怎么接联机与排行榜、发布前该自查什么。SDK 0.19.4 与工具链 0.4.117 的实体文件都固化在技能里，**不联网、不要授权也能工作**。

---

## 它解决什么问题

把 H5 游戏上到创游，反复踩的就是这些坑：

- SDK 注入位置不对，网页本地能跑，进游戏一片白
- 接口名凭印象写，`privateKV`、`matchKey` 拼错，回调永远不来
- 生命周期没接，切后台回来存档丢了
- 排行榜规则和榜单配置对不上，提交成功但榜上没分
- 内购与激励视频接在错误的时机，审核被打回
- 联机房间开了不知道传什么数据，掉线重连全乱
- 包体超限，打包时才被发现，得回来砍资源
- 发布前漏了红线项，上线后被下架

技能把这些变成「先读哪一篇、跑哪条命令」的固定流程，而不是靠人记。

---

## 内容

```
builda-offline-h5/
├── SKILL.md                     技能主体：两阶段流程与路由表
├── 参考资料/                     20 篇中文文档
│   ├── 01_安装与路由说明.md
│   ├── 02_联机安装说明.md
│   ├── 03_HTML5引擎接入.md
│   ├── 04_运行时与身份.md
│   ├── 05_存储与资源.md
│   ├── 06_音频与麦克风.md
│   ├── 07_商业化与输入与排行榜.md
│   ├── 08_事件回调.md
│   ├── 09_错误码与红线.md
│   ├── 10～12_联机体验/房间/社交与限制
│   ├── 13_持久化标识符.md
│   ├── 14_排行榜配置.md
│   ├── 15_打包规范.md
│   ├── 16_包体瘦身.md
│   ├── 17～18_Godot 多语言 / UnityWebGL
│   ├── 19_移动端性能.md
│   └── 20_发布前自查清单.md
├── 离线SDK_HTML5/
│   ├── builda-sdk.js            0.19.4 离线 SDK
│   ├── builda-sdk.d.ts          类型声明
│   ├── builda-dev-shell.html    本地调试试玩壳
│   ├── mic/builda-mic-worker.js 麦克风采集 worker
│   └── 版本信息.txt
└── 脚本/
    ├── 离线安装_HTML5.sh        注入 SDK 与工具链（Linux/macOS）
    ├── 离线安装_HTML5.ps1       同上（Windows）
    └── 工具链/
        ├── builda / builda.cmd / builda.ps1   工具链 0.4.117
        ├── 工具链安装说明.md
        ├── 工具链原始SKILL.md
        └── sdk-guidance/0.19.4/ 官方 SDK 指南 22 个文件
```

覆盖：SDK 注入、运行时与身份、云存档与 privateKV、音频与麦克风、事件回调、内购与激励视频、排行榜、联机房间（Room / matchKey）、持久化标识、打包与包体、错误码与红线、发布前自查、Godot 多语言、UnityWebGL、移动端性能。

---

## 安装

技能要放在助手的 `skills` 目录下（默认 `/skills`），**目录名必须是 `builda-offline-h5`** —— `SKILL.md` 里的脚本路径是绝对路径 `/skills/builda-offline-h5/脚本/...`。

### 一键安装

```bash
git clone https://github.com/frank-bonus18/builda-offline-h5.git
cd builda-offline-h5
./install.sh
```

`install.sh` 会：

1. 把 `builda-offline-h5/` 复制到 `${SKILLS_DIR:-/skills}/`
2. 给脚本和工具链加执行权限
3. 核对文件是否齐：SKILL.md、20 篇参考资料、22 个 SDK 指南、SDK 实体文件

已有旧版会先备份到 `${SKILLS_DIR}/.builda-backups/` —— 备份特意放在点目录里，因为 skills 目录下任何含 `SKILL.md` 的子目录都可能被扫成一个技能，备份到同级会凭空多出一个无效技能。

### 手动安装

```bash
mkdir -p /skills
cp -a builda-offline-h5 /skills/
chmod +x /skills/builda-offline-h5/脚本/*.sh /skills/builda-offline-h5/脚本/工具链/builda
```

### Windows

```powershell
git clone https://github.com/frank-bonus18/builda-offline-h5.git
cd builda-offline-h5
Copy-Item -Recurse -Force builda-offline-h5 "$HOME\.config\skills\"
```

## 用法

装好后直接跟助手说「把这个 H5 游戏接进创游」「帮我打包上传」「接一下排行榜」，它会自己走流程。也可以手动走：

```bash
# 1. 把 SDK 与工具链注入到游戏项目根
bash /skills/builda-offline-h5/脚本/离线安装_HTML5.sh /path/to/游戏项目根

# 2. 在项目根确认引擎
cd /path/to/游戏项目根 && ./.builda-agent/builda check
```

注入完成后项目里会有 `.builda-agent/sdk/web/builda-sdk.js`、`.builda-agent/sdk-version`（0.19.4）、可执行的 `.builda-agent/builda`。

不传参数时，安装脚本以当前目录为目标。

---

## 许可

MIT，署名「假期未知工作室」。见 [LICENSE](LICENSE)。
