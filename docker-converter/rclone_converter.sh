#!/bin/bash
#
# rcloneを使ったDrive MP4 → M4A 変換ツール
# GCP設定不要！
#

INPUT_FOLDER="${INPUT_FOLDER:-}"
OUTPUT_FOLDER="${OUTPUT_FOLDER:-}"
REMOTE_NAME="${REMOTE_NAME:-gdrive}"
TEMP_DIR="/tmp/convert"
FILE_LIST="/tmp/filelist.json"

echo "==================================="
echo "  Drive MP4 → M4A 変換ツール"
echo "  (rclone版 - GCP不要)"
echo "==================================="
echo ""

# rclone設定確認
if ! rclone listremotes | grep -q "^${REMOTE_NAME}:"; then
    echo "❌ rcloneが設定されていません"
    echo ""
    echo "以下のコマンドで設定してください:"
    echo ""
    echo "  docker compose run --rm rclone-setup"
    echo ""
    exit 1
fi

# 環境変数確認
if [ -z "$INPUT_FOLDER" ] || [ -z "$OUTPUT_FOLDER" ]; then
    echo "❌ 環境変数が設定されていません"
    echo ""
    echo ".envファイルに以下を設定してください:"
    echo "  INPUT_FOLDER=フォルダID"
    echo "  OUTPUT_FOLDER=フォルダID"
    echo ""
    exit 1
fi

echo "📁 入力フォルダID: ${INPUT_FOLDER}"
echo "📁 出力フォルダID: ${OUTPUT_FOLDER}"
echo ""

# 一時ディレクトリ作成
mkdir -p "$TEMP_DIR"

# 動画ファイル一覧をJSON形式で取得（文字化け対策）
echo "🔍 動画ファイルを検索中..."
rclone lsjson "${REMOTE_NAME}:" --drive-root-folder-id="${INPUT_FOLDER}" 2>/dev/null > "$FILE_LIST"

# mp4/mov/webmファイルのみ抽出
video_count=$(jq -r '[.[] | select(.Name | test("\\.(mp4|MP4|mov|MOV|webm)$"))] | length' "$FILE_LIST")

if [ "$video_count" -eq 0 ]; then
    echo "   動画ファイルが見つかりません"
    exit 0
fi

echo "   ${video_count} 個の動画ファイルを検出"
echo ""

# 変換処理
converted=0
skipped=0
failed=0

# JSONからファイル名を1つずつ取得して処理
jq -r '.[] | select(.Name | test("\\.(mp4|MP4|mov|MOV|webm)$")) | .Name' "$FILE_LIST" | while IFS= read -r video; do
    [ -z "$video" ] && continue

    name_without_ext="${video%.*}"
    output_name="${name_without_ext}.m4a"

    echo "🎬 $video"

    # 既存ファイルチェック
    existing=$(rclone lsjson "${REMOTE_NAME}:" --drive-root-folder-id="${OUTPUT_FOLDER}" 2>/dev/null | jq -r --arg name "$output_name" '.[] | select(.Name == $name) | .Name')
    if [ -n "$existing" ]; then
        echo "   ⏭️  スキップ（既に存在）"
        continue
    fi

    # ダウンロード（ファイル名を正確に指定）
    echo "   ⬇️  ダウンロード中..."
    rclone copy "${REMOTE_NAME}:" "$TEMP_DIR/" --drive-root-folder-id="${INPUT_FOLDER}" --files-from-raw <(echo "$video") --progress 2>&1 | tail -1 || true

    # ダウンロードされたファイルを確認
    if [ ! -f "$TEMP_DIR/$video" ]; then
        echo "   ❌ ダウンロード失敗"
        continue
    fi

    # 変換
    echo "   🔄 変換中..."
    input_path="$TEMP_DIR/$video"
    output_path="$TEMP_DIR/$output_name"

    if ! ffmpeg -i "$input_path" -vn -acodec copy -y -loglevel error "$output_path" 2>&1; then
        # コピーできない場合はAAC再エンコード
        if ! ffmpeg -i "$input_path" -vn -acodec aac -b:a 128k -y -loglevel error "$output_path" 2>&1; then
            echo "   ❌ 変換失敗"
            rm -f "$input_path" "$output_path"
            continue
        fi
    fi

    # ファイルサイズ表示
    input_size=$(du -h "$input_path" | cut -f1)
    output_size=$(du -h "$output_path" | cut -f1)
    echo "   📊 $input_size → $output_size"

    # アップロード
    echo "   ⬆️  アップロード中..."
    if ! rclone copy "$output_path" "${REMOTE_NAME}:" --drive-root-folder-id="${OUTPUT_FOLDER}" --progress 2>&1 | tail -1; then
        echo "   ❌ アップロード失敗"
    else
        echo "   ✅ 完了: $output_name"
    fi

    # 一時ファイル削除
    rm -f "$input_path" "$output_path"
    echo ""

done

echo "==================================="
echo "  完了"
echo "==================================="
