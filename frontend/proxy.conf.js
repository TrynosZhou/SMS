const PROXY_CONFIG = {
  "/api": {
    target: "http://localhost:3000",
    secure: false,
    changeOrigin: true,
    logLevel: "warn",
    timeout: 120000,
    proxyTimeout: 120000,
    onError(err, req, res) {
      if (res.headersSent) return;
      // Return JSON so the client request completes (avoids infinite "Loading..." in the UI)
      if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED") {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message:
              "Backend unavailable. Ensure the API server is running (npm run dev in the backend folder)."
          })
        );
        return;
      }
      console.error("[Proxy]", err.message || err);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Proxy error" }));
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
