/** The sessionStorage key that marks a launch as already shown. */
export const LAUNCH_KEY = "launched";

/**
 * The localStorage key holding the Week's Look (`weekLook`) as the member
 * screens last read it. The launch screen shows before any layout has read the
 * Week, so it wears the Look this remembers: LAUNCH_GUARD copies it to
 * <html data-look> before the first paint.
 */
export const LOOK_KEY = "week-look";

/**
 * Runs before first paint, ahead of hydration: a document load later in the
 * same launch (a redirect, a full navigation) marks <html> so the launch
 * overlay never flashes again. sessionStorage is per launch — iOS clears it
 * when the app is killed and keeps it across a resume. It also puts the
 * remembered Look (LOOK_KEY) on <html data-look>, for the launch screen.
 */
export const LAUNCH_GUARD =
  `try{if(sessionStorage.getItem("${LAUNCH_KEY}"))document.documentElement.dataset.launched=""}catch(e){}` +
  `try{var l=localStorage.getItem("${LOOK_KEY}");if(l)document.documentElement.dataset.look=l}catch(e){}`;
