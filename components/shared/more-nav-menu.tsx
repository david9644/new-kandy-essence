"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/shared/modal";

export function MoreNavMenu({ items }: { items: Array<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground active:bg-border"
      >
        More
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="More">
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground active:bg-border"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </Modal>
    </>
  );
}
