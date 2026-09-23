"use client";

import { useEffect } from "react";
import { identifyMember } from "@/lib/analytics/analytics";

/** Tells analytics which member this browser belongs to. Renders nothing. */
export function AnalyticsMember({ memberId }: { memberId: number }) {
  useEffect(() => identifyMember(memberId), [memberId]);
  return null;
}
