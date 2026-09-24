// design-sync shim: next/link outside a Next app is just an anchor.
import * as React from "react";

export default React.forwardRef<
  HTMLAnchorElement,
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string | { pathname?: string };
    prefetch?: boolean | null;
    replace?: boolean;
    scroll?: boolean;
  }
>(function Link({ href, prefetch: _prefetch, replace: _replace, scroll: _scroll, ...rest }, ref) {
  return <a ref={ref} href={typeof href === "string" ? href : (href.pathname ?? "")} {...rest} />;
});
