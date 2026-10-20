// Fotos dos anexos do treino (training_activity_files) para os relatórios.
// Lê do DISCO (nunca pela URL pública), reduz no servidor e devolve buffers
// JPEG prontos para o template. Arquivo ausente/corrompido é ignorado.
const fs = require('fs');
const path = require('path');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.gif']);
const MAX_SIDE = 1400;
const JPEG_QUALITY = 78;

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads'));
}

// Só anexos de imagem: mime image/* (ou, sem mime, extensão de imagem).
function isImageAttachment(file) {
  if (!file || !file.file_path) return false;
  const mime = String(file.mime_type || '').toLowerCase();
  if (mime) return mime.startsWith('image/') && mime !== 'image/svg+xml';
  return IMAGE_EXT.has(path.extname(String(file.file_name || file.file_path)).toLowerCase());
}

function filterImageAttachments(files) {
  return (files || []).filter(isImageAttachment);
}

// "/uploads/session-files/x.jpg" → "<UPLOAD_DIR>/session-files/x.jpg".
// Recusa qualquer caminho que escape da pasta de uploads.
function resolveUploadPath(filePath, root = uploadRoot()) {
  if (!filePath) return null;
  const rel = String(filePath).replace(/^\/+/, '').replace(/^uploads\//, '');
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

let sharpLib;
function getSharp() {
  if (sharpLib === undefined) {
    try { sharpLib = require('sharp'); } catch (_) { sharpLib = null; }
  }
  return sharpLib;
}

// Reduz para JPEG (lado máx. 1400px, q78), respeitando a orientação EXIF.
async function loadPhotoBuffer(filePath, { maxSide = MAX_SIDE, quality = JPEG_QUALITY } = {}) {
  const full = resolveUploadPath(filePath);
  if (!full) return null;
  let input;
  try {
    input = await fs.promises.readFile(full);
  } catch (_) {
    return null; // arquivo sumiu do disco
  }
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const out = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    return out;
  } catch (_) {
    return null; // formato que o sharp não lê (ex.: HEIC sem codec)
  }
}

// Escudo do clube (logo_path) → PNG pequeno com transparência.
async function loadLogoBuffer(logoPath) {
  const full = resolveUploadPath(logoPath);
  if (!full) return null;
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const input = await fs.promises.readFile(full);
    return await sharp(input, { failOn: 'none' })
      .resize({ width: 240, height: 240, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (_) {
    return null;
  }
}

// Carrega uma lista de anexos (já filtrados/ordenados) até `limit` fotos válidas.
// Retorna { photos: [{...file, buffer}], hidden } — hidden = imagens que existiam
// mas ficaram de fora pelo limite.
async function loadPhotos(files, limit) {
  const photos = [];
  let hidden = 0;
  for (const f of files) {
    if (photos.length >= limit) {
      const full = resolveUploadPath(f.file_path);
      if (full && fs.existsSync(full)) hidden++;
      continue;
    }
    const buffer = await loadPhotoBuffer(f.file_path);
    if (buffer) photos.push({ ...f, buffer });
  }
  return { photos, hidden };
}

module.exports = {
  MAX_SIDE,
  JPEG_QUALITY,
  isImageAttachment,
  filterImageAttachments,
  resolveUploadPath,
  loadPhotoBuffer,
  loadLogoBuffer,
  loadPhotos,
};
