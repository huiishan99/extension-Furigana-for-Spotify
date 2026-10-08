# Launch kit

Copy for sharing Furigana for Spotify v0.6.3 after publication. Always check each community's self-promotion rules before posting.

Publication gate: use this copy only after the [v0.6.3 release page](https://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3) lists `spotify-furigana-v0.6.3.zip`, `spotify-furigana-v0.6.3.zip.sha256`, `Furigana-for-Spotify-Setup-v0.6.3.exe`, and `Furigana-for-Spotify-Setup-v0.6.3.exe.sha256`. Confirm the release workflow and asset checks succeeded before announcing availability. Windows updaters through v0.6.2 cannot install their own repository-rename repair; keep the one-time manual ZIP reinstall instructions in each post. Automated multi-platform, native-helper, and package checks do not add new live Spotify-client validation; existing compatibility reports remain the real-client evidence.

## English

### Title

I built a local-first Spicetify app that adds furigana to Japanese Spotify lyrics

### Post

I listen to Japanese music while studying, but I still get stuck on unfamiliar kanji. So I built **Furigana for Spotify**, a Windows and macOS Spicetify custom app that adds hiragana readings above kanji in Spotify's existing lyrics view.

- Runs locally by default, with an optional synchronized-reading mode for unusual pronunciations
- Never uploads Spotify credentials, account data, or Spotify-rendered lyrics
- Requires Spotify Desktop and Spicetify installed separately; no Node.js, npm, or browser extension needed
- Works in normal and known fullscreen lyric layouts
- v0.6.3 adds a native macOS desktop-lyrics overlay and a Windows Setup wizard with a native launcher
- The cross-platform ZIP and Windows Setup EXE each have a SHA-256 checksum file

Windows users on v0.6.2 or earlier need one manual update: download and fully extract the v0.6.3 release ZIP, then rerun `install.ps1`. Their existing updater cannot install the repository-rename repair itself.

Demo: https://github.com/huiishan99/extension-Furigana-for-Spotify
Download v0.6.3: https://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3

If it helps you read even one song more comfortably, a GitHub star would mean a lot. Bug reports for new Spotify layouts are welcome too.

## 简体中文

### 标题

我做了一个给 Windows 和 macOS Spotify 日语歌词实时加振假名的插件

### 正文

听日语歌学日语时，经常会遇到认识意思却一下读不出汉字的情况，所以我做了 **Furigana for Spotify**：一个支持 Windows 与 macOS 的 Spicetify Custom App，直接在 Spotify 已显示的歌词汉字上方加平假名读音。

- 默认完全在本机处理，可选同步读音模式用于修正特殊唱法
- 不上传 Spotify 凭据、账号数据或 Spotify 当前显示的歌词
- 需预先安装 Spotify 桌面版和 Spicetify，无需 Node.js、npm 或浏览器插件
- 支持普通歌词页和已知的全屏歌词布局
- v0.6.3 新增原生 macOS 桌面歌词，以及带原生启动器的 Windows Setup 向导
- 跨平台 ZIP 与 Windows Setup EXE 均提供 SHA-256 校验文件

v0.6.2 及以前的 Windows 用户需要手动更新一次：下载并完整解压 v0.6.3 Release ZIP，再运行 `install.ps1`。旧更新器无法自动下载修复仓库更名问题的更新。

效果：https://github.com/huiishan99/extension-Furigana-for-Spotify
v0.6.3 下载：https://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3

如果它刚好帮你更轻松地读完一首歌，欢迎点个 Star。也欢迎反馈 Spotify 新版布局的兼容问题。

## 日本語

### タイトル

Windows・macOS版Spotifyの日本語歌詞にふりがなを表示するSpicetifyアプリを作りました

### 本文

日本語の曲を聴きながら勉強していると、意味は分かっても漢字の読みで止まることがあります。そこで、Spotifyの既存の歌詞画面にひらがなの読みを追加するWindows・macOS向けSpicetify Custom App、**Furigana for Spotify**を作りました。

- デフォルトは端末内で変換し、特殊な読みには任意の同期読みモードを利用可能
- Spotifyの認証情報、アカウント情報、Spotify画面の歌詞はアップロードしない
- Spotifyデスクトップ版とSpicetifyの事前インストールが必要。Node.js・npm・ブラウザー拡張は不要
- 通常表示と既知の全画面歌詞レイアウトに対応
- v0.6.3でネイティブmacOSデスクトップ歌詞と、ネイティブランチャー付きWindows Setupウィザードを追加
- 共通ZIPとWindows Setup EXEの両方にSHA-256チェックサムを用意

v0.6.2以前のWindows版は一度手動更新が必要です。v0.6.3のRelease ZIPをダウンロードして完全に展開し、`install.ps1` を再実行してください。既存の更新機能ではリポジトリ名変更への修正を取得できません。

デモ：https://github.com/huiishan99/extension-Furigana-for-Spotify
v0.6.3のダウンロード：https://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3

一曲でも読みやすくなったら、GitHubでStarを付けてもらえるとうれしいです。Spotifyの新しいレイアウトに関する不具合報告も歓迎します。

## Suggested sharing order

1. Spicetify community and Discord
2. Japanese-learning communities
3. X, Zenn, Qiita, V2EX, Bilibili, or Xiaohongshu
4. Follow up only when there is a real release, compatibility fix, or feature update

Use `../assets/marketing/demo.gif` as the primary visual and `../assets/marketing/social-preview.png` for link cards or posts that need a static image.
