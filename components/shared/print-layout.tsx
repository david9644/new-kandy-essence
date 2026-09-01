"use client";

interface PrintLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

// Shared wrapper for every report screen: A4 print sizing comes from the
// @page rule in globals.css, this just supplies a consistent header and
// hides the Print button itself when actually printing.
export function PrintLayout({ title, subtitle, children }: PrintLayoutProps) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground active:opacity-90"
        >
          Print
        </button>
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-bold">New Kandy Essence</h1>
        <p className="text-sm">{title}</p>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        <p className="mb-4 text-xs text-muted">
          Generated {new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 print:rounded-none print:border-none print:p-0">
        {children}
      </div>
    </div>
  );
}
