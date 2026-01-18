const crypto = require("crypto");

// Generate random secret if not provided (persists for container lifetime)
const defaultSecret = crypto.randomBytes(32).toString("hex");

module.exports = {
  container: {
    name: process.env.CONTAINER_NAME || "hytale-server"
  },
  server: {
    port: parseInt(process.env.PANEL_PORT, 10) || 3000
  },
  docker: {
    socketPath: "/var/run/docker.sock"
  },
  auth: {
    // Set these via environment variables!
    username: process.env.PANEL_USER || "admin",
    password: process.env.PANEL_PASS || "changeme",
    jwtSecret: process.env.JWT_SECRET || defaultSecret,
    tokenExpiry: "24h"
  },
  files: {
    basePath: "/opt/hytale",
    maxUploadSize: 100 * 1024 * 1024,
    editableExtensions: [
      ".json", ".yaml", ".yml", ".properties", 
      ".txt", ".cfg", ".conf", ".xml", ".toml", ".ini"
    ],
    uploadAllowedExtensions: [
      ".jar", ".zip", ".json", ".yaml", ".yml", ".properties",
      ".txt", ".cfg", ".conf", ".xml", ".toml", ".ini", ".png", ".jpg"
    ]
  }
};
