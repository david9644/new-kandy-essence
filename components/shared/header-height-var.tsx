"use client";

import { useEffect } from "react";

// Publishes the sticky app header's height as --app-header-h so a screen can
// stick its own bar directly beneath it (the billing totals bar) even though
// the header's height changes when its nav wraps onto a second line.
export function HeaderHeightVar() {
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;

    function publish() {
      document.documentElement.style.setProperty("--app-header-h", `${header!.offsetHeight}px`);
    }
    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(header);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, []);

  return null;
}
