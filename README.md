# DevScope

DevScope is a GitHub developer analytics and repository intelligence SaaS foundation.

## Architecture

- `apps/web`: Next.js App Router frontend
- `apps/api`: NestJS API, validation, auth-ready modules, and Prisma access
- `apps/api/prisma`: PostgreSQL data model

GitHub App installation, repository analytics, webhook intelligence, and workspace subscriptions are implemented.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 15 or newer

## Setup

1. Copy `.env.example` to `.env` and set your PostgreSQL credentials.
2. Start PostgreSQL: `npm run db:up`
3. Install dependencies: `npm install`
4. Generate Prisma: `npm run prisma:generate`
5. Apply migrations: `npm run prisma:migrate`
6. Start both applications: `npm run dev`

- Web: `http://localhost:3000`
- API: `http://localhost:3001/api/v1`

## GitHub App setup

Create separate development and production GitHub Apps. Configure:

- Setup URL: `http://localhost:3001/api/v1/github/install/callback` in development
- Webhook URL: `http://localhost:3001/api/v1/github/webhooks`
- Repository permissions: Metadata `Read-only`, Issues `Read-only`, Pull requests `Read-only`
- Subscribe to `Installation` and `Installation repositories` webhooks
- Request no write permissions

Set the server-only values from `.env.example`:

- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_INSTALL_URL`
- `GITHUB_APP_SETUP_URL`
- `GITHUB_APP_WEB_CALLBACK_URL`
- `GITHUB_APP_WEBHOOK_SECRET`

The frontend does not receive these values. API routes require a DevScope bearer session plus the
`X-DevScope-Workspace-ID` header. The session and workspace must belong to the same membership.

## Real authentication setup

Demo authentication is development-only. Production must set `NODE_ENV=production` and
`NEXT_PUBLIC_AUTH_MODE=supabase`.

In Supabase, create a project and enable:

- Email/password authentication
- Google provider
- GitHub provider

Add these Supabase redirect URLs:

- `https://<cloudflare-domain>/auth/callback`
- `http://localhost:3000/auth/callback`

Frontend Cloudflare Pages variables:

- `NEXT_PUBLIC_API_URL=https://<api-domain>/api/v1`
- `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>`
- `NEXT_PUBLIC_AUTH_MODE=supabase`

Backend variables:

- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_ANON_KEY=<publishable-key>`
- `SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>`
- `CORS_ORIGIN=https://<cloudflare-domain>,http://localhost:3000`
- `DATABASE_URL=<supabase transaction/session pooler URL>`
- `DIRECT_URL=<supabase direct PostgreSQL URL>`

Never expose `SUPABASE_SERVICE_ROLE_KEY`, GitHub private keys, Stripe secrets or AI API keys through
`NEXT_PUBLIC_*` variables.

## Cloudflare Pages deployment

Cloudflare Pages build settings:

- Build command: `npm run build:cloudflare`
- Build output directory: `apps/web/out`
- Node version: 22 or newer

The frontend is statically exported. API requests go to the separately deployed NestJS backend.
Configure Cloudflare Pages custom domains and CORS origins before enabling OAuth.

## Backend deployment

Build the NestJS container with:

```powershell
docker build -f Dockerfile.api -t devscope-api .
docker run --env-file .env -p 3001:3001 devscope-api
```

Deploy the image to Oracle Cloud or another container host behind HTTPS. Use a managed Supabase
PostgreSQL pooler for `DATABASE_URL` and a direct connection for migrations/DIRECT_URL.

Apply migrations from a trusted CI environment:

```powershell
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

### Obtain GitHub App values

1. Open GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
2. Set the callback/setup URL to `http://localhost:3001/api/v1/github/install/callback`.
3. Set the webhook URL to `http://localhost:3001/api/v1/github/webhooks`.
4. Generate a random webhook secret and enter the same value in `GITHUB_APP_WEBHOOK_SECRET`.
5. Copy the app numeric ID into `GITHUB_APP_ID`.
6. Copy the Client ID into `GITHUB_APP_CLIENT_ID`.
7. Generate a client secret and copy it immediately into `GITHUB_APP_CLIENT_SECRET`.
8. Generate and download a private key; set `GITHUB_APP_PRIVATE_KEY` to the PEM contents.
9. Set `GITHUB_APP_INSTALL_URL` to `https://github.com/apps/<your-app-slug>/installations/new`.
10. Use separate GitHub Apps and secrets for development and production.

In `.env`, escaped `\\n` private-key line breaks are supported and converted by the server. Do not add
these values to `NEXT_PUBLIC_*` variables or to committed files.

## Billing setup

Create server-side Stripe Price IDs for the Pro and Team plans. Configure the environment variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_TEAM_PRICE_ID`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_PORTAL_RETURN_URL`

Configure a Stripe webhook endpoint for:

```text
https://your-api-domain/api/v1/billing/webhooks
```

Subscribe to subscription lifecycle, invoice payment, and checkout completion events. Payment activation
is only recorded after a verified provider webhook. The frontend never supplies or confirms subscription
status.
