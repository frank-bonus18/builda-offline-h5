<!--
离线快照
源: https://ai.builda.game/game-sdk/sdk-guide.html
抓取日期: 2026-11-06
固化方式: 逐条完整照录，未做摘要/浓缩/省略
-->
<!-- 收录章节: Builda SDK 是什么、双版本机制：mock 开发版与 runtime 正式版、统一返回格式、接入方式（按引擎）、HTML5（pixi / phaser / Cocos / 原生 canvas）、Godot（Web 导出）、Unity（WebGL 导出）、本地开发与调试、builda dev 测试外壳、mock 环境 URL 参数、mock 与真机的差异、发布前自查清单、常用的 AI 指令、进一步阅读 -->

<h1>Builda SDK</h1>
      <p>面向把游戏发布到 Builda 平台的开发者（Godot Web / HTML5 / Unity WebGL）：Builda SDK 提供哪些能力、
如何接入使用，以及必须遵守的注意事项。打包与上传规范见 <code>h5_bundle_spec.md</code>，本文只讲 SDK 本身。</p>
      <p><strong>复制给 AI</strong></p>
      <pre><code class="language-text" id="setup-instruction">Install Builda game tools from /agent/setup.md
</code></pre>
      
<h2 id="是什么">Builda SDK 是什么</h2>
      <p>Builda SDK 是游戏与 Builda 平台（Builda App 宿主）之间的<strong>唯一</strong>接口层，以全局对象
<code>window.Builda</code> 暴露给游戏。三个引擎共用同一套 JS API；Godot 与 Unity 各有一层官方包装
（GDScript addon / C# 静态类），语义与 JS 完全一致。</p>
      <div class="table-wrap"><table>
        <thead><tr><th>模块</th><th>能力</th></tr></thead>
        <tbody>
          <tr><td><code>runtime</code></td><td>就绪通知、退出、安全区/胶囊按钮避让、当前语言</td></tr>
          <tr><td><code>whoami</code> / <code>requestToken</code></td><td>当前玩家身份、game-scoped 短期服务 token</td></tr>
          <tr><td><code>getRoleInfo</code> / <code>getServerTime</code></td><td>其他玩家的公开昵称与头像、Builda 服务端权威时间</td></tr>
          <tr><td><code>privateKV</code></td><td>玩家私域云存档（当前游戏 × 当前玩家）</td></tr>
          <tr><td><code>assets</code></td><td>平台资源包（assets.zip）URL 解析</td></tr>
          <tr><td><code>audio</code></td><td>BGM / 音效 / 静音 / 震动 / 麦克风权限</td></tr>
          <tr><td><code>mic</code></td><td>麦克风 PCM 流原语（声控玩法）</td></tr>
          <tr><td><code>pay</code></td><td>内购支付面板</td></tr>
          <tr><td><code>ad</code></td><td>激励视频广告</td></tr>
          <tr><td><code>input</code></td><td>平台原生文本输入面板</td></tr>
          <tr><td><code>rank</code></td><td>排行榜提交与查询</td></tr>
          <tr><td><code>events</code></td><td>订阅式回调：App 切后台/回前台、暂停面板弹出/关闭</td></tr>
        </tbody>
      </table></div>

      
<h3>双版本机制：mock 开发版与 runtime 正式版</h3>
      <p>SDK 有两个实现，<strong>API 表面完全一致</strong>，游戏代码不需要区分环境：</p>
      <ul>
        <li><strong>mock 开发版</strong>（<code>builda sdk install</code> 装进项目、<code>builda dev</code> 本地伺服）：只跑在浏览器里。身份/存档本地伪造（localStorage）、音频/震动走浏览器原生能力、支付/广告弹 mock 模态框由你手工点「成功/失败」。用于本地开发调试。</li>
        <li><strong>runtime 正式版</strong>（发布在平台 CDN）：只跑在 Builda App 宿主内，所有能力走宿主原生实现。无宿主时一律返回失败态（<code>HOST_UNAVAILABLE</code>）或 <code>available: false</code>，<strong>绝不伪造成功</strong>。</li>
      </ul>
      <blockquote>
        <p><strong>关键契约：游戏 zip 不打包 SDK 文件本身。</strong><code>index.html</code> 的 <code>&lt;head&gt;</code> 用根相对路径引用
<code>&lt;script src="builda-sdk.js"&gt;&lt;/script&gt;</code>。本地 <code>builda dev</code> 自动兜底伺服 mock 版；正式运行时由
Builda App 按 release manifest 的 <code>sdk</code> 契约从 CDN 下载正式版注入到同一路径。上传校验会硬查这条引用；
构建工具（vite/webpack）不要把它当模块打包，必须保持 <code>&lt;script&gt;</code> 外链形态。</p>
      </blockquote>

      
