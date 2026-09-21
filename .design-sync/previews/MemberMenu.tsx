import { useEffect, useRef } from "react";
import { MemberMenu } from "@saturday-slate/design-system";
import p04 from "../../public/avatars/pennants/04.svg";

const me = { name: "Moss Dot", file: p04, color: "#6A9449" };

// The panel is a <details>; a static card has no click, so `open` sets it on mount.
function Frame({ open, children }: { open?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.querySelector("details")?.setAttribute("open", "");
  }, [open]);
  return (
    <div ref={ref} style={{ maxWidth: 390, height: open ? 210 : undefined, display: "flex", justifyContent: "flex-end" }}>
      {children}
    </div>
  );
}

export function Closed() {
  return (
    <Frame>
      <MemberMenu avatar={me} displayName="Jonah" group="Mabry Family" />
    </Frame>
  );
}

export function OpenForCommissioner() {
  return (
    <Frame open>
      <MemberMenu avatar={me} displayName="Jonah" group="Mabry Family" manage="/console" />
    </Frame>
  );
}

export function OpenNoPennantYet() {
  return (
    <Frame open>
      <MemberMenu avatar={undefined} displayName="Alex" group="Mabry Family" />
    </Frame>
  );
}
