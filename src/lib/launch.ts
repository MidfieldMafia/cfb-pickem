/** The sessionStorage key that marks a launch as already shown. */
export const LAUNCH_KEY = "launched";

/**
 * Runs before first paint, ahead of hydration: a document load later in the
 * same launch (a redirect, a full navigation) marks <html> so the launch
 * overlay never flashes again. sessionStorage is per launch — iOS clears it
 * when the app is killed and keeps it across a resume.
 */
export const LAUNCH_GUARD = `try{if(sessionStorage.getItem("${LAUNCH_KEY}"))document.documentElement.dataset.launched=""}catch(e){}`;
