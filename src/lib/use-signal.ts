// Read a signal from the store inside a React component. The store keeps its
// framework-free signals; this subscribes with useSyncExternalStore so a
// component re-renders when the value changes.
import { effect, type ReadonlySignal } from "@preact/signals-core";
import { useCallback, useSyncExternalStore } from "react";

export function useValue<T>(source: ReadonlySignal<T>): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let first = true;
      return effect(() => {
        source.value;
        if (first) first = false;
        else onChange();
      });
    },
    [source]
  );
  return useSyncExternalStore(subscribe, () => source.peek(), () => source.peek());
}
