# Private Hub

Private Hub is a private, installable personal dashboard for accounts, memberships, documents, travel, notes, and integration status. The interface evolves the supplied visual skeleton while keeping its calm white-and-pale-blue identity.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the dedicated Private Hub Supabase URL and publishable key.
4. Run `npm run dev`.

Without Supabase environment variables, the app opens in a safe preview mode containing only non-sensitive labels. No account identifiers or membership numbers are bundled in the source.


## Appearance and language

Private Hub includes a local, Supabase-independent personalisation layer in **Settings**:

- Light and Dark appearance modes. The Dark theme is a deliberately designed navy/charcoal companion to the original pale-blue interface rather than a simple colour inversion.
- English, Italian and Spanish interface languages.
- Both preferences are stored in the browser with `localStorage`, apply immediately, and persist on that device without requiring authentication or database changes.
- User-created note content, private identifiers, official bank/product names and bank-provided content are intentionally not machine-translated.

## Supabase

Apply the versioned migration in `supabase/migrations`. It creates isolated relational tables, owner-scoped RLS policies, a private Storage bucket, and a one-time owner claim flow. Populate private values directly in the dedicated Supabase project; never add them to source, fixtures, screenshots, logs, or Git history.

The app uses passwordless email authentication. The owner email is stored only in the private database registry. After the authorised account signs in, the app claims the provisioned records and RLS restricts all reads and writes to that user.

## PWA and privacy

The service worker caches only the static shell and same-origin static assets. Requests to Supabase Auth, REST, and Storage are explicitly excluded from caching. Documents are stored in the private `private-hub-documents` bucket and are never placed in `public/` or committed to Git.

## Read-only Open Banking

Enable Banking runs entirely through Supabase Edge Functions. The browser can start an authenticated consent flow, but application JWT signing, the private key, callback validation, session exchange and provider calls remain server-side. The callback URL is:

`https://gsnblmxskygftpupsmbv.supabase.co/functions/v1/enable-banking-callback`

The backend discovers the current Italian ASPSP name at connection time, requests only balances and transactions, matches returned accounts against the canonical private record, and asks for one-time selection when a match is ambiguous. Refreshes have a cooldown and retain the last successful data on failure. There are deliberately no payment endpoints.

Runtime secrets belong only in the dedicated Supabase project as `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_PRIVATE_KEY`. Never place their values in local env files, GitHub, frontend variables, logs or chat.

## Checks

- `npm run typecheck`
- `npm run build`
