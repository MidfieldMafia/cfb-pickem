import { Wordmark } from "@saturday-slate/design-system";

export function Medium() {
  return (
    <div style={{ padding: 16 }}>
      <Wordmark size="md" />
    </div>
  );
}

export function Large() {
  return (
    <div style={{ padding: 16 }}>
      <Wordmark size="lg" />
    </div>
  );
}

export function DeadEnd() {
  return (
    <div style={{ padding: 24, display: "grid", justifyItems: "center", gap: 12, textAlign: "center", maxWidth: 390 }}>
      <Wordmark size="lg" />
      <h1>That link has expired</h1>
      <p className="text-sm text-muted-foreground" style={{ margin: 0 }}>
        Ask a Commissioner for a new Magic Link.
      </p>
    </div>
  );
}
