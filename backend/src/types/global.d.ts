declare global {
  // Node.js globals are already provided by @types/node
  // Express namespace is provided by @types/express
}

// Extend Express namespace for multer if needed
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

