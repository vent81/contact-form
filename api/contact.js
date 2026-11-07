import pg from 'pg';
import { Resend } from 'resend';
import { z } from 'zod';
import crypto from 'node:crypto';
const { Pool } = pg;
// Singleton pool per connessioni PostgreSQL (Supabase / Neon / Postgres standard)
let poolInstance = null;
function getPool(connectionString) {
    if (!poolInstance) {
        poolInstance = new Pool({
            connectionString,
            ssl: {
                rejectUnauthorized: false,
            },
            max: 2,
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 10000,
        });
    }
    return poolInstance;
}
// -----------------------------------------------------------------------------
// 1. Schema di Validazione dei Dati con Zod
// -----------------------------------------------------------------------------
const contactSchema = z.object({
    fullName: z
        .string({ required_error: 'Il nome e cognome sono obbligatori' })
        .trim()
        .min(2, 'Il nome deve contenere almeno 2 caratteri')
        .max(120, 'Il nome non può superare 120 caratteri'),
    email: z
        .string({ required_error: "L'indirizzo email è obbligatorio" })
        .trim()
        .email('Inserisci un indirizzo email valido')
        .max(255, "L'email non può superare 255 caratteri"),
    phone: z
        .string()
        .trim()
        .max(30, 'Il numero di telefono non può superare 30 caratteri')
        .optional()
        .or(z.literal('')),
    subject: z
        .string({ required_error: "L'oggetto è obbligatorio" })
        .trim()
        .min(3, "L'oggetto deve contenere almeno 3 caratteri")
        .max(200, "L'oggetto non può superare 200 caratteri"),
    message: z
        .string({ required_error: 'Il messaggio è obbligatorio' })
        .trim()
        .min(10, 'Il messaggio deve contenere almeno 10 caratteri')
        .max(5000, 'Il messaggio non può superare 5000 caratteri'),
    privacyConsent: z.literal(true, {
        errorMap: () => ({ message: "È necessario accettare l'informativa sulla privacy" }),
    }),
    // Campo Honeypot per intercettare i bot automatizzati
    hp_company_field: z.string().optional().or(z.literal('')),
    // Token anti-bot Cloudflare Turnstile
    turnstileToken: z.string().optional().or(z.literal('')),
});
// Helper per hash SHA-256 dell'indirizzo IP (Conformità GDPR)
function hashIpAddress(ip) {
    if (!ip)
        return null;
    const salt = process.env.IP_SALT || 'salt_antigravity_contact_form';
    return crypto.createHash('sha256').update(`${ip}-${salt}`).digest('hex');
}
// -----------------------------------------------------------------------------
// 2. Handler Serverless Principale
// -----------------------------------------------------------------------------
export default async function handler(req, res) {
    // Gestione preflight CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Metodo non consentito. Utilizzare POST.',
        });
    }
    try {
        // A. Parsing del body e validazione dei tipi
        const parseResult = contactSchema.safeParse(req.body);
        if (!parseResult.success) {
            const fieldErrors = parseResult.error.flatten().fieldErrors;
            return res.status(400).json({
                success: false,
                error: 'Dati del modulo non validi.',
                details: fieldErrors,
            });
        }
        const data = parseResult.data;
        // B. Protezione Anti-Spam Livello 1: Honeypot Check
        if (data.hp_company_field && data.hp_company_field.trim() !== '') {
            console.warn('[Anti-Spam] Bot rilevato tramite honeypot. Richiesta neutralizzata.');
            return res.status(200).json({
                success: true,
                message: 'Messaggio inviato con successo!',
            });
        }
        // C. Protezione Anti-Spam Livello 2: Cloudflare Turnstile Verification
        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
        if (turnstileSecret && turnstileSecret.trim() !== '' && !turnstileSecret.startsWith('0x4AAAAAA...')) {
            if (!data.turnstileToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Verifica anti-bot obbligatoria mancante.',
                });
            }
            const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress;
            const turnstileFormData = new URLSearchParams();
            turnstileFormData.append('secret', turnstileSecret);
            turnstileFormData.append('response', data.turnstileToken);
            if (clientIp) {
                turnstileFormData.append('remoteip', clientIp);
            }
            const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: turnstileFormData.toString(),
            });
            const turnstileResult = (await turnstileRes.json());
            if (!turnstileResult.success) {
                console.warn('[Turnstile] Verifica challenge fallita:', turnstileResult['error-codes']);
                return res.status(400).json({
                    success: false,
                    error: 'Verifica anti-bot fallita. Ricarica la pagina e riprova.',
                });
            }
        }
        // D. Persistenza su Database PostgreSQL (Supabase / Neon)
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress;
        const ipHash = hashIpAddress(clientIp);
        const userAgent = req.headers['user-agent'] || null;
        let contactId = null;
        let dbSaved = false;
        const dbUrl = process.env.DATABASE_URL;
        if (dbUrl) {
            try {
                const pool = getPool(dbUrl);
                const queryText = `
          INSERT INTO contacts (
            full_name,
            email,
            phone,
            subject,
            message,
            privacy_consent,
            ip_address_hash,
            user_agent,
            status,
            email_notification_sent
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unread', FALSE)
          RETURNING id;
        `;
                const dbResult = await pool.query(queryText, [
                    data.fullName,
                    data.email,
                    data.phone || null,
                    data.subject,
                    data.message,
                    data.privacyConsent,
                    ipHash,
                    userAgent,
                ]);
                if (dbResult.rows && dbResult.rows.length > 0) {
                    contactId = dbResult.rows[0].id;
                    dbSaved = true;
                    console.log(`[Database] Contatto salvato con successo su PostgreSQL (ID: ${contactId})`);
                }
            }
            catch (dbError) {
                console.error('[Database Error] Errore durante il salvataggio su PostgreSQL:', dbError);
                return res.status(500).json({
                    success: false,
                    error: `Errore durante il salvataggio nel database: ${dbError.message || dbError}`,
                });
            }
        }
        else {
            console.warn('[Database] DATABASE_URL non configurato. Salvataggio su DB saltato.');
        }
        // E. Invio Notifiche Email (Resend)
        const resendApiKey = process.env.RESEND_API_KEY;
        const notificationEmail = process.env.CONTACT_NOTIFICATION_EMAIL;
        const fromEmail = process.env.CONTACT_FROM_EMAIL || 'onboarding@resend.dev';
        let emailSent = false;
        if (resendApiKey && !resendApiKey.startsWith('re_your_api_key') && notificationEmail) {
            const resend = new Resend(resendApiKey);
            try {
                // 1. Email di notifica all'amministratore
                await resend.emails.send({
                    from: fromEmail,
                    to: notificationEmail,
                    replyTo: data.email,
                    subject: `[Nuovo Contatto Web] ${data.subject}`,
                    html: `
            <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
              <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">Nuovo Messaggio dal Sito Web</h2>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 6px 0; font-weight: bold; width: 140px;">Nome:</td><td>${escapeHtml(data.fullName)}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Email:</td><td><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Telefono:</td><td>${data.phone ? escapeHtml(data.phone) : '<em>Non specificato</em>'}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Oggetto:</td><td>${escapeHtml(data.subject)}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Data/Ora:</td><td>${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</td></tr>
              </table>
              <div style="margin-top: 20px;">
                <h4 style="margin-bottom: 8px; color: #374151;">Messaggio:</h4>
                <div style="background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 14px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(data.message)}</div>
              </div>
            </div>
          `,
                });
                // 2. Email di conferma automatica all'utente mittente
                await resend.emails.send({
                    from: fromEmail,
                    to: data.email,
                    subject: `Ricezione richiesta di contatto: ${data.subject}`,
                    html: `
            <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
              <h2 style="color: #111827; margin-top: 0;">Grazie per averci contattato, ${escapeHtml(data.fullName)}!</h2>
              <p>Abbiamo ricevuto la tua richiesta con oggetto: <strong>"${escapeHtml(data.subject)}"</strong>.</p>
              <p>Il nostro team esaminerà il messaggio e ti risponderà il prima possibile.</p>
              <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
              <p style="font-size: 13px; color: #6b7280;">Questa è un'email automatica di conferma. Per ulteriori informazioni puoi rispondere direttamente a questo indirizzo.</p>
            </div>
          `,
                });
                emailSent = true;
                // Se salvato su DB, aggiorna il flag email_notification_sent
                if (contactId && dbUrl) {
                    try {
                        const pool = getPool(dbUrl);
                        await pool.query('UPDATE contacts SET email_notification_sent = TRUE WHERE id = $1', [contactId]);
                    }
                    catch (updateErr) {
                        console.error('[Database Update Error]:', updateErr);
                    }
                }
            }
            catch (mailError) {
                console.error('[Resend Email Error]:', mailError);
            }
        }
        else {
            console.warn('[Resend] RESEND_API_KEY non attiva o non configurata. Invio email saltato.');
        }
        // F. Risposta positiva al client
        return res.status(200).json({
            success: true,
            message: 'Grazie! Il tuo messaggio è stato inviato e salvato con successo nel database.',
            contactId,
            dbSaved,
            emailDelivered: emailSent,
        });
    }
    catch (error) {
        console.error('[Handler Error] Errore imprevisto nel serverless handler:', error);
        return res.status(500).json({
            success: false,
            error: "Si è verificato un errore durante l'invio della richiesta. Riprova più tardi.",
        });
    }
}
// Helper per sanificare stringhe HTML per prevenire injection nelle email HTML
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
