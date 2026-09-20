import { Button } from "@saturday-slate/design-system";
import { Lock, Link as LinkIcon } from "lucide-react";

const row = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 16 } as const;

export function Variants() {
  return (
    <div style={row}>
      <Button>Lock in picks</Button>
      <Button variant="secondary">Set Lock of the Week</Button>
      <Button variant="destructive">Remove member</Button>
      <Button variant="outline">Copy Magic Link</Button>
      <Button variant="ghost">Skip</Button>
      <Button variant="link">How to play</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <Button size="xs">Copy</Button>
      <Button size="sm">Publish slate</Button>
      <Button>Continue</Button>
      <Button size="lg">Install Saturday Slate</Button>
    </div>
  );
}

export function WithIcons() {
  return (
    <div style={row}>
      <Button><Lock /> Lock Georgia</Button>
      <Button variant="outline"><LinkIcon /> Magic Link</Button>
      <Button size="icon" variant="outline" aria-label="Lock"><Lock /></Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={row}>
      <Button disabled>Picks locked</Button>
      <Button variant="outline" disabled>Copy Magic Link</Button>
    </div>
  );
}
