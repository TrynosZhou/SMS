const PROXY_CONFIG = {
  "/api": {
    target: "http://localhost:3000",
    secure: false,
    changeOrigin: true,
    logLevel: "warn",
    timeout: 120000,
    proxyTimeout: 120000,
    onError(err, req, res) {
      // Suppress ECONNRESET / socket hang up when backend restarts or connection drops
      if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED") {
        return;
      }
      console.error("[Proxy]", err.message || err);
    },
    onProxyReq(proxyReq, req, res) {
      // Optional: add headers if needed
    },
  },
  "/uploads": {
    target: "http://localhost:3000",
    secure: false,
    changeOrigin: true,
    logLevel: "warn",
    timeout: 120000,
    proxyTimeout: 120000,
    onError(err, req, res) {
      if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED") {
        return;
      }
      console.error("[Proxy]", err.message || err);
    },
  },
};

module.exports = PROXY_CONFIG;
