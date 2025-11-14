/// <reference types="node" />

declare global {
  // Node.js globals
  var __dirname: string;
  var __filename: string;
  var console: Console;
  var Buffer: typeof globalThis.Buffer;
  var process: NodeJS.Process;
}

// Express namespace for multer
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

