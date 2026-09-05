import { Wordmark } from "@/components/wordmark";

export default function ExpiredLink() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <Wordmark />
      <div className="max-w-sm space-y-3">
        <h1>That link doesn&rsquo;t work anymore</h1>
        <p className="text-muted-foreground">
          It may have been regenerated or mistyped. Ask a commissioner for a new link and open
          that one instead.
        </p>
      </div>
    </main>
  );
}
