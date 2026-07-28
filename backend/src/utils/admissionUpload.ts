import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { NextFunction, Request, Response } from 'express';

const uploadsDir = path.join(__dirname, '../../uploads/admissions');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    cb(null, `adm-${uniqueSuffix}-${safeBase}${ext}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and image files (JPEG, PNG, WebP) are allowed'));
  }
};

export const admissionUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const admissionDocumentFields = admissionUpload.fields([
  { name: 'birthCertificate', maxCount: 1 },
  { name: 'reportCard', maxCount: 1 },
  { name: 'idPhoto', maxCount: 1 },
  { name: 'medicalForm', maxCount: 1 },
  { name: 'otherDocument', maxCount: 3 },
]);

export function optionalAdmissionUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('multipart/form-data')) {
    admissionDocumentFields(req, res, (err) => {
      if (err) {
        res.status(400).json({ message: err.message || 'Invalid upload' });
        return;
      }
      next();
    });
    return;
  }
  next();
}

export function admissionPublicPath(filename: string): string {
  return `/uploads/admissions/${filename}`;
}
