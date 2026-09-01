# Devlog

## 2026-09-01 — Reliability and maintenance hardening

- GitHub 仓库恢复为自动更新器原本锁定的 canonical 名称 `huiishan99/spotify-furigana`；已发布启动器的严格 Release URL 校验重新通过，Windows 老版本无需修改本地脚本即可继续发现更新。
- 新增四组隐私安全的 Spotify 歌词 DOM fixture，覆盖当前桌面歌词、旧版标准歌词、旧版全屏歌词和带生成式类名前缀的布局；选择器测试现在会解析真实 HTML 结构，而不是只检查字符串常量。

## 2026-08-30 — More responsive desktop lyrics

- 当前句与下一句的 Furigana 继续并行转换；当前句最多给预览一个 16 ms 帧时间，快速命中时仍合并为一次平滑换句，预览较慢时则先发送当前句、完成后独立补入，并用渲染代次阻止过期结果覆盖新歌词。
- Spotify 侧播放进度采样从 250 ms 缩短到 125 ms，悬浮窗回环接收间隔从 100 ms 缩短到 50 ms；不含动画的最坏轮询等待由约 350 ms 降到约 175 ms，同时保持 Spotify 进程状态检查仍为每秒一次。
- Windows 悬浮歌词单独增加 300 ms 时间前置：临近换句且 Spotify 页面仍高亮旧行时，悬浮窗改用客户端的行级时间戳提前触发下一句，让 360 ms 上滑动画在唱到新句时已经接近完成；完整歌词页的高亮和插件内 Furigana 时机保持不变。
- 修复切到其他应用后悬浮歌词可能停在某句、重新聚焦 Spotify 才追上的问题：悬浮同步新增 Spicetify `onprogress` 播放事件驱动，页面计时器只作为兼容回退，因此不再把后台 Chromium 的计时器降频当作唯一时钟。
- 悬浮窗的回环接收器现在会忽略 Spotify 在切后台、重启或重新应用插件时留下的半截请求，单个超时连接不再导致 WPF 悬浮层退出。
- 悬浮窗宽度从 860 px 收紧到 720 px；左侧「ふ」徽标放大到 34 px、字符增至 19 px，并固定在独立的窗口左栏内向右贴近歌词区，歌词长短和换句动画不会再带动徽标移动。
- 新增渐进发布与过期预览取消测试。压力诊断确认 WPF 首批不同文字会建立字体渲染缓存，但后续 200 次换句句柄保持稳定，因此没有保留风险更高的悬浮窗视觉树重写。
- 本轮保持开发版 `0.6.1`，不创建 Release。

## 2026-08-28 — v0.6.1 adjustable desktop lyric sizes

- 中、日、英三语设置页在 Windows 悬浮歌词卡片中新增“当前句字号”和“下一句字号”两个独立滑块，分别提供 26–44 px 与 12–24 px 的安全范围，默认保持原有 30 px / 20 px 比例。
- 调整值通过现有本地设置与事件机制即时保存、即时发送到桌面悬浮窗；无需重启 Spotify，也不会改变 Spotify 歌词页面内的振假名尺寸。
- 桌面悬浮窗按主文字字号同比缩放对应 Furigana，并在接收端再次限制范围；旧版本状态缺少新字段时继续使用原默认值，保持兼容。
- 换句动画改为真正的双行接替：旧当前句向上淡出，下方预览句从原位置向上移动并同步放大为主字号，新预览句延后从底部淡入；非连续跳转则使用较短距离的上滑回退。
- 悬浮窗缓存完整渲染状态，相同的心跳消息不再清空并重建文字，避免歌词未变化时出现周期性闪烁；只改变字号或读音时会原位刷新，不误触发换句动画。
- 诊断报告加入两项悬浮字号，三语 README 同步补充独立调整能力，测试覆盖默认值、持久化、异常值限制与安装包脚本契约。
- 版本提升至 `0.6.1`，与已经公开的 `v0.6.0` 安装包区分；本轮仅准备并实装开发版，不创建新标签或 Release。

