// App shell: routes with page transitions, the tab bar on phones and the
// sidebar on wide screens, the bar that
// returns you to a running workout, islands, the number pad and dialogs.
import { CalendarDays, ChevronUp, Dumbbell, GraduationCap, ListOrdered, Scale, Settings as SettingsIcon, TrendingUp, UserRound, Utensils } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AccountSheet } from "@/components/account-sheet";
import { AlertHost } from "@/components/alert-host";
import { Islands } from "@/components/islands";
import { Keypad } from "@/components/keypad";
import { ease, spring } from "@/components/kit";
import { pad } from "@/lib/keypad.js";
import { go, route } from "@/lib/router.js";
import { activeWorkout, loaded, pending } from "@/lib/store.js";
import { sync } from "@/lib/sync.js";
import { now } from "@/lib/timer.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";
import { Today } from "@/pages/today";
import { WorkoutPage } from "@/pages/workout";
import { History, WorkoutDetail } from "@/pages/history";
import { ExerciseDetail, Progress } from "@/pages/progress";
import { BodyweightPage } from "@/pages/bodyweight";
import { NutritionPage } from "@/pages/nutrition";
import { CoachPage } from "@/pages/coach";
import { DayEditor, Split } from "@/pages/split";
import { Settings } from "@/pages/settings";
import { ProfilePage } from "@/pages/profile";
import { FriendPage } from "@/pages/friend";

const TABS = [
  { page: "today", label: "Today", icon: Dumbbell, match: ["today", "nutrition"] },
  { page: "history", label: "History", icon: CalendarDays, match: ["history"] },
  { page: "progress", label: "Progress", icon: TrendingUp, match: ["progress", "exercise", "bodyweight"] },
  { page: "split", label: "Split", icon: ListOrdered, match: ["split"] },
  { page: "coach", label: "Coach", icon: GraduationCap, match: ["coach"] },
  { page: "profile", label: "Profile", icon: UserRound, match: ["profile", "settings", "friend"] }
];

function pageFor(page: string, id: string | null): ReactNode {
  if (page === "workout" && id) return <WorkoutPage id={id} />;
  if (page === "history") return id ? <WorkoutDetail id={id} /> : <History />;
  if (page === "progress") return <Progress />;
  if (page === "exercise" && id) return <ExerciseDetail id={id} />;
  if (page === "bodyweight") return <BodyweightPage />;
  if (page === "nutrition") return <NutritionPage />;
  if (page === "coach") return <CoachPage />;
  if (page === "split") return id ? <DayEditor id={id} /> : <Split />;
  if (page === "settings") return <Settings />;
  if (page === "profile") return <ProfilePage />;
  if (page === "friend" && id) return <FriendPage username={id} />;
  return <Today />;
}

// The sidebar on wide screens: training, then fuel and coaching, then the
// account. Rows are 36px with the icon in one column.
const SIDE = [
  {
    label: "Training",
    items: [
      { page: "today", label: "Today", icon: Dumbbell, match: ["today"] },
      { page: "history", label: "History", icon: CalendarDays, match: ["history"] },
      { page: "progress", label: "Progress", icon: TrendingUp, match: ["progress", "exercise"] },
      { page: "split", label: "Split", icon: ListOrdered, match: ["split"] }
    ]
  },
  {
    label: "Body and fuel",
    items: [
      { page: "nutrition", label: "Fuel", icon: Utensils, match: ["nutrition"] },
      { page: "bodyweight", label: "Bodyweight", icon: Scale, match: ["bodyweight"] },
      { page: "coach", label: "Coach", icon: GraduationCap, match: ["coach"] }
    ]
  }
];
const ACCOUNT = [
  { page: "profile", label: "Profile", icon: UserRound, match: ["profile", "friend"] },
  { page: "settings", label: "Settings", icon: SettingsIcon, match: ["settings"] }
];

