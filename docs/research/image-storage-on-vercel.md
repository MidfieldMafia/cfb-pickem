# Where member photo bytes can live, on this Vercel plan, at pool scale

Research date: 2026-09-21. Resolves [#220](https://github.com/MidfieldMafia/cfb-pickem/issues/220),
a sub-issue of the [Photo pennants](https://github.com/MidfieldMafia/cfb-pickem/issues/176) map.

**Facts only.** The decision belongs to "What a stored photo is, and its lifecycle"
([#222](https://github.com/MidfieldMafia/cfb-pickem/issues/222)). Sources are official Vercel docs,
Neon docs, the PostgreSQL manual, the Next.js 16.3.4 docs bundled in this repo's
`node_modules/next/dist/docs/`, the installed `drizzle-orm@0.45.2` and
`@neondatabase/serverless@1.1.0` packages, and the live Vercel API for this project.

## The scale this is measured against

The map has settled that the crop is client-side, so what arrives at the server is one finished
square of roughly **256×256 WebP, on the order of 15 KB**, one per member. Taking **50 members** as a
generous pool:

- **750 KB** of image bytes in total, for the whole app, forever.
- **~50 writes a year**, plus the odd replacement.
- Reads are bounded by how often a board is looked at, times the number of pennants on it.

Every number below should be read against those three. Nothing here is close to a ceiling; the
interesting differences are in **seams and failure modes**, not in cost.

---

## 0. What this project actually is, verified

Checked against the Vercel API on 2026-09-21, not inferred:

| Fact | Value | How it was checked |
| --- | --- | --- |
| Plan | **Hobby** | `get_auth_user` → `billing.plan: "hobby"`, `resourceConfig.concurrentBuilds: 1` |
| Account | `jonahmabry-3517` (`team_YCWnhbsPYgKDLf57ZmmIJany`) | `list_teams`, `get_auth_user` |
| Project | `cfb-pickem` (`prj_FlTkck6k8vh2wWfqdH7ZG0CdAJeQ`), framework `nextjs`, Node `24.x` | `get_project` |
| Domains | `slate.midfield-mafia.com`, `cfb-pickem-eight.vercel.app`, + two generated | `get_project` |
| Blob store | **none exists** — no `BLOB_STORE_ID` and no `BLOB_READ_WRITE_TOKEN` in any environment | `filter_project_envs` |
| Postgres | Neon, provisioned through the **Vercel Marketplace native integration** (`store_U3rYwp2YScvJeuwb`); every `POSTGRES_*` / `PG*` / `DATABASE_URL` var carries `contentHint.type: "integration-store-secret"` | `filter_project_envs` |

Two incidental notes for whoever builds this:

- `.vercel/project.json` is **absent** locally; only `.vercel/repo.json` is there, and it names the
  right project and org. `vercel link` has not been re-run in this checkout.
- `get_project` with an explicit `teamId` returns `404`, and `list_projects` for the team returned
  only `world-cup-26`. Querying `get_project` by name **without** `teamId` returns `cfb-pickem`
  correctly. If a later session concludes "the project does not exist", that is this quirk, not the
  truth.

---

## 1. Summary table

| | **A. Vercel Blob** | **B. Bytes in Neon** | **C. `public/`** |
| --- | --- | --- | --- |
| Available on this plan? | **Yes**, free within Hobby limits | **Yes**, already provisioned | **No** — see §5 |
| Cost at 750 KB / 50 members | **$0.00** (0.075% of the 1 GB Hobby allowance) | **$0.00** (0.15% of Neon Free's 0.5 GB) | n/a |
| New service to provision | Yes — one Blob store | **No** | n/a |
| URL shape | `https://<store-id>.public.blob.vercel-storage.com/<pathname>` | whatever route handler you write, e.g. `/api/members/<id>/pennant.webp` | n/a |
| Serving cost per view | CDN-cached, no function runs | **one function invocation + one Neon query per cache MISS** | n/a |
| `next/image` | Yes, after adding the host to `images.remotePatterns` | Yes, same-origin, no config | n/a |
| Delete | `del(url)` — **free**, but up to 60s of cache lag and browsers keep the old copy | `UPDATE … SET photo = NULL` — instant and transactional | n/a |
| Drags `sharp` in? | **No** | **No** | n/a |

Neither A nor B puts `sharp` in the runtime. See §6 for the three ways it *could* get there.

---

## 2. Vercel Blob

### Availability and price on Hobby

> "Vercel Blob is free for Hobby users within the usage limits."
> — [vercel.com/docs/vercel-blob/usage-and-pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) (`## Hobby`)

The Hobby allowances, and what this pool would use against them:

| Resource | Included (Hobby) | This pool, per month | Headroom |
| --- | --- | --- | --- |
| Blob Storage Size | **1 GB/month** | 0.00075 GB | 1,300× |
| Blob **Simple** Operations | **First 10,000** | see below | large |
| Blob **Advanced** Operations | **First 2,000** | ~50–100 | 20–40× |
| Blob Data Transfer | **First 10 GB** | 750 KB × board views | ~13,000 full 50-pennant board loads |

Source: the pricing table at
[usage-and-pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) (`## Pricing`).

**What counts as which operation** matters more than the totals, because Advanced Operations are the
scarcest thing here (2,000/month):

- **Advanced**: `put()`, `upload()` (client uploads), `copy()`, **`list()`**.
- **Simple**: `head()`, and **a blob URL access that is a cache MISS**. A cache HIT is free.
- **`del()` is free of charge.** "Delete operations using the `del()` are free of charge. They are
  considered advanced operations for operation rate limits but not for billing."

Source: [vercel.com/docs/vercel-blob](https://vercel.com/docs/vercel-blob)
(`## Simple operations`, `## Advanced operations`).

Two traps worth writing into the seam:

1. **Never resolve a pennant by calling `list()`.** It is an Advanced Operation. The URL must come
   out of Postgres (a column on `members`), not out of the store. At 2,000/month, a `list()` per
   board render would exhaust the allowance in a weekend.
2. **Browsing the store in the Vercel dashboard burns operations.** "Each time you interact with the
   Vercel dashboard to browse your blob store, upload files, or view blob details, these actions
   count as Advanced Operations and will appear in your usage metrics." Refreshing the file browser
   is a `list()`.

**Exceeding the Hobby limits does not bill you — it cuts you off.** "You **will not pay for any
additional usage**. However, you will not be able to access Vercel Blob if limits are exceeded. In
this scenario, you will have to wait until 30 days have passed before using Blob storage again."
That is a hard availability cliff, not an invoice. At 1,300× headroom it is not a real risk, but it
is the failure mode.

Hobby can create up to **100 Blob stores**, at a rate limit of 10/minute, and the operation rate
limits are 1,200 Simple/min and 900 Advanced/min
([usage-and-pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) `### Store limits`,
`### Operation rate limits`).

Storage is metered as an average, not a peak: "Vercel Blob measures your storage usage by taking
snapshots of your blob store size every 15 minutes and averages these measurements over the entire
month" ([vercel-blob](https://vercel.com/docs/vercel-blob) `## Storage calculation`).

### How it is served

A public store gives every file a URL of the form
`https://<store-id>.public.blob.vercel-storage.com/<pathname>`, e.g.
`https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com/profilesv1/user-12345-NoOVGDVcqSPc7VYCUAGnTzLTG2qEM2.txt`.
The browser fetches it directly from the Blob network — **no function runs**.

Caching, quoted from
[public-storage](https://vercel.com/docs/vercel-blob/public-storage) (`## Caching`):

> "When you request a public blob URL, the content is cached in two places: 1. Vercel's CDN cache
> 2. Your browser's cache. Both caches store blobs for up to **1 month** by default."

Tunable per upload with `cacheControlMaxAge` (minimum **60 seconds**). The CDN also emits an `ETag`
and answers `304 Not Modified` to `If-None-Match` automatically — no code needed.

`next/image` works with public blob URLs, but the host must be allow-listed:

```js
// next.config.ts
images: { remotePatterns: [new URL('https://<store-id>.public.blob.vercel-storage.com/**')] }
```

> "`next/image` with direct blob URLs only works with **public** Blob stores. For private blobs,
> serve files through your Functions using `get()` and use the function route URL as the image
> source." — [public-storage](https://vercel.com/docs/vercel-blob/public-storage)

Note that **this repo passes `unoptimized` to every `next/image` today** — `Pennant`, `TeamLogo`,
`AppHeader` and `Wordmark` in `packages/design-system/src/`, and `next.config.ts` has no `images`
key at all. So Image Optimization is not currently engaged and its Hobby allowances (5K
transformations, 300K cache reads, 100K cache writes per month —
[image-optimization/limits-and-pricing](https://vercel.com/docs/image-optimization/limits-and-pricing))
are untouched either way. A 256×256 WebP that is already the right size has little to gain from the
optimizer; `unoptimized` keeps the pennant consistent with the rest of the design system.

**Public means public.** "Anyone with the URL can request a public blob." The pool is private and
Magic-Link-gated, but a pennant URL is not. Unguessability comes from `addRandomSuffix: true`, which
produces pathnames like `avatar-oYnXSVczoLa9yBYMFJOSNdaiiervF5.jpg`. Vercel also notes blob URLs can
be indexed by search engines and that the only control is uploading a `robots.txt` **to the store
itself** ([public-storage](https://vercel.com/docs/vercel-blob/public-storage) `## SEO and search
engine indexing`). A **private** store avoids all of this, at the cost of serving every pennant
through a Function via `get()` — which is the same shape as option B and carries option B's costs.

### How it is deleted, and the replace problem

`del(url)` deletes, free of charge. But:

> "When you delete or update (overwrite) a blob, the changes may take **up to 60 seconds** to
> propagate through our cache. However, browser caching presents additional challenges: While our
> cache can update to serve the latest content, browsers will continue serving the cached version."
> — [vercel-blob](https://vercel.com/docs/vercel-blob) (`### Important considerations when updating blobs`)

Vercel's own recommendation is to not fight this:

> "**Best practice: Treat blobs as immutable.** Instead of updating existing blobs, create new ones
> with different pathnames (or use `addRandomSuffix: true` option)."

Also, by default a second `put()` to the same pathname **throws**; overwriting requires
`allowOverwrite: true`.

So "member replaces their photo" on Blob is naturally: `put()` a new unique pathname → update the
column in Postgres to the new URL → `del()` the old URL. That is **two round trips to two systems
for one user action**, and the failure mode is an orphaned blob (harmless, free-ish) or a dangling
URL (a broken image) depending on which half fails. A commissioner clearing a photo is the same
shape: null the column, then `del()`.

### Uploading

Two paths, and the choice is a real seam decision:

- **Client upload** (`upload()` + a `handleUpload` route handler that mints a token): the browser
  sends the bytes straight to the store. "Client Uploads: No data transfer charges for uploads." It
  also sidesteps the **4.5 MB** request body limit on Vercel Functions
  ([functions/limitations](https://vercel.com/docs/functions/limitations) `## Request body size`) —
  irrelevant at 15 KB, but it is the reason most Blob guides recommend it. Requires a long-lived
  `BLOB_READ_WRITE_TOKEN`: "Use the read-write token only when … you generate client tokens for
  browser uploads with `handleUpload`."
- **Server upload** (`put()` inside a server action or route handler): the bytes pass through the
  app. Incurs Fast Data Transfer, but 15 KB × 50 is nothing, and it keeps the whole write in one
  server action next to the `members` update, with no second token to manage.

At 15 KB, **server upload is the simpler seam** and costs essentially nothing. Client upload buys
nothing here except a token to look after.

Authentication on Vercel is OIDC by default once a store is connected to the project: Vercel injects
`BLOB_STORE_ID` and `VERCEL_OIDC_TOKEN` and the SDK uses them automatically
([vercel-blob](https://vercel.com/docs/vercel-blob) `### OIDC access by default`). Note this repo's
`.env.local` already carries a `VERCEL_OIDC_TOKEN`.

Durability is S3-backed: 99.999999999% durability, 99.99% availability.

---

## 3. Bytes in Neon

### Does it fit? Yes, with room to spare

Neon **Free** includes **0.5 GB storage per project** and 100 CU-hours
([neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans),
[neon.com/pricing](https://neon.com/pricing)). 750 KB of `bytea` is **0.15%** of that; base64 `text`
inflates by 4/3 to ~1 MB, i.e. **0.2%**. Either is noise.

The failure mode if you ever did exhaust it is worth recording, because it is nastier than Blob's:
exceeding 0.5 GB on Free makes "operations that increase storage (inserts, updates, and deletes)
fail until you free space or upgrade" — that would take the **whole app** down, not just pennants.
The paid rate is **$0.35/GB-month** on Launch; Free has no overage option, only the cliff.

### Row size and TOAST — the part that actually matters

Postgres pages are 8 kB. A value that pushes a row past `TOAST_TUPLE_THRESHOLD` (**normally 2 kB**)
triggers the TOAST machinery, which compresses and/or moves the value **out of line** into a
separate TOAST table, in chunks of about 2,000 bytes. The default strategy for most TOAST-able types
is `EXTENDED` (compress, then store out-of-line if still too big). The hard ceiling on a single
field is **1 GB (2³⁰ − 1 bytes)**.
— [postgresql.org/docs/current/storage-toast.html](https://www.postgresql.org/docs/current/storage-toast.html)

So a 15 KB WebP:

- **will not** bloat the main `members` heap tuple; it lands in `pg_toast_*` and the row keeps a
  small pointer.
- **will not compress** meaningfully — WebP is already entropy-coded, so pglz gains ~0. Budget the
  full 15 KB (or 20 KB base64).
- is **only read when the column is selected.** That is the whole game.

### What it does to `members` queries

This is the real cost, and it is a code-shape cost, not a byte cost.

`src/db/schema.ts` defines `members` as a flat table and the app queries it with Drizzle. A Drizzle
`select()` with no explicit column list emits `SELECT` of **every** column. Add a `photo bytea` to
`members` and every existing `members` read — the board, the leaderboard, the roster, the console —
silently starts detoasting and shipping 15 KB per member over the Neon **HTTP** driver, JSON-encoded.
A 50-member board would move ~750 KB (or ~1 MB base64-in-JSON) per render, to display nothing.

The mitigations, in order of how little they ask of the rest of the codebase:

1. **Put the bytes in their own table** — `member_photos (member_id PK → members.id, bytes, content_type, updated_at)` —
   and join only in the one route handler that serves an image. Every existing `members` query is
   untouched and cannot regress. This also makes "clear the photo" a `DELETE` of one row, and makes
   the absence of a photo a missing row rather than a null column, which matches how
   `members.avatarId` already reads as "null until chosen".
2. Keep it on `members` and audit every `select()` to name columns. Fragile: the next `select()`
   someone writes re-introduces it, and nothing in `typecheck`, `test` or `eslint` will catch it.

Option 1 is strictly better and costs one extra table.

### Drizzle support — `bytea` is NOT built in at this version

Verified against the installed package, not the docs site (the docs describe a newer release):

```
$ grep -ril bytea node_modules/drizzle-orm/
node_modules/drizzle-orm/gel-core/columns/bytes.js     # a different dialect, not pg
...
```

`node_modules/drizzle-orm/pg-core/columns/all.d.ts` on **drizzle-orm 0.45.2** exports
`bigint, bigserial, boolean, char, cidr, customType, date, doublePrecision, inet, integer, interval,
json, jsonb, line, macaddr, macaddr8, numeric, point, geometry, real, serial, smallint, smallserial,
text, time, timestamp, uuid, varchar, bit, halfvec, sparsevec, vector` — **no `bytea`**.

So a binary column needs the `customType` escape hatch (`drizzle-orm/pg-core/columns/custom`),
roughly:

```ts
import { customType } from "drizzle-orm/pg-core";
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
```

`drizzle-kit generate` emits `bytea` DDL from that, so the migration flow is unchanged: generate
locally, commit the SQL, and `npm run build`'s `drizzle-kit migrate` applies it. (Per CLAUDE.md,
do **not** run `npm run build` locally to check work — it migrates the shared Development database.)

A `text` column holding base64 sidesteps `customType` entirely and is plainly supported today. It
costs +33% bytes and a decode on every read, and it makes the column look like ordinary text to
anything that scans the table. At this scale the +33% is 250 KB total.

### Driver: does `bytea` survive the Neon HTTP driver?

`@neondatabase/serverless@1.1.0` bundles pg-types: `parseBytea` is present in `index.js`, and the
`sql` template appends a `::bytea` cast for binary parameters. That is a good sign but **not an
end-to-end verification** — results over Neon's SQL-over-HTTP endpoint are JSON, and `src/db/index.ts`
goes through `drizzle-orm/neon-http`, which is a further layer. If B is chosen, **spike the round
trip first** (write a Buffer, read it back, compare bytes) before building the screen on it. Base64
`text` has no such question: it is a string at every layer.

### How it is served

There is no URL until you write one. The shape is a route handler:

```
GET /api/members/<id>/pennant.webp   →  SELECT bytes FROM member_photos WHERE member_id = $1
                                     →  new Response(bytes, { headers: { "content-type", "cache-control", "etag" } })
```

Consequences, none fatal at this scale but all real:

- **One function invocation per image per cache MISS.** Hobby includes 1,000,000 function
  invocations/month ([fair-use-guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
  `### Typical monthly usage guidelines`), so headroom is enormous — but a 50-pennant board is 50
  invocations and 50 Neon queries on a cold cache, versus zero for Blob.
- **Neon Free suspends its compute after 5 idle minutes** (already documented in
  `docs/research/vercel-neon-nextjs-constraints.md` and in the README). The first pennant request
  after a quiet spell pays the wake-up, and it pays it *while the page is rendering images*.
- You control caching completely, which is the upside: set `Cache-Control: public, max-age=…,
  immutable` with a content-hash or `updated_at` in the path and the replace problem from §2
  disappears — a new photo is a new URL, and the old one is never requested again.
- `next/image` works with no config because the URL is same-origin. (This repo passes `unoptimized`
  everywhere regardless.)
- Route handlers on Vercel are subject to the **4.5 MB** request/response body limit, and per
  CLAUDE.md a `route.ts` "may export nothing but its handlers" — run `npx next build` on any diff
  that adds one.

### How it is deleted

One statement, inside the same transaction as everything else:
`DELETE FROM member_photos WHERE member_id = $1`. No second system, no 60-second cache lag on the
origin, no orphans. A commissioner clearing a photo (the map's moderation floor) is a single
`removeX`-shaped lib function with no external call that can half-fail — which matters, because
every other console action in this codebase already has that property.

---

## 4. What the Marketplace offers — no object storage

Vercel documents exactly three storage products: **Blob** (files), **Global Config** (formerly Edge
Config; runtime configuration), and **Marketplace storage**
([vercel.com/docs/storage](https://vercel.com/docs/storage) `## Choosing a storage product`).

Marketplace storage is **databases only**:

> "The Vercel Marketplace connects agents and applications to relational data, sessions, rate limits,
> embeddings, and semantic search through providers like Neon, Upstash, and Supabase."

and its own page lists the categories as **Postgres** (Neon, Supabase, AWS Aurora, Prisma), **KV /
Redis** (Upstash), **NoSQL**, and **vector**
([vercel.com/docs/marketplace-storage](https://vercel.com/docs/marketplace-storage)). There is **no
object-storage, file-storage or S3-compatible category in Vercel Marketplace storage.** Supabase
appears there as a *Postgres* provider; its Storage product is not what the Vercel integration
provisions.

Which means: on this plan, "managed object storage, billed through Vercel" is **Vercel Blob or
nothing**. Anything else (Cloudflare R2, S3, Supabase Storage direct) is a third-party account with
its own billing, its own credentials and its own free tier — outside the Marketplace, outside the
unified billing, and a new operational surface for a 750 KB problem.

Global Config is not a candidate: it is a configuration store with its own size limits, written at
seconds-latency, and Hobby is capped at **250 writes/month** ([limits](https://vercel.com/docs/limits)
rate-limit table, "Global Config writes per month (Free)"). It is not for images.

---

## 5. Why `public/` cannot hold user data — confirm and record

`public/` is a **build input**, not a writable directory. Four independent reasons, any one of which
is fatal:

1. **The runtime filesystem is read-only.** "Vercel functions have a read-only filesystem with
   writable `/tmp` scratch space up to 500 MB."
   — [vercel.com/docs/functions/runtimes](https://vercel.com/docs/functions/runtimes)
   (`### File system support`). A server action literally cannot write a file into the deployment.

2. **`/tmp` is not storage.** It is per-microVM scratch, not shared between concurrent instances
   (functions "auto-scale up to 30,000 concurrency" on Hobby), and the instance itself is disposable:
   "Vercel Functions are archived when they are not invoked — within 2 weeks for Production
   Deployments, within 48 hours for Preview Deployments." A photo written to `/tmp` is invisible to
   the next request that lands on a different instance, and gone entirely soon after.

3. **A deployment's file set is fixed at build time.** `public/` is uploaded as static assets when
   the build runs; the CDN serves that snapshot. Nothing a running function does can add to it. The
   only way a new file appears under `/` is a **new deployment**, which means a **new git commit** —
   and Hobby is capped at 100 deployments/day ([limits](https://vercel.com/docs/limits)). "Member
   uploads a photo" would mean "app commits to its own repo and redeploys itself".

4. **This repo is public on GitHub.** The README states production deploys work on Hobby precisely
   *because* "the repo is public". Committing a member's face into `public/` would publish it to the
   world, permanently, in git history — and the map's whole premise is that the pool is private and
   reached only by a Magic Link. Even if 1–3 were solved, this alone rules it out.

For completeness, Next.js's own note: "Next.js cannot safely cache assets in the `public` folder
because they may change. The default caching headers applied are: `Cache-Control: public,
max-age=0`" — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md`.
That is a caching wrinkle, not the blocker; reasons 1–4 are the blocker.

**`public/avatars/` and `public/logos/espn/` are fine and stay fine** — those are repo assets checked
in by developers, exactly what `public/` is for. `src/lib/avatars.ts` resolving `avatarId` against
`public/avatars/avatars.json` is not affected by any of this. The line to hold is: *preset pennants
ship with the code; member photos never can.*

---

## 6. Where `sharp` could sneak into the runtime

The map has ruled `sharp` out of the runtime. It is a **devDependency** today
(`sharp: ^0.35.4`), used only by `scripts/icons.ts` and `scripts/splash.ts` via the `icons` and
`splash` npm scripts. Three ways it could get promoted, in decreasing order of likelihood:

1. **Server-side resize or re-encode.** Anything of the shape "normalise whatever the browser sent
   to exactly 256×256 WebP" needs a codec in the function bundle. This is the one the map already
   ruled out by deciding the crop is client-side. **Neither storage option requires it** — Blob
   stores the bytes you hand it and performs no transformation; a Neon `bytea` column obviously
   does not either.

2. **Server-side *validation* of dimensions.** Less obvious, and the likely accidental route: a
   reviewer asks "how do we know it's really 256×256 and really WebP?", and the reflex is
   `sharp.metadata()`. It does not need `sharp`. A WebP file is a RIFF container — the magic bytes
   are `RIFF` at offset 0 and `WEBP` at offset 8, and the canvas dimensions sit in the `VP8 `/
   `VP8L`/`VP8X` chunk that follows. Byte-length and magic-byte checks cover the real risks (wrong
   type, absurd size) in a few lines with no dependency. **Flag any PR that adds `sharp` to
   `dependencies` for validation.**

3. **Self-hosting or local `next start` image optimization.** The `sharp` mention in the Next.js
   docs bundled here lives in `01-app/02-guides/self-hosting.md`, not in the deployment path: "On
   glibc-based Linux systems, Image Optimization may require additional configuration to prevent
   excessive memory usage" — that is about the self-hosted optimizer. **On Vercel, `next/image`
   optimization runs on Vercel's own Image Optimization infrastructure; `sharp` is not in your
   function bundle.** And this repo passes `unoptimized` to every `Image` anyway, so the optimizer is
   not engaged at all. Using `next/image` for pennants is safe on both counts.

For reference if anyone argues the bundle could absorb it: Vercel Functions cap at **250 MB
uncompressed** ([functions/limitations](https://vercel.com/docs/functions/limitations)
`## Bundle size limits`). `sharp` with its platform binaries would fit. The objection is not size —
it is a native dependency, a cold-start cost and a whole image-processing surface added to a 750 KB
problem.

---

## 7. The seam each option implies

Stated as facts about shape, not as a recommendation.

**A. Vercel Blob** — two systems, eventually consistent.
- New: a Blob store (one-time provisioning, `vercel blob create-store`), `@vercel/blob` in
  `dependencies`, `images.remotePatterns` in `next.config.ts` if optimization is ever wanted.
- `members` (or a sibling table) gains a **text URL** column — same shape as today's `avatarId`,
  which the map likes: "It stays one nullable column and one resolver (`findAvatar`)."
- Write path: server action → `put()` → update column. Delete path: null the column → `del()`.
  **Both are two-step and can half-fail**; the recovery story (orphan blob vs. broken image) has to
  be decided.
- Serving is free and function-free. This is Blob's real win: a 50-pennant board costs zero compute.
- The store lives on the **Hobby account**, not in the repo, so preview deployments and the shared
  Development database will see the **same** blobs unless a second store is created. Worth deciding
  deliberately — Neon already branches per preview, and Blob would not.

**B. Bytes in Neon** — one system, transactional.
- New: one table (`member_photos`), one `customType` bytea (or a `text` base64 column), one route
  handler. **No new service, no new credential, no new dependency.**
- Write, replace and clear are all single statements in the database the app already talks to, and
  they compose with the existing audit-log and console patterns without a second failure mode.
- Preview deployments get their own photos for free, because they already get their own Neon branch.
- Costs a function invocation + a Neon query per image cache-miss, and inherits Neon Free's 5-minute
  autosuspend on the first one.
- Two things to verify before committing: the `bytea` round trip through `neon-http` (§3), and that
  no existing `members` query starts selecting the bytes (§3).

**C. `public/`** — not an option. §5.

---

## 8. Open questions this ticket does not answer

- Whether the store should be **public** (free serving, guessable-but-random URL, indexable) or
  **private** (Function-served, and therefore option B's cost profile with option A's complexity).
- Whether preview deployments should share the production photo set.
- What a half-completed upload looks like on a flaky phone — the map already lists this as not yet
  specified, and it is materially different between A (two systems) and B (one).

These belong to [#222](https://github.com/MidfieldMafia/cfb-pickem/issues/222).

---

## Sources

- [Vercel Blob Pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Vercel Blob overview](https://vercel.com/docs/vercel-blob)
- [Vercel Blob — Public Storage](https://vercel.com/docs/vercel-blob/public-storage)
- [Vercel Storage overview](https://vercel.com/docs/storage)
- [Storage on Vercel Marketplace](https://vercel.com/docs/marketplace-storage)
- [Vercel Functions — Runtimes](https://vercel.com/docs/functions/runtimes)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel Limits](https://vercel.com/docs/limits)
- [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- [Limits and Pricing for Image Optimization](https://vercel.com/docs/image-optimization/limits-and-pricing)
- [Neon plans](https://neon.com/docs/introduction/plans), [Neon pricing](https://neon.com/pricing),
  [Neon usage metrics](https://neon.com/docs/introduction/usage-metrics)
- [PostgreSQL: TOAST](https://www.postgresql.org/docs/current/storage-toast.html)
- Bundled Next.js 16.3.4 docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md`,
  `01-app/02-guides/self-hosting.md`, `01-app/03-api-reference/02-components/image.md`
- Installed packages: `drizzle-orm@0.45.2` (`pg-core/columns/all.d.ts`, `pg-core/columns/custom.d.ts`),
  `@neondatabase/serverless@1.1.0`
- Vercel API, 2026-09-21: `get_auth_user`, `list_teams`, `get_project`, `filter_project_envs`
- This repo: `src/db/schema.ts`, `src/db/index.ts`, `src/lib/avatars.ts`,
  `packages/design-system/src/pennant.tsx`, `next.config.ts`, `package.json`, `README.md`,
  `docs/research/vercel-neon-nextjs-constraints.md`
