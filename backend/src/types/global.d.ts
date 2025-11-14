/// <reference types="node" />
/// <reference types="express" />
/// <reference types="multer" />

declare global {
  // Node.js globals are already provided by @types/node
  // Just ensure Express namespace is available
}

// Extend Express namespace for multer
declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
      buffer: Buffer;
    }
  }
}

export {};

