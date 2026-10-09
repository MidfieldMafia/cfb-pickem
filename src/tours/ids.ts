/**
 * The Tours the app has, by id: what a dismissal row may name. The Welcome
 * Tour is the only one (#426); the registry that describes its Stops builds
 * on this list rather than beside it.
 */
export const tourIds = ["welcome"] as const;
export type TourId = (typeof tourIds)[number];

export const WELCOME_TOUR: TourId = "welcome";

export function isTourId(value: unknown): value is TourId {
  return tourIds.includes(value as TourId);
}