<h3>统一返回格式</h3>
      <p>所有<strong>异步</strong> API 返回 Promise，结果是统一的 Result 结构，不抛异常：</p>
      <pre><code>{ "ok": true,  "data": { } }
{ "ok": false, "error": { "code": "BAD_KEY", "message": "..." } }</code></pre>
      <p>少数纯本地数据接口是<strong>同步裸返回</strong>（不包 Result、不需要 await）：<code>runtime.safeArea()</code>、
<code>runtime.capsuleMenuRect()</code>、<code>runtime.language()</code>、<code>assets.url()</code> / <code>assets.baseUrl</code>，
以及 <code>mic.read()</code>（实时数据要当帧拿到）。多数异步 API 支持 <code>opts.timeoutMs</code>（默认 120 秒），
超时返回 <code>code: "PENDING"</code>。</p>
      <p>除请求式 API 外还有一组<strong>订阅式回调</strong> <code>Builda.events.on/off</code>（宿主主动推给游戏的事件：App
切后台/回前台、暂停面板弹出/关闭），见下方「events：订阅式回调」。</p>

      
<h2 id="接入方式">接入方式（按引擎）</h2>
      <p>三个引擎共同的前提：项目已按首页 / upload 页的安装任务装好项目级工具链（<code>./.builda-agent/builda</code>）。
没装的话，点右上角「复制给 AI」把安装任务发给你项目里的 AI 即可。</p>

      
<h3>HTML5（pixi / phaser / Cocos / 原生 canvas）</h3>
      <ol>
        <li>项目根运行 <code>./.builda-agent/builda sdk install</code> —— mock SDK、<code>builda-sdk.d.ts</code>、测试外壳装到 <code>.builda-agent/sdk/web/</code>（可再生，不入库）。</li>
        <li>游戏 HTML <code>&lt;head&gt;</code> 加 <code>&lt;script src="builda-sdk.js"&gt;&lt;/script&gt;</code>（根相对路径，构建产物必须保留）。</li>
        <li>直接调用 <code>window.Builda.*</code>。<strong>游戏最开始必须调用</strong> <code>Builda.runtime.ready()</code>（入口脚本第一件事）。</li>
        <li>TypeScript 项目可把 <code>builda-sdk.d.ts</code> 加进 tsconfig include 获得类型提示。</li>
        <li>本地验证：<code>./.builda-agent/builda dev --web dist</code>，在输出的 dev-url 测试外壳里验收。</li>
      </ol>
      <pre><code>Builda.runtime.ready();                                 // 游戏最开始必调（30 秒内没收到会被强制关闭）

const who = await Builda.whoami();
if (who.ok) console.log(who.data.name);

await Builda.privateKV.set("save_slot1", bytes);        // bytes: Uint8Array
const r = await Builda.privateKV.get("save_slot1");     // r.data === null 表示 key 不存在</code></pre>

      
<h3>Godot（Web 导出）</h3>
      <ol>
        <li>在 Godot 项目根（含 <code>project.godot</code>）运行 <code>./.builda-agent/builda sdk install</code> 与
<code>./.builda-agent/builda sdk check</code>。会安装 <code>addons/builda/</code>（SDK 包装 <code>builda.gd</code>、mock JS、示例），
把推荐封装 <code>BuildaClient.gd</code> 拷到 <code>scripts/</code> 并注册 Autoload，同时把 SDK 引用写进 Web 导出 preset 的
<code>html/head_include</code>。</li>
        <li>结果模型是<strong>异步 request/signal</strong>：每次调用返回 <code>request_id</code>，结果经
<code>sdk_result(request_id, result)</code> 信号回来（<code>result</code> 即统一 Result 的 Dictionary 形态）：
          <pre><code>var builda = BuildaClient.builda
var rid := builda.whoami()
# 在 sdk_result 回调里按 request_id 匹配结果

builda.private_kv_set("save", var_to_bytes(save_dict))
# 读取侧：bytes_to_var(builda.private_kv_bytes(result.data))</code></pre>
          字节类值（privateKV、mic 样本）过桥统一 base64，用 <code>private_kv_bytes()</code> / <code>mic_samples()</code> 还原；
存档格式统一用 <code>var_to_bytes()</code> / <code>bytes_to_var()</code>。</li>
        <li><strong>游戏最开始必须调用</strong> <code>builda.runtime_ready()</code>（自动装好的 <code>BuildaClient</code> Autoload 已在 <code>_ready()</code> 第一件事调用）。</li>
        <li>编辑器 / 非 Web 导出下所有调用返回 <code>UNSUPPORTED</code>（不崩溃）；行为验证必须导出 Web 后用
<code>builda dev --web build/web</code> 在浏览器里做。</li>
        <li>不要手动混拷不同版本的 addon / JS / d.ts；版本不一致时重跑 <code>sdk install</code>。
