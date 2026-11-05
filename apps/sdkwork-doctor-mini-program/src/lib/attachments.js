// Attachments for the mini program conversation.
//
// Images and videos come from `wx.chooseMedia` (album or camera); documents
// come from `wx.chooseMessageFile`. The chosen temp file is saved into the app
// file system so the medical record can still open it after a restart; the
// record persists only the metadata and the saved path.
const { createMedicalAttachment } = require('./medical-records.js');

const MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  csv: 'text/csv',
  rtf: 'application/rtf',
};

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

function guessMime(name, fallback) {
  return MIME_BY_EXTENSION[extensionOf(name)] || fallback || 'application/octet-stream';
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return String(Math.round(value)) + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
  return (value / (1024 * 1024)).toFixed(1) + ' MB';
}

function saveTempFile(tempFilePath) {
  return new Promise((resolve) => {
    if (!tempFilePath) {
      resolve('');
      return;
    }
    try {
      wx.getFileSystemManager().saveFile({
        tempFilePath: tempFilePath,
        success: (result) => resolve(result.savedFilePath || tempFilePath),
        fail: () => resolve(tempFilePath),
      });
    } catch (error) {
      resolve(tempFilePath);
    }
  });
}

function basename(path, fallback) {
  const value = String(path || '');
  const index = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  return index >= 0 ? value.slice(index + 1) : fallback;
}

function chooseMedia() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const files = (result && result.tempFiles) || [];
        Promise.all(files.map(async (file) => {
          const kind = file.fileType === 'video' ? 'video' : 'image';
          const extension = kind === 'video' ? 'mp4' : 'jpg';
          const name = basename(file.tempFilePath, kind + '-' + Date.now() + '.' + extension);
          const path = await saveTempFile(file.tempFilePath);
          return createMedicalAttachment({
            name: name,
            mimeType: guessMime(name, kind === 'video' ? 'video/mp4' : 'image/jpeg'),
            sizeBytes: file.size,
            kind: kind,
            path: path,
          });
        })).then(resolve).catch(reject);
      },
      fail: reject,
    });
  });
}

function chooseDocument() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 9,
      type: 'file',
      success: (result) => {
        const files = (result && result.tempFiles) || [];
        Promise.all(files.map(async (file) => {
          const name = file.name || basename(file.path, 'file');
          const path = await saveTempFile(file.path);
          return createMedicalAttachment({
            name: name,
            mimeType: guessMime(name),
            sizeBytes: file.size,
            path: path,
          });
        })).then(resolve).catch(reject);
      },
      fail: reject,
    });
  });
}

/**
 * Lets the patient pick photos, videos, or documents. Resolves with the new
 * attachment rows; a cancelled picker rejects so the page can ignore it.
 */
function chooseAttachments(labels) {
  const copy = labels || {};
  return new Promise((resolve, reject) => {
    wx.showActionSheet({
      itemList: [copy.image || 'Photo', copy.video || 'Video', copy.file || 'File'],
      success: (result) => {
        const picker = result.tapIndex === 2 ? chooseDocument : chooseMedia;
        picker().then(resolve).catch(reject);
      },
      fail: reject,
    });
  });
}

module.exports = {
  chooseAttachments,
  formatBytes,
  guessMime,
};
