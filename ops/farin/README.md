# Farin deployment

This deployment uses the Node adapter and runs as the unprivileged `node` user in a Docker container. The app has no published host port; the existing Caddy container reaches it over `supabase_default`. Its resource limit is one CPU and 1 GiB of memory. App data continues to use the hosted Supabase project.

## Environment files

On Farin, keep the runtime variables at `/etc/3fp/production.env` and the build-time static variables at `/etc/3fp/build.env`. Both files should be owned by `root:root`, mode `0600`, and excluded from the source tree. The build file is mounted as a BuildKit secret and is not copied into an image layer. The runtime file must contain only production values, not Vercel's build-only `VERCEL_*` system variables.

The build file needs the static SvelteKit values: `PUBLIC_GOOGLE_MAPS_API_KEY`, `PUBLIC_STRIPE_PUBLISHABLE_KEY`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_URL`, `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_URL_BASE`, `TURNSTILE_ENABLED`, and `TURNSTILE_SECRET_KEY`. Runtime secrets belong only in `production.env`.

## Provider integrations

The runtime file includes the existing `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` and `VERCEL_API_TOKEN`; both integrations were verified on Farin. Rotate both after this validation and replace the values in `/etc/3fp/production.env` (and in Vercel while it remains live). Keep the file at `0600` and recreate the container after replacing values.

Mercury sync connects directly from Farin to `https://api.mercury.com`, using the encrypted API key saved separately for each tenant. No Mercury relay environment variables or shared Mercury token are required. If Mercury IP restrictions are enabled, allow Farin's fixed public egress IP.

`VERCEL_API_TOKEN` continues to support the existing custom-domain registration and renewal integration. A full migration of that workflow needs a replacement domain provider and routing flow.

## Build and run

From the repository root on Farin, build and start the service with:

```sh
docker compose -f ops/farin/compose.yaml up -d --build
```

Check readiness with:

```sh
docker compose -f ops/farin/compose.yaml ps
docker compose -f ops/farin/compose.yaml logs --tail=100 web
```

The Caddy route is in `Caddyfile.fragment`. Add that block to the existing `/root/wazi2/ops/Caddyfile` and reload Caddy after confirming the `3fp-web` container is healthy. Caddy obtains and renews a public certificate with the Cloudflare DNS-01 challenge, so the records can stay proxied.

Farin's host Caddyfile trusts Cloudflare's published IPv4 and IPv6 proxy ranges, with strict `X-Forwarded-For` parsing, so proxied requests retain the visitor IP. Refresh those static ranges if Cloudflare changes its published list. The `3fp.org` and `www.3fp.org` Caddy site uses `tls { dns cloudflare {env.CLOUDFLARE_3FP_API_TOKEN} }`. Set `CLOUDFLARE_3FP_API_TOKEN` in `/root/wazi2/ops/.env` using a token scoped only to the `3fp.org` zone with `Zone:Zone:Read` and `Zone:DNS:Edit`; the existing Farin token remains separate for its other zones. Caddy renews the certificate automatically using DNS-01 while Cloudflare proxying stays enabled. Cloudflare's SSL/TLS mode for this zone is set to **Full (strict)**, which validates Caddy's origin certificate.

Cloudflare's free-plan settings use Always Use HTTPS, HTTP/2 to visitors and the origin, HTTP/3, TLS 1.3, and Early Hints. Early Hints is ready for preload/preconnect `Link` headers; current responses do not emit those hints yet. The `Cache immutable image proxy responses` Cache Rule applies only to `GET /api/media/image` on `3fp.org` and `www.3fp.org`, marks responses eligible, and respects the endpoint's one-year immutable cache headers. Keep application HTML and authenticated API responses dynamic; they return `private, no-store`. SvelteKit's content-hashed assets and static report files are already cached at Cloudflare; report PDFs and images honor their four-hour origin TTL. Smart Tiered Cache and the image optimization add-ons require a paid feature on this account and remain off.

Do not change public DNS until the Farin app and Caddy route have both been checked. The database remains the hosted Supabase project; this deployment must not point the app at the Supabase containers on Farin.

## Scheduled work

The app has no `vercel.json` cron configuration. Existing scheduled API calls are defined by migrations in the hosted Supabase project's `pg_cron`; they continue to call the existing `https://3fp.org` origin after a DNS cutover. Keep `CRON_SECRET` in the runtime environment and verify the hosted schedules before cutover.

## Automatic deployment

The GitHub Actions CI workflow deploys `main` after all checks pass and deploys published stable releases after the same checks pass. Farin accepts a dedicated SSH key that is restricted to a root-owned deployment script; the script fetches only `main` or the release tag, builds the Node image, waits for the container health check and `/api/health`, and restores the previous image if health verification fails. Store the matching private key only as the repository Actions secret `FARIN_DEPLOY_KEY`.
