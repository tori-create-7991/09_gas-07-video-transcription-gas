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
 * 新規ファイルをスキャン（ショートカット対応）
 */
function scanNewFiles() {
  const config = getConfig();
  const sheet = getFilesSheet();
  const folder = DriveApp.getFolderById(config.WATCH_FOLDER_ID);

  const existingIds = getExistingFileIds(sheet);
  const mp4Files = [];

  // フォルダ内のMP4ファイルとショートカットを収集
  collectMp4Files(folder, mp4Files, existingIds);

  let addedCount = 0;
  for (const file of mp4Files) {
    sheet.appendRow([file.getId(), file.getName(), STATUS.NEW, '', '', '']);
    addedCount++;
  }

  SpreadsheetApp.getUi().alert(`${addedCount} 件の新規ファイルを追加しました`);
}

/**
 * MP4ファイルを収集（ショートカット対応）
 * @param {Folder} folder - 検索対象フォルダ
 * @param {File[]} mp4Files - 収集したファイルを格納する配列
 * @param {string[]} existingIds - 既存のファイルID
 * @param {Set} visitedFolderIds - 訪問済みフォルダID（循環参照防止）
 */
function collectMp4Files(folder, mp4Files, existingIds, visitedFolderIds = new Set()) {
  const folderId = folder.getId();

  // 循環参照防止
  if (visitedFolderIds.has(folderId)) return;
  visitedFolderIds.add(folderId);

  // 通常のMP4ファイルを取得
  const files = folder.getFilesByType('video/mp4');
  while (files.hasNext()) {
    const file = files.next();
    if (!existingIds.includes(file.getId())) {
      mp4Files.push(file);
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
        // MP4ファイルへのショートカット
        if (targetFile.getMimeType() === 'video/mp4' && !existingIds.includes(targetId)) {
          mp4Files.push(targetFile);
        }
      } catch (e) {
        // ファイルとして取得できない場合はフォルダとして試す
        try {
          const targetFolder = DriveApp.getFolderById(targetId);
          // フォルダへのショートカット → 再帰的に検索
          collectMp4Files(targetFolder, mp4Files, existingIds, visitedFolderIds);
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
  const fileUri = uploadFileToGemini(file, apiKey);
  Utilities.sleep(5000);

  const response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{
          parts: [
            { fileData: { mimeType: file.getMimeType(), fileUri: fileUri }},
            { text: `この動画の音声を全て文字起こししてください。

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
 * Gemini File APIにアップロード
 */
function uploadFileToGemini(file, apiKey) {
  const bytes = file.getBlob().getBytes();

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
      contentType: 'application/json'
    }
  );

  const uploadUrl = startResponse.getHeaders()['x-goog-upload-url']
                 || startResponse.getHeaders()['X-Goog-Upload-URL'];

  const uploadResponse = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': file.getMimeType()
    },
    payload: bytes
  });

  return JSON.parse(uploadResponse.getContentText()).file.uri;
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