## 2026-08-27 — v0.6.0 floating current lyric

- 重写中、日、英三语 README 的首屏与功能叙述：用“在 Spotify 中直接读懂歌词”作为核心价值，将透明双行桌面歌词、默认本地处理、可选精准读音、显示定制和自动更新压缩为更清晰的用户收益，并把最新版下载入口前置。
- 新增默认关闭、仅限 Windows 的“当前句悬浮显示”：当前歌词与 Furigana 进入独立 WPF 原生窗口，即使切到浏览器、Codex、记事本或其他程序也保持系统级置顶，不再局限于 Spotify 窗口内部。
- 根据桌面歌词使用场景移除整块深色卡片、绿色外框与大面积阴影，只保留带描边感阴影的歌词和读音；「ふ」与关闭按钮默认低透明度、鼠标移入才显现，窗口高度同步收窄，减少对其他应用内容的遮挡。
- 桌面歌词升级为双行预览：当前句保持主字号，下一句及其 Furigana 会提前完成转换并以较小字号显示在下方；换句时复用预转换缓存，并用 180 ms 淡入上移动画缓和直接跳句的突兀感。
- Spotify 扩展继续使用客户端自身的行级时间戳与播放进度，不猜测音频时间轴；生成的安全文本/读音分段只通过 `127.0.0.1:43841` 发送给本机窗口，并校验 Spotify XPUI Origin、消息版本、长度和数量，不监听局域网、不保存歌词。
- Windows 品牌启动器会隐藏启动桌面歌词进程，再运行 `spicetify auto`；互斥锁防止重复窗口，Spotify 退出 8 秒后伴随进程自动结束。窗口可拖动，只把坐标写入 `%LOCALAPPDATA%\Furigana for Spotify\overlay-position.json`，下次恢复到可见屏幕范围内。
- 中日英设置与用户文档明确桌面歌词的 Windows 平台边界；构建、Release 包、安装器和自动更新完整性检查均包含 `overlay.ps1`，macOS 保留 Spotify 内歌词注音但禁用桌面悬浮开关。
- 在 Windows 11 + Spotify 1.2.97.270 + Spicetify 2.44.0 实装验证：正常无调试参数启动后，原生窗口显示当前《きらり》歌词及逐段读音；把记事本切到前台后窗口仍可见且带 `WS_EX_TOPMOST`，Spotify 全部进程退出后窗口按设计自动结束，随后从品牌启动器重开可恢复窗口与已保存位置。
- 版本提升至 `0.6.0`；测试增加桌面歌词分段、固定回环传输、WPF/启动器/安装包契约，总计 71 项通过。

## 2026-08-26 — v0.5.1 visible reading source and privacy-safe diagnostics

