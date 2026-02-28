-- LeadControl SaaS — PostgreSQL init
-- Este ficheiro é executado pelo Postgres apenas na primeira inicialização

-- Extensões úteis para SaaS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Full-text search trigrams (futuro)
CREATE EXTENSION IF NOT EXISTS "btree_gin";   -- Índices compostos (futuro)

-- Criar role de leitura para relatórios (opcional)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'leadcontrol_readonly') THEN
    CREATE ROLE leadcontrol_readonly;
  END IF;
END $$;
