// App shell: routes with page transitions, the floating tab bar, the bar that
// returns you to a running workout, islands, the number pad and dialogs.
import { CalendarDays, ChevronUp, Dumbbell, GraduationCap, ListOrdered, TrendingUp, UserRound } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertHost } from "@/components/alert-host";
import { Islands } from "@/components/islands";
import { Keypad } from "@/components/keypad";
import { spring } from "@/components/kit";
import { pad } from "@/lib/keypad.js";
import { go, route } from "@/lib/router.js";
import { activeWorkout, loaded } from "@/lib/store.js";
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
  if (page === "friend" && id) return <FriendPage email={id} />;
  return <Today />;
}

function TabBar() {
  const { page } = useValue(route) as { page: string };
  return (
    <nav aria-label="Main" className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 [transform:translateZ(0)]">
      <div className="glass pointer-events-auto mb-3 flex w-full max-w-md items-center justify-between rounded-full p-1.5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.55)]">
        {TABS.map((tab) => {
          const on = tab.match.includes(page);
          const Icon = tab.icon;
          return (
            <a aria-current={on ? "page" : undefined} className={cn("relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-medium", on ? "text-primary" : "text-muted-foreground")} href={`#/${tab.page}`} key={tab.page}>
              {on ? <motion.span className="absolute inset-0 rounded-full bg-primary/14" layoutId="tab-pill" transition={spring} /> : null}
              <Icon className="relative size-[21px]" strokeWidth={on ? 2.4 : 2} />
              <span className="relative">{tab.label}</span>
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
          className="glass pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-lg"
          exit={{ y: 24, opacity: 0 }}
          initial={{ y: 24, opacity: 0 }}
          onClick={() => go(`workout/${active.id}`)}
          transition={spring}
          type="button"
        >
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{active.name}</span>
          <span className="text-[14px] text-muted-foreground tabular">{format.clock((tick - active.startedAt) / 1000)}</span>
          <ChevronUp className="size-4 text-muted-foreground" strokeWidth={2.6} />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

export default function App() {
  const ready = useValue(loaded);
  const r = useValue(route) as { page: string; id: string | null };
  const keypadOpen = Boolean(useValue(pad));
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
          animate={{ opacity: 1, x: 0, scale: 1 }}
          className={cn("relative min-h-dvh", keypadOpen && "pb-[340px]")}
          exit={{ opacity: 0, x: depth ? -24 * direction : 0, scale: depth ? 1 : 0.985 }}
          initial={{ opacity: 0, x: depth ? 40 * direction : 0, scale: depth ? 1 : 0.985 }}
          key={key}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
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
            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-30 px-4 [transform:translateZ(0)]">
              <MiniPlayer />
            </div>
          ) : null}
          {inWorkout ? null : <TabBar />}
        </>,
        document.body
      )}
      {inWorkout ? <Keypad /> : null}
      <Islands />
      <AlertHost />
    </MotionConfig>
  );
}
