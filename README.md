# LeadControl SaaS — Backend v3

**PostgreSQL + Prisma + Multi-tenant · Pronto para SaaS**

---

## Arquitectura

```
leadcontrol-saas/
├── prisma/
│   ├── schema.prisma          ← Modelo de dados (12 tabelas, multi-tenant)
│   └── migrations/
│       └── 001_init.sql       ← SQL gerado (executado pelo Prisma)
├── src/
│   ├── index.js               ← Express app + startup
│   ├── lib/
│   │   ├── prisma.js          ← Singleton Prisma Client
│   │   └── score.js           ← Lógica de scoring de leads
│   ├── middleware/
│   │   └── auth.js            ← JWT + injecção de tenantId
│   └── routes/
│       ├── authRoutes.js      ← login, logout, me, register (self-service)
│       ├── propertyRoutes.js  ← CRUD imóveis
│       ├── leadRoutes.js      ← CRUD leads + scoring
│       ├── dealRoutes.js      ← Pipeline Kanban
│       ├── appointmentRoutes.js
│       ├── taskRoutes.js
│       ├── dashboardRoutes.js ← KPIs, gráficos, notificações
│       ├── userRoutes.js      ← Membros do tenant
│       └── automationRoutes.js ← Automações + integrações + mapa
├── scripts/
│   ├── seed.js                ← Dados demo Portugal (8 imóveis, 7 leads)
│   ├── migrate-from-sqlite.js ← Migração one-shot do SQLite anterior
│   └── init.sql               ← Extensões PostgreSQL (run once)
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## Como o Multi-tenant funciona

```
Tenant (Imobiliária Silva Lda)
  └── Users (Rafael, Juliana, Bruno)
  └── Properties (Penthouse Alfama, T3 Chiado...)
  └── Leads (Carlos Mendes, Ana Lima...)
  └── Deals, Tasks, Appointments...

Tenant (Imobiliária Cardoso)
  └── Users (diferentes)
  └── Properties (diferentes, isoladas)
  └── Leads (completamente separados)
```

**Isolamento**: `tenant_id` está em **todas** as tabelas. Cada query no Prisma inclui
`where: { tenantId: req.tenantId }` — os dados de um tenant são invisíveis para outro.

O `tenantId` vem do JWT: quando o utilizador faz login, o token inclui `tenantId`.
O middleware `verifyToken` injeta `req.tenantId` em todos os handlers protegidos.

---

## Passo 1 — Setup (Fase Actual)

### Pré-requisitos
- Node.js 18+
- Docker Desktop

### 1. Configurar variáveis de ambiente
```bash
cd leadcontrol-saas
cp .env.example .env
# Edite .env se necessário (os valores padrão funcionam com o Docker Compose)
```

### 2. Subir o PostgreSQL
```bash
docker compose up -d
# Aguarda ~5s para o Postgres inicializar

# Verificar:
docker compose ps
# → leadcontrol_postgres   running   0.0.0.0:5432->5432/tcp
```

### 3. Instalar dependências e criar as tabelas
```bash
npm install

# Opção A (recomendado para dev): push directo sem migration
npm run db:push

# Opção B (produção / CI): executar migrations versionadas
npm run db:migrate
```

### 4. Gerar dados demo
```bash
npm run db:seed
# → Cria tenant + 3 utilizadores + 8 imóveis + 7 leads + pipeline completo
```

### 5. Arrancar o servidor
```bash
npm run dev       # desenvolvimento (nodemon)
npm start         # produção
```

### 6. Testar
```bash
# Health check
curl http://localhost:3000/api/health

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@leadcontrol.pt","password":"admin123"}'

# Guardar token e testar leads
TOKEN="eyJ..."
curl http://localhost:3000/api/leads \
  -H "Authorization: Bearer $TOKEN"
```

### Ligar o frontend actual (/public)
O servidor Express serve automaticamente a pasta `/public` se ela existir.

**Opção A** — Copiar o frontend para junto do backend:
```bash
cp -r ../leadcontrol-beta/public ./public
npm start
# Abre http://localhost:3000 → login → CRM funcional com Postgres
```

**Opção B** — Manter `/public` separado e apontar para o novo servidor:
No `app.js` do frontend, altere a base URL da API:
```js
// Antes (apontava para porta 3000 SQLite)
// Agora aponta para o novo servidor na mesma porta 3000
const API_BASE = 'http://localhost:3000';
```

### Migrar dados do SQLite (opcional)
```bash
node scripts/migrate-from-sqlite.js \
  --sqlite ../leadcontrol-beta/database/leadcontrol.db \
  --tenant-name "Minha Imobiliária"
