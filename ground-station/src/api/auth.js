/**
 * Simple authentication middleware
 * Uses bearer tokens for UAV authentication
 */

const registeredTokens = new Map();

/**
 * Generate a simple auth token for a UAV
 */
function generateToken(uavName) {
  const token = `uav_${uavName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  registeredTokens.set(token, uavName);
  return token;
}

/**
 * Revoke all tokens for a specific UAV
 */
function revokeTokensForUAV(uavName) {
  let revokedCount = 0;

  // Find and delete all tokens for this UAV
  for (const [token, tokenUavName] of registeredTokens.entries()) {
    if (tokenUavName === uavName) {
      registeredTokens.delete(token);
      revokedCount++;
    }
  }

  return revokedCount;
}

/**
 * Middleware to verify auth token
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!registeredTokens.has(token)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token'
    });
  }

  // Attach UAV name to request
  req.uavName = registeredTokens.get(token);
  next();
}

module.exports = {
  generateToken,
  revokeTokensForUAV,
  authenticate
};
