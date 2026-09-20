import { redirect } from "next/navigation";

/**
 * History opens on the latest week's results — `/history/results` lands on the
 * most recent Week the season has played, and its week chips reach the rest.
 * This path stays because the tab, the leaderboard link and `landingRoute` all
 * point at it.
 */
export default function History() {
  redirect("/history/results");
}