```

---

## Rotas API (equivalente 100% ao SQLite anterior)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/auth/me` | Utilizador actual |
| POST | `/api/auth/register` | **NOVO** — Criar tenant+admin (self-service SaaS) |
| GET  | `/api/properties` | Listar imóveis (com filtros) |
| POST | `/api/properties` | Criar imóvel |
| PUT  | `/api/properties/:id` | Editar imóvel |
| DELETE | `/api/properties/:id` | Remover imóvel |
| GET  | `/api/leads` | Listar leads |
| POST | `/api/leads` | Criar lead |
| PUT  | `/api/leads/:id` | Editar lead |
| DELETE | `/api/leads/:id` | Remover lead |
| POST | `/api/leads/:id/contact` | Registar contacto |
| GET  | `/api/deals` | Kanban pipeline |
| POST | `/api/deals` | Criar negócio |
| PATCH | `/api/deals/:id/stage` | Mover no pipeline |
| GET  | `/api/dashboard/stats` | KPIs dashboard |
| GET  | `/api/dashboard/notifications` | Notificações |
| PATCH | `/api/dashboard/notifications/read` | Marcar como lidas |
| GET  | `/api/automations` | Listar automações + logs |
| POST | `/api/automations` | Criar automação |
| PATCH | `/api/automations/:id/toggle` | Activar/desactivar |
| POST | `/api/automations/:id/run` | Executar manualmente |
| DELETE | `/api/automations/:id` | Eliminar |
| GET  | `/api/automations/integrations` | Listar integrações |
| PATCH | `/api/automations/integrations/:id/toggle` | Toggle integração |
| GET  | `/api/automations/map-properties` | Imóveis para mapa |
| GET  | `/api/appointments` | Agenda |
| POST | `/api/appointments` | Criar agendamento |
| GET  | `/api/tasks` | Tarefas |
| POST | `/api/tasks` | Criar tarefa |
| GET  | `/api/users` | Membros do tenant |
| POST | `/api/users` | Adicionar membro (admin) |

---

## Comandos úteis

```bash
# Visualizar banco no browser
npm run db:studio          # abre http://localhost:5555

# Apagar tudo e re-seed (dev)
npm run db:reset

# Subir PgAdmin (UI visual para o Postgres)
docker compose --profile tools up -d
# abre http://localhost:5050
# email: admin@leadcontrol.pt / pass: admin123

# Ver logs do Postgres
docker compose logs -f postgres

# Conectar ao Postgres directamente
docker exec -it leadcontrol_postgres psql -U leadcontrol -d leadcontrol

# Criar nova migração após mudar o schema
npx prisma migrate dev --name nome_da_mudanca
```

---

## Passo 2 — Migração para Next.js

> Esta secção é o **roadmap para quando quiseres substituir o frontend `/public` por Next.js.**
> O backend Express não precisa de mudar nada.

### Porquê Next.js?

| Feature | Agora (Vanilla JS + Express) | Depois (Next.js + Express) |
|---------|------------------------------|---------------------------|
| Routing | Manual (app.js switch) | File-based automático |
| SEO | Zero | SSR/SSG nativo |
| Performance | Bundle manual | Automatic code splitting |
| TypeScript | Opcional | First-class |
| Deploy | 1 processo | Vercel/Netlify free tier |
| Auth | Cookie/JWT manual | NextAuth.js |
| API | Express separado | API Routes integradas (opcional) |

### Opção A — Next.js como frontend, Express mantém-se como API

Esta é a **opção recomendada** — menor risco, maior flexibilidade.

```
[Browser]
   ↓
[Next.js :3001]  ←→  [Express API :3000]
   - Pages (SSR/SSG)       - /api/leads
   - Components            - /api/properties
   - Tailwind CSS          - /api/auth
                           - PostgreSQL
```

**Setup:**
```bash
# 1. Criar app Next.js FORA do backend
npx create-next-app@latest leadcontrol-web \
  --typescript --tailwind --app --src-dir

cd leadcontrol-web

# 2. Instalar dependências SaaS
npm install next-auth @tanstack/react-query axios
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu
npm install leaflet react-leaflet  # mapa

# 3. Configurar variável de ambiente
echo 'NEXT_PUBLIC_API_URL=http://localhost:3000' >> .env.local
echo 'NEXTAUTH_SECRET=chave_secreta_aqui'        >> .env.local
echo 'NEXTAUTH_URL=http://localhost:3001'         >> .env.local
```

