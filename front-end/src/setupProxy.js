// Deze proxy setup is niet meer nodig omdat we nu direct de API_BASE_URL configureren in AuthContext.tsx
// Je kunt dit bestand verwijderen of behouden voor toekomstig gebruik.

// const { createProxyMiddleware } = require('http-proxy-middleware');
//
// module.exports = function(app) {
//   app.use(
//     '/api',
//     createProxyMiddleware({
//       target: 'http://10.0.1.105:3001',
//       changeOrigin: true,
//       secure: false,
//       onProxyReq: (proxyReq, req) => {
//         // Log the request for debugging
//         console.log(`Proxying ${req.method} request to: ${proxyReq.path}`);
//         
//         // Copy authorization header from original request
//         if (req.headers.authorization) {
//           proxyReq.setHeader('Authorization', req.headers.authorization);
//         }
//       },
//       onError: (err, req, res) => {
//         console.error('Proxy error:', err);
//         res.status(500).json({ error: 'Proxy error', message: err.message });
//       }
//     })
//   );
// };

// Leeg module export om te voorkomen dat React de proxy middleware probeert te initialiseren
module.exports = function(app) {
  // Geen proxy configuratie
};