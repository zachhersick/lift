// Confirmation dialogs as promises: `await ask(...)` from anywhere, rendered
// by <AlertHost /> in the app shell.
import { signal } from "@preact/signals-core";

export interface AlertAction<T = unknown> {
  label: string;
  value: T;
  style?: "cancel" | "danger" | "primary";
}

export interface AlertRequest {
  title: string;
  message?: string;
  actions: AlertAction[];
  resolve: (value: unknown) => void;
}

export const alertState = signal<AlertRequest | null>(null);

export function choose<T>({ title, message = "", actions }: { title: string; message?: string; actions: AlertAction<T>[] }): Promise<T> {
  return new Promise((resolve) => {
    alertState.value = { title, message, actions, resolve: resolve as (value: unknown) => void };
  });
}

export function ask({ title, message = "", confirm = "OK", cancel = "Cancel", danger = false }: { title: string; message?: string; confirm?: string; cancel?: string; danger?: boolean }) {
  return choose<boolean>({
    title,
    message,
    actions: [
      { label: cancel, value: false, style: "cancel" },
      { label: confirm, value: true, style: danger ? "danger" : "primary" }
    ]
  });
}
