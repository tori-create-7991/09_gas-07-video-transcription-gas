FROM alpine:3.19

# FFmpegをインストール
RUN apk add --no-cache ffmpeg bash

# 作業ディレクトリ
WORKDIR /app

# 変換スクリプトをコピー
COPY convert.sh /app/convert.sh
RUN chmod +x /app/convert.sh

# 入出力ディレクトリ
VOLUME ["/input", "/output"]

ENTRYPOINT ["/app/convert.sh"]
