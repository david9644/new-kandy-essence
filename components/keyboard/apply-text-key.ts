import type { TextKey } from "@/components/OnScreenKeyboard";

export function applyTextKey(current: string, key: TextKey): string {
  if (key === "back") return current.slice(0, -1);
  if (key === "space") return current + " ";
  if (key === "done") return current;
  return current + key;
}
