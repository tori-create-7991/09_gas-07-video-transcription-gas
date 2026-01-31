#!/usr/bin/env python3
"""
Google Drive MP4 → M4A 変換ツール

Drive APIで動画をダウンロード → FFmpegで変換 → Driveにアップロード
"""

import os
import sys
import subprocess
import tempfile
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
import io


# 対応するMIMEタイプ
SUPPORTED_VIDEO_TYPES = [
    'video/mp4',
    'video/webm',
    'video/quicktime',  # mov
]

# 設定
SCOPES = ['https://www.googleapis.com/auth/drive']


def get_drive_service():
    """Drive APIサービスを取得"""
    creds_file = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', '/app/credentials.json')

    if not os.path.exists(creds_file):
        print(f"❌ 認証ファイルが見つかりません: {creds_file}")
        print("   サービスアカウントのJSONキーを credentials.json として配置してください")
        sys.exit(1)

    credentials = service_account.Credentials.from_service_account_file(
        creds_file, scopes=SCOPES
    )
    return build('drive', 'v3', credentials=credentials)


def list_video_files(service, folder_id):
    """フォルダ内の動画ファイル一覧を取得"""
    query_parts = [f"'{folder_id}' in parents", "trashed = false"]

    # MIMEタイプでフィルタ
    mime_conditions = " or ".join([f"mimeType = '{mt}'" for mt in SUPPORTED_VIDEO_TYPES])
    query_parts.append(f"({mime_conditions})")

    query = " and ".join(query_parts)

    results = service.files().list(
        q=query,
        fields="files(id, name, mimeType, size)",
        orderBy="name"
    ).execute()

    return results.get('files', [])


def download_file(service, file_id, file_name, temp_dir):
    """Driveからファイルをダウンロード"""
    request = service.files().get_media(fileId=file_id)

    file_path = os.path.join(temp_dir, file_name)

    with open(file_path, 'wb') as f:
        downloader = MediaIoBaseDownload(f, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            if status:
                print(f"   ダウンロード: {int(status.progress() * 100)}%", end='\r')

    print(f"   ダウンロード: 100%")
    return file_path


def convert_to_m4a(input_path, output_path):
    """FFmpegでM4Aに変換"""
    cmd = [
        'ffmpeg',
        '-i', input_path,
        '-vn',              # 映像なし
        '-acodec', 'copy',  # 音声コーデックをコピー
        '-y',               # 上書き
        '-loglevel', 'error',
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        # コピーできない場合はAAC再エンコード
        cmd[4:6] = ['-acodec', 'aac', '-b:a', '128k']
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(f"変換エラー: {result.stderr}")

    return output_path


def upload_file(service, file_path, folder_id, file_name):
    """Driveにファイルをアップロード"""
    file_metadata = {
        'name': file_name,
        'parents': [folder_id]
    }

    media = MediaFileUpload(
        file_path,
        mimetype='audio/mp4',
        resumable=True
    )

    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, webViewLink'
    ).execute()

    return file


def check_existing_file(service, folder_id, file_name):
    """出力フォルダに同名ファイルがあるか確認"""
    query = f"'{folder_id}' in parents and name = '{file_name}' and trashed = false"
    results = service.files().list(q=query, fields="files(id)").execute()
    return len(results.get('files', [])) > 0


def format_size(size_bytes):
    """ファイルサイズを読みやすい形式に"""
    if size_bytes is None:
        return "不明"
    size = int(size_bytes)
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"


def main():
    # 環境変数から設定を取得
    input_folder_id = os.environ.get('INPUT_FOLDER_ID')
    output_folder_id = os.environ.get('OUTPUT_FOLDER_ID')
    skip_existing = os.environ.get('SKIP_EXISTING', 'true').lower() == 'true'

    if not input_folder_id or not output_folder_id:
        print("❌ 環境変数が設定されていません")
        print("   INPUT_FOLDER_ID: 動画があるフォルダID")
        print("   OUTPUT_FOLDER_ID: M4Aを保存するフォルダID")
        sys.exit(1)

    print("===================================")
    print("  Drive MP4 → M4A 変換ツール")
    print("===================================")
    print()

    # Drive APIに接続
    print("🔗 Google Driveに接続中...")
    service = get_drive_service()
    print("   ✅ 接続成功")
    print()

    # 動画ファイル一覧を取得
    print(f"📁 フォルダをスキャン中...")
    videos = list_video_files(service, input_folder_id)

    if not videos:
        print("   動画ファイルが見つかりません")
        return

    print(f"   {len(videos)} 個の動画ファイルを検出")
    print()

    # 変換処理
    converted = 0
    skipped = 0
    failed = 0

    with tempfile.TemporaryDirectory() as temp_dir:
        for video in videos:
            file_name = video['name']
            file_id = video['id']
            file_size = video.get('size')

            # 出力ファイル名
            name_without_ext = os.path.splitext(file_name)[0]
            output_name = f"{name_without_ext}.m4a"

            print(f"🎬 {file_name} ({format_size(file_size)})")

            # 既存ファイルチェック
            if skip_existing and check_existing_file(service, output_folder_id, output_name):
                print(f"   ⏭️  スキップ（既に存在）")
                skipped += 1
                continue

            try:
                # ダウンロード
                print(f"   ⬇️  ダウンロード中...")
                input_path = download_file(service, file_id, file_name, temp_dir)

                # 変換
                print(f"   🔄 変換中...")
                output_path = os.path.join(temp_dir, output_name)
                convert_to_m4a(input_path, output_path)

                # ファイルサイズ確認
                output_size = os.path.getsize(output_path)
                print(f"   📊 変換後サイズ: {format_size(output_size)}")

                # アップロード
                print(f"   ⬆️  アップロード中...")
                result = upload_file(service, output_path, output_folder_id, output_name)

                print(f"   ✅ 完了: {output_name}")
                converted += 1

                # 一時ファイル削除
                os.remove(input_path)
                os.remove(output_path)

            except Exception as e:
                print(f"   ❌ エラー: {str(e)}")
                failed += 1

            print()

    # 結果サマリー
    print("===================================")
    print("  完了")
    print("===================================")
    print(f"✅ 変換成功: {converted} 件")
    if skipped > 0:
        print(f"⏭️  スキップ: {skipped} 件")
    if failed > 0:
        print(f"❌ 失敗: {failed} 件")


if __name__ == '__main__':
    main()
