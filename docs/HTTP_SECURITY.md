# HTTP security

HTML uses a fresh nonce for each response, dynamic rendering and no-store caching. Next.js receives the CSP on the request so its scripts inherit that nonce. Production scripts require the nonce; eval is only allowed in development. Styles permit inline CSS for React/Tailwind compatibility. Auth and Realtime connections are limited to the configured Supabase origin; loopback HTTP is allowed for disposable integration tests. Navigation to OAuth providers does not require broad connect-src permissions.

All application responses include nosniff, no-referrer, frame denial and restrictions on camera, microphone and geolocation. This does not change Bearer authentication, RLS or the OAuth state check. API requests are not covered by the HTML middleware.

## Nginx request limits

Install deploy/nginx/jetree-limits.conf once in the http context and include deploy/nginx/jetree-limit-server.conf only in the selected Jetree HTTPS server. Start with staging. Validate nginx configuration before reloading and retain the previous configuration for rollback.

Limits per source IP and hostname: general API 5 requests/second with burst 30; chat POST 12/minute with burst 3; OAuth start POST 10/minute with burst 5. Excess returns 429 JSON and Retry-After: 60. Health, Telegram worker, Telegram webhooks and OAuth callback are excluded. Static files and the dashboard do not consume these buckets. Source IP is nginx's remote address, never a client-supplied forwarding header. If deployed behind another proxy, configure trusted real-IP handling explicitly.

Limits are an edge control, not per-user quotas. Users sharing a NAT share a bucket; SSH tunnels bypass the public edge. Auth remains mandatory, and existing execution quotas continue to apply. Do not expose the worker or change other sites while installing these snippets.

Validate authenticated login and chat, OAuth consent/callback, Telegram delivery and 429 behavior in staging before applying to production. The isolated CI browser checks response-specific nonces and CSP violations; actual provider consent is a separate live check.