- 播放器底部 `ふ` 按钮的无障碍标签与悬停提示会实时显示本地读音、同步精准读音及在线不可用时的本地回退；缓存命中也保留匹配行数，用户无需进入设置页即可确认当前来源。
- 扩展会在状态发生变化时发布一份版本化诊断快照，记录 Furigana/Spicetify 版本、平台、界面语言、设置、读音状态、歌词选择器命中数及已注音/等待行数；明确不采集歌曲名、歌手、URI、歌词、账号数据、Cookie、令牌或凭据。
- 中日英设置页新增诊断摘要与一键复制按钮，便于提交不含歌词内容的 Issue；构建时从 `package.json` 注入应用版本，避免诊断版本漂移。
- 新增诊断格式、隐私字段和三语读音来源测试；版本提升至 `0.5.1`，三语用户文档同步说明状态提示与诊断入口。
- 修复 Windows 启动器在 Spotify 运行期间占用 Custom App 安装目录的问题：快捷方式与脚本都切换到独立状态目录，后续安装包或自动更新可安全替换插件目录。
- Windows Store 版 Spotify 更新造成 Spicetify 备份版本不一致时，安装器现在会显式确认受支持的备份刷新流程，避免隐藏安装与自动更新停在交互式 `[y/N]` 提示后回滚。
- 修复 Spotify 1.2.97 启动或路由切换时替换 `<body>` 后歌词观察器失效的问题：观察根节点改为稳定的 `document.documentElement`，歌词页和诊断计数会在新页面挂载后继续更新。
- 歌词扫描与诊断发布不再依赖后台 WebView 会暂停的 `requestAnimationFrame`，改用合并式零延时任务；切到歌词页后即使 Spotify 暂时失去前台焦点，注音也会完成。
- 在 Spotify 1.2.97.270 + Spicetify 2.44.0 实装验证设置诊断、来源悬停提示和后台歌词扫描，并以正确显示 `二人 → ふたり`、`一人 → ひとり` 的真实《きらり》画面刷新仓库截图、社交预览与演示 GIF。
- 修正 README 演示 GIF 的高亮框：范围收紧到单行歌词，并与 Spotify 画面共用缩放变换，动画过程中不再偏离文字。

## 2026-08-23 — v0.5.0 checksum-verified automatic updates

- Windows 开始菜单与 macOS `.app` 启动器新增 Furigana Release 自动更新：每 24 小时最多检查一次官方稳定版，按语义版本判断是否升级，不安装 draft、prerelease 或非 `vX.Y.Z` 标签。
- 更新器要求 Release 同时存在精确版本名的 ZIP 与 `.sha256`，下载后验证 SHA-256、包内版本和必需安装文件；通过后才以无递归启动模式运行安装器，并继续使用原有可恢复备份流程。
- GitHub 不可用、资源缺失、校验错误或安装失败时只写入本机更新日志，继续运行已安装版本与 `spicetify auto`；没有常驻后台进程，也不会发送 Spotify 凭据、账号数据、曲目信息或歌词。
- Windows 安装器改为让品牌快捷方式启动内置更新器，macOS `.app` 同步携带启动器与版本元数据；安装时可用 `-DisableAutoUpdate` 或 `SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE=1` 关闭自动更新。
- 构建产物新增 `launcher.ps1`、`launcher.sh` 和 `version.txt`，卸载时会把更新状态与日志移到可恢复目录；版本提升至 `0.5.0`，三语 README、离线说明与开发文档同步更新。
- Windows 隔离测试覆盖正确升级、SHA-256 不匹配和发布服务离线三条路径；本机安装后确认开始菜单快捷方式指向更新启动器、官方最新 `v0.4.3` 低于已装 `v0.5.0` 时记录无需更新，并继续成功打开 Spotify。版本发现改用 GitHub `releases/latest` 网页重定向，不消耗 REST API 配额。

## 2026-08-23 — Visible playbar Furigana icon

- 修复播放器底部「ふ」按钮只有 32×32 可点击区域、图标却不可见的问题：自定义 SVG 没有固有尺寸，被 Spicetify 的图标容器计算为 `0 × 0`。
- 为 SVG 的显示尺寸与内部坐标统一设置 `16 × 16`，通过字形中心线把「ふ」与相邻 Lyrics 图标垂直居中并统一视觉大小；同时去掉小尺寸下显得多余的注音横杠，保留 `currentColor` 跟随 Spotify 的普通、悬停和启用状态。
- 在 Microsoft Store Spotify 1.2.96.518 + Spicetify 2.44.0 中实测：修复前图标容器宽度为 `0`、SVG 为 `0 × 0`；修复后容器与 SVG 均为 `16 × 16`，按钮保持在 Lyrics 左侧。
- 图标测试新增固有宽高约束，防止后续重构再次产生零尺寸 SVG；运行时诊断代码未保留在生产构建中。

## 2026-08-21 — v0.4.3 multilingual app UI

