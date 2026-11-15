// Renders the promise-based dialogs from lib/dialogs.ts: a centered
// card that scales in, with its buttons stacked on small screens.
import { AnimatePresence, motion } from "motion/react";
import { alertState } from "@/lib/dialogs";
import { useValue } from "@/lib/use-signal";
import { cn } from "@/lib/utils";

export function AlertHost() {
  const a = useValue(alertState);
  const close = (value: unknown) => {
    if (!a) return;
    alertState.value = null;
    a.resolve(value);
  };
  const cancelValue = a?.actions.find((x) => x.style === "cancel")?.value ?? false;
  const ordered = a ? [...a.actions.filter((x) => x.style !== "cancel"), ...a.actions.filter((x) => x.style === "cancel")] : [];
  return (
    <AnimatePresence>
      {a ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-6"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          key="alert"
          onClick={(e) => e.target === e.currentTarget && close(cancelValue)}
        >
          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            aria-label={a.title}
            aria-modal="true"
            className="w-full max-w-[320px] rounded-[20px] bg-popover p-5 shadow-[0_8px_24px_rgba(0,0,0,0.16)] ring-1 ring-border"
            exit={{ scale: 0.96, opacity: 0 }}
            initial={{ scale: 0.9, opacity: 0, y: 8 }}
            role="alertdialog"
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="text-[19px] font-medium">{a.title}</h2>
            {a.message ? <p className="mt-1.5 text-[14px] leading-snug whitespace-pre-line text-muted-foreground">{a.message}</p> : null}
            <div className="mt-5 flex flex-col gap-2">
              {ordered.map((action) => (
                <button
                  className={cn(
                    "h-12 rounded-2xl text-[15px] font-medium active:scale-[0.98]",
                    action.style === "danger" && "bg-destructive/15 text-destructive",
                    action.style === "primary" && "bg-primary text-primary-foreground",
                    action.style === "cancel" && "bg-muted text-foreground",
                    !action.style && "bg-muted text-foreground"
                  )}
                  key={action.label}
                  onClick={() => close(action.value)}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
