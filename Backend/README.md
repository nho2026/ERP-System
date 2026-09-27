
## Claude replies for WhatsApp

The CRM can automatically answer incoming text messages using the Anthropic Messages API.

1. In `Backend/.env`, set `ANTHROPIC_API_KEY` to your Anthropic API key.
2. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_APP_SECRET` from your Meta app. Choose `WHATSAPP_VERIFY_TOKEN` yourself.
3. Configure Meta's webhook callback as `https://YOUR-API-HOST/api/crm/whatsapp/webhook`, use the same verify token, and subscribe to `messages`.
4. Set `WHATSAPP_AUTO_REPLY=true` and restart the backend. Set it to `false` and restart to disable replies.
5. Send a new text message to the connected WhatsApp business number and check the CRM inbox.

`ANTHROPIC_MODEL` defaults to `claude-sonnet-4-6`. Optionally set `WHATSAPP_AI_SYSTEM_PROMPT` with your business instructions, language preferences, and verified business information. The assistant has no ERP tools or access to other customer records. Up to 20 recent messages from the same conversation are sent to Anthropic. Attachments are not analyzed or automatically answered.

The worker saves pending work in existing message records and processes it every two seconds. Duplicate webhooks do not queue extra replies. Old messages and answers superseded by staff or newer customer messages are skipped. Claude failures and uncertain delivery failures are not automatically retried: inspect `ai_failed` messages and reply manually. If a process crashes after claiming a message, it can remain `ai_processing`; inspect it before manually replying. Pending work survives restarts. Run one worker instance to preserve conversation ordering; this is not a distributed queue. No schema migration is required.

The authenticated WhatsApp status endpoint reports `autoReplyEnabled` and `autoReplyConfigured`, without exposing keys. An Anthropic key alone is insufficient: Meta WhatsApp Cloud API credentials and a reachable HTTPS webhook are also required. No live API test is performed during setup.

API reference: https://platform.claude.com/docs/en/api/overview

### Claude returns HTTP 400 about a workspace

Set `ANTHROPIC_WORKSPACE_ID="wrkspc_..."` in the deployed backend's `.env` using the ID from Claude Console → Settings → Workspaces. The backend sends it in the `anthropic-workspace-id` header. Alternatively, use a key scoped to that workspace. Restart the backend and send a **new** WhatsApp text; already failed messages are not resent automatically.

A successful POST webhook returns HTTP 200 immediately after saving the message; the actual reply is sent separately through Meta. HTTPS alone does not establish successful webhook delivery. Check the server logs and the CRM inbox to distinguish webhook delivery from Claude generation failures.

## Lead inbox table rename

The WhatsApp conversation model maps to `crm_lead_convarasations` and the message model maps to `crm_leadinbox` (exact database names). For existing databases, stop the backend and back up the target database, then run `node scripts/rename-lead-inbox.js` from `Backend`, followed by `npm run db:generate`, and restart the backend. The rename preserves rows and foreign keys; the script can be rerun safely. Run it before `db:push` so Prisma does not replace the old table. Fresh databases use the new name automatically.
