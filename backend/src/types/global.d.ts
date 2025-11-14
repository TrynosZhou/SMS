// Global type augmentations
declare global {
  // Node.js globals - these should be provided by @types/node
  // But we declare them here as a fallback
  var __dirname: string;
  var __filename: string;
  var console: Console;
  var process: NodeJS.Process;
  var require: NodeRequire;
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

