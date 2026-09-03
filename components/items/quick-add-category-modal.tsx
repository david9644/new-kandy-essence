"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/shared/modal";
import { createCategory } from "@/app/(app)/items/actions";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";

export interface QuickCategory {
  id: string;
  name: string;
}

// Minimal category capture for "get unblocked while adding an item" -- not
// a replacement for the full Settings screen.
export function QuickAddCategoryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (category: QuickCategory) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // This form is rendered through a portal (Modal -> document.body), but
    // React still bubbles its submit event through the React tree -- up
    // into the item form this modal was opened from -- unless stopped
    // here. Without this, submitting the modal also fires the outer form's
    // onSubmit with whatever state it happened to have at that instant.
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const result = await createCategory(name);
      if (result?.error || !result?.id) {
        setError(result?.error ?? "Could not create category.");
        return;
      }
      onCreated({ id: result.id, name: name.trim() });
    });
  }

  return (
    <Modal open onClose={onClose} title="Add Category">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Name</label>
          <KeyboardTextInput
            value={name}
            onChange={setName}
            required
            autoFocus
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground active:bg-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex h-12 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Saving..." : "Add Category"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
