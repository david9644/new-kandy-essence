"use client";

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  allowDecimal?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

// Large on-screen keypad for quantity/price entry on the touch kiosk. The
// input itself stays a normal editable field so a physical keyboard works
// just as well on the regular-PC station and on mobile.
export function NumericKeypad({
  value,
  onChange,
  label,
  allowDecimal = true,
  placeholder = "0",
  autoFocus,
}: NumericKeypadProps) {
  function press(key: string) {
    if (key === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "." && (!allowDecimal || value.includes("."))) return;
    if (key !== "." && value.includes(".") && value.split(".")[1]?.length >= 2) return;
    onChange(value + key);
  }

  return (
    <div className="w-full">
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      )}
      <input
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value;
          if (allowDecimal ? /^\d*\.?\d{0,2}$/.test(next) : /^\d*$/.test(next)) {
            onChange(next);
          }
        }}
        className="mb-2 w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-2xl font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={key === "." && !allowDecimal}
            className="flex h-14 items-center justify-center rounded-lg border border-border bg-surface text-xl font-medium text-foreground active:bg-background disabled:opacity-30"
          >
            {key === "back" ? "⌫" : key}
          </button>
        ))}
      </div>
    </div>
  );
}
