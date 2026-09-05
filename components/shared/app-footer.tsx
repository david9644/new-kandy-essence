import Image from "next/image";

const APEX_LOGO_ASPECT = { width: 2133, height: 587 };

// Quiet credit line for the agency that built this app -- shown small and
// muted on every page (variant "muted"), and a bit larger and in full
// color on the login screen's own "cover" (variant "prominent"). Never
// meant to compete with New Kandy Essence's own branding.
export function AppFooter({
  variant = "muted",
}: {
  variant?: "muted" | "prominent";
}) {
  if (variant === "prominent") {
    return (
      <div className="flex flex-col items-center gap-1.5 py-3 print:hidden">
        <Image
          src="/apex-logo.png"
          alt="Apex Digital Solutions"
          {...APEX_LOGO_ASPECT}
          className="h-7 w-auto"
        />
        <span className="text-xs text-muted">Crafted by Apex Digital Solutions</span>
      </div>
    );
  }

  return (
    <footer className="flex items-center justify-center gap-2 py-3 text-xs text-muted print:hidden">
      <Image
        src="/apex-logo.png"
        alt="Apex Digital Solutions"
        {...APEX_LOGO_ASPECT}
        className="h-5 w-auto opacity-60 grayscale"
      />
      <span>Crafted by Apex Digital Solutions</span>
    </footer>
  );
}
