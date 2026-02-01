// ============================================================
// 動画文字起こし GAS - NotebookLM連携
// ============================================================

// シート名定義
const SHEET_NAMES = {
  FILES: 'ファイル一覧'
};

// ステータス定義
const STATUS = {
  NEW: '🆕 未処理',
  PROCESSING: '⏳ 処理中',
  DONE: '✅ 完了',
  ERROR: '❌ エラー'
};

// 設定キー
const CONFIG_KEYS = {
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  WATCH_FOLDER_ID: 'WATCH_FOLDER_ID',
  OUTPUT_FOLDER_ID: 'OUTPUT_FOLDER_ID'
};

// 対応メディアファイルのMIMEタイプ
const SUPPORTED_MIME_TYPES = [
  'video/mp4',
  'audio/mp4',        // m4a
  'audio/mpeg',       // mp3
  'audio/wav',        // wav
  'audio/x-wav',      // wav（別形式）
  'audio/aac',        // aac
  'audio/ogg',        // ogg
  'audio/webm',       // webm audio
  'video/webm'        // webm video
];

// ファイルサイズ制限（バイト）
// GASのUrlFetchApp制限とメモリ制限を考慮して50MBに設定
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE_MB = 50;

// Geminiファイル処理のポーリング設定
const GEMINI_POLLING_INTERVAL_MS = 5000;  // 5秒間隔
const GEMINI_POLLING_MAX_ATTEMPTS = 60;   // 最大60回（5分）

// ============================================================
// 設定管理
// ============================================================

/**
 * 設定を取得（スクリプトプロパティから）
 */
function getConfig() {
  const props = PropertiesService.getScriptProperties();

  const config = {
    GEMINI_API_KEY: props.getProperty(CONFIG_KEYS.GEMINI_API_KEY),
    WATCH_FOLDER_ID: props.getProperty(CONFIG_KEYS.WATCH_FOLDER_ID),
    OUTPUT_FOLDER_ID: props.getProperty(CONFIG_KEYS.OUTPUT_FOLDER_ID)
  };

  const missing = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`設定が未登録です。メニュー「⚙️ 設定を登録」から入力してください。\n未設定: ${missing.join(', ')}`);
  }

  return config;
}

/**
 * 設定を保存（ダイアログから呼び出し）
 */
function saveConfigFromDialog(apiKey, watchFolder, outputFolder) {
  const props = PropertiesService.getScriptProperties();

  props.setProperty(CONFIG_KEYS.GEMINI_API_KEY, apiKey);
  props.setProperty(CONFIG_KEYS.WATCH_FOLDER_ID, watchFolder);
  props.setProperty(CONFIG_KEYS.OUTPUT_FOLDER_ID, outputFolder);
}

/**
 * 設定を削除
 */
function clearConfig() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ 確認',
    '全ての設定を削除しますか？',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    const props = PropertiesService.getScriptProperties();
    props.deleteAllProperties();
    ui.alert('設定を削除しました');
  }
}

// ============================================================
// UI / メニュー
// ============================================================

/**
 * メニュー追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📹 動画文字起こし')
    .addItem('🔍 新規ファイルを検索', 'scanNewFiles')
    .addItem('▶️ 未処理を全て実行', 'processAllNew')
    .addItem('▶️ 選択行を実行', 'processSelectedRow')
    .addSeparator()
    .addItem('📚 全ドキュメントを結合', 'combineAllDocs')
    .addSeparator()
    .addItem('⚙️ 設定を登録', 'showConfigDialog')
    .addItem('🔍 設定を確認', 'showCurrentConfig')
    .addItem('🗑️ 設定を削除', 'clearConfig')
    .addSeparator()
    .addItem('📋 シート初期化', 'initSheet')
    .addToUi();
}

/**
 * 設定ダイアログを表示
 */
