import type { TourTarget } from "./tours";

/**
 * Finding a Stop's target on the page (#431). Targets are `data-tour`
 * attributes (#430); each id is rendered once, so the first match is it.
 */
export function findTarget(target: TourTarget): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

/**
 * After a tab move the new screen renders some time after `router.push`, so
 * the runner waits for the target, up to `ms`, watching the DOM rather than
 * polling. Resolves `null` when it never comes: the Stop is dropped.
 */
export function waitForTarget(target: TourTarget, ms: number): Promise<HTMLElement | null> {
  const found = findTarget(target);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const finish = (element: HTMLElement | null) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(element);
    };
    const observer = new MutationObserver(() => {
      const element = findTarget(target);
      if (element) finish(element);
    });
    const timer = setTimeout(() => finish(null), ms);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tour"] });
  });
}

/** A Vaul sheet that is open. The Welcome Tour never starts over one. */
export function sheetOpen(): boolean {
  return document.querySelector('[data-vaul-drawer][data-state="open"]') !== null;
}
