// Netlify Function (Option A) — wraps the Express API as a serverless handler.
// /api/* is proxied here by netlify.toml. Requires the root package.json deps.
const serverless = require('serverless-http');
const app = require('../../backend/server');
exports.handler = serverless(app);
