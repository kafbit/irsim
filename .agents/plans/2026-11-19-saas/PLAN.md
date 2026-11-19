# irsim Cloud: open source local, hosted SaaS

## Goal
irsim stays a free, open source, local tool. irsim Cloud adds hosted workspaces with collaborative editing, access control, in-app AI chat and AI board edits, sold in USD worldwide through subscriptions per workspace.

## Plans

| Plan | Price (starting value, validated in phase 0) | Users | Workspaces | Storage | AI |
|---|---|---|---|---|---|
| Local | free, AGPL | the local user | any | local disk | the user's own agent harness (Claude Code, Codex, Pi, OpenCode, Command Code) |
| Cloud Free (proposed) | $0 | at most 3 editors | 1 per owner account | 500 MB per workspace | BYOK only: in-app chat and cloud AI edits run on the user's own API key |
| Cloud | $5 per user per month (launch plan) | seats | any | 10 GB per seat, pooled per workspace | BYOK only; local-first: build locally, sync online, edit together |
| Cloud AI (after launch) | to be set from BYOK usage, starting near $20 per seat per month | seats | any | 25 GB per seat, pooled per workspace | monthly AI credits per seat from Kafbit, renewed every billing cycle, no rollover; credit packs on top; BYOK still allowed |

- Launch with Local (free) and Cloud at $5 BYOK only; Cloud AI follows once BYOK usage shows the demand and the cost per user. Marketing plan: https://github.com/kafbit/irsim/issues/27
- Yearly billing at 10 months' price.
- The subscription belongs to the workspace. Seats are workspace members with the role editor or above. Viewers and commenters are free and unlimited.
- Version history kept 7 days on Free, 90 days on paid plans.
- Cloud Free (proposed): a small team (at most 3 editors) gets the full collaborative workspace with BYOK, so the paid value is visible before paying. The limits that lead to Cloud: a 4th editor, more than 500 MB, more than one workspace, version history beyond 7 days. Decide before the Cloud MVP whether it ships at launch or after the first paying teams.
- Free plan cost: no AI cost (BYOK); storage of 500 MB on R2 is cents per month; the variable cost is the realtime sync server and thumbnail rendering, so free workspaces with no activity for 90 days are archived to R2 and restored on the next open.
- Abuse limit: one free workspace per owner account, and an owner account needs a verified email; creating more accounts to split a team is allowed by the limits but costs the team its shared history and roles.

## Architecture

```
apps/canvas          Next.js app (today's app/), local mode and cloud mode
packages/core        board model, canvas.json schema, closure hash, BoardStore interface, merge engine
packages/runtime     board runtime (today's app/public/runtime)
packages/cli         irsim CLI, bridge, doctor (today's bin/)
packages/connectors  harness connectors and skill (today's plugin/)
ee/cloud             auth, workspaces, access control, billing, AI service, collaboration server (commercial license)
```