function SideLink({ item, page }: { item: (typeof ACCOUNT)[number]; page: string }) {
  const on = item.match.includes(page);
  const Icon = item.icon;
  return (
    <a
      aria-current={on ? "page" : undefined}
      className={cn("relative flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors", on ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}
      href={`#/${item.page}`}
    >
      {on ? <motion.span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" layoutId="side-mark" transition={spring} /> : null}
      <Icon className={cn("size-[18px] shrink-0", on && "text-primary")} strokeWidth={1.75} />
      {item.label}
    </a>
  );
}

/** Lift's mark: a plate seen face on, flat in the accent. */
function Mark() {
  return (
    <svg aria-hidden="true" className="size-6 shrink-0" viewBox="0 0 24 24">
      <circle cx="12" cy="12" fill="var(--tint)" r="11" />
      <circle cx="12" cy="12" fill="none" r="7" stroke="var(--tint-ink)" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="12" cy="12" fill="var(--bar)" r="2.5" />
    </svg>
  );
}

function Sidebar() {
  const { page } = useValue(route) as { page: string };
  const active = useValue(activeWorkout) as any;
  const tick = useValue(now);
  const state = useValue(sync) as any;
  const waiting = useValue(pending) as number;
  const user = state.user;
  const status = state.status === "error" ? "Sync paused" : waiting ? `${format.plural(waiting, "change")} waiting` : state.status === "signedOut" ? "Not signed in" : "Synced";
  return (
    <nav aria-label="Main" className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-bar px-3 pt-5 pb-4 lg:flex">
      <a className="mb-6 flex h-9 items-center gap-2 rounded-lg px-3 text-[18px] font-semibold" href="#/today">
        <Mark /> Lift
      </a>
      {active && page !== "workout" ? (
        <a className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 transition-colors hover:bg-accent" href={`#/workout/${active.id}`}>
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[12px] text-success">In progress</span>
            <span className="truncate text-[14px] font-medium">{active.name}</span>
          </span>
          <span className="sets text-[13px] text-muted-foreground">{format.clock((tick - active.startedAt) / 1000)}</span>
        </a>
      ) : null}
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
        {SIDE.map((group) => (
          <div className="flex flex-col gap-0.5" key={group.label}>
            <span className="mb-1 px-3 text-[12px] text-muted-foreground">{group.label}</span>
            {group.items.map((item) => (
              <SideLink item={item} key={item.page} page={page} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5 border-t border-border pt-3">
        {ACCOUNT.map((item) => (
          <SideLink item={item} key={item.page} page={page} />
        ))}
        <div className="mt-2 flex items-center gap-2 px-3 text-[12px] text-muted-foreground">
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", state.status === "error" ? "bg-destructive" : waiting || state.status === "signedOut" ? "bg-pr" : "bg-success")} />
          <span className="truncate">{user?.username ? `@${user.username}` : user?.email || "Lift"} · {status}</span>
        </div>
      </div>
    </nav>
  );
}

function TabBar() {
  const { page } = useValue(route) as { page: string };
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bar [transform:translateZ(0)] lg:hidden">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-2">
        {TABS.map((tab) => {
          const on = tab.match.includes(page);
          const Icon = tab.icon;
          return (
            <a aria-current={on ? "page" : undefined} className={cn("relative flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] transition-colors", on ? "text-primary" : "text-muted-foreground")} href={`#/${tab.page}`} key={tab.page}>
              {on ? <motion.span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" layoutId="tab-mark" transition={spring} /> : null}
              <Icon className="size-5" strokeWidth={1.75} />
              <span>{tab.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function MiniPlayer() {
  const active = useValue(activeWorkout);
  const tick = useValue(now);
  return (
    <AnimatePresence>
      {active ? (
        <motion.button
          animate={{ y: 0, opacity: 1 }}
          className="pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-popover px-4 py-3 text-left shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          exit={{ y: 24, opacity: 0 }}
          initial={{ y: 24, opacity: 0 }}
          onClick={() => go(`workout/${active.id}`)}
          transition={spring}
          type="button"
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-success" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{active.name}</span>
          <span className="sets text-[14px] text-muted-foreground">{format.clock((tick - active.startedAt) / 1000)}</span>
          <ChevronUp className="size-4 text-muted-foreground" strokeWidth={1.75} />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

export default function App() {
  const ready = useValue(loaded);
  const r = useValue(route) as { page: string; id: string | null };
  const keypadOpen = Boolean(useValue(pad));
  const user = (useValue(sync) as any).user;
  const inWorkout = r.page === "workout";
  const depth = r.id ? 1 : 0;
  const lastDepth = useRef(depth);
  const direction = depth >= lastDepth.current ? 1 : -1;
  useEffect(() => {
    lastDepth.current = depth;
    window.scrollTo(0, 0);
  }, [r.page, r.id, depth]);

  if (!ready) return null;
  const key = `${r.page}/${r.id || ""}`;
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.main
          animate={{ opacity: 1, x: 0 }}
          className={cn("relative min-h-dvh lg:pl-60", keypadOpen && "pb-[340px]")}
          exit={{ opacity: 0, x: depth ? -12 * direction : 0 }}
          initial={{ opacity: 0, x: depth ? 24 * direction : 0 }}
          key={key}
          transition={{ duration: 0.24, ease }}
        >
          {pageFor(r.page, r.id)}
        </motion.main>
      </AnimatePresence>

      {/* Portaled to <body> with static fixed shells, like the keypad: on iOS
          a fixed bar under a transformed ancestor, or one whose content
          animates, can end up scrolling with the page. */}
      {createPortal(
        <>
          {!inWorkout && r.page !== "today" ? (
            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-30 px-4 [transform:translateZ(0)] lg:hidden">
              <MiniPlayer />
            </div>
          ) : null}
          {inWorkout ? null : <TabBar />}
          <Sidebar />
        </>,
        document.body
      )}
      {inWorkout ? <Keypad /> : null}
      <Islands />
      <AlertHost />
      {/* Everyone signed in picks a username once; friends find them by it. */}
      {user && !user.username ? <AccountSheet onClose={() => {}} open required /> : null}
    </MotionConfig>
  );
}
