// Start page, login target and the installed app's identity. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  DEFAULT_LANDING,
  START_PAGE_FLAG,
  START_PAGE_SCRIPT,
  nextParamFor,
  safeNextPath,
} from "./start-page";

// ── safeNextPath ─────────────────────────────────────────────────────────

test("safeNextPath: ordinary pages on this site are kept, query included", () => {
  assert.equal(safeNextPath("/billing/new"), "/billing/new");
  assert.equal(safeNextPath("/stock/out?x=1"), "/stock/out?x=1");
  assert.equal(safeNextPath("/billing/abc/print"), "/billing/abc/print");
});

test("safeNextPath: anything that could leave the site or loop is refused", () => {
  for (const bad of [
    "",
    null,
    undefined,
    "billing/new", // not a path
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example",
    "javascript:alert(1)",
    "/login",
    "/login?next=/x",
    "/login/",
    "/api/auth/login",
    "/api",
    "/",
    "/a\nb",
    "/a\\b",
    "/" + "x".repeat(600),
  ]) {
    assert.equal(safeNextPath(bad as string | null | undefined), null, String(bad));
  }
});

test("nextParamFor: the path and the query of the request", () => {
  assert.equal(nextParamFor("/billing/new", ""), "/billing/new");
  assert.equal(nextParamFor("/stock", "?q=a"), "/stock?q=a");
  assert.equal(nextParamFor("/", ""), null);
  assert.equal(nextParamFor("/login", ""), null);
  assert.equal(DEFAULT_LANDING, "/billing/new");
});

// ── the fallback script, run exactly as shipped ──────────────────────────

interface Env {
  standalone?: boolean;
  navigatorStandalone?: boolean;
  path: string;
  storage?: Map<string, string> | "throws";
}

function run(env: Env): { replaced: string[]; storage: Map<string, string> } {
  const storage = env.storage instanceof Map ? env.storage : new Map<string, string>();
  const replaced: string[] = [];
  const sessionStorage =
    env.storage === "throws"
      ? {
          getItem() {
            throw new Error("blocked");
          },
          setItem() {
            throw new Error("blocked");
          },
        }
      : {
          getItem: (k: string) => storage.get(k) ?? null,
          setItem: (k: string, v: string) => void storage.set(k, v),
        };
  const window = {
    matchMedia: (q: string) => ({ matches: q.includes("standalone") && env.standalone === true }),
    navigator: { standalone: env.navigatorStandalone },
    location: { pathname: env.path, replace: (u: string) => void replaced.push(u) },
    sessionStorage,
  };
  new Function("window", START_PAGE_SCRIPT)(window);
  return { replaced, storage };
}

test("installed app, first page is the Dashboard: sent to the new bill, once", () => {
  const storage = new Map<string, string>();
  const first = run({ standalone: true, path: "/dashboard", storage });
  assert.deepEqual(first.replaced, ["/billing/new"]);
  assert.equal(storage.get(START_PAGE_FLAG), "1");
  // the cashier opens the Dashboard later in the same window session: left alone
  const later = run({ standalone: true, path: "/dashboard", storage });
  assert.deepEqual(later.replaced, []);
});

test("installed app, first page is the root or has a trailing slash: also sent", () => {
  assert.deepEqual(run({ standalone: true, path: "/" }).replaced, ["/billing/new"]);
  assert.deepEqual(run({ standalone: true, path: "/dashboard/" }).replaced, ["/billing/new"]);
});

test("installed app, first page is something else: nothing moves, but it counts as the first page", () => {
  const storage = new Map<string, string>();
  assert.deepEqual(run({ standalone: true, path: "/stock", storage }).replaced, []);
  assert.equal(storage.get(START_PAGE_FLAG), "1");
  // so a later visit to the Dashboard is normal
  assert.deepEqual(run({ standalone: true, path: "/dashboard", storage }).replaced, []);
});

test("the login page is not 'the first page': after the login the first real page decides", () => {
  const storage = new Map<string, string>();
  assert.deepEqual(run({ standalone: true, path: "/login", storage }).replaced, []);
  assert.equal(storage.has(START_PAGE_FLAG), false);
  // login honoured ?next=/dashboard (the app was started on the old start page)
  assert.deepEqual(run({ standalone: true, path: "/dashboard", storage }).replaced, ["/billing/new"]);
  // API paths are never touched
  assert.deepEqual(run({ standalone: true, path: "/api/auth/login" }).replaced, []);
});

test("an ordinary browser tab is never redirected", () => {
  const storage = new Map<string, string>();
  assert.deepEqual(run({ standalone: false, path: "/dashboard", storage }).replaced, []);
  assert.equal(storage.size, 0);
});

test("iOS-style standalone flag counts too", () => {
  assert.deepEqual(run({ standalone: false, navigatorStandalone: true, path: "/dashboard" }).replaced, [
    "/billing/new",
  ]);
});

test("blocked sessionStorage: no redirect, no error", () => {
  assert.doesNotThrow(() => run({ standalone: true, path: "/dashboard", storage: "throws" }));
  assert.deepEqual(run({ standalone: true, path: "/dashboard", storage: "throws" }).replaced, []);
});

// ── the manifest: the installed app's identity must not move ──────────────

// Chrome's app id = the first 16 bytes of SHA-256(SHA-256(manifest id URL)), hex digits
// mapped 0-f -> a-p. The shortcut on Station 1 launches --app-id=galbhgloljbkajildddddfejaeenkacl.
function appIdOf(manifestIdUrl: string): string {
  const once = createHash("sha256").update(manifestIdUrl).digest();
  const hex = createHash("sha256").update(once).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

const ORIGIN = "https://new-kandy-essence.vercel.app";
const INSTALLED_APP_ID = "galbhgloljbkajildddddfejaeenkacl";

test("the installed app id is the hash of <origin>/dashboard (the OLD start_url, no id)", () => {
  assert.equal(appIdOf(`${ORIGIN}/dashboard`), INSTALLED_APP_ID);
});

test("manifest: id equals the old start_url, so the identity is unchanged; start_url is the new bill", () => {
  const m = JSON.parse(readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
  assert.equal(m.id, "/dashboard");
  assert.equal(m.start_url, "/billing/new");
  const identity = new URL(m.id, new URL(m.start_url, ORIGIN).origin);
  identity.hash = "";
  assert.equal(identity.href, `${ORIGIN}/dashboard`);
  assert.equal(appIdOf(identity.href), INSTALLED_APP_ID);
  // everything else is as it was
  assert.equal(m.display, "standalone");
  assert.equal(m.name, "New Kandy Essence");
  assert.equal(m.short_name, "NKE");
  assert.equal(m.theme_color, "#2563a8");
  assert.equal(m.background_color, "#f8fafc");
  assert.deepEqual(
    m.icons.map((i: { src: string; sizes: string }) => `${i.src} ${i.sizes}`),
    ["/icon-192.png 192x192", "/icon-512.png 512x512"]
  );
});
