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

### 1. 必要な設定

スプレッドシートのメニュー「📹 動画文字起こし」→「⚙️ 設定を登録」から以下を設定:

- **Gemini API Key**: [AI Studio](https://aistudio.google.com/apikey)で取得
- **監視フォルダID**: MP4ファイルを置くGoogle DriveフォルダのID
- **出力フォルダID**: 文字起こしドキュメントを保存するフォルダのID

### 2. GitHub Actionsでのデプロイ

リポジトリのSecretsに以下を設定:

- `CLASPRC_JSON`: claspの認証情報
- `SCRIPT_ID`: Google Apps ScriptのスクリプトID

## 使い方

1. 「📋 シート初期化」でシートを準備
2. 監視フォルダにMP4ファイルをアップロード
3. 「🔍 新規ファイルを検索」で検出
4. 「▶️ 未処理を全て実行」または「▶️ 選択行を実行」で文字起こし実行

## ライセンス

MIT