- 修复 GitHub Issue #5：设置页不再固定为中文；首次使用会根据 Spotify 内嵌页面/系统语言自动选择 English、简体中文或日本語，无法识别时默认 English。
- 设置页新增可持久化的 `Auto / English / 简体中文 / 日本語` 选择器，切换后立即更新全部设置、隐私说明、在线状态与无障碍标签，不需要重新启动 Spotify。
- 播放器底部「ふ」按钮、开关通知、词典错误和在线状态同步使用所选语言；状态事件改用稳定代码与动态行数，避免缓存中文消息污染其他语言。
- 新增语言解析、手动覆盖、设置页翻译和动态状态测试；版本提升至 `0.4.3`。

## 2026-08-19 — v0.4.2 cross-script artist matching

- 复现《満ちてゆく》显示“当前歌曲暂无同步读音”：网易云实际存在同步罗马音，但 Spotify 使用英文艺名 `Fujii Kaze`，搜索结果使用日文艺名 `藤井風`，原有严格歌手匹配因此安全回退。
- 严格匹配失败时新增 MusicBrainz 二次别名验证；只有分数至少 95 且记录自身名称、排序名或别名能精确对应 Spotify 歌手时，才把跨文字体系名称加入候选，仍拒绝同名翻唱和相似艺名。
- 修复同一官方歌曲存在多个发行版本时的提前回退：《旅路》的 Spotify 专辑版候选没有罗马音，但单曲版有；现在会按专辑匹配度排序，并在最多四个经过严格歌名和歌手验证的候选中寻找可用同步读音。
- 同一 Spotify 会话内只缓存成功验证过的歌手别名，避免同一歌手换歌时重复查询，也避免一次空响应让该歌手在整个会话中永久失配；MusicBrainz 不可用时保持原有安全回退。
- 设置页、中英日 README、离线安装说明和安全策略新增第三个主机与发送字段披露；版本提升至 `0.4.2`。

## 2026-08-19 — v0.4.1 reliable people-counter readings

- 确认在线模式在缺少第三方同步罗马音时会按设计回退 Kuromoji，但 Kuromoji 会把常见的 `一人`、`二人` 和 `1人2人` 拆开读成 `いちにん`、`ににん`。
- 新增与歌曲无关的本地短语纠正规则：离线也能把 `一人 / 1人 / １人` 标成 `ひとり`，把 `二人 / 2人 / ２人` 标成 `ふたり`，并兼容平假名、片假名与罗马字模式。
- 通过上下文保护避免误改 `一人称`、`二人称`、`一人前`、`二人前`、`二人羽織`、`二人三脚` 以及 `十二人`、`11人`；在线同步读音仍优先用于歌曲特有唱法。
- 新增本地规则和完整词典集成测试，版本提升至 `0.4.1`。

## 2026-08-18 — v0.4.0 macOS support

- 新增可恢复的 macOS Release 安装与卸载脚本：识别 `/Applications` 和 `~/Applications` 中的 Spotify，配置官方 Resources/prefs 路径，把应用安装到 Spicetify CustomApps，并在失败时恢复旧版本。
- 安装器会在 `~/Applications` 创建带项目「ふ」图标的 **Furigana for Spotify.app**；该入口通过 `spicetify auto` 启动 Spotify，使受支持的客户端更新后可以自动重新应用修改。
- Release ZIP 同时包含 Windows PowerShell 与 macOS shell 安装器，生产构建增加 macOS 启动器图像；安装、升级、卸载、启动器、shell 语法和平台路径均有契约测试。
- CI 扩展到 Windows、macOS 与 Linux；三语 README、离线安装说明、兼容性边界、问题模板及发布文案同步更新。macOS 暂仅声明自动化覆盖，等待真实 Spotify 客户端验证报告后再加入实机兼容表。
- 版本提升至 `0.4.0`。

## 2026-08-17 — v0.3.0 synchronized accurate readings