function showConfigDialog() {
  const props = PropertiesService.getScriptProperties();

  const currentApiKey = props.getProperty(CONFIG_KEYS.GEMINI_API_KEY) || '';
  const currentWatchFolder = props.getProperty(CONFIG_KEYS.WATCH_FOLDER_ID) || '';
  const currentOutputFolder = props.getProperty(CONFIG_KEYS.OUTPUT_FOLDER_ID) || '';

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: 'Google Sans', sans-serif; padding: 20px; }
      .form-group { margin-bottom: 16px; }
      label { display: block; font-weight: 500; margin-bottom: 4px; color: #333; }
      input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
      input:focus { outline: none; border-color: #4285f4; box-shadow: 0 0 0 2px rgba(66,133,244,0.2); }
      .hint { font-size: 12px; color: #666; margin-top: 4px; }
      .hint a { color: #1a73e8; }
      .buttons { margin-top: 24px; text-align: right; }
      button { padding: 10px 24px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; margin-left: 8px; }
      .btn-primary { background: #4285f4; color: white; }
      .btn-primary:hover { background: #3367d6; }
      .btn-secondary { background: #f1f3f4; color: #333; }
      .btn-secondary:hover { background: #e8eaed; }
      .current { font-size: 11px; color: #888; margin-top: 2px; }
    </style>

    <div class="form-group">
      <label>🔑 Gemini API Key</label>
      <input type="password" id="apiKey" placeholder="AIza..." value="${currentApiKey}">
      <div class="hint"><a href="https://aistudio.google.com/apikey" target="_blank">AI Studio</a> で取得</div>
      ${currentApiKey ? '<div class="current">✓ 登録済み</div>' : ''}
    </div>

    <div class="form-group">
      <label>📁 監視フォルダID（MP4を置くフォルダ）</label>
      <input type="text" id="watchFolder" placeholder="1AbCdEfGhIjK..." value="${currentWatchFolder}">
      <div class="hint">DriveフォルダのURLから取得: drive.google.com/drive/folders/<b>ここ</b></div>
      ${currentWatchFolder ? '<div class="current">✓ 登録済み</div>' : ''}
    </div>

    <div class="form-group">
      <label>📄 出力フォルダID（文字起こし保存先）</label>
      <input type="text" id="outputFolder" placeholder="2ZyXwVuTsRq..." value="${currentOutputFolder}">
      <div class="hint">文字起こしドキュメントが保存されるフォルダ</div>
      ${currentOutputFolder ? '<div class="current">✓ 登録済み</div>' : ''}
    </div>

    <div class="buttons">
      <button class="btn-secondary" onclick="google.script.host.close()">キャンセル</button>
      <button class="btn-primary" onclick="saveConfig()">💾 保存</button>
    </div>

    <script>
      function saveConfig() {
        const apiKey = document.getElementById('apiKey').value.trim();
        const watchFolder = document.getElementById('watchFolder').value.trim();
        const outputFolder = document.getElementById('outputFolder').value.trim();

        if (!apiKey || !watchFolder || !outputFolder) {
          alert('全ての項目を入力してください');
          return;
        }

        google.script.run
          .withSuccessHandler(() => {
            alert('✅ 設定を保存しました');
            google.script.host.close();
          })
          .withFailureHandler((err) => {
            alert('❌ エラー: ' + err.message);
          })
          .saveConfigFromDialog(apiKey, watchFolder, outputFolder);
      }
    </script>
  `)
  .setWidth(450)
  .setHeight(420);

  SpreadsheetApp.getUi().showModalDialog(html, '⚙️ 設定を登録');
}

/**
 * 現在の設定を確認
 */
function showCurrentConfig() {
  const props = PropertiesService.getScriptProperties();
  const ui = SpreadsheetApp.getUi();

  const apiKey = props.getProperty(CONFIG_KEYS.GEMINI_API_KEY);
  const watchFolder = props.getProperty(CONFIG_KEYS.WATCH_FOLDER_ID);
  const outputFolder = props.getProperty(CONFIG_KEYS.OUTPUT_FOLDER_ID);

  const maskApiKey = apiKey
    ? apiKey.substring(0, 8) + '****' + apiKey.substring(apiKey.length - 4)
    : '❌ 未設定';

  const message = `
🔑 Gemini API Key: ${maskApiKey}

📁 監視フォルダID: ${watchFolder || '❌ 未設定'}
   ${watchFolder ? '→ https://drive.google.com/drive/folders/' + watchFolder : ''}

📄 出力フォルダID: ${outputFolder || '❌ 未設定'}
   ${outputFolder ? '→ https://drive.google.com/drive/folders/' + outputFolder : ''}
  `.trim();

  ui.alert('🔍 現在の設定', message, ui.ButtonSet.OK);
}

// ============================================================
// シート操作
// ============================================================

/**
 * シート初期化
 */
function initSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  let sheet = ss.getSheetByName(SHEET_NAMES.FILES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.FILES);
  } else {
    sheet.clear();
  }

  const headers = ['ファイルID', 'ファイル名', 'ステータス', 'ドキュメントURL', '処理日時', 'エラー詳細'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#4285f4')
    .setFontColor('white')
    .setFontWeight('bold');

  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 300);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 200);
  sheet.hideColumns(1);

  ui.alert('✅ シートを初期化しました');
}

/**
 * ファイル一覧シートを取得
 */
function getFilesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.FILES);

  if (!sheet) {
    throw new Error('「📋 シート初期化」を先に実行してください');
  }

  return sheet;
}

/**
 * 既存ファイルIDを取得
 */
function getExistingFileIds(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(row => row[0]).filter(id => id);
}

// ============================================================
// ファイル処理
// ============================================================

/**
 * 新規ファイルをスキャン（ショートカット対応、音声ファイル対応）
 */
function scanNewFiles() {
  const config = getConfig();
  const sheet = getFilesSheet();
  const folder = DriveApp.getFolderById(config.WATCH_FOLDER_ID);

  const existingIds = getExistingFileIds(sheet);
  const mediaFiles = [];

  // フォルダ内のメディアファイルとショートカットを収集
  collectMediaFiles(folder, mediaFiles, existingIds);

  let addedCount = 0;
  for (const file of mediaFiles) {
    sheet.appendRow([file.getId(), file.getName(), STATUS.NEW, '', '', '']);
    addedCount++;
  }

  SpreadsheetApp.getUi().alert(`${addedCount} 件の新規ファイルを追加しました`);
}

/**
 * メディアファイルを収集（ショートカット対応）
 * @param {Folder} folder - 検索対象フォルダ
 * @param {File[]} mediaFiles - 収集したファイルを格納する配列
 * @param {string[]} existingIds - 既存のファイルID
 * @param {Set} visitedFolderIds - 訪問済みフォルダID（循環参照防止）
 */
function collectMediaFiles(folder, mediaFiles, existingIds, visitedFolderIds = new Set()) {
  const folderId = folder.getId();

  // 循環参照防止
  if (visitedFolderIds.has(folderId)) return;
  visitedFolderIds.add(folderId);

  // 対応する全てのメディアファイルを取得
  for (const mimeType of SUPPORTED_MIME_TYPES) {
    const files = folder.getFilesByType(mimeType);
    while (files.hasNext()) {
      const file = files.next();
      if (!existingIds.includes(file.getId())) {
        mediaFiles.push(file);
      }
    }
  }

  // ショートカットを処理
  const shortcuts = folder.getFilesByType('application/vnd.google-apps.shortcut');
  while (shortcuts.hasNext()) {
    const shortcut = shortcuts.next();
    try {
      const targetId = shortcut.getTargetId();
      if (!targetId) continue;

      // ターゲットがファイルかフォルダかを判定
      try {
        const targetFile = DriveApp.getFileById(targetId);
        const mimeType = targetFile.getMimeType();
        // 対応メディアファイルへのショートカット
        if (SUPPORTED_MIME_TYPES.includes(mimeType) && !existingIds.includes(targetId)) {
          mediaFiles.push(targetFile);
        }
      } catch (e) {
        // ファイルとして取得できない場合はフォルダとして試す
        try {
          const targetFolder = DriveApp.getFolderById(targetId);
          // フォルダへのショートカット → 再帰的に検索
          collectMediaFiles(targetFolder, mediaFiles, existingIds, visitedFolderIds);
        } catch (e2) {
          // アクセス権がない等の理由でスキップ
          console.log(`ショートカット先にアクセスできません: ${shortcut.getName()}`);
        }
      }
    } catch (e) {
      console.log(`ショートカット処理エラー: ${shortcut.getName()} - ${e.message}`);
    }
  }
}

/**
 * 未処理を全て実行
 */
function processAllNew() {
  const config = getConfig();
  const sheet = getFilesSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('処理するファイルがありません');
    return;
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  let processedCount = 0, errorCount = 0;

  for (let i = 0; i < data.length; i++) {
    const [fileId, fileName, status] = data[i];
    if (status === STATUS.NEW || status === STATUS.ERROR) {
      if (processRow(sheet, i + 2, fileId, fileName, config)) {
        processedCount++;
      } else {
        errorCount++;
      }
    }
  }

  SpreadsheetApp.getUi().alert(`完了: ${processedCount} 件\nエラー: ${errorCount} 件`);
}

/**
 * 選択行を実行
 */
function processSelectedRow() {
  const config = getConfig();
  const sheet = getFilesSheet();
  const row = sheet.getActiveCell().getRow();

  if (row <= 1) {
    SpreadsheetApp.getUi().alert('処理する行を選択してください');
    return;
  }

  const [fileId, fileName] = sheet.getRange(row, 1, 1, 2).getValues()[0];
  if (!fileId) {
    SpreadsheetApp.getUi().alert('ファイルIDが見つかりません');
    return;
  }

  const success = processRow(sheet, row, fileId, fileName, config);
  SpreadsheetApp.getUi().alert(success ? '✅ 完了しました' : '❌ エラーが発生しました');
}

/**
 * 1行を処理
 */
function processRow(sheet, rowNum, fileId, fileName, config) {
  try {
    sheet.getRange(rowNum, 3).setValue(STATUS.PROCESSING);
    SpreadsheetApp.flush();

    const file = DriveApp.getFileById(fileId);

    // ファイルサイズチェック
    const fileSize = file.getSize();
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
      throw new Error(`ファイルサイズが大きすぎます（${fileSizeMB}MB）。${MAX_FILE_SIZE_MB}MB以下に変換してください。docker-converterを使用するか、音声のみを抽出してください。`);
    }

    const transcript = transcribeWithGemini(file, config.GEMINI_API_KEY);
    const docUrl = saveAsGoogleDoc(fileName, transcript, config.OUTPUT_FOLDER_ID);

    sheet.getRange(rowNum, 3).setValue(STATUS.DONE);
    sheet.getRange(rowNum, 4).setValue(docUrl);
    sheet.getRange(rowNum, 5).setValue(new Date().toLocaleString('ja-JP'));
    sheet.getRange(rowNum, 6).setValue('');
    return true;
  } catch (e) {
    sheet.getRange(rowNum, 3).setValue(STATUS.ERROR);
    sheet.getRange(rowNum, 5).setValue(new Date().toLocaleString('ja-JP'));
    sheet.getRange(rowNum, 6).setValue(e.message);
    return false;
  }
}

// ============================================================
// Gemini API
// ============================================================

/**
 * Geminiで文字起こし
 */
function transcribeWithGemini(file, apiKey) {
  const uploadResult = uploadFileToGemini(file, apiKey);

  // ファイルがACTIVE状態になるまでポーリング
  const activeFileUri = waitForFileActive(uploadResult.fileName, apiKey);

  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{
          parts: [
            { fileData: { mimeType: file.getMimeType(), fileUri: activeFileUri }},
            { text: `このメディアファイルの音声を全て文字起こししてください。

【ルール】
- 話者が複数いる場合は「話者A:」「話者B:」と区別
- タイムスタンプ不要
- 聞き取れない部分は[不明]
- 句読点を入れて読みやすく
- 文字起こしのみ出力` }
          ]
        }],
        generationConfig: { maxOutputTokens: 8192 }
      })
    }
  );

  const result = JSON.parse(response.getContentText());
  if (result.error) throw new Error(result.error.message);
  return result.candidates[0].content.parts[0].text;
}

/**
 * Geminiファイルがアクティブになるまで待機
 */
function waitForFileActive(fileName, apiKey) {
  for (let attempt = 0; attempt < GEMINI_POLLING_MAX_ATTEMPTS; attempt++) {
    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
      {
        method: 'get',
        muteHttpExceptions: true
      }
    );

    const result = JSON.parse(response.getContentText());

    if (result.error) {
      throw new Error(`ファイル状態確認エラー: ${result.error.message}`);
    }

    const state = result.state;
    console.log(`ファイル状態: ${state} (試行 ${attempt + 1}/${GEMINI_POLLING_MAX_ATTEMPTS})`);

    if (state === 'ACTIVE') {
      return result.uri;
    } else if (state === 'FAILED') {
      throw new Error('Geminiでのファイル処理に失敗しました。ファイル形式を確認してください。');
    }

    // PROCESSING状態の場合は待機して再試行
    Utilities.sleep(GEMINI_POLLING_INTERVAL_MS);
  }

  throw new Error(`ファイル処理がタイムアウトしました（${GEMINI_POLLING_MAX_ATTEMPTS * GEMINI_POLLING_INTERVAL_MS / 1000}秒）。ファイルが大きすぎる可能性があります。`);
}

/**
 * Gemini File APIにアップロード
 * @returns {Object} { uri: string, fileName: string }
 */
function uploadFileToGemini(file, apiKey) {
  // Blobを直接使用してメモリ効率を改善
  const blob = file.getBlob();
  const bytes = blob.getBytes();

  console.log(`アップロード開始: ${file.getName()} (${(bytes.length / (1024 * 1024)).toFixed(1)}MB)`);

  const startResponse = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'post',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': bytes.length,
        'X-Goog-Upload-Header-Content-Type': file.getMimeType()
      },
      payload: JSON.stringify({ file: { displayName: file.getName() }}),
      contentType: 'application/json',
      muteHttpExceptions: true
    }
  );

  if (startResponse.getResponseCode() !== 200) {
    throw new Error(`アップロード開始エラー: ${startResponse.getContentText()}`);
  }

  const uploadUrl = startResponse.getHeaders()['x-goog-upload-url']
                 || startResponse.getHeaders()['X-Goog-Upload-URL'];

  if (!uploadUrl) {
    throw new Error('アップロードURLを取得できませんでした');
  }

  const uploadResponse = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': file.getMimeType()
    },
    payload: bytes,
    muteHttpExceptions: true
  });

  if (uploadResponse.getResponseCode() !== 200) {
    throw new Error(`アップロードエラー: ${uploadResponse.getContentText()}`);
  }

  const result = JSON.parse(uploadResponse.getContentText());
  console.log(`アップロード完了: ${result.file.name}`);

  return {
    uri: result.file.uri,
    fileName: result.file.name
  };
}

// ============================================================
// Google ドキュメント
// ============================================================

/**
 * Googleドキュメントとして保存
 */
function saveAsGoogleDoc(originalName, transcript, outputFolderId) {
  const outputFolder = DriveApp.getFolderById(outputFolderId);
  const docName = originalName.replace(/\.[^.]+$/, '') + '_文字起こし';

  const existingFiles = outputFolder.getFilesByName(docName);
  let doc;

  if (existingFiles.hasNext()) {
    doc = DocumentApp.openById(existingFiles.next().getId());
    doc.getBody().clear();
  } else {
    doc = DocumentApp.create(docName);
    DriveApp.getFileById(doc.getId()).moveTo(outputFolder);
  }

  const body = doc.getBody();
  body.appendParagraph(`元ファイル: ${originalName}`).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`文字起こし日時: ${new Date().toLocaleString('ja-JP')}`);
  body.appendParagraph('───────────────────');
  body.appendParagraph(transcript);
  doc.saveAndClose();

  return doc.getUrl();
}

// ============================================================
// 全ドキュメント結合
// ============================================================

/**
 * 出力フォルダ内の全ての文字起こしドキュメントを1つに結合
 */
function combineAllDocs() {
  const config = getConfig();
  const ui = SpreadsheetApp.getUi();
  const outputFolder = DriveApp.getFolderById(config.OUTPUT_FOLDER_ID);

  // 文字起こしドキュメントを収集
  const docs = [];
  const files = outputFolder.getFilesByType('application/vnd.google-apps.document');

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    // 「_文字起こし」で終わるドキュメントのみ対象（統合ドキュメント自体は除外）
    if (fileName.endsWith('_文字起こし')) {
      docs.push({
        id: file.getId(),
        name: fileName,
        createdDate: file.getDateCreated()
      });
    }
  }

  if (docs.length === 0) {
    ui.alert('⚠️ 結合対象', '出力フォルダに文字起こしドキュメントがありません。', ui.ButtonSet.OK);
    return;
  }

  // 作成日時でソート（古い順）
  docs.sort((a, b) => a.createdDate - b.createdDate);

  // 確認ダイアログ
  const response = ui.alert(
    '📚 全ドキュメント結合',
    `${docs.length} 件の文字起こしドキュメントを結合します。\n\n結合対象:\n${docs.map(d => '・' + d.name).join('\n')}\n\n続行しますか？`,
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  // 統合ドキュメントの名前（固定）
  const combinedDocName = '📚 統合文字起こし';

  // 既存の統合ドキュメントを確認
  const existingFiles = outputFolder.getFilesByName(combinedDocName);
  let combinedDoc;

  if (existingFiles.hasNext()) {
    // 既存ドキュメントを上書き
    combinedDoc = DocumentApp.openById(existingFiles.next().getId());
    combinedDoc.getBody().clear();
  } else {
    // 新規ドキュメント作成
    combinedDoc = DocumentApp.create(combinedDocName);
    DriveApp.getFileById(combinedDoc.getId()).moveTo(outputFolder);
  }

  const body = combinedDoc.getBody();

  // タイトルを追加
  body.appendParagraph('📚 統合文字起こしドキュメント')
    .setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(`作成日時: ${new Date().toLocaleString('ja-JP')}`);
  body.appendParagraph(`結合ドキュメント数: ${docs.length} 件`);
  body.appendParagraph('');

  // 目次を作成
  body.appendParagraph('━━━━━━━━━━ 目次 ━━━━━━━━━━')
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  for (let i = 0; i < docs.length; i++) {
    body.appendParagraph(`${i + 1}. ${docs[i].name}`);
  }
  body.appendParagraph('');

  // 各ドキュメントの内容を追加
  for (let i = 0; i < docs.length; i++) {
    const docInfo = docs[i];

    // セクション区切り
    body.appendParagraph('');
    body.appendPageBreak();

    // セクションヘッダー
    body.appendParagraph(`━━━━━━━━━━ ${i + 1}/${docs.length} ━━━━━━━━━━`)
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(docInfo.name)
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('');

    // 元ドキュメントの内容を取得して追加
    try {
      const sourceDoc = DocumentApp.openById(docInfo.id);
      const sourceBody = sourceDoc.getBody();
      const numChildren = sourceBody.getNumChildren();

      for (let j = 0; j < numChildren; j++) {
        const child = sourceBody.getChild(j);
        const childType = child.getType();

        if (childType === DocumentApp.ElementType.PARAGRAPH) {
          const para = child.asParagraph();
          body.appendParagraph(para.getText());
        } else if (childType === DocumentApp.ElementType.LIST_ITEM) {
          const listItem = child.asListItem();
          body.appendListItem(listItem.getText());
        } else if (childType === DocumentApp.ElementType.TABLE) {
          // テーブルはテキストとして追加
          body.appendParagraph('[表]');
        }
      }
    } catch (e) {
      body.appendParagraph(`❌ エラー: ${e.message}`);
    }
  }

  combinedDoc.saveAndClose();

  ui.alert(
    '✅ 結合完了',
    `${docs.length} 件のドキュメントを結合しました。\n\n📄 ${combinedDocName}\n\n${combinedDoc.getUrl()}`,
    ui.ButtonSet.OK
  );
}
