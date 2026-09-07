/**
 * Required environment variables. The message is a runbook instruction, so it
 * is written once: two copies drift the moment the pull command changes.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; run \`vercel env pull .env.local\`.`);
  return value;
}
