# Furigana for Spotify — Release package

## English

Requirements: Windows 10/11 or macOS 12+, Spotify Desktop, and [Spicetify](https://spicetify.app/docs/getting-started). Open Spotify and sign in for at least 60 seconds before installing.

**Release status (2026-10-08):** the latest published release is [v0.6.2](https://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.2), dated 2026-09-02. Download `spotify-furigana-v0.6.2.zip`; its checksum is `spotify-furigana-v0.6.2.zip.sha256`. The same ZIP contains the Windows and macOS install scripts. The repository source is **v0.6.3, unreleased**; no Setup EXE is currently published. Use the release ZIP, not GitHub’s source-code ZIP.

On Windows, extract the ZIP completely, open PowerShell in this folder, and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

On macOS, open Terminal in this folder and run:

```sh
sh ./install.sh
```

**For a future release that includes Setup:** if its release page provides `Furigana-for-Spotify-Setup-vX.Y.Z.exe`, you can use that wizard instead. The unreleased Setup offers a native Windows launcher, optional desktop shortcut and automatic updates, a Start menu entry, and an Installed apps entry. The desktop shortcut is selected by default. Setup installations can be removed from **Settings → Apps → Installed apps**.

To uninstall the currently published ZIP installation on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

To uninstall on macOS:

```sh
sh ./uninstall.sh
```

The installer preserves an existing installation as a timestamped backup before replacing it. It applies Spicetify and creates a **Furigana for Spotify** launcher with the project's original **ふ** icon in the Windows Start menu or `~/Applications` on macOS. Use that launcher for future starts: it checks the official GitHub Release at most once every 24 hours, installs only a newer stable package whose SHA-256 matches the published checksum, and then runs `spicetify auto` to repair supported Spotify updates. If the check or update fails, the installed version still opens. On Windows, the Microsoft Store build requires this launcher because the regular Store shortcut opens the unmodified UI.

**Windows updater recovery:** launchers shipped through v0.6.2 reject the release URL after the repository redirects to `huiishan99/extension-Furigana-for-Spotify`. They still open the installed version but cannot download their own repair. Once a fixed release is published, manually download and extract its release ZIP and rerun `install.ps1` once. No fixed release is published as of 2026-10-08; reinstalling v0.6.2 does not fix this issue.

On Windows, this launcher also starts the optional desktop-lyrics window. The native macOS window is available only in unreleased v0.6.3 source, not the current release ZIP. Enable **Floating current lyric** in the Spotify sidebar settings to show the synchronized line and furigana above other apps. Lyric communication stays on the device through a fixed loopback listener, only the screen position is saved, and the window exits with Spotify.

To disable automatic Furigana updates, install with `-DisableAutoUpdate` on Windows or `SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE=1 sh ./install.sh` on macOS. The update check sends no Spotify data; it only accesses this project's public GitHub Release.

Reading conversion remains local by default. The sidebar settings page offers an optional experimental accurate-reading mode. Enabling it sends the public track title and artist to the disclosed GD Studio search endpoint and downloads synchronized lyrics and romanization for the selected NetEase Cloud Music track. If strict artist matching fails because services use different scripts, the public artist name is sent to MusicBrainz for high-confidence alias verification. The Spotify album name is used only for local result ranking. No Spotify credentials, cookies, account data, or Spotify-rendered lyrics are uploaded; unavailable results fall back to local reading rules and the dictionary.

## 简体中文

需要 Windows 10/11 或 macOS 12+、Spotify 桌面版，以及 [Spicetify](https://spicetify.app/docs/getting-started)。安装前请打开 Spotify 并登录至少 60 秒。

**发布状态（2026-10-08）：**最新已发布版本为 2026-09-02 发布的 [v0.6.2](https://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.2)。请下载 `spotify-furigana-v0.6.2.zip`，校验文件为 `spotify-furigana-v0.6.2.zip.sha256`；同一个 ZIP 包含 Windows 和 macOS 安装脚本。仓库源码为 **v0.6.3，尚未发布**，目前没有已发布的 Setup EXE。请使用这一发布附件，而不是 GitHub 自动生成的源码 ZIP。

Windows 用户请完整解压 ZIP，在解压目录中打开 PowerShell 并运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOS 用户在解压目录中打开终端，运行：

```sh
sh ./install.sh
```

**适用于未来包含 Setup 的发布版本：**只有在 Release 页面提供 `Furigana-for-Spotify-Setup-vX.Y.Z.exe` 时，才可以使用该向导安装。未发布的 Setup 提供原生 Windows 启动器、可选桌面图标和自动更新，并创建开始菜单入口及“已安装的应用”条目；桌面图标默认勾选。Setup 安装可从“设置 → 应用 → 已安装的应用”中卸载。

当前已发布 ZIP 版的 Windows 卸载命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

macOS 卸载命令：

```sh
sh ./uninstall.sh
```

覆盖安装前，安装器会把现有版本保留为带时间戳的备份。它会应用 Spicetify，并在 Windows 开始菜单或 macOS 的 `~/Applications` 创建带项目原创 **「ふ」图标**的 **Furigana for Spotify**。以后请用这个入口启动：它每 24 小时最多检查一次官方 GitHub Release，只安装版本更新且 SHA-256 与公开校验值一致的稳定版，然后运行 `spicetify auto` 修复受支持的 Spotify 更新。检查或升级失败时仍会打开当前版本。Windows Microsoft Store 版必须使用此入口；原来的 Store 快捷方式只会打开未修改界面。

**Windows 更新器恢复：**v0.6.2 及以前发布的启动器会拒绝仓库重定向后的 `huiishan99/extension-Furigana-for-Spotify` 发布地址。它们仍会打开已安装版本，但无法自动下载修复自身的更新。修复版发布后，请手动下载并解压其 Release ZIP，重新运行一次 `install.ps1`。截至 2026-10-08，尚未发布修复版；重装 v0.6.2 无法解决此问题。

Windows 启动器还会启动可选的桌面歌词窗口。原生 macOS 窗口目前仅在未发布的 v0.6.3 源码中提供，当前 Release ZIP 不包含此功能。在 Spotify 侧边栏设置中打开 **当前句悬浮显示**，即可让同步歌词与 Furigana 置顶显示在其他程序上方。歌词通过固定的本机回环端口通信，只保存屏幕位置，并随 Spotify 一同退出。

如需关闭 Furigana 自动更新，Windows 安装时加入 `-DisableAutoUpdate`，macOS 使用 `SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE=1 sh ./install.sh`。更新检查不会发送 Spotify 数据，只访问本项目公开的 GitHub Release。

读音转换默认保持完全本地。侧边栏设置页提供可选的实验性精准读音模式；主动开启后，会把公开的歌曲名和歌手发送到已说明的 GD Studio 搜索接口，并下载匹配网易云曲目的同步歌词和罗马音。如果不同服务使用不同文字、导致歌手严格匹配失败，会把公开歌手名发送到 MusicBrainz 做高置信别名验证。Spotify 专辑名只在本机用于筛选；它不会上传 Spotify 凭据、Cookie、账号数据或 Spotify 当前显示的歌词；无结果时自动使用本地读音规则和词典。

## 日本語

Windows 10/11またはmacOS 12以降、Spotifyデスクトップ版、および[Spicetify](https://spicetify.app/docs/getting-started)が必要です。インストール前にSpotifyを開き、60秒以上ログインしてください。

**リリース状況（2026-10-08）：**最新の公開版は2026-09-02リリースの [v0.6.2](https://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.2) です。`spotify-furigana-v0.6.2.zip` をダウンロードしてください。チェックサムは `spotify-furigana-v0.6.2.zip.sha256` です。同じZIPにWindowsとmacOSのインストールスクリプトが含まれます。リポジトリのソースは **v0.6.3、未リリース**で、Setup EXEはまだ公開されていません。GitHubのソースコードZIPではなく、この配布ZIPを使用してください。

WindowsではZIPを完全に展開し、このフォルダーでPowerShellを開いて次を実行します。

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOSでは展開したフォルダーでターミナルを開き、次を実行します。

```sh
sh ./install.sh
```

**今後、Setupを含むリリースが公開された場合：**リリースページに `Furigana-for-Spotify-Setup-vX.Y.Z.exe` が掲載されていれば、そのウィザードでもインストールできます。未リリースのSetupはネイティブWindowsランチャー、デスクトップショートカットと自動更新の選択、スタートメニュー項目、「インストールされているアプリ」への登録に対応します。デスクトップショートカットは既定で選択されます。Setup版は **設定 → アプリ → インストールされているアプリ** から削除できます。

現在公開されているZIP版をWindowsでアンインストールする場合：

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

macOSでのアンインストール：

```sh
sh ./uninstall.sh
```

上書きインストールの前に、既存バージョンはタイムスタンプ付きのバックアップとして保存されます。Spicetifyを適用し、WindowsのスタートメニューまたはmacOSの `~/Applications` にプロジェクト独自の **「ふ」アイコン**を使用した **Furigana for Spotify** を作成します。今後はこのランチャーを使用してください。24時間に最大1回、公式GitHub Releaseを確認し、公開SHA-256と一致する新しい安定版だけをインストールしてから、`spicetify auto` で対応済みのSpotify更新を修復します。確認や更新に失敗しても現在のバージョンを開きます。WindowsのMicrosoft Store版ではこのランチャーが必須で、通常のStoreショートカットは未変更のUIを開きます。

**Windowsの更新機能の復旧：**v0.6.2以前に配布されたランチャーは、リポジトリのリダイレクト先である `huiishan99/extension-Furigana-for-Spotify` のリリースURLを拒否します。インストール済みの版は開きますが、自身の修正をダウンロードできません。修正版の公開後、そのRelease ZIPを手動でダウンロードして展開し、`install.ps1` を一度再実行してください。2026-10-08時点では修正版は未公開です。v0.6.2を再インストールしても解消しません。

Windowsのランチャーは、任意のデスクトップ歌詞ウィンドウも起動します。ネイティブmacOSウィンドウは未リリースのv0.6.3ソースにのみ含まれ、現在のRelease ZIPには含まれません。Spotifyサイドバー設定の **現在の歌詞をフローティング表示** をオンにすると、同期歌詞とふりがながほかのアプリより前面に表示されます。歌詞通信は固定ループバックリスナーを通じて端末内だけで行い、画面上の位置だけを保存し、Spotifyと一緒に終了します。

Furiganaの自動更新を無効にするには、Windowsでは `-DisableAutoUpdate` を付けてインストールし、macOSでは `SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE=1 sh ./install.sh` を使用します。更新確認ではSpotifyデータを送信せず、このプロジェクトの公開GitHub Releaseだけにアクセスします。

読み変換はデフォルトで完全ローカルです。サイドバーの設定画面には、任意の実験的な高精度読みモードがあります。有効にすると、公開曲名とアーティスト名を明示済みのGD Studio検索エンドポイントへ送り、選択したNetEase Cloud Music曲の同期歌詞とローマ字を取得します。サービス間の表記体系が異なって厳密なアーティスト照合に失敗した場合は、公開アーティスト名をMusicBrainzへ送り、高信頼の別名確認を行います。Spotifyのアルバム名はローカルでの候補選別にのみ使います。Spotifyの認証情報、Cookie、アカウント情報、Spotify画面の歌詞はアップロードせず、取得できない場合はローカル読み規則と辞書へ戻ります。

Project: https://github.com/huiishan99/extension-Furigana-for-Spotify