<code>scripts/BuildaClient.gd</code> 归你的项目所有，可按需修改，升级不覆盖。</li>
      </ol>

      
<h3>Unity（WebGL 导出）</h3>
      <ol>
        <li>Unity 项目根运行 <code>./.builda-agent/builda sdk install</code> —— C# 包装层与 jslib 桥装到
<code>Assets/Builda/</code>，Builda WebGL 模板装到 <code>Assets/WebGLTemplates/Builda/</code>。</li>
        <li><code>Player Settings → Resolution and Presentation → WebGL Template</code> 选 <strong>Builda</strong>
（模板已含 SDK 引用；自定义模板需自己在 <code>&lt;head&gt;</code> 加）。</li>
        <li>调用 <code>Builda</code> 命名空间下的静态类 <code>BuildaSDK</code>，异步 API 传回调：
          <pre><code>using Builda;

BuildaSDK.RuntimeReady(_ =&gt; {});                   // 游戏最开始必调（30 秒内没收到会被强制关闭）
BuildaSDK.Whoami(result =&gt; {
    if (result.Ok) Debug.Log(result.DataMap["name"]);
});
BuildaSDK.KvSet("save_slot1", bytes);              // byte[]，SDK 内部 base64 过桥
BuildaSDK.KvGet("save_slot1", r =&gt; {
    var data = BuildaSDK.KvBytes(r.Data);          // null = key 不存在
});
var lang = BuildaSDK.RuntimeLanguage();            // 同步 API 直接返回</code></pre></li>
        <li>编辑器 / 非 WebGL 平台所有调用返回 <code>UNSUPPORTED</code> 失败态（不抛异常）。验证同样走 WebGL 导出 + <code>builda dev</code>。</li>
      </ol>

      
<h2 id="本地调试">本地开发与调试</h2>

      
<h3>builda dev 测试外壳</h3>
      <pre><code>./.builda-agent/builda dev --web &lt;构建目录&gt;          # 如 dist、build/web
./.builda-agent/builda dev --web build/web --safearea 44,0,34,0   # 模拟刘海+底部横条</code></pre>
      <p>打开输出的 dev-url，测试外壳提供：横竖屏切换、刘海/安全区模拟、胶囊按钮模拟、支付/广告 mock 模态框
（模拟宿主面板盖在 WebView 上）、「拒绝麦克风」/「麦克风中断」开关、「切后台」按钮（模拟宿主前后台推送）；
胶囊按钮弹出的暂停面板同时模拟 <code>events.pausePanel</code>。</p>

      
<h3>mock 环境 URL 参数</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>参数</th><th>作用</th></tr></thead>
        <tbody>
          <tr><td><code>builda_mock_player</code> / <code>builda_mock_name</code></td><td>切换 mock 玩家身份（KV 按玩家隔离）</td></tr>
          <tr><td><code>builda_mock_lang=es-419</code></td><td>覆盖 <code>runtime.language()</code> 返回值，测语言回退</td></tr>
          <tr><td><code>builda_mock_safearea=44,0,34,0</code></td><td>即 <code>--safearea</code>，注入安全区（上,右,下,左）</td></tr>
          <tr><td><code>builda_mock_mic=deny</code></td><td>模拟用户拒绝麦克风</td></tr>
        </tbody>
      </table></div>

      
<h3>mock 与真机的差异</h3>
      <blockquote>
        <p>本地测过 ≠ 真机没问题。mock 验证接口形态与 UI 流程；真实身份、KV、支付、广告、排行榜语义只能走草稿流程
在 Builda App 待发布区试玩验证。</p>
      </blockquote>
      <div class="table-wrap"><table>
        <thead><tr><th>能力</th><th>mock（builda dev）</th><th>真机（Builda App）</th></tr></thead>
        <tbody>
          <tr><td>身份</td><td>URL 参数假玩家</td><td>真实登录玩家</td></tr>
          <tr><td>privateKV</td><td>localStorage（配额校验一致；<strong>写频率不管控</strong>）</td><td>宿主落服务端/本地，写频率 60/min</td></tr>
          <tr><td>支付/广告</td><td>模态框手工点成功/失败</td><td>宿主真实面板/广告</td></tr>
          <tr><td>音频</td><td>浏览器 <code>Audio</code>（受 autoplay 限制）</td><td>宿主原生，无 autoplay 限制</td></tr>
          <tr><td>排行榜</td><td>不校验榜单配置，固定假对手</td><td>按已发布 rankBoards 权威校验</td></tr>
          <tr><td>requestToken</td><td>伪造 token，连不上真实服务</td><td>宿主向平台换发真 token</td></tr>
          <tr><td>events.appVisibility</td><td>外壳「切后台」按钮模拟宿主推送；切标签页走浏览器兜底</td><td>宿主 <code>onAppEvent</code> 推送 + WebView 兜底</td></tr>
          <tr><td>events.pausePanel</td><td>外壳胶囊按钮弹出的暂停面板 / 「继续游戏」</td><td>宿主「已暂停」面板弹出/关闭推送</td></tr>
          <tr><td>SDK 文件</td><td>dev 兜底伺服 mock 版</td><td>宿主按 manifest 从 CDN 注入正式版</td></tr>
        </tbody>
      </table></div>

      
