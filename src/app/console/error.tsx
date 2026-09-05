"use client";

import { Button } from "@/components/ui/button";

export default function ConsoleError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3">
      <h1>That didn&rsquo;t go through</h1>
      <p className="text-muted-foreground">{error.message}</p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