- 新增默认关闭的“在线精准读音（实验性）”：用户主动开启后，只发送公开曲名与歌手进行搜索，并在本机用 Spotify 专辑名辅助筛选网易云曲目；弱匹配、无结果、超时和错误都会自动回退本地词典。
- 将同步罗马音转换为假名并按歌词中的假名锚点对齐汉字块，支持平假名、片假名和罗马字显示；实测数据可把 `二人だけの空が広がる夜に` 标成 `ふたりだけのそらがひろがるよるに`，不再依赖 Kuromoji 对 `二人` 的拆字猜测。
- 成功结果本地缓存 30 天、无结果缓存 6 小时，最多保留 30 首歌；设置页显示查询状态、明确两个外部主机及发送字段，并提供清除缓存按钮。不会发送 Spotify 凭据、Cookie、账号数据或 Spotify 当前渲染的歌词。
- 新增 WanaKana 5.3.1 及完整 MIT 许可证，补充曲目匹配、时间戳配对、罗马音转换、助词发音、缓存期限和在线优先回退测试；版本提升至 `0.3.0`。
- 在 Microsoft Store Spotify 1.2.96.518 + Spicetify 2.44.0 完成 v0.3.0 覆盖安装、设置开关、真实外部请求、无结果回退、缓存清除后立即重查与 59 个实时 ruby 元素验证；已验证目标同步样例能在 Spotify 运行时取回，最终行对齐仍以自动化集成测试为证据边界。

## 2026-08-17 — Original Windows launcher icon

- 将启动器从 Spotify 官方图标改为项目原创的「ふ」Logo，并将名称统一为品牌规范更清晰的 `Furigana for Spotify`；旧 `Spotify with Furigana` 快捷方式会在升级时保留为带时间戳的备份。
- 新增确定性的多尺寸 Windows ICO 生成脚本，并把图标纳入构建、Release 包、安装器完整性检查及安装器测试。
- 安装器现在将快捷方式图标指向已安装 Custom App 内的 `launcher.ico`；三语 README 同步说明入口识别方式，版本提升至 `0.2.3`。

## 2026-08-17 — Persistent Windows installation

- Release 安装器会识别 spotify.com 与 Microsoft Store 两种 Windows 客户端，并在同时安装两种版本时停止，避免配置和快捷方式指向不同客户端。
- 安装器会主动设置对应的 `spotify_path` 与 `prefs_path`，先无重启执行 `spicetify apply`，仅在 Spotify 更新导致旧备份不可用时回退到 `spicetify backup apply`，并移除可绕过实际应用步骤的 `-SkipApply`。
- 安装后在开始菜单创建 **Spotify with Furigana** 自修复启动入口，并立即通过 `spicetify auto` 启动；Microsoft Store 版由此获得必需的 `--app-directory`，Spotify 更新后也会检查并重新应用修改，卸载器会一并移除该入口。
- Spicetify 查找逻辑兼容常规 `PATH`、官方脚本目录和 WinGet 安装目录，并新增安装契约测试。
- 在 Microsoft Store Spotify 1.2.96.518 + Spicetify 2.44.0 上完成安装包、应用产物哈希、完整关闭/自修复启动及无障碍界面树验证；三语文档同时标明 Spicetify 2.44 官方兼容范围只到 1.2.93。
- 将三语用户文档与 Release 离线说明更新为持久启动流程，补丁版本提升为 `0.2.2`。

## 2026-08-16 — Recognizable playbar icon

- 将播放器底部的通用歌词图标替换为项目专属「ふ」图标，并保留顶部注音条元素，使其在小尺寸下也能关联到 Furigana for Spotify。
- 图标使用 `currentColor` 跟随 Spotify 的普通、悬停和启用状态，不使用 Spotify 官方圆形或波纹标识。
- 新增图标结构测试，防止后续改动意外退回 Spotify 内置图标名称。
- 将补丁版本提升为 `0.2.1`，确保 Release 安装用户可以直接获得新图标。

