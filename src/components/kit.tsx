// The app's building blocks: page frame and header, sections, cards, list
// rows, segmented controls, toggles, steppers, sheets and empty states.
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { type ComponentType, type ReactNode, useId, useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { back } from "@/lib/router.js";
import { haptic } from "@/lib/haptics.js";
import { cn } from "@/lib/utils";

// One easing curve for the whole app: short for feedback, longer for entrances.
export const ease = [0.22, 1, 0.36, 1] as const;
export const spring = { duration: 0.2, ease } as const;
export const softSpring = { duration: 0.36, ease } as const;

// ---------- page frame ----------

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pb-36", className)}>{children}</div>;
}

/** Large title that hands off to a compact bar once it scrolls away. */
export function TopBar({
  title,
  subtitle,
  eyebrow,
  backTo,
  backLabel = "Back",
  trailing,
  large = true,
  children
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  backTo?: string;
  backLabel?: string;
  trailing?: ReactNode;
  large?: boolean;
  children?: ReactNode;
}) {
  const { scrollY } = useScroll();
  const [compact, setCompact] = useState(!large);
  useMotionValueEvent(scrollY, "change", (y) => large && setCompact(y > 56));
  return (
    <>
      <header className="pt-safe sticky top-0 z-30 -mx-4">
        <motion.div
          animate={{ opacity: compact ? 1 : 0 }}
          className="pointer-events-none absolute inset-0 border-b border-border bg-background"
          initial={false}
          transition={{ duration: 0.2 }}
        />
        <div className="relative grid h-12 grid-cols-[1fr_auto_1fr] items-center px-2">
          <div className="flex min-w-0 items-center">
            {backTo !== undefined ? (
              <button
                aria-label={`Back to ${backLabel}`}
                className="flex h-10 min-w-0 items-center gap-1 rounded-[10px] pr-3 pl-1 text-primary transition-opacity active:opacity-60"
                onClick={() => back(backTo)}
                type="button"
              >
                <ChevronLeft className="size-5 shrink-0" strokeWidth={2} />
                <span className="truncate text-[15px]">{backLabel}</span>
              </button>
            ) : null}
          </div>
          <motion.div
            animate={{ opacity: compact ? 1 : 0, y: compact ? 0 : 4 }}
            className="max-w-[55vw] truncate text-center text-[15px] font-medium"
            initial={false}
            transition={spring}
          >
            {title}
          </motion.div>
          <div className="flex items-center justify-end gap-1 pr-1">{trailing}</div>
        </div>
      </header>
      {large ? (
        <motion.div animate={{ opacity: 1, y: 0 }} className="-mt-4 px-1" initial={{ opacity: 0, y: 6 }} transition={softSpring}>
          {eyebrow ? <p className="mb-1 text-[13px] text-muted-foreground">{eyebrow}</p> : null}
          {children ?? <h1 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.01em]">{title}</h1>}
          {subtitle ? <p className="mt-1 text-[15px] text-muted-foreground">{subtitle}</p> : null}
        </motion.div>
      ) : null}
    </>
  );
}

// ---------- sections and cards ----------

export function Section({ title, action, footer, children, className }: { title?: ReactNode; action?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {title || action ? (
        <div className="flex items-baseline justify-between gap-3 px-1 pb-1">
          {title ? <h2 className="text-[20px] leading-7 font-medium">{title}</h2> : <span />}
          {action ? <div className="text-[13px] text-muted-foreground">{action}</div> : null}
        </div>
      ) : null}
      {children}
      {footer ? <p className="px-1 pt-1 text-[13px] leading-5 text-muted-foreground">{footer}</p> : null}
    </section>
  );
}

