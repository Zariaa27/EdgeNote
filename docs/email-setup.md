# Email Setup

EdgeNote sends verification, password-reset, email-change, document-invitation, and sign-in notification messages through Resend. Cloudflare Email Routing is used for inbound mail forwarding only; it is not an outbound transactional email service.

## Configure Cloudflare Email Routing

1. Add and activate the app's domain in the Cloudflare account that manages its DNS.
2. Open **Email** → **Email Routing**, enable routing, and add a destination address you can access. Complete Cloudflare's destination verification.
3. Add a custom route such as `accounts@your-domain.example` and forward it to that verified destination. Cloudflare will configure the inbound MX records it requires.
4. Send a test message to the custom address and confirm it reaches the destination inbox.

This creates the address used in `EMAIL_FROM`; it does not send EdgeNote's verification or notification messages.

## Configure outbound sending with Resend

1. Add the sending domain to Resend and complete its domain verification.
2. Publish the SPF/DKIM records Resend provides in Cloudflare DNS. Keep Cloudflare Email Routing's inbound MX records intact; don't replace or remove them when setting up outbound authentication.
3. Use the routed address as the sender, for example `EdgeNote <accounts@your-domain.example>`. Ensure the sender domain is verified in Resend before using it.
4. Create a Resend API key with only the sending permissions required by this app.

DNS records and verification requirements can change; use the exact values shown in the Cloudflare and Resend dashboards for your domains.

## Configure each runtime

For local Worker development, put the following in the ignored repository-root `.dev.vars` file:

```text
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=EdgeNote <accounts@your-domain.example>
APP_URL=http://localhost:8787
```

For staging, `EMAIL_FROM` and `APP_URL` are non-secret variables in `wrangler.staging.toml`; set `RESEND_API_KEY` as a Worker secret for the staging Worker. For production, set the secret and variables in the production Worker environment. `APP_URL` must be the exact public HTTPS origin used by that environment. Never commit API keys, and do not put them in a Wrangler config file or a `NEXT_PUBLIC_*` variable.

## Message behavior

- New accounts must confirm their email address before they can sign in. Verification links expire after 24 hours.
- Password reset and email-change links are single-use and expire. Verification and reset requests use generic responses to avoid disclosing whether an address has an account.
- A successful password sign-in sends a notification with the UTC sign-in time and a link to the password recovery page. Delivery is best-effort: a provider/configuration failure is logged but does not prevent sign-in.
- Invitations also use the configured sender. An invitation grant can be saved even if delivery fails; the API reports the mail failure.

Use a non-production Worker and test recipient when validating sender setup. Do not use real user addresses or production credentials for local experiments.