## 2026-08-16 — User-focused README

- 将三语 README 收敛为功能介绍、兼容环境、Release 安装、更新、显示设置、卸载、故障排查与支持入口。
- 移除源码构建、仓库结构、内部实现、测试命令和已完成路线图，避免普通用户在安装路径中阅读开发信息。
- 新增独立 `docs/DEVELOPMENT.md`，集中保存架构、源码入口、构建、打包、源码安装和验证边界，并从贡献指南链接。

## 2026-08-16 — v0.2.0 roadmap completion

- 完成平假名、片假名、罗马字三种注音模式；切换模式时会安全重建当前歌词，并用逐行转换代次避免快速切换产生旧结果覆盖新结果。
- 设置页新增字号、透明度、上下间距滑块与一键恢复默认，全部通过 Spicetify LocalStorage 本地持久化并实时同步到播放器扩展。
- 设置页新增 Spicetify 运行时状态和版本提示；播放栏开关与完整设置继续共享同一状态。
- 新增设置默认值、非法值约束、完整持久化和三种读音输出测试；测试总数从 10 增加到 16。
- 新增公开兼容性矩阵，明确区分实机验证与自动化布局覆盖；CI 同时在 Windows 和 Linux 上检查当前及旧版歌词选择器、类型、测试和生产构建。
- 将原始路线图全部标记完成，并把版本提升为 `0.2.0`；Marketplace 发现所需的公开仓库、`spicetify-apps` topic 与根目录 manifest 已齐备。
- 生成并校验 v0.2.0 Release ZIP；在本机安装时保留了旧版本备份，且确认已安装扩展与构建产物的 SHA-256 完全一致。

## 2026-08-16 — Open-source launch and discovery kit

- 新增仓库根目录 Marketplace `manifest.json` 与 `spicetify-apps` 发布准备，使项目满足 Spicetify Marketplace 的发现元数据要求。
- 使用原创 Logo 和真实 Spotify 实机截图确定性生成 `1280 × 640` 社交封面与 `960 × 540` 演示 GIF；保留 SVG 源文件、生成脚本、素材清单与来源说明，不使用生成式方式重画歌词或界面。
- 三语 README 增加 Release、Star、下载入口、动态演示、统一的更新/卸载流程与分享引导。
- 新增贡献指南、安全策略、行为准则、Bug/兼容性与功能请求表单、PR 模板，以及中日英三语发布文案。
- 将仓库级 Git 提交邮箱切换为 GitHub noreply；未重写旧提交历史，以免破坏已发布的标签与 Release。

## 2026-08-16 — Installable v0.1.0 release packaging

- 新增 `npm run package`，把预编译扩展、Kuromoji 词典、MIT License、三语离线说明和 PowerShell 安装/卸载器打包为 Release ZIP，并生成 SHA-256 校验文件。
- Release 包同时附带所有已打包运行时依赖的完整许可证与 Kuromoji notice，避免把项目 MIT License 误当成第三方代码和词典的许可证。
- 安装器会在覆盖前保留带时间戳的旧版本备份，任一步骤失败时回滚；卸载器将安装目录移动到可恢复位置，不直接永久删除。
- 新增 tag 驱动的 GitHub Release workflow：校验 tag 与 `package.json` 版本一致，运行编译、测试和打包，再上传 ZIP 与校验文件。
- 三语 README 增加 Release 快速安装路径，同时保留源码构建方式。

## 2026-08-16 — Multilingual documentation structure

- 将根目录 `README.md` 改为英文默认入口，并新增 `docs/README.zh-CN.md` 与 `docs/README.ja.md` 两份完整翻译。
- 三种语言在顶部互相链接，并保持 Logo、徽章、截图、功能、安装、限制、路线图、贡献和商标说明一致。
- 增加仓库结构说明；审查确认 `app/`、`src/`、`tests/`、`scripts/`、`types/` 与 `assets/` 职责清晰，因此只新增 `docs/`，不移动源码或破坏现有构建路径。

