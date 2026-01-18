const jwt = require("jsonwebtoken");
const config = require("../config");

// Verify JWT token from cookie or Authorization header
function verifyToken(token) {
  try {
    return jwt.verify(token, config.auth.jwtSecret);
  } catch (e) {
    return null;
  }
}

// Extract token from request
function getToken(req) {
  // Try cookie first
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  // Try Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

// Express middleware for protected routes
function requireAuth(req, res, next) {
  const token = getToken(req);
  
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = decoded;
  next();
}

// Socket.IO middleware for protected connections
function socketAuth(socket, next) {
  // Try handshake auth
  let token = socket.handshake.auth?.token;
  
  // Try cookie from handshake headers
  if (!token) {
    const cookies = socket.handshake.headers.cookie;
    if (cookies) {
      const match = cookies.match(/token=([^;]+)/);
      if (match) token = match[1];
    }
  }

  if (!token) {
    return next(new Error("Authentication required"));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error("Invalid or expired token"));
  }

  socket.user = decoded;
  next();
}

// Generate JWT token
function generateToken(username) {
  return jwt.sign(
    { username, iat: Date.now() },
    config.auth.jwtSecret,
    { expiresIn: config.auth.tokenExpiry }
  );
}

module.exports = {
  verifyToken,
  getToken,
  requireAuth,
  socketAuth,
  generateToken
};
