<p align="center">
  <a href="../README.md">English</a> · <strong>简体中文</strong> · <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="../assets/logo.png" alt="Furigana for Spotify logo" width="168" />
</p>

<h1 align="center">Furigana for Spotify</h1>

<p align="center">
  <strong>在 Windows 与 macOS Spotify 桌面歌词上，为日语汉字实时显示平假名、片假名或罗马字读音。</strong>
  <br />
  默认本地处理 · 可选同步读音 · 无需 Spotify 凭据
</p>

<p align="center">
  <a href="https://github.com/huiishan99/spotify-furigana/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/huiishan99/spotify-furigana/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/huiishan99/spotify-furigana/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/huiishan99/spotify-furigana?display_name=tag&amp;label=release&amp;color=00A77D" /></a>
  <a href="https://github.com/huiishan99/spotify-furigana/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/huiishan99/spotify-furigana?style=flat&amp;logo=github&amp;color=00A77D" /></a>
  <img alt="Windows and macOS" src="https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS-4F46E5" />
  <img alt="Spotify Desktop 1.2.97 tested" src="https://img.shields.io/badge/Spotify%20Desktop-1.2.97%20tested-16A34A?logo=spotify&amp;logoColor=1ED760&amp;labelColor=191414" />
  <img alt="Spicetify 2.44 tested" src="https://img.shields.io/badge/Spicetify-2.44%20tested-F97366" />
  <a href="../LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-4338CA" /></a>
</p>

> [!IMPORTANT]
> 这是独立社区项目，与 Spotify AB 没有关联，也未获得其赞助或认可。项目自身标志不使用 Spotify 官方 logo；兼容性徽章中的标识仅用于说明目标平台。