- Bun workspaces. The local build never imports `ee/`.
- `BoardStore` has two implementations: `FsBoardStore` (today's `design/` folder) and `CloudBoardStore` (Neon for metadata, Cloudflare R2 for board files, assets, thumbnails and versions).
- Hosting: one container service (Fly.io) for the Next.js app, the collaboration server and the Chromium thumbnail worker; Neon Postgres (Drizzle ORM); R2 for blobs (no egress fees).
- Boards are user HTML and JavaScript. Cloud serves board frames from a separate origin (`*.irsim-usercontent.com`) in sandboxed iframes, so a board script cannot read the app session.
- Agents reach a cloud workspace through `irsim bridge --cloud` with a personal access token, and through an MCP endpoint over HTTPS. The connectors do not change.

## Data model (Neon)
- Better Auth tables: `user`, `session`, `account`, `organization` (= workspace), `member`, `invitation`.
- `page`, `board`, `section`: today's `canvas.json` as rows.
- `board_version`: board id, content hash, R2 key, parent version, author, source (`human`, `agent`, `ai`, `sync`), created at.
- `board_doc`: the Yjs state per board and per page layout.
- `share`: resource type (workspace, page, board), resource id, principal (user, email, link, public), role, expiry, optional password hash.
- `thread`, `comment`: today's comments store as rows.
- `ai_usage`: workspace, user, model, input and output tokens, credits, key source (`kafbit` or `byok`).
- `credit_ledger`: grants (cycle renewal, packs) and debits; the local source for enforcement, mirrored to Polar.
- `byok_key`: provider, encrypted key (envelope encryption, the data key in the host secret store), last four characters.
- `storage_usage`: bytes per workspace, updated on every blob write and delete.

## Access control
- Workspace roles: owner, admin, editor, commenter, viewer.
- Visibility per page and per board:
  - `workspace` (default): every member, at their workspace role.
  - `private`: the creator and explicit grants only, admins included only by grant.
  - `shared`: explicit grants to users or email addresses, each with a role.
  - `link`: anyone with the link, as viewer or commenter, with optional expiry and password.
  - `public`: listed and indexable, served read-only, also as a static export URL.
- A board inherits its page visibility unless it sets its own. Explicit grants add access; `private` removes inherited workspace access.
- One policy module, `can(actor, action, resource)`, used by every API route, the MCP endpoint and the collaboration server on connect and on every update. A table-driven test covers every role, visibility and action pair.
- Authorization lives in the app layer. Postgres row-level security is not used in the first version, because Neon's pooled connections need the session variable on every transaction.

## Collaborative editing
- Yjs documents: one per board (`Y.Text` holding the board source) and one per page (`Y.Map` holding positions, sizes and sections from `canvas.json`).
- Server: Hocuspocus (MIT), self-hosted, with `onStoreDocument` writing the Yjs state to `board_doc` (debounced) and a snapshot to R2 as a `board_version` after 30 s idle or after every agent change.
- Presence through Yjs awareness: cursors and selections on the canvas, avatars in the top bar, who is viewing a board.
- Comments and threads update live over the same connection.

## Conflict resolution and merging
1. Two people editing: Yjs merges the operations; there is no conflict state.
2. Agent and AI edits write a whole file from a base version. The server computes the diff from that base to the agent's file and applies it as `Y.Text` operations on the current document. When a changed hunk overlaps a region edited since the base (a diff3 conflict), the change is not applied: it becomes a variant of the board, shown in the existing compare view with the conflicting hunks marked, and the user chooses or merges.
3. Local repository and cloud: `irsim cloud push`, `pull` and `sync` merge each board three-way, with the base being the last synced version hash in `.irsim/cloud.json`. A clean merge applies. A conflict becomes a variant on the canvas, never conflict markers inside the board HTML, because markers break the render. `canvas.json` merges per field, with the newer timestamp winning.
4. Every version is restorable from a history panel with a diff view.

## AI in the cloud
- In-app chat panel per workspace, scoped to the selected board or page.
- Cloud AI edits: the chat agent has tools to read a board, propose an edit (merged as in step 2 above), create a variant, and comment. It runs server-side on the Claude API tool-use loop.
- Default models are the current Claude models, chosen in workspace settings. BYOK supports an Anthropic key and an OpenRouter key.
- Credits: one credit is a fixed fraction of a US dollar of model cost; each request debits credits from token counts at the model's current list price plus a margin. The ledger is checked before each request and debited after it; the usage event goes to a Polar meter.
- BYOK requests debit no credits and are only rate limited.

## Payments
- Polar as merchant of record: it collects USD worldwide, handles VAT and sales tax, has seat-based subscriptions, meter credits that renew per cycle, and a Better Auth plugin that syncs organizations and seats.
- Products: Cloud (seat-based, $5, monthly and yearly; creator coupon codes for attribution), Cloud AI (seat-based with a meter credits benefit), Credit pack (one-time).
- Fallback: Paddle (merchant of record, Egypt payouts listed). Paddle has no meter credits, so the credit ledger stays in our database in both cases.
- Stripe is not an option: it does not onboard companies registered in Egypt.

## Phases
0. Validate: Polar seller onboarding for an Egyptian company (payout account), pricing interviews, AI cost model per credit, trademark check for "irsim".
1. Monorepo and `BoardStore`, with no change to the local app.
2. Cloud MVP: auth, workspaces, single-editor saving, R2 and Neon storage, `irsim cloud push/pull`, link and public sharing, Cloud Free with BYOK chat and AI edits, storage limits, sandboxed board origin.
3. Billing: Polar products, seats, credits, packs, metering, enforcement, customer portal, plan limits.
4. Collaboration: Hocuspocus, presence, full roles and visibility, live comments, version history.
5. Merge engine: agent edits rebased onto live documents, conflicts as variants, three-way local and cloud sync.
6. Launch: pricing section and irsim page on the landing site, docs, terms and privacy for the cloud, status page, support inbox.

## Decisions
- AGPL core with a commercial `ee/` folder: self-hosting stays free, a closed competing SaaS is not allowed.
- Per-workspace subscription with seats: collaboration is the paid value, viewers and commenters stay free so sharing grows the product.
- Free cloud requires BYOK and caps a workspace at 3 editors: no AI cost for free accounts, and a team that grows pays.
- Yjs and Hocuspocus over Liveblocks: self-hosted, Postgres persistence, no per-connection vendor cost.
- Agent edits merge through the existing variant and compare view: one conflict UI for people, agents and sync.
- Polar first: Egypt payouts listed, credits and seats built in, Better Auth plugin.

## Risks
- Egypt payout support comes from one third-party check (6 October 2026). Phase 0 confirms it with Polar onboarding before any billing code.
- Polar usage billing was labeled alpha in one docs version.
- Board files are free-form HTML, so text CRDT merges can produce invalid markup. Every merged result renders through the existing check before it becomes the current version; a failed render becomes a variant instead.
- Cost of Chromium thumbnails at scale; thumbnails render on change only, cached in R2.
- This plan becomes public with the repository.

## Sources
- Merchant of record payout countries: https://agentaos.ai/answers/which-merchant-of-record-pays-out-to-my-country
- MoR fees and payouts: https://www.paritydeals.com/blog/best-merchant-of-record-for-saas/
- Polar credits: https://polar.sh/docs/features/usage-based-billing/credits
- Polar seats: https://polar.sh/docs/features/seat-based-pricing
- Polar Better Auth plugin: https://polar.sh/docs/integrate/sdk/adapters/better-auth
- Neon free plan limits: https://neon.com/faqs/free-plan-limits-and-quotas
- Cal.com AGPL and enterprise edition: https://next.cal.com/blog/changing-to-agplv3-and-introducing-enterprise-edition
- Hocuspocus, Y-Sweet, Liveblocks comparison: https://www.pkgpulse.com/guides/liveblocks-vs-partykit-vs-hocuspocus-realtime-2026
