# 動画文字起こし GAS - NotebookLM連携

Google Drive MP4 → Gemini API文字起こし → Googleドキュメント → NotebookLM連携のためのGoogle Apps Script

## 機能

- Google Drive内のMP4ファイルを自動検出
- Gemini APIを使用した高精度な文字起こし
- 複数話者の識別対応
- Googleドキュメントへの自動保存
- NotebookLMとの連携を想定した出力形式

## ファイル構成

```
video-transcription-gas/
├── src/
│   ├── main.js           # メインコード
│   └── appsscript.json   # GAS設定
├── .github/workflows/
│   └── deploy.yml        # GitHub Actions
├── .gitignore
├── package.json
└── README.md
```

## セットアップ

### 1. claspのインストールとログイン

```bash
# claspをグローバルインストール
npm install -g @google/clasp

# Googleアカウントでログイン（ブラウザが開きます）
clasp login
```

#### GitHub Codespace / リモート環境の場合

Codespaceなどのリモート環境では、通常の`clasp login`はlocalhostへの接続エラーになります。
代わりに`--no-localhost`オプションを使用してください：

```bash
clasp login --no-localhost
```

このコマンドを実行すると：
1. 認証用のURLが表示されます
2. そのURLをブラウザで開いてGoogleアカウントで認証
3. 認証後「localhost refused to connect」エラーが表示されますが、**アドレスバーのURL全体**（`http://localhost:8888?code=...`）をコピー
4. ターミナルに貼り付け

### 2. GASプロジェクトの作成

#### 新規作成の場合

```bash
# スプレッドシートにバインドしたGASプロジェクトを作成
clasp create --type sheets --title "動画文字起こし" --rootDir ./src

# 作成されたスプレッドシートを開く
clasp open --webapp
```

#### 既存のGASプロジェクトに接続する場合

```bash
# .clasp.jsonを手動作成
echo '{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "./src"
}' > .clasp.json
```

スクリプトIDは、GASエディタのURL `https://script.google.com/home/projects/SCRIPT_ID/edit` から取得できます。

### 3. デプロイ

#### ローカルからデプロイ

```bash
# コードをGASにプッシュ
npm run push
# または
clasp push

# プッシュしてデプロイ（バージョン作成）
npm run deploy
# または
clasp push && clasp deploy
```

#### 開発用コマンド

```bash
# GASエディタを開く
npm run open

# GASからローカルにコードを取得
npm run pull
```

### 4. GitHub Actionsでの自動デプロイ

mainブランチへのpush時に自動デプロイするには、以下の設定が必要です。

#### Apps Script API の有効化（必須）

claspを使用するには、Apps Script APIを有効にする必要があります：

1. [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings) にアクセス
2. 「Google Apps Script API」を**オン**にする

※ GitHub Actionsで使用するアカウントでAPIを有効にしてください。

#### リポジトリSecretsの設定

#### CLASPRC_JSON の取得方法

```bash
# ログイン後、以下のファイルの内容をコピー
cat ~/.clasprc.json
```

この内容をGitHub Secretsの `CLASPRC_JSON` に登録します。

#### SCRIPT_ID の取得方法

`.clasp.json` 内の `scriptId` の値、またはGASエディタのURLから取得。

#### 組織のGoogle Workspaceを使用している場合

組織のWorkspaceでは、セキュリティポリシーにより`clasp deploy`が制限されている場合があります。
エラー「Only users in the same domain as the script owner may deploy this script」が出る場合：

- GitHub Actionsでは`clasp push`（コードのアップロード）のみ実行されます
- デプロイ（バージョン作成）はGASエディタから手動で行ってください：
  1. [GASエディタ](https://script.google.com/)でスクリプトを開く
  2. 「デプロイ」→「新しいデプロイ」

### 5. GAS側の設定

スプレッドシートのメニュー「📹 動画文字起こし」→「⚙️ 設定を登録」から以下を設定:

- **Gemini API Key**: [AI Studio](https://aistudio.google.com/apikey)で取得
- **監視フォルダID**: MP4ファイルを置くGoogle DriveフォルダのID
- **出力フォルダID**: 文字起こしドキュメントを保存するフォルダのID

## 使い方

1. 「📋 シート初期化」でシートを準備
2. 監視フォルダにMP4ファイルをアップロード
3. 「🔍 新規ファイルを検索」で検出
4. 「▶️ 未処理を全て実行」または「▶️ 選択行を実行」で文字起こし実行

## ライセンス

MIT
