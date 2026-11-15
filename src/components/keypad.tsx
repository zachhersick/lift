// The docked number pad for weight and reps (logic in lib/keypad.js), and
// the key grid on its own for the bodyweight sheet.
import { ChevronDown, Delete } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closePad, currentValue, FIELD, locate, next, pad, press } from "@/lib/keypad.js";
import { exerciseIndex, exerciseName, settings } from "@/lib/store.js";
import { haptic } from "@/lib/haptics.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";
import { PlatesSheet } from "./plates";
import { spring } from "./kit";

export function Key({ children, onPress, variant = "digit", label, disabled }: { children?: ReactNode; onPress?: () => void; variant?: "digit" | "fn" | "go"; label?: string; disabled?: boolean }) {
  return (
    <motion.button
      aria-label={label}
      className={cn(
        "grid h-[52px] place-items-center rounded-xl select-none disabled:opacity-0",
        variant === "digit" && "bg-card text-[26px] tabular ring-1 ring-border dark:bg-accent dark:ring-0",
        variant === "fn" && "bg-muted text-[15px] font-medium text-foreground",
        variant === "go" && "bg-primary text-[16px] font-medium text-primary-foreground"
      )}
      disabled={disabled}
      onClick={() => {
        haptic(4);
        onPress?.();
      }}
      transition={spring}
      type="button"
      whileTap={{ scale: 0.92 }}
    >
      {children}
    </motion.button>
  );
}

export function KeyGrid({ onKey, decimal = true, side }: { onKey: (key: string) => void; decimal?: boolean; side: ReactNode[] }) {
  const digit = (d: string) => (
    <Key label={d} onPress={() => onKey(d)}>
      {d}
    </Key>
  );
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_1.2fr] gap-2">
      {digit("1")}
      {digit("2")}
      {digit("3")}
      {side[0]}
      {digit("4")}
      {digit("5")}
      {digit("6")}
      {side[1]}
      {digit("7")}
      {digit("8")}
      {digit("9")}
      {side[2]}
      <Key disabled={!decimal} label="Decimal point" onPress={() => onKey(".")}>
        .
      </Key>
      {digit("0")}
      <Key label="Delete" onPress={() => onKey("back")} variant="fn">
        <Delete className="size-6" strokeWidth={1.8} />
      </Key>
      {side[3]}
    </div>
  );
}

export function Keypad() {
  const target = useValue(pad);
  const s = useValue(settings);
  const [plates, setPlates] = useState(false);
  useEffect(() => {
    if (!target) setPlates(false);
  }, [target]);

  const found = target ? locate(target) : null;
  const open = Boolean(target && found?.set);
  const field = target?.field as keyof typeof FIELD;
  const config = FIELD[field] || FIELD.reps;
  const step = config.step();
  const stepLabel = field === "seconds" ? `${step}s` : format.weight(step);
  const title: Record<string, string> = { weight: `Weight (${s.unit})`, reps: "Reps", incline: "Incline (%)", speed: `Speed (${format.speedUnit(s.unit)})`, seconds: "Time" };

  // The fixed shell never moves; only the panel inside it slides. On iOS a
  // fixed element that carries its own transform animation can end up
  // scrolling with the page, so the two are kept apart. Portaled to <body> so
  // no transformed ancestor can re-anchor it either.
  return createPortal(
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 lg:left-60">
        <AnimatePresence>
          {open && target && found ? (
            <motion.div
              animate={{ y: 0 }}
              aria-label="Number pad"
              className="pb-safe pointer-events-auto rounded-t-[20px] border border-b-0 border-border bg-bar px-3 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] lg:mx-auto lg:max-w-2xl"
              exit={{ y: "110%" }}
              initial={{ y: "110%" }}
              role="group"
              transition={spring}
            >
              <div className="mx-auto max-w-xl">
                <div className="flex items-center gap-2 px-1 pb-3">
                  <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                    <span className="font-medium text-foreground">{title[field]}</span>
                    {" · "}
                    {found.set.type === "warmup" ? "Warm-up" : `Set ${found.entry.sets.slice(0, found.setIndex + 1).filter((x: any) => x.type !== "warmup").length}`}
                    {" · "}
                    {exerciseName(found.entry.exerciseId)}
                  </p>
                  <button aria-label="Hide number pad" className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground" onClick={closePad} type="button">
                    <ChevronDown className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
                <KeyGrid
                  decimal={Boolean("decimal" in config && config.decimal)}
                  onKey={press}
                  side={[
                    <Key key="m" label={`Minus ${stepLabel}`} onPress={() => press("minus")} variant="fn">
                      −{stepLabel}
                    </Key>,
                    <Key key="p" label={`Plus ${stepLabel}`} onPress={() => press("plus")} variant="fn">
                      +{stepLabel}
                    </Key>,
                    target.field === "weight" ? (
                      <Key key="pl" label="Plate calculator" onPress={() => setPlates(true)} variant="fn">
                        <PlateGlyph />
                      </Key>
                    ) : (
                      <Key disabled key="pl" variant="fn" />
                    ),
                    <Key key="n" onPress={next} variant="go">
                      Next
                    </Key>
                  ]}
                />
                <div className="h-2" />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <PlatesSheet equipment={found ? exerciseIndex.value.get(found.entry.exerciseId)?.equipment : undefined} onClose={() => setPlates(false)} open={plates} weight={target ? currentValue(target) : 0} />
    </>,
    document.body
  );
}

function PlateGlyph() {
  return (
    <svg aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M2 12h20M6.5 7.5v9M9.5 5v14M14.5 5v14M17.5 7.5v9" />
    </svg>
  );
}
