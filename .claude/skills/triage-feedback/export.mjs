// Read-only export of every Feedback a commissioner has not filed under Done:
// feedback.json plus feedback-<id>.jpg per screenshot, into the directory given.
// Run from a checkout with node_modules and .env.local:
//   node --env-file=.env.local .claude/skills/triage-feedback/export.mjs <out-dir>
import { neon } from "@neondatabase/serverless";
import { mkdirSync, writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) throw new Error("usage: export.mjs <out-dir>");
mkdirSync(out, { recursive: true });

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  select f.id, f.kind, f.text, f.user_agent, f.created_at,
         m.display_name, m.is_commissioner, s.bytes
  from feedback f
  join members m on m.id = f.member_id
  left join feedback_screenshots s on s.feedback_id = f.id
  where f.done_at is null
  order by f.id`;

for (const r of rows) {
  if (r.bytes) {
    const b64 = r.bytes.replace(/^data:[^,]*,/, "");
    writeFileSync(`${out}/feedback-${r.id}.jpg`, Buffer.from(b64, "base64"));
  }
  r.screenshot = r.bytes ? `feedback-${r.id}.jpg` : null;
  delete r.bytes;
}
writeFileSync(`${out}/feedback.json`, JSON.stringify(rows, null, 1));
console.log(`${new URL(process.env.DATABASE_URL).host}: ${rows.length} open`);
for (const r of rows) {
  const text = r.text.replace(/\s+/g, " ").slice(0, 90);
  console.log(`#${r.id} ${r.kind} ${new Date(r.created_at).toISOString().slice(0, 10)} ${r.screenshot ? "[shot] " : ""}${text}`);
}