<h3>发布前自查清单</h3>
      <ul>
        <li>游戏最开始就调用了 <code>runtime.ready()</code>，且任何启动路径都能调到（dev 时看 console 有无 15 秒警告；真机 30 秒内没收到会被强制关闭）。</li>
        <li><code>index.html</code> <code>&lt;head&gt;</code> 保留 <code>&lt;script src="builda-sdk.js"&gt;</code> 外链，zip 未打包 SDK 文件。</li>
        <li>私域字节存档走 privateKV；Online 服务器管理的 Player Data 独立，无 localStorage/本地文件自存；写入按事件节点、无定时写。</li>
        <li>没有自做的音乐/音效开关、退出按钮、「点击开启声音」引导层。</li>
        <li>关键 UI 避让 safeArea 与 capsuleMenuRect（<code>--safearea</code> 实测横竖屏）。</li>
        <li>支付走 <code>Builda.iap</code>（不是 legacy <code>pay</code>）；<code>success</code> 只表示付钱成功；<code>grantBy=client</code> 才按 orderId 在客户端幂等发放并 <code>claim</code>，<code>grantBy=room</code> 把 orderId 交 Room。</li>
        <li>文本输入走 <code>showInputPanel</code>，未自绘输入框。</li>
        <li>使用排行榜的：manifest <code>rankBoards</code> 已声明且代码里 <code>rankId</code> 一致。</li>
        <li>使用 assets 的：无写死 CDN URL；<code>res/**</code> 资源未重复打进主包；加载失败分支实测过。</li>
        <li>使用 BuildaMic 的（Godot）：<code>addons/builda/mic/web/</code> 已拷进导出目录随 zip 分发。</li>
        <li>声控游戏：拒绝权限、中断/恢复、开 BGM 灵敏度等用例在外壳里逐条过。</li>
      </ul>

      
<h2 id="AI指令">常用的 AI 指令</h2>
      <p>装好工具链后，以下任务直接把这句话说给你的 agent（Claude Code / Cursor 等）即可：</p>
      <div class="table-wrap"><table>
        <thead><tr><th>指令</th><th>作用</th></tr></thead>
        <tbody>
          <tr><td>打开本地预览</td><td>启动本地 mock 页面，可在 PC 网页端预览 App 内的效果</td></tr>
          <tr><td>上传草稿</td><td>将游戏上传到 Builda App，随后可在 App 内发布</td></tr>
          <tr><td>部署服务器（联机游戏）</td><td>上传并激活 Room 服务端源码，由 Builda Online Skill 执行，见 <a href="https://ai.builda.game/online/index.html">Builda Online 用户文档</a></td></tr>
        </tbody>
      </table></div>

      
<h2 id="进一步阅读">进一步阅读</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>文档</th><th>内容</th></tr></thead>
        <tbody>
          <tr><td><code>h5_bundle_spec.md</code></td><td>游戏 zip 打包规范（入口、排除清单、分引擎校验规则）</td></tr>
          <tr><td><code>md_persistent_ids.md</code></td><td>持久化标识符（KV key / payId / rankId）完整契约</td></tr>
          <tr><td><code>md_rankboards.md</code></td><td>排行榜 manifest 配置完整契约</td></tr>
          <tr><td><code>md_bundle_size.md</code></td><td>包体瘦身与 <code>res/**</code> 资源分包实战</td></tr>
          <tr><td><code>md_godot_i18n.md</code> / <code>md_unity_webgl.md</code></td><td>多语言与字体、Unity WebGL 导出专题</td></tr>
          <tr><td><code>md_mobile_perf.md</code></td><td>移动端性能 / 动态 DPR</td></tr>
          <tr><td><a href="https://ai.builda.game/online/index.html">Builda Online 用户文档</a></td><td>联机能力：玩家体验选择、匹配与房间、Builda App 自带的房间聊天与邀请、使用限制；AI 安装：<code>builda sdk install --with-online</code>，说明见 <code>https://ai.builda.game/online/releases/0.19.4/setup.md</code></td></tr>
        </tbody>
      </table></div>
      <p><code>md_*</code> 专题文档随 SDK 0.19.4 一起发布在 <code>https://ai.builda.game/game-sdk/releases/0.19.4/</code>，也随三个引擎包的 <code>guidance/</code> 安装到项目；<code>h5_bundle_spec.md</code> 随 Agent 工具链分发。</p>
