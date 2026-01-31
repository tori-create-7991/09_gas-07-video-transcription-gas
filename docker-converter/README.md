# MP4 → M4A 変換ツール（Docker）

FFmpegを使用してMP4動画から音声（M4A）を抽出するDockerツールです。

## 3つの使い方

| モード | 説明 | GCP設定 |
|--------|------|---------|
| ローカル変換 | ローカルファイルを変換 | 不要 |
| **rclone版（おすすめ）** | Driveから自動取得→変換→アップロード | **不要** |
| Python版 | Driveから自動取得→変換→アップロード | 必要 |

---

## ローカル変換モード

### 使い方

```bash
cd docker-converter

# 1. inputフォルダにMP4を配置
cp /path/to/video.mp4 input/

# 2. 変換実行
docker compose up converter --build

# 3. outputフォルダにM4Aが生成される
ls output/
```

---

## rclone版（GCP不要・おすすめ）

**GCP設定不要！** rcloneの組み込みOAuthを使用します。

### セットアップ

#### 1. 環境変数を設定

```bash
cd docker-converter
cp .env.example .env
```

`.env` を編集（**フォルダIDではなくパスを指定**）：

```
INPUT_FOLDER=動画/会議録画
OUTPUT_FOLDER=音声/変換済み
```

#### 2. rclone設定（初回のみ）

```bash
docker compose run --rm rclone-setup
```

対話形式で設定します：

```
n) New remote
name> gdrive
Storage> drive
client_id> （空のままEnter）
client_secret> （空のままEnter）
scope> 1（フルアクセス）
root_folder_id> （空のままEnter）
service_account_file> （空のままEnter）
Edit advanced config?> n
Use auto config?> n
```

表示されるURLをブラウザで開いて認証し、コードを貼り付けます。

```
Configure this as a Shared Drive?> n
y) Yes this is OK
q) Quit config
```

#### 3. 変換を実行

```bash
docker compose up rclone-converter --build
```

### 実行例

```
===================================
  Drive MP4 → M4A 変換ツール
  (rclone版 - GCP不要)
===================================

📁 入力: gdrive:動画/会議録画
📁 出力: gdrive:音声/変換済み

🔍 動画ファイルを検索中...
   3 個の動画ファイルを検出

🎬 meeting_2024-01-15.mp4
   ⬇️  ダウンロード中...
   🔄 変換中...
   📊 523MB → 52MB
   ⬆️  アップロード中...
   ✅ 完了: meeting_2024-01-15.m4a

===================================
  完了
===================================
✅ 変換成功: 3 件
```

---

## Python版（GCP必要）

GCPでOAuthクライアントを作成する方法です。

### セットアップ

#### 1. GCPでOAuthクライアントを作成

1. [GCP Console](https://console.cloud.google.com/)
2. 「APIとサービス」→「ライブラリ」→「Drive API」を有効化
3. 「OAuth同意画面」→ 外部 → アプリ名入力 → テストユーザー追加
4. 「認証情報」→「OAuthクライアントID」→「デスクトップアプリ」
5. JSONダウンロード → `credentials/client_secret.json`

#### 2. 環境変数を設定

```bash
cp .env.example .env
# INPUT_FOLDER_ID, OUTPUT_FOLDER_ID を設定
```

#### 3. OAuth認証（初回のみ）

```bash
docker compose run --rm oauth-setup
```

#### 4. 変換を実行

```bash
docker compose up drive-converter --build
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

### rclone: リモートが見つからない

```bash
# 設定を確認
docker compose run --rm rclone-setup
# → l) List remotes で確認
```

### rclone: 認証エラー

```bash
# 再認証
docker compose run --rm rclone-setup
# → n) New remote で再設定
```

### 変換に失敗する場合

音声コーデックがコピーできない場合は、自動的にAAC再エンコードを試みます。

### Dockerがない場合

```bash
# Mac
brew install ffmpeg rclone

# Ubuntu/Debian
sudo apt install ffmpeg rclone

# rclone設定
rclone config

# 変換コマンド
ffmpeg -i input.mp4 -vn -acodec copy output.m4a
```
