// The app's building blocks: page frame and header, sections, cards, list
// rows, segmented controls, toggles, steppers, sheets and empty states.
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { type ComponentType, type ReactNode, useId, useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import BackgroundPaths from "@/components/kokonutui/background-paths";
import { back } from "@/lib/router.js";
import { haptic } from "@/lib/haptics.js";
import { cn } from "@/lib/utils";

export const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
export const softSpring = { type: "spring", stiffness: 260, damping: 30 } as const;

// ---------- page frame ----------

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex w-full max-w-xl flex-col gap-7 px-4 pb-36", className)}>{children}</div>;
}

/** Large title that hands off to a compact glass bar once it scrolls away. */
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
          className="glass pointer-events-none absolute inset-0 border-x-0 border-t-0"
          initial={false}
          transition={{ duration: 0.2 }}
        />
        <div className="relative grid h-12 grid-cols-[1fr_auto_1fr] items-center px-2">
          <div className="flex min-w-0 items-center">
            {backTo !== undefined ? (
              <button
                aria-label={`Back to ${backLabel}`}
                className="flex h-10 min-w-0 items-center gap-0.5 rounded-full pr-3 pl-1 text-primary active:opacity-60"
                onClick={() => back(backTo)}
                type="button"
              >
                <ChevronLeft className="size-6 shrink-0" strokeWidth={2.4} />
                <span className="truncate text-[15px] font-medium">{backLabel}</span>
              </button>
            ) : null}
          </div>
          <motion.div
            animate={{ opacity: compact ? 1 : 0, y: compact ? 0 : 6 }}
            className="max-w-[55vw] truncate text-center text-[15px] font-semibold"
            initial={false}
          >
            {title}
          </motion.div>
          <div className="flex items-center justify-end gap-1 pr-1">{trailing}</div>
        </div>
      </header>
      {large ? (
        <motion.div animate={{ opacity: 1, y: 0 }} className="-mt-4 px-1" initial={{ opacity: 0, y: 8 }} transition={softSpring}>
          {eyebrow ? <p className="mb-1 text-[13px] font-medium text-muted-foreground">{eyebrow}</p> : null}
          {children ?? <h1 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.03em]">{title}</h1>}
          {subtitle ? <p className="mt-1 text-[15px] text-muted-foreground">{subtitle}</p> : null}
        </motion.div>
      ) : null}
    </>
  );
}

// ---------- sections and cards ----------

export function Section({ title, action, footer, children, className }: { title?: ReactNode; action?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title || action ? (
        <div className="flex items-baseline justify-between gap-3 px-1">
          {title ? <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h2> : <span />}
          {action ? <div className="text-[14px] text-muted-foreground">{action}</div> : null}
        </div>
      ) : null}
      {children}
      {footer ? <p className="px-1 text-[13px] leading-snug text-muted-foreground">{footer}</p> : null}
    </section>
  );
}