## 2026-08-16 — Streaming-inspired app logo palette

- 将 App 主 Logo 从靛蓝/珊瑚色调整为近黑、青翠绿与米白，在不使用 Spotify 官方标识的前提下强化音乐流媒体产品联想。
- 保留原有“ふ”、注音条、歌词卡、音符和整体轮廓；青翠绿代表色约为 `#01CA95`，与 Spotify Green `#1ED760` 保持明显差异。
- 最终图标为 `1254 × 1254` 透明 PNG，并验证四角 alpha 为 `0`，适合作为 README 与后续应用图标素材。

## 2026-08-16 — Open-source README and original branding

- 重写 README，加入项目视觉头图、状态徽章、效果示例、快速安装、更新/卸载、工作原理、兼容性范围与贡献指引。
- 新增原创透明背景图标，以“ふ”、注音条和音符表达日语歌词辅助功能，并避开 Spotify 的绿色、圆形和波纹品牌元素。
- 增加 Windows Spotify 实机歌词截图，展示插件在当前 Spotify 1.2.96.518 + Spicetify 2.44.0 环境中的真实运行效果，并标注第三方界面与内容权利归属。
- 在 README 兼容性徽章区增加 `Spotify Desktop 1.2.96 tested`，使用独立的 Spotify 平台图标作兼容性归属说明；项目主标志仍保持原创且不包含 Spotify 品牌元素。
- 将用户可见名称统一为 `Furigana for Spotify`，并增加独立项目与商标免责声明，避免暗示官方关联。
- 保持仓库现有可见性不变，公开前由仓库所有者最终确认。

## 2026-08-16 — Spotify 1.2.96 runtime selector fix

- 在 Microsoft Store Spotify 1.2.96.518 + Spicetify 2.44.0 中完成真实运行时诊断。
- 确认扩展脚本、播放器开关和 12 个 Kuromoji 词典资源均已加载。
- 修复 Spotify 1.2.96 移除歌词行 `data-testid` 后无法匹配歌词的问题。
- 修复 Kuromoji 经 `path-browserify` 解析完整 URL 后产生重复域名、导致词典请求 404 的问题。
- 词典加载失败后停止自动重试，避免对同一批本地资源持续发起无效请求。
- 新增当前 `.lyrics-lyricsContent-text` 布局与旧版布局的回归测试。

## 2026-08-16 — 改为 Windows Spotify 桌面端

- 根据需求澄清，将目标从 Spotify Web Player 浏览器扩展改为 Windows Spotify 桌面客户端。
- 使用 Spicetify Custom App 的 `subfiles_extension` 在 Spotify 启动时加载歌词增强逻辑。
- 增加播放器底部快速开关和侧边栏设置页面，状态通过 Spicetify LocalStorage 保存。
- 将 Kuromoji 词典打包为 Custom App 本地 assets，继续保持歌词不上传。
- 新增 esbuild 桌面插件构建流程、资源路径测试和 Windows 手动安装说明。
- 当前机器安装的是 Microsoft Store 版 Spotify，且未安装 Spicetify；已完成静态验证，但尚未完成桌面端实际注入验证。

## 2026-08-16 — MVP scaffold

- 选择 WXT + TypeScript 构建 Manifest V3 浏览器扩展。
- 使用 Kuroshiro 和 Kuromoji 在本地生成振假名，不引入歌词上传服务。
- 为 Kuromoji 的浏览器构建加入 `path-browserify` 兼容层。
- 支持 Spotify 的 `lyrics-line` 与 `fullscreen-lyric` 两类歌词节点。
- 增加开关弹窗、单元测试、生产构建和 GitHub Actions CI。
- 明确 MVP 边界：尚未完成 Chrome Web Store 发布，也未在所有 Spotify 账号/地区布局中验证。
