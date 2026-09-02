"use client";

// Pure key-emitting keypad, same visual style as the /login PIN pad. It owns
// no value/state itself -- every caller (the login page's always-visible PIN
// entry, or the floating KeyboardPanel for a quantity/price field) decides
// what each key means. Buttons use onPointerDown + preventDefault so tapping
// a key never steals focus away from whatever field is being typed into --
// a normal onClick would blur the field between keystrokes and the floating
// panel would think focus left the form.
export type NumericKey = `${number}` | "." | "back" | "clear";

interface NumericKeypadProps {
  onKey: (key: NumericKey) => void;
  /** General numeric fields (qty/price) want a decimal point in the bottom
   * row; PIN entry has no use for one and wants a Clear key there instead. */
  allowDecimal?: boolean;
  disabled?: boolean;
  /** Bigger buttons for the dedicated, full-screen /login PIN pad. */
  large?: boolean;
}

const DIGIT_ROWS: NumericKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export function NumericKeypad({
  onKey,
  allowDecimal = true,
  disabled = false,
  large = false,
}: NumericKeypadProps) {
  const height = large ? "h-16" : "h-14";
  const textSize = large ? "text-2xl" : "text-xl";

  function keyButton(key: NumericKey, label: React.ReactNode) {
    return (
      <button
        key={key}
        type="button"
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault();
          if (!disabled) onKey(key);
        }}
        className={`flex ${height} items-center justify-center rounded-xl border border-border bg-surface ${textSize} font-medium text-foreground active:bg-background disabled:opacity-30`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {DIGIT_ROWS.flat().map((key) => keyButton(key, key))}
      {allowDecimal ? keyButton(".", ".") : keyButton("clear", "C")}
      {keyButton("0", "0")}
      {keyButton("back", "⌫")}
    </div>
  );
}
