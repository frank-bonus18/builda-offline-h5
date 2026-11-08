---
name: builda-offline-h5
description: >-
  Builda（BuildaGame / 创游世界）游戏接入与发布助手，全离线版。触发词：Builda、发布游戏、上传草稿、接入 SDK、联机、排行榜、内购、支付、
  云存档、privateKV、激励视频、广告、麦克风、Room、matchKey、Builda Online。用于给 HTML5 游戏注入 Builda SDK、按能力查接口契约、
  本地 mock 调试、zip 打包校验、联机接入与发布前自查。内置 0.19.4 离线 SDK 实体文件与中文参考资料，不联网也能工作。
compatibility: 需要 bash；离线 SDK 已内置，安装与本地调试无需联网、无需授权。
---

# Builda 游戏接入（全离线 HTML5 版）

SDK 0.19.4 / 工具链 0.4.117 的文档与 SDK 实体文件已固化在本技能内。回答接口问题时以下面的参考资料原文为准，
不要凭印象改接口名、参数或错误码。

## 第一阶段（固定顺序，不许跳过）

1. 注入 SDK 到目标项目根（含 `index.html` 或 `package.json` 的目录）：

   ```bash
   bash /skills/builda-offline-h5/脚本/离线安装_HTML5.sh /path/to/游戏项目根
   ```

   Windows：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "/skills/builda-offline-h5/脚本/离线安装_HTML5.ps1" -Target "C:\path\to\游戏项目根"
   ```

   脚本只复制本地的 `离线SDK_HTML5/` 与 `脚本/工具链/`，仅当本地文件缺失才联网降级。跑完应有
   `.builda-agent/sdk/web/builda-sdk.js`、`.builda-agent/sdk-version`（0.19.4）、可执行的 `.builda-agent/builda`。
   不带参数时目标是当前目录。

2. 读 [01 安装与路由说明](参考资料/01_安装与路由说明.md)，拿到工具链版本、项目根判定、`builda check` 与授权边界。

3. 在项目根跑 `./.builda-agent/builda check`；`engine=h5` 才继续按本技能走。

## 第二阶段：只读命中的那几篇

| 任务 | 读这个文件 |
| --- | --- |
| HTML5 怎么接、双版本机制、统一返回格式、本地调试、AI 指令 | [03 HTML5 引擎接入](参考资料/03_HTML5引擎接入.md) |
| runtime / whoami / requestToken / getRoleInfo / getServerTime / playerData | [04 运行时与身份](参考资料/04_运行时与身份.md) |
| privateKV 云存档、assets 资源包 | [05 存储与资源](参考资料/05_存储与资源.md) |
| audio（BGM/音效/震动）、mic 声控 | [06 音频与麦克风](参考资料/06_音频与麦克风.md) |
| iap 内购、ad 激励视频、input 文本输入、rank 排行榜 | [07 商业化与输入与排行榜](参考资料/07_商业化与输入与排行榜.md) |
| events 订阅回调、online / Game Data 概览 | [08 事件回调](参考资料/08_事件回调.md) |
| 错误码表、红线、持久化标识符注意点 | [09 错误码与红线](参考资料/09_错误码与红线.md) |
| KV key / payId / rankId 完整契约 | [13 持久化标识符](参考资料/13_持久化标识符.md) |
| rankBoards 排行榜配置 | [14 排行榜配置](参考资料/14_排行榜配置.md) |
| zip 入口、排除清单、bundle-check 规则 | [15 打包规范](参考资料/15_打包规范.md) |
| 包体超限、res/** 分包 | [16 包体瘦身](参考资料/16_包体瘦身.md) |
| 多语言与字体（Godot 小节可忽略） | [17 Godot 多语言](参考资料/17_Godot多语言.md) |
| Unity WebGL 导出 | [18 Unity WebGL](参考资料/18_UnityWebGL.md) |
| 移动端卡顿、发热、动态 DPR | [19 移动端性能](参考资料/19_移动端性能.md) |
| 交付前逐条打勾 | [20 发布前自查清单](参考资料/20_发布前自查清单.md) |

联机相关：先读 [10 联机体验与入口](参考资料/10_联机体验与入口.md)，再按需读
[11 联机房间与数据](参考资料/11_联机房间与数据.md)、[12 联机社交与限制](参考资料/12_联机社交与限制.md)、
[02 联机安装说明](参考资料/02_联机安装说明.md)（`--with-online`、Room 语言、Mock 与部署边界）。

专题文档与 SDK 同版本 0.19.4，不要跨版本混用接口。

## 发布路径（只在用户明确要求时走）

1. `./.builda-agent/builda auth`（幂等；把输出的 `authorization-url` 立刻作为消息发给用户）。
2. 构建产物打成 zip，zip 根就是 `index.html`；先跑 `./.builda-agent/builda bundle-check <zip>`。
3. `./.builda-agent/builda upload-build <zip>` 或 `publish` 同步草稿。只进 Builda 待发布区，玩家装到的是用户在 App 内走完审核后公开发布的 release。

## 红线

- 不擅自 `auth`：安装、接 SDK、本地调试都不需要授权；只有上传/建草稿/部署联机才需要，且只跑一次幂等的 `auth`。
- 不 `sdk upgrade`：版本锁在 `.builda-agent/sdk-version`，升级必须用户明确同意，不手写版本号。
- 不部署：`builda-online deploy` 只在用户明确要求上线时执行。
- 不混用 TypeScript / Rust Room：一个项目只保留一种 Room 语言；Unity 项目不装 H5 SDK。
- 不绕过 SDK 直调宿主桥：禁止碰 `window.__cysjHost`、`flutter_inappwebview.callHandler` 等底层桥。
- token 只在内存：`requestToken` 的 token 不写 privateKV、文件、URL、日志、存档。
- 麦克风 PCM 只在本地实时分析，禁止录音留存或上传。
- 无宿主不伪造成功：浏览器里支付/广告返回 `HOST_UNAVAILABLE` 是正确行为，不许兜底成「购买成功」。
- 不改 SDK 分发文件：`builda-sdk.js`、`builda-sdk.d.ts`、`builda-dev-shell.html` 由 `sdk install` 整体覆盖。
- 不上传源码、`node_modules/`、`.map`、`.env`、`.d.ts`、VCS 目录。

## 本地验证

`./.builda-agent/builda dev --web <构建目录或 zip>`，在输出的 `dev-url` 测试外壳里过身份、KV、安全区、支付/广告模态框。
mock 与真机差异见 [03 HTML5 引擎接入](参考资料/03_HTML5引擎接入.md) 的「mock 与真机的差异」表。

`离线SDK_HTML5/版本信息.txt` 记录了 SDK 版本、sha256 与文件名说明（`builda-sdk.js` 等是平台硬编码文件名，不可改）。
