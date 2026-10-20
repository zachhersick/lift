// Short notices (a PR, the next exercise in a superset, a sync error). They
// show in the status island at the top of the screen and leave on their own.
import { signal } from "@preact/signals-core";
import type { IslandTask } from "@/components/kokonutui/status-island";

export const notices = signal<IslandTask[]>([]);

let counter = 0;

export function notify(label: string, { detail, status = "done", action }: { detail?: string; status?: IslandTask["status"]; action?: IslandTask["action"] } = {}) {
  counter += 1;
  const task: IslandTask = { id: `n${counter}`, label, detail, status, action };
  notices.value = [...notices.value.slice(-2), task];
  // The island only times out finished tasks; everything here is transient.
  if (status !== "done") setTimeout(() => dismissNotice(task.id), 2600);
  return task.id;
}

export function dismissNotice(id: string) {
  notices.value = notices.value.filter((task) => task.id !== id);
}
