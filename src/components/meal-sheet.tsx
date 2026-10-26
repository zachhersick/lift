// Add or edit a meal by hand. Meals from ChatGPT open here too, so a wrong
// estimate can be fixed. The number pad types into whichever value is picked.
import { Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Row, Sheet, SheetAction } from "@/components/kit";
import { Key, KeyGrid } from "@/components/keypad";
import { Button } from "@/components/ui/button";
import { ask } from "@/lib/dialogs";
import { dateKey, fromDateKey } from "@/lib/model.js";
import { remove, saveMeal } from "@/lib/store.js";
import { cn } from "@/lib/utils";

const VALUES = [
  { key: "calories", label: "Calories", unit: "kcal", step: 50 },
  { key: "protein", label: "Protein", unit: "g", step: 5 },
  { key: "carbs", label: "Carbs", unit: "g", step: 5 },
  { key: "fat", label: "Fat", unit: "g", step: 5 }
] as const;
type Value = (typeof VALUES)[number]["key"];
const EMPTY = { calories: "", protein: "", carbs: "", fat: "" } as Record<Value, string>;

const text = (n: unknown) => (n === null || n === undefined || n === "" ? "" : String(Math.round(Number(n) * 10) / 10));

export function MealSheet({ open, onClose, meal = null, date }: { open: boolean; onClose: () => void; meal?: any; date?: string }) {
  const [name, setName] = useState("");
  const [day, setDay] = useState(dateKey());
  const [values, setValues] = useState(EMPTY);
  const [field, setField] = useState<Value>("calories");
  useEffect(() => {
    if (!open) return;
    setName(meal?.name || "");
    setDay(meal?.date || date || dateKey());
    setValues(meal ? { calories: text(meal.calories), protein: text(meal.protein), carbs: text(meal.carbs), fat: text(meal.fat) } : EMPTY);
    setField("calories");
  }, [open]);

  const config = VALUES.find((v) => v.key === field)!;
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
    await saveMeal({ ...(meal || {}), name: name.trim(), date: day, eatenAt, calories: number(values.calories), protein: number(values.protein), carbs: number(values.carbs), fat: number(values.fat) });
    onClose();
  };
  const next = () => {
    const index = VALUES.findIndex((v) => v.key === field);
    if (index < VALUES.length - 1) setField(VALUES[index + 1].key);
    else submit();
  };

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
          <input aria-label="Date" className="bg-transparent text-right text-[15.5px] text-primary outline-none" max={dateKey()} onChange={(e) => e.currentTarget.value && setDay(e.currentTarget.value)} type="date" value={day} />
        </Row>
      </Card>

      {meal?.items?.length ? (
        <Card className="flex flex-col gap-1.5 p-4 text-[14px]">
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
            {meal.source === "chatgpt" ? <Sparkles className="size-3.5" strokeWidth={2.4} /> : null}
            {meal.source === "chatgpt" ? "Estimated by ChatGPT" : "Items"}
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
        {VALUES.map((v) => (
          <button
            aria-checked={field === v.key}
            aria-label={v.label}
            className={cn("flex flex-col items-center gap-0.5 rounded-2xl bg-muted px-1 py-2.5 ring-2 ring-transparent transition-colors", field === v.key && "bg-primary/12 ring-primary")}
            key={v.key}
            onClick={() => setField(v.key)}
            role="radio"
            type="button"
          >
            <span className="text-[12px] font-medium text-muted-foreground">{v.label}</span>
            <span className={cn("text-[20px] leading-tight font-semibold tabular", values[v.key] === "" && "text-muted-foreground/40")}>{values[v.key] || "0"}</span>
            <span className="text-[11px] text-muted-foreground">{v.unit}</span>
          </button>
        ))}
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
            {field === "fat" ? "Save" : "Next"}
          </Key>
        ]}
      />

      {meal ? (
        <Button
          onClick={async () => {
            if (await ask({ title: "Delete meal?", message: meal.source === "chatgpt" ? "It stays in your ChatGPT chat; only Lift's copy is removed." : undefined, confirm: "Delete", danger: true })) {
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