**Estrutura de páginas (App Router):**
```
leadcontrol-web/src/
├── app/
│   ├── layout.tsx              ← Root layout (sidebar, navbar)
│   ├── page.tsx                ← / → redireciona para /dashboard
│   ├── (auth)/
│   │   └── login/page.tsx      ← Página de login
│   └── (app)/                  ← Layout com sidebar (requer auth)
│       ├── layout.tsx
│       ├── dashboard/page.tsx
│       ├── imoveis/page.tsx
│       ├── leads/page.tsx
│       ├── pipeline/page.tsx
│       ├── agenda/page.tsx
│       ├── mapa/page.tsx
│       └── automacoes/page.tsx
├── components/
│   ├── ui/                     ← shadcn/ui components
│   ├── leads/LeadTable.tsx
│   ├── properties/PropertyCard.tsx
│   ├── pipeline/KanbanBoard.tsx
│   └── map/PropertyMap.tsx
├── lib/
│   ├── api.ts                  ← Axios client com interceptors
│   └── auth.ts                 ← NextAuth config
└── hooks/
    ├── useLeads.ts             ← React Query hooks
    └── useProperties.ts
```

**Exemplo de page com dados do Express:**
```tsx
// app/(app)/leads/page.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function LeadsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get('/api/leads').then(r => r.data),
  });

  if (isLoading) return <div>A carregar...</div>;

  return (
    <div>
      {data?.leads.map(lead => (
        <div key={lead.id}>{lead.name}</div>
      ))}
    </div>
  );
}
```

**Autenticação com NextAuth:**
```ts
// lib/auth.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
          method: 'POST',
          body: JSON.stringify(credentials),
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (res.ok && data.token) {
          return { ...data.user, token: data.token, tenantId: data.user.tenantId };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) { token.accessToken = user.token; token.tenantId = user.tenantId; }
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.tenantId = token.tenantId;
      return session;
    },
  },
});
```

### Opção B — Next.js full-stack (API Routes substituem Express)

Só recomendada se quiseres simplificar para **um único processo** e usar o Prisma
directamente nas API Routes do Next.js.

```
[Browser]
   ↓
[Next.js :3000]
   ├── /app/dashboard       ← Pages
   ├── /app/api/leads       ← API Routes (substituem Express)
   └── Prisma → PostgreSQL
```

**Vantagens:** Um único processo, deploy simplificado na Vercel.
**Desvantagens:** Prisma em serverless precisa de connection pooling (PgBouncer/Prisma Accelerate).

**Quando escolher:** Se prevês deploy na Vercel e <500 req/min.

### Plano de migração faseado

```
Semana 1 — Paralelismo
  ✓ Backend Express a correr em :3000 (este projecto)
  ✓ Criar Next.js em :3001
  ✓ Implementar autenticação (NextAuth → Express /api/auth)
  ✓ Primeira página: Dashboard

Semana 2 — Páginas principais
  ✓ Imóveis com filtros e cards
  ✓ Leads com tabela e scoring
  ✓ Pipeline Kanban (react-beautiful-dnd ou @dnd-kit)

Semana 3 — Funcionalidades avançadas
  ✓ Mapa com Leaflet/react-leaflet
  ✓ Automações
  ✓ Agenda

Semana 4 — Corte
  ✓ Testes
  ✓ Desactivar /public no Express
  ✓ Next.js em produção (Vercel ou VPS)
  ✓ Express API em produção (Railway / Render / VPS)
```

---

## Próximos passos SaaS (Passo 3+)

```
Billing (Stripe)
  └── Planos: FREE (1 user) / STARTER (3) / GROWTH (10) / ENTERPRISE (∞)
  └── Webhook: stripe → actualizar tenant.plan
  └── Middleware: verificar plan limits antes de criar recursos

Subdomínios multi-tenant
  └── silva.leadcontrol.pt → tenantSlug = "silva"
  └── Middleware Next.js: extrair slug do host → injectar no contexto
  └── DNS: wildcard CNAME *.leadcontrol.pt → Vercel

Onboarding self-service
  └── POST /api/auth/register (já implementado)
  └── Formulário: nome empresa → slug → email admin → senha
  └── Auto-seed: pipeline stages + integrações padrão

Row-Level Security (RLS) no PostgreSQL
  └── Alternativa ao isolamento via aplicação
  └── Mais seguro: banco rejeita queries sem tenant_id
  └── Útil quando expores GraphQL ou queries directas
```

---

## Stack completa

| Camada | Tecnologia |
|--------|-----------|
| Base de dados | PostgreSQL 16 |
| ORM | Prisma 5 |
| Backend | Express 4 |
| Autenticação | JWT (bcryptjs) |
| Frontend actual | Vanilla JS + Leaflet.js |
| Frontend futuro | Next.js 14 (App Router) |
| Containerização | Docker Compose |
| Deploy futuro | Vercel (Next) + Railway/Render (Express) |

---

*LeadControl SaaS v3 — Multi-tenant · Portugal Real Estate CRM*
