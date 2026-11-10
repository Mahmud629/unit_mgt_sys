export const THEME_KEY = "ums-theme";

/** Runs before the page paints (see app/layout.tsx) so there is no white flash in dark mode. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(!t&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.dataset.theme="dark";if(localStorage.getItem("ums-sidebar")==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;
