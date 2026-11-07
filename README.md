# Form di Contatto Serverless (Vercel + PostgreSQL + Resend)

Modulo di contatto moderno, sicuro e conforme al GDPR progettato con architettura **Zero-Backend** per siti web statici ospitati su **Vercel**.

## 🚀 Caratteristiche

- **Zero Gestione Server**: Eseguito interamente tramite Vercel Edge/Serverless Functions.
- **Persistenza Relazionale**: Salvataggio dei contatti su **PostgreSQL** ([Neon](https://neon.tech) o [Supabase](https://supabase.com)).
- **Email Transazionali Immediate**: Notifica istantanea all'amministratore e auto-reply di conferma all'utente con [Resend](https://resend.com).
- **Anti-Spam & Anti-Bot Multi-Livello**:
  - Campo **Honeypot** invisibile agli utenti per neutralizzare bot banali senza overhead.
  - Integrazione con **Cloudflare Turnstile** (challenge invisibile, privacy-friendly, senza captcha complessi).
- **Conformità GDPR**:
  - Flag consenso obbligatorio.
  - Mascheramento/hashing degli indirizzi IP (SHA-256 + salt) per audit anti-abuso senza memorizzare dati personali in chiaro.
- **Validazione Sicura con Zod**: Tipizzazione forte e sanitizzazione HTML contro attacchi XSS ed email injection.

---

## 📁 Struttura del Progetto

```text
├── api/
│   └── contact.ts           # Endpoint Serverless Vercel (Validazione, DB, Email)
├── public/
│   ├── index.html           # Interfaccia grafica del modulo di contatto
│   ├── css/
│   │   └── style.css        # Stili, layout responsive e stati di caricamento/errore
│   └── js/
│       └── contact.js       # Validazione lato client e chiamata asincrona all'API
├── schema.sql               # Script SQL per la creazione della tabella su PostgreSQL
├── vercel.json              # Configurazione Vercel e header di sicurezza HTTP
├── package.json             # Dipendenze Node.js (@neondatabase/serverless, resend, zod)
├── tsconfig.json            # Configurazione TypeScript
├── .env.example             # Modello delle variabili d'ambiente
└── README.md                # Guida al setup e al deploy
```

---

## 🛠️ Guida Rapida al Setup

### 1. Inizializzare il Database PostgreSQL
Crea un database gratuito su [Neon](https://neon.tech) o [Supabase](https://supabase.com) ed esegui la query contenuta in `schema.sql` nella SQL Editor del tuo provider:

```bash
# Esempio esecuzione via psql (se installato):
psql "$DATABASE_URL" -f schema.sql
```

### 2. Configurare le Variabili d'Ambiente
Copia il file `.env.example` in `.env.local`:

```bash
cp .env.example .env.local
```

Compila i valori richiesti:
- `DATABASE_URL`: Connection string del tuo database PostgreSQL.
- `RESEND_API_KEY`: Chiave API ottenuta su [resend.com/api-keys](https://resend.com/api-keys).
- `CONTACT_NOTIFICATION_EMAIL`: La tua email su cui ricevere i messaggi.
- `CONTACT_FROM_EMAIL`: L'indirizzo mittente (es. `noreply@tuodominio.it` o `onboarding@resend.dev` per test).
- `TURNSTILE_SECRET_KEY`: Chiave segreta da Cloudflare Turnstile (opzionale in sviluppo locale).

### 3. Eseguire i Test ed Avviare in Locale

Per eseguire la suite di test automatizzati (validazione Zod, anti-bot honeypot, CORS, status code):
```bash
npm test
```

Per avviare il server di sviluppo locale:
```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) nel browser per interagire con il form. L'API risponderà su `http://localhost:3000/api/contact`.

---

## 🚢 Deploy su Vercel

### Opzione A: Tramite Vercel CLI
```bash
npx vercel
```
Segui le istruzioni a schermo e inserisci le variabili d'ambiente quando richiesto (oppure tramite la dashboard di Vercel).

### Opzione B: Tramite GitHub / GitLab / Bitbucket
1. Esegui il push del repository su GitHub.
2. Collega il repository su [vercel.com/new](https://vercel.com/new).
3. Nella sezione **Environment Variables**, incolla le variabili definite nel tuo `.env.example`.
4. Clicca **Deploy**.
