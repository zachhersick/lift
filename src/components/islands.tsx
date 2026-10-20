// The top-of-screen islands. The rest timer morphs from a small pill into a
// panel with −15 / +15 / Skip, the way Live Activities do. Below it, the
// Kokonut status island shows short notices (a PR, the next exercise).
import NumberFlow from "@number-flow/react";
import { Timer } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { StatusIsland } from "@/components/kokonutui/status-island";
import { dismissNotice, notices } from "@/lib/notify";
import { adjustRest, now, restTimer, stopRest } from "@/lib/timer.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";

const MORPH = { type: "spring", duration: 0.45, bounce: 0.18 } as const;

function Ring({ fraction, done, size = 22 }: { fraction: number; done?: boolean; size?: number }) {
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden="true" className="-rotate-90" height={size} width={size}>
      <circle cx={size / 2} cy={size / 2} fill="none" r={r} stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={r}
        stroke={done ? "#4ade80" : "var(--tint)"}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        strokeLinecap="round"
        strokeWidth="3"
        style={{ transition: "stroke-dashoffset 250ms linear" }}
      />
    </svg>
  );
}

function Clock({ seconds, className }: { seconds: number; className?: string }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <span className={cn("inline-flex items-baseline tabular", className)}>
      <NumberFlow value={m} />
      <span>:</span>
      <NumberFlow format={{ minimumIntegerDigits: 2 }} value={s} />
    </span>
  );
}

export function RestIsland() {
  const timer = useValue(restTimer);
  const tick = useValue(now);
  const [open, setOpen] = useState(false);
  const done = Boolean(timer?.finishedAt);
  const left = timer?.endsAt ? Math.max(0, Math.ceil((timer.endsAt - tick) / 1000)) : 0;
  const fraction = timer?.endsAt ? Math.max(0, Math.min(1, (timer.endsAt - tick) / 1000 / timer.total)) : 1;

  return (
    <AnimatePresence>
      {timer ? (
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="pointer-events-auto"
          exit={{ opacity: 0, y: -12, scale: 0.9 }}
          initial={{ opacity: 0, y: -12, scale: 0.9 }}
          key="rest"
          transition={MORPH}
        >
          <motion.div
            className={cn("overflow-hidden bg-zinc-950 text-white shadow-2xl shadow-black/40 ring-1 ring-white/10", done && "ring-emerald-400/40")}
            layout
            style={{ borderRadius: open ? 28 : 22 }}
            transition={MORPH}
          >
            {open && !done ? (
              <motion.div animate={{ opacity: 1 }} className="flex w-[min(92vw,360px)] flex-col gap-3 p-4" initial={{ opacity: 0 }} layout="position">
                <button className="flex items-center gap-3 text-left" onClick={() => setOpen(false)} type="button">
                  <Ring fraction={fraction} size={44} />
                  <span className="flex flex-col">
                    <span className="text-[12px] font-medium text-white/55">Resting</span>
                    <Clock className="text-[30px] leading-none font-semibold" seconds={left} />
                  </span>
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button className="h-11 rounded-2xl bg-white/10 text-[15px] font-semibold active:bg-white/20" onClick={() => adjustRest(-15)} type="button">
                    −15s
                  </button>
                  <button className="h-11 rounded-2xl bg-white/10 text-[15px] font-semibold active:bg-white/20" onClick={() => adjustRest(15)} type="button">
                    +15s
                  </button>
                  <button
                    className="h-11 rounded-2xl bg-[var(--tint)] text-[15px] font-semibold"
                    onClick={() => {
                      setOpen(false);
                      stopRest();
                    }}
                    type="button"
                  >
                    Skip
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                aria-label={done ? "Rest over" : `Rest, ${left} seconds left. Tap for controls`}
                className="flex h-11 items-center gap-2.5 px-4"
                layout="position"
                onClick={() => (done ? stopRest() : setOpen(true))}
                type="button"
              >
                {done ? <Timer className="size-[18px] text-emerald-400" strokeWidth={2.4} /> : <Ring fraction={fraction} />}
                <span className="text-[13px] font-medium text-white/60">{done ? "Rest over" : "Rest"}</span>
                {done ? <span className="text-[15px] font-semibold">Next set</span> : <Clock className="min-w-12 text-[17px] font-semibold" seconds={left} />}
              </motion.button>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function Islands() {
  const tasks = useValue(notices);
  return (
    <div className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-2">
      <RestIsland />
      <div className="pointer-events-auto">
        <StatusIsland dismissAfter={2600} onDismiss={dismissNotice} tasks={tasks} />
      </div>
    </div>
  );
}
