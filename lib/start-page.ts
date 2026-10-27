// Where the app opens, and where a login lands.
//
// * DEFAULT_LANDING: the counter's new-bill screen, for Owner and Store Keeper.
// * safeNextPath: the page that was asked for before the login page, kept through
//   the login. Only a plain path on this site is ever accepted.
// * START_PAGE_SCRIPT: the immediate fallback for the installed app. Chrome only
//   picks up a changed manifest start_url once a day (and after the app window
//   closes), so for the first page of a window session this inline script sends an
//   installed app that opened on the Dashboard (or the root) to the new bill.
//   It is shipped as text in the page head so it runs before anything is drawn.

export const DEFAULT_LANDING = "/billing/new";

/** The page to go to after login: the requested one when it is a safe path on this
 * site, otherwise null (the caller then uses DEFAULT_LANDING). */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  if (!raw.startsWith("/")) return null; // not a path on this site
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null; // protocol-relative
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null; // control characters, backslashes
  const path = raw.split(/[?#]/)[0];
  if (path === "/login" || path.startsWith("/login/")) return null;
  if (path === "/api" || path.startsWith("/api/")) return null;
  if (path === "/") return null; // the root has no content of its own
  return raw;
}

/** The same rule for the address of a request: the path and query to come back to. */
export function nextParamFor(pathname: string, search: string): string | null {
  return safeNextPath(pathname + search);
}

/** Session memory: the first page of a window session has been looked at. */
export const START_PAGE_FLAG = "nke-start-page-handled";

export const START_PAGE_SCRIPT = `(function(){try{
var m=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;
if(!(m||window.navigator.standalone===true))return;
var p=window.location.pathname.replace(/\\/+$/,"")||"/";
if(p==="/login"||p.indexOf("/api/")===0)return;
var k="${START_PAGE_FLAG}";
if(window.sessionStorage.getItem(k))return;
window.sessionStorage.setItem(k,"1");
if(p==="/"||p==="/dashboard")window.location.replace("${DEFAULT_LANDING}");
}catch(e){}})();`;
