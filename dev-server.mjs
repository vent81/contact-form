import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Caricamento variabili d'ambiente (.env.local o .env)
if (fs.existsSync('.env.local')) {
  try {
    process.loadEnvFile('.env.local');
    console.log('📄 Configurazione caricata con successo da .env.local');
  } catch (e) {
    console.warn('Avviso caricamento .env.local:', e.message);
  }
} else if (fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
    console.log('📄 Configurazione caricata con successo da .env');
  } catch (e) {
    console.warn('Avviso caricamento .env:', e.message);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Importa l'handler serverless compilato
let contactHandler;
try {
  const module = await import('./api/contact.js');
  contactHandler = module.default;
} catch (err) {
  console.error('Errore durante l importazione di api/contact.js:', err);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // 1. Gestione Endpoint API /api/contact
  if (pathname === '/api/contact') {
    if (!contactHandler) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Handler API non disponibile' }));
    }

    // Accumula il body per richieste POST/PUT
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });

    req.on('end', async () => {
      // Wrapper compatibile VercelRequest / VercelResponse
      let parsedBody = {};
      try {
        if (rawBody.trim()) {
          parsedBody = JSON.parse(rawBody);
        }
      } catch (parseErr) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'JSON non valido' }));
      }

      const vercelReq = Object.assign(req, {
        body: parsedBody,
        query: Object.fromEntries(url.searchParams),
        cookies: {},
      });

      const vercelRes = Object.assign(res, {
        status(statusCode) {
          res.statusCode = statusCode;
          return this;
        },
        json(data) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(data));
          return this;
        },
        send(data) {
          res.end(data);
          return this;
        },
      });

      try {
        await contactHandler(vercelReq, vercelRes);
      } catch (handlerErr) {
        console.error('Errore non gestito nell handler:', handlerErr);
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Errore interno del server' }));
        }
      }
    });

    return;
  }

  // 2. Servizio File Statici da /public
  let relativeFilePath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(relativeFilePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Server di sviluppo locale avviato con successo!`);
  console.log(`🌐 Frontend disponibile su:   http://localhost:${PORT}`);
  console.log(`🔌 API endpoint disponibile su: http://localhost:${PORT}/api/contact`);
  console.log(`🗄️  Database URL configurato: ${process.env.DATABASE_URL ? 'Sì (Supabase)' : 'No'}`);
  console.log(`======================================================\n`);
});