export function Card({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("surface overflow-hidden rounded-3xl", className)} {...props}>
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
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary", iconClass)}>
          <Icon className="size-[18px]" strokeWidth={2.2} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        {title !== undefined ? (
          <span className={cn("truncate text-[15.5px] font-medium", tone === "action" && "text-primary", tone === "danger" && "text-destructive")}>{title}</span>
        ) : null}
        {subtitle ? <span className="truncate text-[13.5px] text-muted-foreground">{subtitle}</span> : null}
      </span>
      {value !== undefined && value !== null ? <span className="shrink-0 text-right text-[15px] text-muted-foreground tabular">{value}</span> : null}
      {children}
      {chevron ? <ChevronRight className="-mr-1 size-[18px] shrink-0 text-muted-foreground/60" strokeWidth={2.4} /> : null}
    </>
  );
  const classes = cn(
    "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors",
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
    <div aria-label={label} className={cn("relative flex rounded-full bg-muted p-1", className)} role="radiogroup">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            aria-checked={on}
            className={cn(
              "relative z-10 flex-1 rounded-full px-3 font-medium whitespace-nowrap transition-colors",
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
            {on ? <motion.span className="absolute inset-0 -z-10 rounded-full bg-card shadow-sm ring-1 ring-border dark:bg-white/12" layoutId={`seg-${id}`} transition={spring} /> : null}
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
      <motion.span animate={{ x: checked ? 20 : 0 }} className="block size-[27px] rounded-full bg-white shadow-md" transition={spring} />
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, label, format = (v: number) => String(v) }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; label: string; format?: (v: number) => string }) {
  return (
    <div aria-label={label} className="flex items-center gap-1 rounded-full bg-muted p-1" role="group">
      <button aria-label={`Fewer ${label}`} className="grid size-8 place-items-center rounded-full active:bg-accent disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} type="button">
        <Minus className="size-4" strokeWidth={2.6} />
      </button>
      <span className="min-w-9 text-center text-[15px] font-semibold tabular">{format(value)}</span>
      <button aria-label={`More ${label}`} className="grid size-8 place-items-center rounded-full active:bg-accent disabled:opacity-30" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} type="button">
        <Plus className="size-4" strokeWidth={2.6} />
      </button>
    </div>
  );
}

export function Chip({ on, children, onClick, className }: { on?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      className={cn(
        "h-9 shrink-0 rounded-full px-3.5 text-[14px] font-medium transition-colors",
        on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground active:bg-accent",
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
      <DrawerContent className={cn("rounded-t-[28px]! border-border bg-popover pb-safe outline-none", tall ? "h-[92dvh] max-h-[92dvh]!" : "max-h-[92dvh]!")}>
        <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
          <div className="justify-self-start">{left}</div>
          <DrawerTitle className="max-w-[55vw] truncate text-center text-[16px] font-semibold">{title}</DrawerTitle>
          <div className="justify-self-end">
            {right === undefined ? (
              <button aria-label="Close" className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground active:bg-accent" onClick={onClose} type="button">
                <X className="size-4" strokeWidth={2.6} />
              </button>
            ) : (
              right
            )}
          </div>
        </div>
        <DrawerDescription className="sr-only">{description || (typeof title === "string" ? title : "Sheet")}</DrawerDescription>
        <div className={cn("flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-1 pb-6", className)} data-vaul-no-drag>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function SheetAction({ children, onClick, bold, disabled }: { children: ReactNode; onClick: () => void; bold?: boolean; disabled?: boolean }) {
  return (
    <button className={cn("h-9 rounded-full px-3 text-[15px] text-primary active:opacity-60 disabled:opacity-35", bold && "font-semibold")} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

// ---------- empty states ----------

export function Empty({ icon: Icon, title, children, action }: { icon: IconType; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="relative">
      <BackgroundPaths className="absolute inset-0 min-h-0 bg-transparent text-primary opacity-50 dark:bg-transparent dark:text-primary" count={16} interactive={false} speed={0.4}>
        {null}
      </BackgroundPaths>
      <div className="relative flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span className="mb-2 grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Icon className="size-7" strokeWidth={2} />
        </span>
        <h3 className="text-[20px] font-semibold tracking-tight">{title}</h3>
        {children ? <p className="max-w-72 text-[14.5px] text-muted-foreground">{children}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
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
          <span className="truncate text-[12.5px] font-medium text-muted-foreground">{item.label}</span>
          <span className="truncate text-[22px] leading-tight font-semibold tracking-tight tabular">
            {item.value}
            {item.unit ? <span className="ml-0.5 text-[13px] font-medium text-muted-foreground">{item.unit}</span> : null}
          </span>
          {item.sub ? <span className="truncate text-[12px] text-muted-foreground">{item.sub}</span> : null}
        </Card>
      ))}
    </div>
  );
}

export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div animate={{ opacity: 1, y: 0 }} className={className} initial={{ opacity: 0, y: 14 }} transition={{ ...softSpring, delay }}>
      {children}
    </motion.div>
  );
}

export { AnimatePresence, motion };
