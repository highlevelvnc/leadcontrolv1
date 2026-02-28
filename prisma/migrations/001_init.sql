-- ══════════════════════════════════════════════════════════════
-- LeadControl SaaS — Migração Inicial
-- Gerado por: prisma migrate dev --name init
-- Este ficheiro é executado pelo `prisma migrate deploy`
-- ══════════════════════════════════════════════════════════════

-- Extensões PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'ENTERPRISE');
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'AGENT');

-- Tenants
CREATE TABLE "tenants" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "slug"       TEXT NOT NULL,
    "plan"       "Plan" NOT NULL DEFAULT 'FREE',
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "logo"       TEXT,
    "phone"      TEXT,
    "email"      TEXT,
    "address"    TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- Users
CREATE TABLE "users" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "password"   TEXT NOT NULL,
    "role"       "UserRole" NOT NULL DEFAULT 'AGENT',
    "phone"      TEXT,
    "avatar"     TEXT,
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenant_id", "email");
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- Properties
CREATE TABLE "properties" (
    "id"           TEXT NOT NULL,
    "tenant_id"    TEXT NOT NULL,
    "agent_id"     TEXT,
    "title"        TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    "purpose"      TEXT NOT NULL,
    "price"        DECIMAL(12,2) NOT NULL,
    "area"         DECIMAL(8,2),
    "bedrooms"     INTEGER NOT NULL DEFAULT 0,
    "bathrooms"    INTEGER NOT NULL DEFAULT 0,
    "parking"      INTEGER NOT NULL DEFAULT 0,
    "address"      TEXT,
    "neighborhood" TEXT,
    "city"         TEXT,
    "state"        TEXT,
    "description"  TEXT,
    "status"       TEXT NOT NULL DEFAULT 'active',
    "featured"     BOOLEAN NOT NULL DEFAULT false,
    "images"       TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amenities"    TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latitude"     DECIMAL(10,7),
    "longitude"    DECIMAL(10,7),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "properties_tenant_id_idx"        ON "properties"("tenant_id");
CREATE INDEX "properties_tenant_id_status_idx" ON "properties"("tenant_id", "status");
CREATE INDEX "properties_tenant_id_purpose_idx" ON "properties"("tenant_id", "purpose");

-- Leads
CREATE TABLE "leads" (
    "id"                   TEXT NOT NULL,
    "tenant_id"            TEXT NOT NULL,
    "agent_id"             TEXT,
    "property_interest_id" TEXT,
    "name"                 TEXT NOT NULL,
    "email"                TEXT,
    "phone"                TEXT,
    "source"               TEXT NOT NULL DEFAULT 'manual',
    "status"               TEXT NOT NULL DEFAULT 'new',
    "temperature"          TEXT NOT NULL DEFAULT 'cold',
    "interest"             TEXT,
    "budget_min"           DECIMAL(12,2),
    "budget_max"           DECIMAL(12,2),
    "notes"                TEXT,
    "score"                INTEGER NOT NULL DEFAULT 0,
    "last_contact"         TIMESTAMP(3),
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leads_tenant_id_idx"             ON "leads"("tenant_id");
CREATE INDEX "leads_tenant_id_temperature_idx" ON "leads"("tenant_id", "temperature");
CREATE INDEX "leads_tenant_id_status_idx"      ON "leads"("tenant_id", "status");

-- Pipeline Stages
CREATE TABLE "pipeline_stages" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "color"      TEXT NOT NULL DEFAULT '#4a9eff',
    "position"   INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pipeline_stages_tenant_id_idx" ON "pipeline_stages"("tenant_id");

-- Deals
CREATE TABLE "deals" (
    "id"             TEXT NOT NULL,
    "tenant_id"      TEXT NOT NULL,
    "agent_id"       TEXT,
    "lead_id"        TEXT,
    "property_id"    TEXT,
    "stage_id"       TEXT,
    "title"          TEXT NOT NULL,
    "value"          DECIMAL(12,2),
    "notes"          TEXT,
    "expected_close" TIMESTAMP(3),
    "closed_at"      TIMESTAMP(3),
    "status"         TEXT NOT NULL DEFAULT 'open',
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deals_tenant_id_idx"        ON "deals"("tenant_id");
CREATE INDEX "deals_tenant_id_status_idx" ON "deals"("tenant_id", "status");

-- Appointments
CREATE TABLE "appointments" (
    "id"          TEXT NOT NULL,
    "tenant_id"   TEXT NOT NULL,
    "agent_id"    TEXT,
    "lead_id"     TEXT,
    "property_id" TEXT,
    "title"       TEXT NOT NULL,
    "type"        TEXT NOT NULL DEFAULT 'visit',
    "date"        TIMESTAMP(3) NOT NULL,
    "duration"    INTEGER NOT NULL DEFAULT 60,
    "status"      TEXT NOT NULL DEFAULT 'scheduled',
    "notes"       TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appointments_tenant_id_idx"      ON "appointments"("tenant_id");
CREATE INDEX "appointments_tenant_id_date_idx" ON "appointments"("tenant_id", "date");

-- Tasks
CREATE TABLE "tasks" (
    "id"          TEXT NOT NULL,
    "tenant_id"   TEXT NOT NULL,
    "assigned_to" TEXT,
    "created_by"  TEXT,
    "lead_id"     TEXT,
    "property_id" TEXT,
    "deal_id"     TEXT,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "due_date"    TIMESTAMP(3),
    "priority"    TEXT NOT NULL DEFAULT 'medium',
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tasks_tenant_id_idx" ON "tasks"("tenant_id");

-- Automations
CREATE TABLE "automations" (
    "id"             TEXT NOT NULL,
    "tenant_id"      TEXT NOT NULL,
    "created_by"     TEXT,
    "name"           TEXT NOT NULL,
    "trigger_type"   TEXT NOT NULL,
    "trigger_config" JSONB NOT NULL DEFAULT '{}',
    "action_type"    TEXT NOT NULL,
    "action_config"  JSONB NOT NULL DEFAULT '{}',
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "run_count"      INTEGER NOT NULL DEFAULT 0,
    "last_run"       TIMESTAMP(3),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "automations_tenant_id_idx" ON "automations"("tenant_id");

-- Automation Logs
CREATE TABLE "automation_logs" (
    "id"             TEXT NOT NULL,
    "tenant_id"      TEXT NOT NULL,
    "automation_id"  TEXT NOT NULL,
    "status"         TEXT NOT NULL,
    "message"        TEXT NOT NULL,
    "ran_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "automation_logs_tenant_id_idx"     ON "automation_logs"("tenant_id");
CREATE INDEX "automation_logs_automation_id_idx" ON "automation_logs"("automation_id");

-- Integrations
CREATE TABLE "integrations" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "type"       TEXT NOT NULL,
    "config"     JSONB NOT NULL DEFAULT '{}',
    "active"     BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "integrations_tenant_id_idx" ON "integrations"("tenant_id");

-- Activities
CREATE TABLE "activities" (
    "id"          TEXT NOT NULL,
    "tenant_id"   TEXT NOT NULL,
    "user_id"     TEXT,
    "lead_id"     TEXT,
    "property_id" TEXT,
    "deal_id"     TEXT,
    "type"        TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "activities_tenant_id_idx"            ON "activities"("tenant_id");
CREATE INDEX "activities_tenant_id_created_at_idx" ON "activities"("tenant_id", "created_at");

-- Notifications
CREATE TABLE "notifications" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "lead_id"    TEXT,
    "type"       TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "message"    TEXT NOT NULL,
    "link"       TEXT,
    "read"       BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_tenant_id_user_id_idx" ON "notifications"("tenant_id", "user_id");

-- ── Foreign Keys ─────────────────────────────────────────────
ALTER TABLE "users"         ADD CONSTRAINT "users_tenant_id_fkey"       FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "properties"    ADD CONSTRAINT "properties_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "properties"    ADD CONSTRAINT "properties_agent_id_fkey"    FOREIGN KEY ("agent_id")    REFERENCES "users"("id")           ON DELETE SET NULL;
ALTER TABLE "leads"         ADD CONSTRAINT "leads_tenant_id_fkey"        FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "leads"         ADD CONSTRAINT "leads_agent_id_fkey"         FOREIGN KEY ("agent_id")    REFERENCES "users"("id")           ON DELETE SET NULL;
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")     ON DELETE CASCADE;
ALTER TABLE "deals"         ADD CONSTRAINT "deals_tenant_id_fkey"        FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "deals"         ADD CONSTRAINT "deals_agent_id_fkey"         FOREIGN KEY ("agent_id")    REFERENCES "users"("id")           ON DELETE SET NULL;
ALTER TABLE "deals"         ADD CONSTRAINT "deals_lead_id_fkey"          FOREIGN KEY ("lead_id")     REFERENCES "leads"("id")           ON DELETE SET NULL;
ALTER TABLE "deals"         ADD CONSTRAINT "deals_property_id_fkey"      FOREIGN KEY ("property_id") REFERENCES "properties"("id")     ON DELETE SET NULL;
ALTER TABLE "deals"         ADD CONSTRAINT "deals_stage_id_fkey"         FOREIGN KEY ("stage_id")    REFERENCES "pipeline_stages"("id") ON DELETE SET NULL;
ALTER TABLE "appointments"  ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "appointments"  ADD CONSTRAINT "appointments_agent_id_fkey"  FOREIGN KEY ("agent_id")    REFERENCES "users"("id")           ON DELETE SET NULL;
ALTER TABLE "appointments"  ADD CONSTRAINT "appointments_lead_id_fkey"   FOREIGN KEY ("lead_id")     REFERENCES "leads"("id")           ON DELETE SET NULL;
ALTER TABLE "appointments"  ADD CONSTRAINT "appointments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id")   ON DELETE SET NULL;
ALTER TABLE "tasks"         ADD CONSTRAINT "tasks_tenant_id_fkey"        FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "tasks"         ADD CONSTRAINT "tasks_assigned_to_fkey"      FOREIGN KEY ("assigned_to") REFERENCES "users"("id")           ON DELETE SET NULL;
ALTER TABLE "tasks"         ADD CONSTRAINT "tasks_created_by_fkey"       FOREIGN KEY ("created_by")  REFERENCES "users"("id")           ON DELETE SET NULL;
ALTER TABLE "tasks"         ADD CONSTRAINT "tasks_lead_id_fkey"          FOREIGN KEY ("lead_id")     REFERENCES "leads"("id")           ON DELETE SET NULL;
ALTER TABLE "tasks"         ADD CONSTRAINT "tasks_deal_id_fkey"          FOREIGN KEY ("deal_id")     REFERENCES "deals"("id")           ON DELETE SET NULL;
ALTER TABLE "automations"   ADD CONSTRAINT "automations_tenant_id_fkey"  FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "automations"   ADD CONSTRAINT "automations_created_by_fkey" FOREIGN KEY ("created_by")  REFERENCES "users"("id")           ON DELETE SET NULL;
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_tenant_id_fkey"     FOREIGN KEY ("tenant_id")    REFERENCES "tenants"("id")    ON DELETE CASCADE;
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE;
ALTER TABLE "integrations"  ADD CONSTRAINT "integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "activities"    ADD CONSTRAINT "activities_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "activities"    ADD CONSTRAINT "activities_user_id_fkey"     FOREIGN KEY ("user_id")     REFERENCES "users"("id")           ON DELETE SET NULL;
ALTER TABLE "activities"    ADD CONSTRAINT "activities_lead_id_fkey"     FOREIGN KEY ("lead_id")     REFERENCES "leads"("id")           ON DELETE SET NULL;
ALTER TABLE "activities"    ADD CONSTRAINT "activities_deal_id_fkey"     FOREIGN KEY ("deal_id")     REFERENCES "deals"("id")           ON DELETE SET NULL;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id")         ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"  FOREIGN KEY ("user_id")    REFERENCES "users"("id")            ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_lead_id_fkey"  FOREIGN KEY ("lead_id")    REFERENCES "leads"("id")            ON DELETE SET NULL;
