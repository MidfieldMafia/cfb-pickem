import { HeaderLinks } from "@saturday-slate/design-system";

const bar = {
  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", maxWidth: 390,
  border: "1px solid var(--border)", borderRadius: 14, background: "var(--card)",
} as const;

export function Member() {
  return (
    <div style={{ padding: 16 }}>
      <div style={bar}>
        <span className="font-display" style={{ flex: 1, fontSize: 18 }}>Picks</span>
        <HeaderLinks />
      </div>
    </div>
  );
}

export function WithManage() {
  return (
    <div style={{ padding: 16 }}>
      <div style={bar}>
        <span className="font-display" style={{ flex: 1, fontSize: 18 }}>Live Board</span>
        <HeaderLinks manage="/console" />
      </div>
    </div>
  );
}
