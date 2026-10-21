// Anexos de atividade (training_activity_files): helpers de disco.
// O registro no banco sai por FK CASCADE quando a atividade é apagada; o arquivo
// físico precisa ser removido à mão (é o que a rota DELETE /api/files/:id já fazia).
const fs = require('fs');
const path = require('path');

// Limite por ATIVIDADE (antes eram 5 por sessão inteira).
const MAX_FILES_PER_ACTIVITY = 5;

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || '../uploads');
}

// file_path é sempre "/uploads/session-files/<uuid>.<ext>". Resolve dentro do
// UPLOAD_DIR e recusa qualquer coisa que escape dele.
function diskPathFor(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const rel = filePath.replace(/^\/?uploads\//, '');
  const root = uploadRoot();
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) return null;
  return full;
}

function removeStoredFile(filePath) {
  const full = diskPathFor(filePath);
  if (!full) return false;
  try {
    if (fs.existsSync(full)) { fs.unlinkSync(full); return true; }
  } catch (err) {
    console.error('Falha ao apagar arquivo do anexo:', err.message);
  }
  return false;
}

module.exports = { MAX_FILES_PER_ACTIVITY, diskPathFor, removeStoredFile };