> [!TIP]
> 如果这个项目让你更轻松地读完哪怕一首日语歌，欢迎[给它一个 Star](https://github.com/huiishan99/spotify-furigana)。Star 能帮助更多日语学习者发现它。

## 效果

<p align="center">
  <img src="../assets/marketing/demo.gif" alt="Windows Spotify 歌词页面中的实时日语振假名动态效果" width="100%" />
</p>

<p align="center">
  <sub>动图来自真实环境：Windows 11 · Spotify 1.2.97.270 · Spicetify 2.44.0。<a href="../assets/screenshots/lyrics-view.png">查看完整截图。</a>歌词、封面及 Spotify 界面元素的权利归各自权利方所有，仅用于展示插件运行效果。</sub>
</p>

插件直接增强 Spotify 已经显示的歌词，把汉字转换为标准 HTML `<ruby>` 注音：

| 原歌词 | 开启振假名后 |
| --- | --- |
| 声も聞かさないで | <ruby>声<rt>こえ</rt></ruby>も<ruby>聞<rt>き</rt></ruby>かさないで |
| 明日は晴れる | <ruby>明日<rt>あした</rt></ruby>は<ruby>晴<rt>は</rt></ruby>れる |

## 为什么用它

- **跟随原生歌词**：自动处理当前桌面歌词页，并兼容已知的全屏歌词布局。
- **默认完全本地**：Kuroshiro + Kuromoji 在电脑上完成分词与读音转换，不联系歌词服务。
- **常见人数离线纠正**：本地即可把 `一人` / `1人` 标成 `ひとり`、`二人` / `2人` 标成 `ふたり`，同时避开 `一人称`、`二人三脚` 等不同读法。
- **可选精准读音**：有同步罗马音时优先采用，用于歌曲特有或刻意变化的唱法。
- **随时确认读音来源**：把鼠标停在播放器底部的 `ふ` 按钮上，即可看到当前使用本地读音、同步精准读音，还是安全的本地回退。
- **中日英界面**：可以自动跟随 Spotify，也可以单独选择 English、简体中文或日本語。
- **自由调整显示**：可切换平假名、片假名与罗马字，并调整字号、透明度和上下间距。
- **保留 Spotify 原生歌词**：只增强 Spotify 当前显示的文字，不替换播放器或歌词时间轴。
- **随时开关**：通过播放器底部的歌词图标按钮，或左侧插件页面控制。

## 环境要求

- Windows 10/11，或 macOS 12 及更高版本
- Spotify 桌面版：Windows 使用 [spotify.com 桌面版](https://www.spotify.com/download/windows/)或 Microsoft Store 版（二选一）；macOS 使用 [spotify.com 版](https://www.spotify.com/download/mac/)
- [Spicetify](https://spicetify.app/docs/getting-started)

当前已实机验证：

| 组件 | 验证版本 |
| --- | --- |
| Windows | Windows 11 Pro 10.0.26200 |
| Spotify | Microsoft Store 版 1.2.97.270 |
| Spicetify | 2.44.0 |

其他版本可能也能工作，但尚未逐一验证。

macOS 安装器和生产构建已纳入 macOS CI 自动检查，但目前还没有登记真实 Spotify 客户端的验证报告。因此 macOS 属于新增支持，尚不能表述为已完成实机验证。

更多版本信息请查看[兼容性矩阵](./COMPATIBILITY.md)。

## 安装

<p>
  <a href="https://github.com/huiishan99/spotify-furigana/releases/latest"><img alt="下载最新版本" src="https://img.shields.io/badge/下载-最新版本-00A77D?style=for-the-badge&amp;logo=github" /></a>
</p>

从[最新 Release](https://github.com/huiishan99/spotify-furigana/releases/latest)下载 `spotify-furigana-vX.Y.Z.zip`，并完整解压。

### Windows

在解压目录中打开 PowerShell，运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

安装器会识别唯一的 Spotify 安装、备份现有 Furigana 版本、安装并启用插件、应用 Spicetify 配置，并在开始菜单创建 **Furigana for Spotify** 启动入口。这个入口使用项目原创的 **「ふ」图标**，方便与 Spotify 原版快捷方式区分。

安装完成后，请从开始菜单打开 **Furigana for Spotify**。这个入口每 24 小时最多检查一次官方 Furigana Release，再在启动 Spotify 前检查并重新应用 Spicetify。因此后续发布的新功能可以自动更新，普通重启后插件仍然有效，受支持的 Spotify 更新后也能自动修复。接着播放一首带歌词的日语歌曲并打开歌词页面；第一次转换时，本地词典需要短暂加载。

> [!IMPORTANT]
> Microsoft Store 用户必须使用 **Furigana for Spotify**，不能使用 Spotify 原来的普通快捷方式。安装器生成的入口会通过 `spicetify auto` 带上所需的应用目录；直接打开 Store 应用只会显示未修改的 Spotify。Spicetify 2.44 官方兼容范围只到 Spotify 1.2.93；上表的 Store 1.2.97 已由本项目实机验证，但仍超出 Spicetify 官方范围。

### macOS

在解压目录中打开终端，运行：

```sh
sh ./install.sh
```

安装器支持位于 `/Applications` 或 `~/Applications` 的 Spotify，会检查偏好设置、备份旧版、配置并应用 Spicetify，再在 `~/Applications` 创建带项目 **「ふ」图标**的 **Furigana for Spotify.app**。以后请用这个入口启动，它会自动安装官方 Furigana Release，并在打开 Spotify 前运行 `spicetify auto`。

## 更新

从 `v0.5.0` 开始，**Furigana for Spotify** 启动器每 24 小时最多检查一次 GitHub 官方最新 Release。发现新的稳定版本时，它会下载版本对应的 ZIP 和 `.sha256`、校验安装包、把当前版本保留为带时间戳的备份，然后在打开 Spotify 前完成升级；不会安装常驻后台更新程序。

如果 GitHub 暂时不可用、校验失败或安装失败，启动器只会在本机记录错误，并继续打开当前已安装的版本。更新检查不会发送 Spotify 凭据、账号信息、曲目信息或歌词，只会发出读取和下载本项目公开 GitHub Release 所需的普通 HTTPS 请求。

`v0.4.3` 及更早版本还没有更新器，需要手动安装一次 `v0.5.0`。下载并解压最新版 Release ZIP，然后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOS：

```sh
sh ./install.sh
```

如果不希望自动更新 Furigana，Windows 安装时加入 `-DisableAutoUpdate`：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -DisableAutoUpdate
```

macOS 使用 `SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE=1 sh ./install.sh`。以后不带该选项重新运行安装器即可重新开启自动更新。

## 调整注音显示

从 Spotify 左侧边栏打开 **Furigana for Spotify**，可以：

- 自动跟随 Spotify 界面语言，或单独选择 English、简体中文或日本語；
- 在平假名、片假名和罗马字之间切换；
- 将注音字号调整为 30%–75%；
- 将透明度调整为 40%–100%；
- 增加最多 8 px 的上下间距；
- 一键恢复默认显示。
- 开启实验性的在线精准读音，并随时清除其本地缓存。

设置会保存在本地并立即生效。

## 在线精准读音与隐私

在线精准读音**默认关闭**。开启后，插件会把当前公开的歌曲名和歌手发送到 GD Studio 搜索接口，再从网易云音乐获取选中曲目的同步歌词与罗马音。如果不同服务使用了不同文字、导致歌手严格匹配失败，插件会把公开歌手名发送到 MusicBrainz，并且只接受 `Fujii Kaze` ↔ `藤井風` 这类高置信别名。Spotify 专辑名只在本机用于筛选，发音数据只用于标注相匹配的 Spotify 歌词行。

插件不会发送 Spotify 凭据、Cookie、账号数据，也不会上传 Spotify 当前显示的歌词。这里的“同步”指第三方歌词与罗马音按时间戳配对，不是实时听歌或音频识别。成功结果最多在本机缓存 30 天；无结果会记录 6 小时，避免反复请求；最多保留 30 首歌。可以随时从设置页清除缓存。第三方服务和歌曲覆盖率不作保证，无法匹配时会自动使用本地读音规则和词典。

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

macOS：

```sh
sh ./uninstall.sh
```

## 常见问题

- **左侧栏没有 Furigana 页面：**运行 `spicetify apply`，然后重新启动 Spotify。
- **按钮出现但歌词没有变化：**确认歌曲有包含汉字的日语歌词、歌词按钮处于开启状态，并等待首次本地词典加载。
- **在线精准读音仍显示“使用本地词典”：**可能是歌词源没有同步罗马音、专辑或歌曲版本无法安全匹配，或者服务暂时不可用。插件会主动拒绝把不可靠结果套到当前歌曲。
- **Spotify 更新后插件消失：**关闭 Spotify，然后从 Windows 开始菜单或 macOS 的 `~/Applications` 打开 **Furigana for Spotify**；必要时手动运行一次 `spicetify backup apply`。
- **安装器检测到两个 Spotify：**保留 Microsoft Store 版或 [spotify.com 桌面版](https://www.spotify.com/download/windows/)中的一个，卸载另一个，打开保留版本至少 60 秒，再重新运行安装器。
- **Microsoft Store 版打开后没有 Furigana：**关闭它，从开始菜单使用 **Furigana for Spotify**；不要使用原来的 Store 快捷方式。
- **macOS 提示找不到 Spotify 或偏好设置：**将 Spotify 安装到 `/Applications` 或 `~/Applications`，打开并登录至少 60 秒，关闭后重新运行 `sh ./install.sh`。
- **macOS 启动器找不到 Spicetify：**重新安装 Spicetify，打开新的终端窗口，再运行一次 Furigana 安装器以重建启动器。
- **需要提交 Issue：**打开 Furigana 页面并点击**复制诊断信息**。报告只包含版本、设置、读音状态和选择器数量，不包含歌曲名、歌手、歌词、账号数据或凭据。

## 已知限制

- 本地模式已处理常见的一人、二人人数读法，但仍可能读错人名、地名、双关及特殊唱法；在线精准读音能改善已覆盖歌曲，但无法覆盖所有曲目和歌词行。
- Spotify 更新可能改变歌词 DOM；若插件突然失效，请在 issue 中附上 Spotify 与 Spicetify 版本。
- 不支持 Web Player 与移动端。macOS 已有自动化安装/构建覆盖，但仍等待公开的实机验证报告。

## 参与贡献

遇到问题或有新想法？可以提交 [Issue](https://github.com/huiishan99/spotify-furigana/issues)；准备 Pull Request 前请先阅读 [CONTRIBUTING.md](../CONTRIBUTING.md)。

安全问题请按照 [SECURITY.md](../SECURITY.md) 私下报告。

## 分享项目

[docs/LAUNCH_KIT.md](./LAUNCH_KIT.md) 已准备好中、日、英三种发布文案。如果插件对你有帮助，[给仓库一个 Star](https://github.com/huiishan99/spotify-furigana)或提交一份可靠的兼容性报告，就是最有价值的支持。

## 商标声明

Furigana for Spotify 是一个独立开源项目。Spotify、Spotify logo 及相关品牌元素是 Spotify AB 的商标。本项目与 Spotify AB 没有关联，也未获得其赞助或认可。“for Spotify”仅用于说明兼容平台。

项目图标为原创设计，使用“ふ”、注音条和音符表达日语歌词辅助功能。近黑、青翠绿和米白配色用于建立音乐流媒体产品的视觉联想；青翠绿与 Spotify Green 不同，图形也不使用 Spotify 的圆形、波纹或官方标识。参见 [Spotify Design & Branding Guidelines](https://developer.spotify.com/documentation/design)。

## License

[MIT](../LICENSE)
