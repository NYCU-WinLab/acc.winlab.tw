# acc.winlab.tw

A one-page resource checker for the [NYCU Accounting Office](https://acc.nycu.edu.tw)
website. Press **開始掃描**, watch the log, and get two lists back: problems
confirmed broken, and problems a human still needs to confirm.

Built because the office is audited on whether its published resources still
work — PDFs that open, links that resolve, mailboxes that receive.

## Stack

Bun 1.3 · Next.js 16 (App Router + Turbopack) · React 19 · Tailwind v4 ·
shadcn/ui via the [`@zyx1121`](https://ui.zyx.tw) registry (`base-luma`) ·
Upstash Redis (optional) · deployed on Vercel, functions in `hnd1` (Tokyo)

## What it checks

| Check          | How                                                                             |
| -------------- | ------------------------------------------------------------------------------- |
| Pages          | Every page reachable from the menus and both sitemaps, list endpoints paginated |
| Attachments    | Ranged GET, then filename and magic-byte inspection                             |
| Archives       | Downloaded and unzipped, to prove they contain real files                       |
| External links | Followed, with bot-wall interstitials told apart from genuine failures          |
| Email links    | `mailto:` target compared against the address printed beside it                 |
| Email domains  | MX lookup, with an A/AAAA fallback                                              |

Three defects this catches that a conventional link checker cannot:

1. **HTTP 200 with a missing file.** The CMS answers with a zero-byte
   `檔案不存在.txt` instead of a 404, so status codes alone look healthy.
2. **A valid but empty archive.** One monthly report was a 206-byte zip holding a
   single empty folder. Header checks pass; the download is useless.
3. **A mailto pointing somewhere other than the address on screen.** The link
   "works", and mail still goes to the wrong inbox.

## How a scan runs

The browser is the orchestrator. A full pass takes over two minutes, well beyond
a serverless function's limit, so the client walks through batches against
stateless endpoints — which is also why the log shows real progress rather than a
spinner.

```
POST /api/scan/seed        sitemaps + control fingerprint
POST /api/scan/pages       crawl a batch, collect links + emails + mailto audit
POST /api/scan/resources   ranged GET a batch of attachments and links
POST /api/scan/archives    download + unzip a batch of archives
POST /api/scan/emails      MX lookups
POST /api/scan/result      cache the summary
```

`HEAD` is never used: the target's WAF answers every HEAD with 403.

## Commands

```bash
bun install
bun run dev        # http://localhost:3000
bun run build
bun run typecheck
bun run lint
bun run format
```

## Env

Both optional. Without them the app still scans; it just cannot share a result
between visitors or enforce the cooldown server-side. See `.env.example`.

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
SCAN_IP_SALT=
```

## Limits

Two questions an outside scan cannot answer, both stated in the UI:

- **Whether a mailbox exists.** Only domain deliverability is checked. SMTP
  probing is unreliable against catch-all and Google Workspace domains and looks
  like abuse, so account-level verification belongs with the office's staff list.
- **Orphan pages.** Coverage follows links from the menus and sitemaps; a page
  nothing points at is invisible.

Scans are public but rate-limited per visitor, since every pass sends roughly
1,800 requests to someone else's server.

## Pointing it at another site

Edit `lib/scan/target.ts`. Origin, seeds, pagination, share hosts, missing-file
hints and soft-404 patterns all live there; nothing else is site-specific.
