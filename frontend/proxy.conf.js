/** Use IPv4 loopback — on Windows, "localhost" can hit ::1 first and ETIMEDOUT before 127.0.0.1 */
/** SMS API port — use 3001 locally so port 3000 can stay free for other apps */
const API_TARGET = "http://127.0.0.1:3001";

const PROXY_CONFIG = {
  "/api": {
    target: API_TARGET,
    secure: false,
    changeOrigin: true,
    logLevel: "warn",
    timeout: 120000,
    proxyTimeout: 120000,
    onError(err, req, res) {
      if (res.headersSent) return;
      // Return JSON so the client request completes (avoids infinite "Loading..." in the UI)
      if (
        err.code === "ECONNRESET" ||
        err.code === "ECONNREFUSED" ||
        err.code === "ETIMEDOUT"
      ) {
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
    target: API_TARGET,
    secure: false,
    changeOrigin: true,
    logLevel: "warn",
    timeout: 120000,
    proxyTimeout: 120000,
    onError(err, req, res) {
      if (
        err.code === "ECONNRESET" ||
        err.code === "ECONNREFUSED" ||
        err.code === "ETIMEDOUT"
      ) {
        return;
      }
      console.error("[Proxy]", err.message || err);
    },
  },
};

module.exports = PROXY_CONFIG;
