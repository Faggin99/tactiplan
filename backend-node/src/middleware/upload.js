const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.resolve(process.env.UPLOAD_DIR || '../uploads');

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/mpeg',
  'video/webm',
  'video/quicktime',
  'application/pdf'
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(uploadDir, subfolder);
      ensureDir(dest);
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename = `${uuidv4()}${ext}`;
      cb(null, filename);
    }
  });
}

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
}

const uploadProfilePhoto = multer({
  storage: createStorage('profile-photos'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
}).single('photo');

const uploadClubLogo = multer({
  storage: createStorage('club-logos'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
}).single('logo');

const uploadSessionFile = multer({
  storage: createStorage('session-files'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
}).single('file');

const uploadAthletePhoto = multer({
  storage: createStorage('athlete-photos'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
}).single('photo');

// Análise do adversário: escudo (imagem) e vídeos por seção. Sem PDF/GIF (o PowerPoint embute só isso).
const MIDIA_ANALISE = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
const uploadAnaliseMidia = multer({
  storage: createStorage('analise'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => (MIDIA_ANALISE.includes(file.mimetype)
    ? cb(null, true) : cb(new Error('Envie uma imagem (JPG, PNG, WEBP) ou um vídeo (MP4, MOV, WEBM).'), false)),
}).single('file');

module.exports = {
  uploadAnaliseMidia,
  uploadProfilePhoto,
  uploadClubLogo,
  uploadSessionFile,
  uploadAthletePhoto
};
