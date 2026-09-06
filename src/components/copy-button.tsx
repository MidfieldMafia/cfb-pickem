"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies `text` to the clipboard, falling back to a prompt the user can copy from by hand. */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "outline",
  size = "sm",
  className,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "sm" | "default";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this", text);
    }
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={copy} className={className}>
      {copied ? copiedLabel : label}
    </Button>
  );
}
