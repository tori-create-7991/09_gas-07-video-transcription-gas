#!/bin/bash

INPUT_DIR="/input"
OUTPUT_DIR="/output"

echo "==================================="
echo "  MP4 → M4A 変換ツール"
echo "==================================="
echo ""

# 入力ファイルの確認
mp4_count=$(find "$INPUT_DIR" -maxdepth 1 -name "*.mp4" -o -name "*.MP4" 2>/dev/null | wc -l)

if [ "$mp4_count" -eq 0 ]; then
    echo "❌ MP4ファイルが見つかりません"
    echo "   /input フォルダにMP4ファイルを配置してください"
    exit 1
fi

echo "📁 ${mp4_count} 個のMP4ファイルを検出"
echo ""

# 変換処理
converted=0
failed=0

for input_file in "$INPUT_DIR"/*.mp4 "$INPUT_DIR"/*.MP4; do
    # ファイルが存在しない場合はスキップ
    [ -f "$input_file" ] || continue

    filename=$(basename "$input_file")
    name_without_ext="${filename%.*}"
    output_file="$OUTPUT_DIR/${name_without_ext}.m4a"

    echo "🔄 変換中: $filename"

    # FFmpegで音声のみ抽出（映像なし、音声はコピー）
    if ffmpeg -i "$input_file" -vn -acodec copy "$output_file" -y -loglevel error 2>&1; then
        # ファイルサイズを取得
        input_size=$(du -h "$input_file" | cut -f1)
        output_size=$(du -h "$output_file" | cut -f1)
        echo "   ✅ 完了: $filename ($input_size) → ${name_without_ext}.m4a ($output_size)"
        ((converted++))
    else
        echo "   ❌ 失敗: $filename"
        ((failed++))
    fi
done

echo ""
echo "==================================="
echo "  完了"
echo "==================================="
echo "✅ 成功: ${converted} 件"
[ "$failed" -gt 0 ] && echo "❌ 失敗: ${failed} 件"
echo ""
echo "出力先: $OUTPUT_DIR"
