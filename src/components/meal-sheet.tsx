// Add or edit a meal by hand. Meals from an assistant open here too, so a wrong
// estimate can be fixed. The number pad types into whichever value is picked:
// calories and macros, or any micronutrient under "Micronutrients". A
// micronutrient left blank is unknown, not zero.
import { ChevronDown, MessageSquareText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Row, Sheet, SheetAction } from "@/components/kit";
import { Key, KeyGrid } from "@/components/keypad";
import { Button } from "@/components/ui/button";
import { ask } from "@/lib/dialogs";
import { dateKey, fromAssistant, fromDateKey, MICROS, mealMicro } from "@/lib/model.js";
import { remove, saveMeal } from "@/lib/store.js";
import { cn } from "@/lib/utils";

type Value = { key: string; label: string; unit: string; step: number };
const MACRO_VALUES: Value[] = [
  { key: "calories", label: "Calories", unit: "kcal", step: 50 },
  { key: "protein", label: "Protein", unit: "g", step: 5 },
  { key: "carbs", label: "Carbs", unit: "g", step: 5 },
  { key: "fat", label: "Fat", unit: "g", step: 5 }
];
const MICRO_VALUES: Value[] = MICROS.map((micro: any) => ({ key: micro.key, label: micro.label, unit: micro.unit, step: micro.unit === "g" ? 1 : micro.unit === "mg" ? (micro.dv >= 1000 ? 100 : micro.dv >= 100 ? 10 : 1) : micro.dv >= 100 ? 50 : 1 }));
const ALL_VALUES = [...MACRO_VALUES, ...MICRO_VALUES];

const text = (n: unknown) => (n === null || n === undefined || n === "" ? "" : String(Math.round(Number(n) * 10) / 10));

function valuesOf(meal: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of MACRO_VALUES) out[v.key] = meal ? text(meal[v.key]) : "";
  for (const v of MICRO_VALUES) out[v.key] = meal ? text(mealMicro(meal, v.key)) : "";
  return out;
}

function Tile({ value, on, text: shown, small, onPick }: { value: Value; on: boolean; text: string; small?: boolean; onPick: () => void }) {
  return (
    <button
      aria-checked={on}
      aria-label={value.label}
      className={cn("flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-muted px-1 ring-2 ring-transparent transition-colors", small ? "py-2" : "py-2.5", on && "bg-card ring-primary")}
      onClick={onPick}
      role="radio"
      type="button"
    >
      <span className={cn("max-w-full truncate font-medium text-muted-foreground", small ? "text-[11px]" : "text-[12px]")}>{value.label}</span>
      <span className={cn("leading-tight font-medium tabular", small ? "text-[16px]" : "text-[20px]", shown === "" && "text-muted-foreground/40")}>{shown || (small ? "–" : "0")}</span>
      <span className="text-[11px] text-muted-foreground">{value.unit}</span>
    </button>
  );
}

