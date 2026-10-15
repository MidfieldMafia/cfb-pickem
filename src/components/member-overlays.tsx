"use client";

import { dismissTourAction } from "@/app/(member)/actions";
import { tours } from "@/tours/tours";
import { TourRunner } from "./tour-runner";
import { WhatsNew } from "./whats-new";

/**
 * What can open over a member screen by itself: the What's new modal and the
 * Welcome Tour, decided together so a new member's first landing doesn't get
 * both (#426). `welcomeTour` is the layout's server read of the dismissal,
 * false when that read fails.
 */
export function MemberOverlays({ welcomeTour }: { welcomeTour: boolean }) {
  return (
    <>
      <WhatsNew quiet={welcomeTour} />
      {welcomeTour && <TourRunner tour={tours.welcome} dismiss={dismissTourAction} />}
    </>
  );
}
