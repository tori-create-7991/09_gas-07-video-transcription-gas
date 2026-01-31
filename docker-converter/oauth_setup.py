#!/usr/bin/env python3
"""
OAuth認証セットアップ

ブラウザで認証して、トークンを保存します。
初回のみ実行してください。
"""

import os
import json
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials

SCOPES = ['https://www.googleapis.com/auth/drive']
CREDENTIALS_DIR = '/app/credentials'
CLIENT_SECRETS_FILE = os.path.join(CREDENTIALS_DIR, 'client_secret.json')
TOKEN_FILE = os.path.join(CREDENTIALS_DIR, 'token.json')


def main():
    print("===================================")
    print("  OAuth認証セットアップ")
    print("===================================")
    print()

    if not os.path.exists(CLIENT_SECRETS_FILE):
        print("❌ client_secret.json が見つかりません")
        print()
        print("GCPコンソールで OAuth クライアントIDを作成してください:")
        print("1. https://console.cloud.google.com/")
        print("2. 「APIとサービス」→「認証情報」")
        print("3. 「認証情報を作成」→「OAuthクライアントID」")
        print("4. アプリケーションの種類: 「デスクトップアプリ」")
        print("5. JSONをダウンロード")
        print("6. credentials/client_secret.json として保存")
        return

    print("🔗 ブラウザで認証してください...")
    print()

    # OAuth認証フロー
    flow = InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri='urn:ietf:wg:oauth:2.0:oob'  # コピペ方式
    )

    # 認証URL生成
    auth_url, _ = flow.authorization_url(prompt='consent')

    print("以下のURLをブラウザで開いてください:")
    print()
    print(auth_url)
    print()

    # 認証コードを入力
    code = input("認証後に表示されるコードを入力: ").strip()

    # トークン取得
    flow.fetch_token(code=code)
    credentials = flow.credentials

    # トークンを保存
    token_data = {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes
    }

    with open(TOKEN_FILE, 'w') as f:
        json.dump(token_data, f, indent=2)

    print()
    print("✅ 認証成功！トークンを保存しました")
    print(f"   {TOKEN_FILE}")
    print()
    print("これで drive-converter を実行できます")


if __name__ == '__main__':
    main()
