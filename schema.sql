-- ==============================================================================
-- SCHEMA DATABASE: CONTATTI (POSTGRESQL / NEON / SUPABASE)
-- ==============================================================================

-- Creazione estensione UUID (se non presente di default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabella principale dei contatti ricevuti
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Dati del mittente
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    
    -- Conformità GDPR e Metadati
    privacy_consent BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address_hash VARCHAR(64), -- Hashed con SHA-256 (nessun IP memorizzato in chiaro)
    user_agent TEXT,
    
    -- Stato di gestione interna del contatto
    status VARCHAR(20) DEFAULT 'unread' NOT NULL CHECK (status IN ('unread', 'in_progress', 'replied', 'archived', 'spam')),
    
    -- Esito notifica email
    email_notification_sent BOOLEAN DEFAULT FALSE NOT NULL
);

-- Indici per ottimizzare interrogazioni e filtri
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- Commenti descrittivi per documentazione del catalogo
COMMENT ON TABLE contacts IS 'Archivio delle richieste di contatto pervenute dal form web';
COMMENT ON COLUMN contacts.ip_address_hash IS 'Hash SHA-256 dell indirizzo IP del mittente per tracciamento anti-abuso nel rispetto del GDPR';
COMMENT ON COLUMN contacts.privacy_consent IS 'Flag obbligatorio di consenso al trattamento dei dati personali';
