import Link from "next/link";

// A fixed href, not router.back() -- this app runs as an installed PWA with
// no browser back button visible, and a detail page reached by drilling
// into a list should always return to that same list regardless of how the
// user actually arrived (a deep link, a refresh, whatever history exists).
export function BackButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium text-foreground active:bg-background print:hidden"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className="h-4 w-4"
      >
        <path
          d="M12.5 15L7.5 10L12.5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Back
    </Link>
  );
}