export function MealSheet({ open, onClose, meal = null, date }: { open: boolean; onClose: () => void; meal?: any; date?: string }) {
  const [name, setName] = useState("");
  const [day, setDay] = useState(dateKey());
  const [values, setValues] = useState<Record<string, string>>(valuesOf(null));
  const [field, setField] = useState("calories");
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!open) return;
    const start = valuesOf(meal);
    setName(meal?.name || "");
    setDay(meal?.date || date || dateKey());
    setValues(start);
    setField("calories");
    setMore(MICRO_VALUES.some((v) => start[v.key] !== ""));
  }, [open]);

  const config = ALL_VALUES.find((v) => v.key === field)!;
  const key = (k: string) =>
    setValues((all) => {
      const t = all[field];
      let next = t;
      if (/^\d$/.test(k)) next = t.replace(".", "").length >= 5 ? t : t === "0" ? k : t + k;
      else if (k === ".") next = field === "calories" || t.includes(".") ? t : `${t || "0"}.`;
      else if (k === "back") next = t.slice(0, -1);
      else if (k === "minus" || k === "plus") next = String(Math.max(0, (Number(t) || 0) + (k === "plus" ? config.step : -config.step)));
      return { ...all, [field]: next };
    });

  const ready = Boolean(name.trim()) && values.calories !== "";
  const submit = async () => {
    if (!ready) return;
    // A meal added for another day sits at noon so it sorts sensibly.
    const eatenAt = meal?.eatenAt ?? (day === dateKey() ? Date.now() : fromDateKey(day) + 12 * 3_600_000);
    const number = (v: string) => (v === "" ? 0 : Number(v) || 0);
    const micros: Record<string, number> = {};
    for (const v of MICRO_VALUES) if (v.key !== "fiber" && values[v.key] !== "") micros[v.key] = Number(values[v.key]) || 0;
    const { fiber: _oldFiber, ...rest } = meal || {};
    await saveMeal({
      ...rest,
      name: name.trim(),
      date: day,
      eatenAt,
      calories: number(values.calories),
      protein: number(values.protein),
      carbs: number(values.carbs),
      fat: number(values.fat),
      ...(values.fiber !== "" ? { fiber: Number(values.fiber) || 0 } : {}),
      micros
    });
    onClose();
  };
  // Next walks the macros, then the micronutrients when they're open.
  const order = more ? ALL_VALUES : MACRO_VALUES;
  const index = order.findIndex((v) => v.key === field);
  const last = index === order.length - 1;
  const next = () => (last ? submit() : setField(order[index + 1].key));

  return (
    <Sheet
      left={<SheetAction onClick={onClose}>Cancel</SheetAction>}
      onClose={onClose}
      open={open}
      right={
        <SheetAction bold disabled={!ready} onClick={submit}>
          Save
        </SheetAction>
      }
      tall
      title={meal ? "Edit meal" : "Add meal"}
    >
      <Card>
        <Row>
          <input
            aria-label="Meal name"
            className="w-full bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="What did you eat?"
            value={name}
          />
        </Row>
        <Row className="border-t border-border" title="Date">
          <input aria-label="Date" className="bg-transparent text-right text-[15px] text-primary outline-none" max={dateKey()} onChange={(e) => e.currentTarget.value && setDay(e.currentTarget.value)} type="date" value={day} />
        </Row>
      </Card>

      {meal?.items?.length ? (
        <Card className="flex flex-col gap-1.5 p-4 text-[14px]">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            {fromAssistant(meal) ? <MessageSquareText className="size-3.5" strokeWidth={1.75} /> : null}
            {fromAssistant(meal) ? `Estimated by ${meal.source === "claude" ? "Claude" : "ChatGPT"}` : "Items"}
          </span>
          {meal.items.map((item: any, i: number) => (
            <div className="flex justify-between gap-3" key={i}>
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 text-muted-foreground">{[item.amount, item.calories != null ? `${Math.round(item.calories)} kcal` : ""].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
        </Card>
      ) : null}

      <div className="grid grid-cols-4 gap-2" role="radiogroup">
        {MACRO_VALUES.map((v) => (
          <Tile key={v.key} on={field === v.key} onPick={() => setField(v.key)} text={values[v.key]} value={v} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <button
          aria-expanded={more}
          className="flex items-center justify-between px-1 text-[14px] font-medium text-primary"
          onClick={() => {
            if (more && MICRO_VALUES.some((v) => v.key === field)) setField("calories");
            setMore(!more);
          }}
          type="button"
        >
          <span>Micronutrients{MICRO_VALUES.some((v) => values[v.key] !== "") ? ` · ${MICRO_VALUES.filter((v) => values[v.key] !== "").length} logged` : ""}</span>
          <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} strokeWidth={1.75} />
        </button>
        {more ? (
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {MICRO_VALUES.map((v) => (
              <Tile key={v.key} on={field === v.key} onPick={() => setField(v.key)} small text={values[v.key]} value={v} />
            ))}
          </div>
        ) : null}
      </div>

      <KeyGrid
        decimal={field !== "calories"}
        onKey={key}
        side={[
          <Key key="m" label={`Minus ${config.step}`} onPress={() => key("minus")} variant="fn">
            −{config.step}
          </Key>,
          <Key key="p" label={`Plus ${config.step}`} onPress={() => key("plus")} variant="fn">
            +{config.step}
          </Key>,
          <Key disabled key="x" variant="fn" />,
          <Key key="n" onPress={next} variant="go">
            {last ? "Save" : "Next"}
          </Key>
        ]}
      />

      {meal ? (
        <Button
          onClick={async () => {
            if (await ask({ title: "Delete meal?", message: fromAssistant(meal) ? "It stays in your chat; only Lift's copy is removed." : undefined, confirm: "Delete", danger: true })) {
              await remove(meal.id);
              onClose();
            }
          }}
          variant="destructive"
        >
          <Trash2 className="size-4" /> Delete meal
        </Button>
      ) : null}
    </Sheet>
  );
}
