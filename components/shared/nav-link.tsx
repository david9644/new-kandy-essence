"use client";

import Link, { useLinkStatus } from "next/link";

// Marks the pressed tab as "loading" the moment it is tapped (dimmed, with a
// small pulsing dot) so the screen answers within a frame even when the page's
// data takes longer. useLinkStatus only reports for the Link it sits inside.
function PendingDot() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span aria-hidden className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
  ) : null;
}

export function NavLink({
  href,
  className,
  onClick,
  children,
}: {
  href: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
      <PendingDot />
    </Link>
  );
}
