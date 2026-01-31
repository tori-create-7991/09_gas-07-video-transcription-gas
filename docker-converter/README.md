# MP4 → M4A 変換ツール（Docker）

FFmpegを使用してMP4動画から音声（M4A）を抽出するDockerツールです。

## 2つの使い方

| モード | 説明 | 用途 |
|--------|------|------|
| ローカル変換 | ローカルファイルを変換 | 手動でファイルを配置 |
| Drive連携 | Driveから自動取得→変換→アップロード | 全自動 |

---

## ローカル変換モード

### 必要なもの

- Docker
- Docker Compose

### 使い方

#### 1. MP4ファイルを配置

`input/` フォルダにMP4ファイルを配置します。

```
docker-converter/
├── input/
│   ├── video1.mp4
│   └── video2.mp4
└── output/
```

#### 2. 変換を実行

```bash
cd docker-converter
docker compose up converter --build
```

#### 3. 出力を確認

`output/` フォルダにM4Aファイルが生成されます。

---

## Drive連携モード（自動）

Google Driveから動画を取得 → 変換 → Driveにアップロード を自動で行います。

### 必要なもの

- Docker / Docker Compose
- GCPプロジェクト
- サービスアカウント

### セットアップ

#### 1. GCPでサービスアカウントを作成

1. [GCP Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを選択（または新規作成）
3. 「APIとサービス」→「ライブラリ」
4. 「Google Drive API」を検索して**有効化**
5. 「APIとサービス」→「認証情報」
6. 「認証情報を作成」→「サービスアカウント」
7. 名前を入力（例: `drive-converter`）して作成
8. 作成したサービスアカウントをクリック
9. 「鍵」タブ →「鍵を追加」→「新しい鍵を作成」→ JSON
10. ダウンロードされたJSONを `credentials/credentials.json` として保存

#### 2. サービスアカウントにフォルダを共有

1. Google Driveで変換元・変換先フォルダを開く
2. 「共有」をクリック
3. サービスアカウントのメールアドレスを追加
   - 形式: `サービスアカウント名@プロジェクトID.iam.gserviceaccount.com`
   - 権限: **編集者**

#### 3. 環境変数を設定

```bash
cd docker-converter
cp .env.example .env
```

`.env` を編集：

```
INPUT_FOLDER_ID=動画があるフォルダのID
OUTPUT_FOLDER_ID=M4Aを保存するフォルダのID
```

フォルダIDは、DriveフォルダのURLから取得：
`https://drive.google.com/drive/folders/XXXXXX` の `XXXXXX` 部分

#### 4. 変換を実行

```bash
docker compose up drive-converter --build
```

### 実行例

```
===================================
  Drive MP4 → M4A 変換ツール
===================================

🔗 Google Driveに接続中...
   ✅ 接続成功

📁 フォルダをスキャン中...
   3 個の動画ファイルを検出

🎬 meeting_2024-01-15.mp4 (523.4MB)
   ⬇️  ダウンロード中...
   ダウンロード: 100%
   🔄 変換中...
   📊 変換後サイズ: 52.1MB
   ⬆️  アップロード中...
   ✅ 完了: meeting_2024-01-15.m4a

===================================
  完了
===================================
✅ 変換成功: 3 件
```

---

## ファイルサイズの目安

| 元動画 | 変換後音声 | 削減率 |
|--------|-----------|--------|
| 100MB | 約10MB | 90%削減 |
| 500MB | 約50MB | 90%削減 |
| 1GB | 約100MB | 90%削減 |

---

## 変換後のワークフロー

1. 変換されたM4AファイルがDriveの出力フォルダに保存される
2. GASで「🔍 新規ファイルを検索」を実行
3. 「▶️ 未処理を全て実行」で文字起こし

---

## トラブルシューティング

### サービスアカウントのアクセス権エラー

```
❌ エラー: The user does not have sufficient permissions
```

→ サービスアカウントにフォルダの**編集者**権限を付与してください

### Drive APIが有効でない

```
❌ エラー: Google Drive API has not been enabled
```

→ GCPコンソールで「Drive API」を有効化してください

### 変換に失敗する場合

音声コーデックがコピーできない場合は、自動的にAAC再エンコードを試みます。
それでも失敗する場合は、元動画のフォーマットを確認してください。

### Dockerがない場合

FFmpegを直接インストールして使用：

```bash
# Mac
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# 変換コマンド
ffmpeg -i input.mp4 -vn -acodec copy output.m4a
```
