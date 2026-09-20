import { CopyButton } from "@saturday-slate/design-system";

const row = { display: "flex", gap: 12, alignItems: "center", padding: 16, flexWrap: "wrap" } as const;

export function Variants() {
  return (
    <div style={row}>
      <CopyButton text="https://saturday-slate.example/join/abc123" label="Copy Magic Link" />
      <CopyButton text="https://saturday-slate.example/join/abc123" label="Copy" variant="secondary" />
      <CopyButton text="https://saturday-slate.example/join/abc123" label="Copy Join Link" variant="default" size="default" />
    </div>
  );
}
