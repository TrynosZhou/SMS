/// <reference types="node" />
/// <reference types="express" />

// Ensure Node.js globals are available
declare global {
  var __dirname: string;
  var __filename: string;
  var console: Console;
  var Buffer: typeof globalThis.Buffer;
  var process: NodeJS.Process;
}

export {};

