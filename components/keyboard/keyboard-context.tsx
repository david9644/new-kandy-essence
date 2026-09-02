"use client";

import { createContext, useCallback, useContext, useMemo, useState, type RefObject } from "react";
import type { NumericKey } from "@/components/NumericKeypad";
import type { TextKey } from "@/components/OnScreenKeyboard";

export interface OpenNumericKeyboard {
  type: "numeric";
  allowDecimal: boolean;
  onKey: (key: NumericKey) => void;
  targetRef: RefObject<HTMLElement | null>;
}

export interface OpenTextKeyboard {
  type: "text";
  multiline: boolean;
  onKey: (key: TextKey) => void;
  targetRef: RefObject<HTMLElement | null>;
}

export type ActiveKeyboard = OpenNumericKeyboard | OpenTextKeyboard | null;

interface KeyboardContextValue {
  active: ActiveKeyboard;
  open: (state: OpenNumericKeyboard | OpenTextKeyboard) => void;
  close: () => void;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveKeyboard>(null);

  const open = useCallback((state: OpenNumericKeyboard | OpenTextKeyboard) => {
    setActive(state);
  }, []);

  const close = useCallback(() => setActive(null), []);

  const value = useMemo(() => ({ active, open, close }), [active, open, close]);

  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
}

export function useOnScreenKeyboard() {
  const ctx = useContext(KeyboardContext);
  if (!ctx) throw new Error("useOnScreenKeyboard must be used within a KeyboardProvider");
  return ctx;
}
