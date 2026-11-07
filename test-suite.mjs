/**
 * Automated Test Suite per il Form di Contatto Serverless
 * Testa l'handler di api/contact.js simulando scenari di utilizzo reali e attacchi di spam.
 */

import handler from './api/contact.js';

// Helper per creare un mock di VercelRequest e VercelResponse
function createMockContext({ method = 'POST', body = {}, headers = {} }) {
  const req = {
    method,
    body,
    headers: {
      'user-agent': 'Antigravity-Test-Agent/1.0',
      'x-forwarded-for': '127.0.0.1',
      ...headers,
    },
    socket: { remoteAddress: '127.0.0.1' },
  };

  let statusCode = 200;
  let responseData = null;
  const responseHeaders = {};

  const res = {
    statusCode,
    setHeader(key, val) {
      responseHeaders[key] = val;
      return this;
    },
    status(code) {
      statusCode = code;
      this.statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    end() {
      return this;
    },
  };

  return {
    req,
    res,
    getResult: () => ({ status: statusCode, body: responseData, headers: responseHeaders }),
  };
}

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Dettagli:`, details);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 AVVIO TEST AUTOMATIZZATI FORM DI CONTATTO');
  console.log('======================================================\n');

  // Test 1: Invio valido completo
  {
    const { req, res, getResult } = createMockContext({
      body: {
        fullName: 'Mario Rossi',
        email: 'mario.rossi@example.com',
        phone: '+39 340 1234567',
        subject: 'Richiesta di preventivo',
        message: 'Buongiorno, vorrei maggiori dettagli sui vostri servizi.',
        privacyConsent: true,
      },
    });

    await handler(req, res);
    const result = getResult();
    assert(result.status === 200, 'Test 1: Status HTTP 200 per payload valido');
    assert(result.body?.success === true, 'Test 1: Proprietà success === true');
  }

  // Test 2: Validazione fallita per campi obbligatori mancanti
  {
    const { req, res, getResult } = createMockContext({
      body: {
        fullName: 'M', // Troppo corto (< 2)
        // email mancante
        subject: '',
        message: 'Corto', // Troppo corto (< 10)
        privacyConsent: false,
      },
    });

    await handler(req, res);
    const result = getResult();
    assert(result.status === 400, 'Test 2: Status HTTP 400 per dati non validi');
    assert(result.body?.success === false, 'Test 2: Proprietà success === false');
    assert(result.body?.details?.email !== undefined, 'Test 2: Errore rilevato sul campo email');
    assert(result.body?.details?.privacyConsent !== undefined, 'Test 2: Errore consenso privacy obbligatorio');
  }

  // Test 3: Formato email non valido
  {
    const { req, res, getResult } = createMockContext({
      body: {
        fullName: 'Laura Bianchi',
        email: 'email-non-valida-senza-chiocciola',
        subject: 'Info generale',
        message: 'Questo è un messaggio di test con lunghezza sufficiente.',
        privacyConsent: true,
      },
    });

    await handler(req, res);
    const result = getResult();
    assert(result.status === 400, 'Test 3: Status 400 per email con sintassi errata');
    assert(result.body?.details?.email !== undefined, 'Test 3: Segnalazione errore specifico su email');
  }

  // Test 4: Protezione Anti-Spam Honeypot
  {
    const { req, res, getResult } = createMockContext({
      body: {
        fullName: 'Bot Spammer',
        email: 'bot@spamnetwork.xyz',
        subject: 'Buy cheap watches',
        message: 'Visita subito il nostro sito per vincere un premio speciale!',
        privacyConsent: true,
        hp_company_field: 'Valore inserito dal bot automatizzato', // Campo honeypot compilato
      },
    });

    await handler(req, res);
    const result = getResult();
    assert(result.status === 200, 'Test 4: Honeypot risponde 200 OK fittizio al bot');
    assert(result.body?.success === true, 'Test 4: Il bot viene neutralizzato senza errori');
  }

  // Test 5: Metodo HTTP non consentito (es. GET invece di POST)
  {
    const { req, res, getResult } = createMockContext({
      method: 'GET',
    });

    await handler(req, res);
    const result = getResult();
    assert(result.status === 405, 'Test 5: Status HTTP 405 Method Not Allowed per richieste GET');
    assert(result.body?.success === false, 'Test 5: Segnalazione metodo non consentito');
  }

  // Test 6: Gestione CORS Preflight (OPTIONS)
  {
    const { req, res, getResult } = createMockContext({
      method: 'OPTIONS',
    });

    await handler(req, res);
    const result = getResult();
    assert(result.status === 200, 'Test 6: Status HTTP 200 per preflight CORS OPTIONS');
    assert(result.headers['Access-Control-Allow-Origin'] === '*', 'Test 6: Header CORS corretti');
  }

  console.log('\n------------------------------------------------------');
  console.log(`RISULTATO TEST: ${passed} passati, ${failed} falliti.`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
