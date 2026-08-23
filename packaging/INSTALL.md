# Furigana for Spotify — Release package

## English

Requirements: Windows 10/11 or macOS 12+, Spotify Desktop, and [Spicetify](https://spicetify.app/docs/getting-started). Open Spotify and sign in for at least 60 seconds before installing.

Extract the ZIP completely. On Windows, open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

On macOS, open Terminal in this folder and run:

```sh
sh ./install.sh
```

To uninstall on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

To uninstall on macOS:

```sh
sh ./uninstall.sh
```

The installer preserves an existing installation as a timestamped backup before replacing it. It applies Spicetify and creates a **Furigana for Spotify** launcher with the project's original **ふ** icon in the Windows Start menu or `~/Applications` on macOS. Use that launcher for future starts: it checks the official GitHub Release at most once every 24 hours, installs only a newer stable package whose SHA-256 matches the published checksum, and then runs `spicetify auto` to repair supported Spotify updates. If the check or update fails, the installed version still opens. On Windows, the Microsoft Store build requires this launcher because the regular Store shortcut opens the unmodified UI.

To disable automatic Furigana updates, install with `-DisableAutoUpdate` on Windows or `SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE=1 sh ./install.sh` on macOS. The update check sends no Spotify data; it only accesses this project's public GitHub Release.

Reading conversion remains local by default. The sidebar settings page offers an optional experimental accurate-reading mode. Enabling it sends the public track title and artist to the disclosed GD Studio search endpoint and downloads synchronized lyrics and romanization for the selected NetEase Cloud Music track. If strict artist matching fails because services use different scripts, the public artist name is sent to MusicBrainz for high-confidence alias verification. The Spotify album name is used only for local result ranking. No Spotify credentials, cookies, account data, or Spotify-rendered lyrics are uploaded; unavailable results fall back to local reading rules and the dictionary.

## 简体中文

需要 Windows 10/11 或 macOS 12+、Spotify 桌面版，以及 [Spicetify](https://spicetify.app/docs/getting-started)。安装前请打开 Spotify 并登录至少 60 秒。

完整解压 ZIP。Windows 用户在解压目录中打开 PowerShell，运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOS 用户在解压目录中打开终端，运行：

```sh
sh ./install.sh
```

Windows 卸载命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

macOS 卸载命令：

```sh
sh ./uninstall.sh
```

覆盖安装前，安装器会把现有版本保留为带时间戳的备份。它会应用 Spicetify，并在 Windows 开始菜单或 macOS 的 `~/Applications` 创建带项目原创 **「ふ」图标**的 **Furigana for Spotify**。以后请用这个入口启动：它每 24 小时最多检查一次官方 GitHub Release，只安装版本更新且 SHA-256 与公开校验值一致的稳定版，然后运行 `spicetify auto` 修复受支持的 Spotify 更新。检查或升级失败时仍会打开当前版本。Windows Microsoft Store 版必须使用此入口；原来的 Store 快捷方式只会打开未修改界面。

如需关闭 Furigana 自动更新，Windows 安装时加入 `-DisableAutoUpdate`，macOS 使用 `SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE=1 sh ./install.sh`。更新检查不会发送 Spotify 数据，只访问本项目公开的 GitHub Release。

读音转换默认保持完全本地。侧边栏设置页提供可选的实验性精准读音模式；主动开启后，会把公开的歌曲名和歌手发送到已说明的 GD Studio 搜索接口，并下载匹配网易云曲目的同步歌词和罗马音。如果不同服务使用不同文字、导致歌手严格匹配失败，会把公开歌手名发送到 MusicBrainz 做高置信别名验证。Spotify 专辑名只在本机用于筛选；它不会上传 Spotify 凭据、Cookie、账号数据或 Spotify 当前显示的歌词；无结果时自动使用本地读音规则和词典。

## 日本語

Windows 10/11またはmacOS 12以降、Spotifyデスクトップ版、および[Spicetify](https://spicetify.app/docs/getting-started)が必要です。インストール前にSpotifyを開き、60秒以上ログインしてください。

ZIPを完全に展開します。Windowsでは展開したフォルダーでPowerShellを開き、次を実行します。

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOSでは展開したフォルダーでターミナルを開き、次を実行します。

```sh
sh ./install.sh
```

Windowsでのアンインストール：

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

macOSでのアンインストール：

```sh
sh ./uninstall.sh
```

上書きインストールの前に、既存バージョンはタイムスタンプ付きのバックアップとして保存されます。Spicetifyを適用し、WindowsのスタートメニューまたはmacOSの `~/Applications` にプロジェクト独自の **「ふ」アイコン**を使用した **Furigana for Spotify** を作成します。今後はこのランチャーを使用してください。24時間に最大1回、公式GitHub Releaseを確認し、公開SHA-256と一致する新しい安定版だけをインストールしてから、`spicetify auto` で対応済みのSpotify更新を修復します。確認や更新に失敗しても現在のバージョンを開きます。WindowsのMicrosoft Store版ではこのランチャーが必須で、通常のStoreショートカットは未変更のUIを開きます。

Furiganaの自動更新を無効にするには、Windowsでは `-DisableAutoUpdate` を付けてインストールし、macOSでは `SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE=1 sh ./install.sh` を使用します。更新確認ではSpotifyデータを送信せず、このプロジェクトの公開GitHub Releaseだけにアクセスします。

読み変換はデフォルトで完全ローカルです。サイドバーの設定画面には、任意の実験的な高精度読みモードがあります。有効にすると、公開曲名とアーティスト名を明示済みのGD Studio検索エンドポイントへ送り、選択したNetEase Cloud Music曲の同期歌詞とローマ字を取得します。サービス間の表記体系が異なって厳密なアーティスト照合に失敗した場合は、公開アーティスト名をMusicBrainzへ送り、高信頼の別名確認を行います。Spotifyのアルバム名はローカルでの候補選別にのみ使います。Spotifyの認証情報、Cookie、アカウント情報、Spotify画面の歌詞はアップロードせず、取得できない場合はローカル読み規則と辞書へ戻ります。

Project: https://github.com/huiishan99/spotify-furigana
