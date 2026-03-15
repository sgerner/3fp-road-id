# Group Social Media v1

This feature adds a first-pass social publishing dashboard for claimed groups on `/groups/[slug]`.

## Environment Variables

Add these server-side variables:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_OAUTH_REDIRECT_URI` (optional if `PUBLIC_URL_BASE` is set; defaults to `<PUBLIC_URL_BASE>/api/groups/social/callback`)
- `META_GRAPH_API_VERSION` (optional, default `v21.0`)
- `META_OAUTH_VERSION` (optional, default mirrors `META_GRAPH_API_VERSION`)
- `SOCIAL_TOKEN_ENCRYPTION_KEY` (required, 32-byte key; base64/hex/plain supported)

## Supabase Setup

1. Apply migrations:
   - `supabase/migrations/20260312010000_add_group_social_media_tables.sql`
   - `supabase/migrations/20260312011000_add_group_social_publish_cron.sql`
   - `supabase/migrations/20260312012000_enable_rls_for_group_social_tables.sql`
   - `supabase/migrations/20260312013000_create_group_social_media_bucket.sql`
   - `supabase/migrations/20260312014000_add_group_social_oauth_pending_connections.sql`
2. Ensure these extensions/schemas are already available (existing project setup):
   - `extensions.pgcrypto`
   - `extensions.pg_net`
   - `extensions.pg_cron`
   - `private.cron_secrets`
   - `private.app_settings`
3. Confirm cron is enabled and the job exists:
   - `group-social-publish-15m`
4. Confirm internal cron secret verification supports:
   - `social_publish`

## Meta Developer Console Setup

1. Create or use a Meta app with Facebook Login.
2. Add legal URLs in Meta App Details:
   - Privacy Policy URL: `https://<your-domain>/privacy`
   - Terms of Service URL: `https://<your-domain>/terms`
   - Data Deletion Instructions URL: `https://<your-domain>/data-deletion`
   - These are required for App Details and recommended for Login review readiness.
3. In Facebook Login settings, ensure your valid OAuth redirect URIs include:
   - `https://<your-domain>/api/groups/social/callback`
4. Request/enable scopes used in v1:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_manage_metadata`
   - `pages_read_user_content`
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_comments`
5. Verify connected Instagram accounts are professional accounts linked to a Facebook Page.

## Webhooks

Webhook ingestion is not required for v1. Comments are synced via manual `Sync comments` action.

TODO for v2:

- Add webhook subscriptions for comment/create/update events.
- Add signature verification and retry-safe webhook ingestion endpoint.

## Product Notes

- Scheduled publishing is aligned to 15-minute buckets.
- UI copy explicitly states this behavior.
- Instagram personal accounts are not supported.
- OAuth stores encrypted access tokens server-side only.
- If OAuth returns multiple manageable pages/accounts, users pick the exact asset in the group dashboard before final connect.
- Media publishing uses files uploaded to Supabase Storage bucket `group-social-media`.
- Disconnect is soft (`status='revoked'`) and preserves history.
- Token refresh is attempted automatically before expiry on publish/comment operations.
