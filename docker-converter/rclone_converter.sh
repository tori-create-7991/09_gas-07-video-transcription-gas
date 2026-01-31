#!/bin/bash
#
# rcloneを使ったDrive MP4 → M4A 変換ツール
# GCP設定不要！
#

# set -e を削除（((var++))で0になるとエラーになるため）

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
    echo "  INPUT_FOLDER=フォルダID"
    echo "  OUTPUT_FOLDER=フォルダID"
    echo ""
    echo "※ URLではなく、フォルダIDを指定します"
    echo "   例: 1pi9EvAkCyMBvdnF3FhlNtX_A1srzC8Nl"
    exit 1
fi

# フォルダIDの形式でrcloneパスを構築
# --drive-root-folder-id オプションを使用
INPUT_PATH="${REMOTE_NAME}:,drive-root-folder-id=${INPUT_FOLDER}"
OUTPUT_PATH="${REMOTE_NAME}:,drive-root-folder-id=${OUTPUT_FOLDER}"

echo "📁 入力フォルダID: ${INPUT_FOLDER}"
echo "📁 出力フォルダID: ${OUTPUT_FOLDER}"
echo ""

# 一時ディレクトリ作成
mkdir -p "$TEMP_DIR"

# 動画ファイル一覧を取得（フォルダIDを直接指定）
echo "🔍 動画ファイルを検索中..."
videos=$(rclone lsf "${REMOTE_NAME}:" --drive-root-folder-id="${INPUT_FOLDER}" --include "*.mp4" --include "*.MP4" --include "*.mov" --include "*.MOV" --include "*.webm" 2>/dev/null || true)

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
    if rclone lsf "${REMOTE_NAME}:" --drive-root-folder-id="${OUTPUT_FOLDER}" --include "${output_name}" 2>/dev/null | grep -q "${output_name}"; then
        echo "   ⏭️  スキップ（既に存在）"
        ((skipped++))
        continue
    fi

    # ダウンロード
    echo "   ⬇️  ダウンロード中..."
    # ファイル名をそのまま使用（rcloneが内部でエスケープ処理）
    if ! rclone copy "${REMOTE_NAME}:" "$TEMP_DIR/" --drive-root-folder-id="${INPUT_FOLDER}" --include "${video}" --progress 2>&1 | tail -1; then
        echo "   ❌ ダウンロード失敗"
        ((failed++))
        continue
    fi

    # ダウンロードされたファイルを確認
    if [ ! -f "$TEMP_DIR/$video" ]; then
        echo "   ❌ ファイルが見つかりません"
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
    if ! rclone copy "$output_path" "${REMOTE_NAME}:" --drive-root-folder-id="${OUTPUT_FOLDER}" --progress 2>&1 | tail -1; then
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
