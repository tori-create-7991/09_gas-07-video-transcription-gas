#!/bin/bash
#
# rcloneを使ったDrive MP4 → M4A 変換ツール
# GCP設定不要！
#

set -e

INPUT_FOLDER="${INPUT_FOLDER:-}"
OUTPUT_FOLDER="${OUTPUT_FOLDER:-}"
REMOTE_NAME="${REMOTE_NAME:-gdrive}"
TEMP_DIR="/tmp/convert"

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
    echo "  INPUT_FOLDER=フォルダパス（例: 動画/会議録画）"
    echo "  OUTPUT_FOLDER=フォルダパス（例: 音声/変換済み）"
    echo ""
    echo "※ フォルダIDではなく、Driveでのパスを指定します"
    exit 1
fi

echo "📁 入力: ${REMOTE_NAME}:${INPUT_FOLDER}"
echo "📁 出力: ${REMOTE_NAME}:${OUTPUT_FOLDER}"
echo ""

# 一時ディレクトリ作成
mkdir -p "$TEMP_DIR"

# 動画ファイル一覧を取得
echo "🔍 動画ファイルを検索中..."
videos=$(rclone lsf "${REMOTE_NAME}:${INPUT_FOLDER}" --include "*.mp4" --include "*.MP4" --include "*.mov" --include "*.MOV" --include "*.webm" 2>/dev/null || true)

if [ -z "$videos" ]; then
    echo "   動画ファイルが見つかりません"
    exit 0
fi

video_count=$(echo "$videos" | wc -l)
echo "   ${video_count} 個の動画ファイルを検出"
echo ""

# 変換処理
converted=0
skipped=0
failed=0

while IFS= read -r video; do
    [ -z "$video" ] && continue

    name_without_ext="${video%.*}"
    output_name="${name_without_ext}.m4a"

    echo "🎬 $video"

    # 既存ファイルチェック
    if rclone lsf "${REMOTE_NAME}:${OUTPUT_FOLDER}/${output_name}" &>/dev/null; then
        echo "   ⏭️  スキップ（既に存在）"
        ((skipped++))
        continue
    fi

    # ダウンロード
    echo "   ⬇️  ダウンロード中..."
    if ! rclone copy "${REMOTE_NAME}:${INPUT_FOLDER}/${video}" "$TEMP_DIR/" --progress 2>&1 | grep -E "Transferred:|ETA"; then
        echo "   ❌ ダウンロード失敗"
        ((failed++))
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
            ((failed++))
            continue
        fi
    fi

    # ファイルサイズ表示
    input_size=$(du -h "$input_path" | cut -f1)
    output_size=$(du -h "$output_path" | cut -f1)
    echo "   📊 $input_size → $output_size"

    # アップロード
    echo "   ⬆️  アップロード中..."
    if ! rclone copy "$output_path" "${REMOTE_NAME}:${OUTPUT_FOLDER}/" --progress 2>&1 | grep -E "Transferred:|ETA"; then
        echo "   ❌ アップロード失敗"
        ((failed++))
    else
        echo "   ✅ 完了: $output_name"
        ((converted++))
    fi

    # 一時ファイル削除
    rm -f "$input_path" "$output_path"
    echo ""

done <<< "$videos"

# 結果サマリー
echo "==================================="
echo "  完了"
echo "==================================="
echo "✅ 変換成功: ${converted} 件"
[ "$skipped" -gt 0 ] && echo "⏭️  スキップ: ${skipped} 件"
[ "$failed" -gt 0 ] && echo "❌ 失敗: ${failed} 件"
