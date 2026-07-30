<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# acc.winlab.tw

A one-page link checker for the NYCU Accounting Office site (`acc.nycu.edu.tw`).
One button, a live log, and two result blocks: confirmed problems and things a
human needs to confirm.

## Where things live

| Path                  | What it holds                                                                     |
| --------------------- | --------------------------------------------------------------------------------- |
| `lib/scan/target.ts`  | **Everything site-specific.** Point the tool elsewhere by editing only this file. |
| `lib/scan/url.ts`     | URL normalization + resource classification                                       |
| `lib/scan/fetch.ts`   | Ranged GET, full download, retry, bounded-concurrency pool                        |
| `lib/scan/extract.ts` | Cheerio parsing: links, emails, the mailto audit                                  |
| `lib/scan/probe.ts`   | Verdict rules + the control-fingerprint sample                                    |
| `lib/scan/archive.ts` | Unzips archives to prove they hold real files                                     |
| `hooks/use-scan.ts`   | The scan orchestrator — runs in the browser, not the server                       |
| `app/api/scan/*`      | One stateless batch endpoint per phase                                            |

## Three decisions worth not undoing

**The browser drives the scan.** A full pass takes over two minutes; a
serverless function is capped in seconds. So the client walks through batches and
each endpoint stays stateless. This is also why the log shows real progress
instead of a spinner. Do not "simplify" it into one long server-side scan.

**Never use HEAD against the target.** Its WAF answers every HEAD with 403.
Existence is proven with a ranged GET, and the stream is cancelled once enough
bytes arrive. A HEAD-based rewrite would report the whole site as broken.

**A 200 does not mean the resource exists.** This CMS returns HTTP 200 with a
zero-byte file named `檔案不存在.txt` when the blob is gone, and serves
structurally valid zips containing nothing but an empty folder. Both defects were
real. That is why attachments get their filename inspected and archives get
opened. `sampleControl()` learns the missing-file filename at scan start rather
than trusting a hardcoded list.

## Verdicts

Three states, not two. `dead` is proven broken, `suspect` needs a human,
`blocked` means the far side refuses automated checks (Cloudflare interstitials)
and is folded into `suspect` in the UI. Keeping the third state is what stops the
tool from either over-claiming or hiding real problems.

## Style

Loki's house style: Next 16 App Router at repo root (no `src/`), Tailwind v4
CSS-first (no `tailwind.config.*`), kebab-case filenames, `cn()` for every class
merge, Prettier with semicolons and double quotes, UI copy in 繁中 and code
identifiers in English.

UI primitives come from the `@zyx1121` registry (`ui.zyx.tw`, `base-luma` style),
pulled with `bunx shadcn@latest add @zyx1121/<name>`. That registry ships
components only, so its `--block` / `--corner-shape` tokens are declared by hand
in `app/globals.css` — keep them in sync if the registry's theme moves.

## Commands

```bash
bun install
bun run dev
bun run build
bun run typecheck
bun run lint
bun run format
```
