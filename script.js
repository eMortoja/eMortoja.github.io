const express = require('express');
const httpProxy = require('http-proxy');
const app = express();
const proxy = httpProxy.createProxyServer({ changeOrigin: true });

app.use('/proxy', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('No url provided');
  proxy.web(req, res, { target: targetUrl });
});

app.listen(3000, () => console.log('Proxy listening on port 3000'));