export function Card({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("surface overflow-hidden rounded-2xl", className)} {...props}>
      {children}
    </div>
  );
}

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn("divide-y divide-border p-0", className)}>{children}</Card>;
}

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export function Row({
  icon: Icon,
  iconClass,
  title,
  subtitle,
  value,
  chevron,
  onClick,
  href,
  tone,
  disabled,
  children,
  className,
  label
}: {
  icon?: IconType;
  iconClass?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  href?: string;
  tone?: "action" | "danger";
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const body = (
    <>
      {Icon ? (
        <span className={cn("grid w-5 shrink-0 place-items-center text-muted-foreground", iconClass)}>
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        {title !== undefined ? (
          <span className={cn("truncate text-[15px]", tone === "action" && "text-primary", tone === "danger" && "text-destructive")}>{title}</span>
        ) : null}
        {subtitle ? <span className="truncate text-[13px] text-muted-foreground">{subtitle}</span> : null}
      </span>
      {value !== undefined && value !== null ? <span className="shrink-0 text-right text-[15px] text-muted-foreground tabular">{value}</span> : null}
      {children}
      {chevron ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} /> : null}
    </>
  );
  const classes = cn(
    "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors",
    (onClick || href) && "active:bg-accent",
    disabled && "pointer-events-none opacity-40",
    className
  );
  if (href) {
    return (
      <a aria-label={label} className={classes} href={href}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button aria-label={label} className={classes} disabled={disabled} onClick={onClick} type="button">
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}

// ---------- controls ----------

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
  size = "md"
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div aria-label={label} className={cn("relative flex rounded-xl bg-muted p-1", className)} role="radiogroup">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            aria-checked={on}
            className={cn(
              "relative z-10 flex-1 rounded-lg px-3 font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "h-8 text-[13px]" : "h-9 text-[14px]",
              on ? "text-foreground" : "text-muted-foreground"
            )}
            key={String(option.value)}
            onClick={() => {
              haptic(4);
              onChange(option.value);
            }}
            role="radio"
            type="button"
          >
            {on ? <motion.span className="absolute inset-0 -z-10 rounded-lg bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border dark:bg-accent" layoutId={`seg-${id}`} transition={spring} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn("relative h-[31px] w-[51px] shrink-0 rounded-full p-[2px] transition-colors duration-200", checked ? "bg-primary" : "bg-input")}
      onClick={() => {
        haptic(6);
        onChange(!checked);
      }}
      role="switch"
      type="button"
    >
      <motion.span animate={{ x: checked ? 20 : 0 }} className="block size-[27px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]" transition={spring} />
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, label, format = (v: number) => String(v) }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; label: string; format?: (v: number) => string }) {
  return (
    <div aria-label={label} className="flex items-center gap-1 rounded-[10px] bg-muted p-1" role="group">
      <button aria-label={`Fewer ${label}`} className="grid size-8 place-items-center rounded-md transition-colors active:bg-accent disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} type="button">
        <Minus className="size-4" strokeWidth={1.75} />
      </button>
      <span className="min-w-9 text-center text-[15px] font-medium tabular">{format(value)}</span>
      <button aria-label={`More ${label}`} className="grid size-8 place-items-center rounded-md transition-colors active:bg-accent disabled:opacity-30" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} type="button">
        <Plus className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function Chip({ on, children, onClick, className }: { on?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      className={cn(
        "h-9 shrink-0 rounded-[10px] px-3 text-[14px] font-medium transition-colors",
        on ? "bg-foreground text-background" : "bg-muted text-foreground active:bg-accent",
        className
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

// ---------- sheets ----------

/** A bottom sheet (vaul): drag to dismiss, header with optional actions. */
export function Sheet({
  open,
  onClose,
  title,
  description,
  left,
  right,
  tall,
  children,
  className
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: string;
  left?: ReactNode;
  right?: ReactNode;
  tall?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Drawer onOpenChange={(next) => !next && onClose()} open={open}>
      <DrawerContent className={cn("rounded-t-[20px]! border-border bg-popover pb-safe outline-none", tall ? "h-[92dvh] max-h-[92dvh]!" : "max-h-[92dvh]!")}>
        <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
          <div className="justify-self-start">{left}</div>
          <DrawerTitle className="max-w-[55vw] truncate text-center text-[15px] font-medium">{title}</DrawerTitle>
          <div className="justify-self-end">
            {right === undefined ? (
              <button aria-label="Close" className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground active:bg-accent" onClick={onClose} type="button">
                <X className="size-4" strokeWidth={1.75} />
              </button>
            ) : (
              right
            )}
          </div>
        </div>
        <DrawerDescription className="sr-only">{description || (typeof title === "string" ? title : "Sheet")}</DrawerDescription>
        {/* Children keep their height (*:shrink-0); otherwise a card with
            overflow-hidden collapses when the sheet's content scrolls. */}
        <div className={cn("flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-1 pb-6 *:shrink-0", className)} data-vaul-no-drag>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function SheetAction({ children, onClick, bold, disabled }: { children: ReactNode; onClick: () => void; bold?: boolean; disabled?: boolean }) {
  return (
    <button className={cn("h-9 rounded-[10px] px-3 text-[15px] text-primary transition-opacity active:opacity-60 disabled:opacity-35", bold && "font-medium")} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

// ---------- empty states ----------

export function Empty({ icon: Icon, title, children, action }: { icon: IconType; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <Icon className="mb-2 size-6 text-muted-foreground" strokeWidth={1.75} />
        <h3 className="text-[17px] font-medium">{title}</h3>
        {children ? <p className="max-w-72 text-[14px] leading-5 text-muted-foreground">{children}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </Card>
  );
}

// ---------- stats ----------

export function StatTiles({ items, className }: { items: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("grid gap-3", items.length === 4 ? "grid-cols-2" : "grid-cols-3", className)}>
      {items.map((item) => (
        <Card className="flex min-w-0 flex-col gap-1 p-4" key={item.label}>
          <span className="truncate text-[13px] text-muted-foreground">{item.label}</span>
          <span className="truncate text-[24px] leading-tight font-medium tabular">
            {item.value}
            {item.unit ? <span className="ml-1 text-[13px] text-muted-foreground">{item.unit}</span> : null}
          </span>
          {item.sub ? <span className="truncate text-[12px] text-muted-foreground">{item.sub}</span> : null}
        </Card>
      ))}
    </div>
  );
}

export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div animate={{ opacity: 1, y: 0 }} className={className} initial={{ opacity: 0, y: 8 }} transition={{ ...softSpring, delay: Math.min(delay, 0.2) }}>
      {children}
    </motion.div>
  );
}

export { AnimatePresence, motion };
