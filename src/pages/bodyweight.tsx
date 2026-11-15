// Bodyweight: log a weigh-in on the number pad, and a chart with a 7-day
// moving average. One entry per day; logging the same day again replaces it.
import { Plus, Scale, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LineChart } from "@/components/chart";
import { Card, Empty, FadeIn, Page, Row, Section, Segmented, Sheet, SheetAction, StatTiles, TopBar } from "@/components/kit";
import { Key, KeyGrid } from "@/components/keypad";
import { Button } from "@/components/ui/button";
import { ask } from "@/lib/dialogs";
import { dateKey, fromDateKey, movingAverage } from "@/lib/model.js";
import { bodyweights, logBodyweight, remove, settings } from "@/lib/store.js";
import * as format from "@/lib/format.js";
import { useValue } from "@/lib/use-signal";

export function BodyweightSheet({ open, onClose, entry = null }: { open: boolean; onClose: () => void; entry?: any }) {
  const s = useValue(settings) as any;
  const entries = useValue(bodyweights) as any[];
  const last = entries[0];
  const [text, setText] = useState("");
  const [date, setDate] = useState(dateKey());
  useEffect(() => {
    if (!open) return;
    setText(entry ? String(entry.weight) : "");
    setDate(entry ? entry.date : dateKey());
  }, [open]);
  const step = s.unit === "kg" ? 0.1 : 0.2;
  const placeholder = last ? format.weight(last.weight) : s.unit === "kg" ? "80" : "180";
  const value = text === "" ? null : Number(text);

  const key = (k: string) => {
    if (/^\d$/.test(k)) setText((t) => (t.replace(".", "").length >= 5 ? t : t === "0" ? k : t + k));
    else if (k === ".") setText((t) => (t.includes(".") ? t : `${t || "0"}.`));
    else if (k === "back") setText((t) => t.slice(0, -1));
    else if (k === "minus" || k === "plus") {
      const base = value ?? Number(placeholder);
      setText(String(Math.max(0, Math.round((base + (k === "plus" ? step : -step)) * 10) / 10)));
    }
  };

  const saveIt = async () => {
    const weight = value ?? (last ? last.weight : null);
    if (!weight) return;
    if (entry && entry.date !== date) await remove(entry.id);
    await logBodyweight(weight, date);
    onClose();
  };

  return (
    <Sheet
      left={<SheetAction onClick={onClose}>Cancel</SheetAction>}
      onClose={onClose}
      open={open}
      right={
        <SheetAction bold disabled={value === null && !last} onClick={saveIt}>
          Save
        </SheetAction>
      }
      title={entry ? "Edit weigh-in" : "Log bodyweight"}
    >
      <div className="py-2 text-center">
        <span className={text ? "text-[60px] leading-none font-medium tabular" : "text-[60px] leading-none font-medium text-muted-foreground/40 tabular"}>{text || placeholder}</span>
        <span className="ml-2 text-[22px] font-medium text-muted-foreground">{s.unit}</span>
      </div>
      <Card>
        <Row title="Date">
          <input aria-label="Date" className="bg-transparent text-right text-[15px] text-primary outline-none" max={dateKey()} onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} type="date" value={date} />
        </Row>
      </Card>
      <KeyGrid
        onKey={key}
        side={[
          <Key key="m" label={`Minus ${step}`} onPress={() => key("minus")} variant="fn">
            −{step}
          </Key>,
          <Key key="p" label={`Plus ${step}`} onPress={() => key("plus")} variant="fn">
            +{step}
          </Key>,
          <Key disabled key="x" variant="fn" />,
          <Key key="s" onPress={saveIt} variant="go">
            Save
          </Key>
        ]}
      />
      {entry ? (
        <Button
          onClick={async () => {
            if (await ask({ title: "Delete weigh-in?", confirm: "Delete", danger: true })) {
              await remove(entry.id);
              onClose();
            }
          }}
          variant="destructive"
        >
          <Trash2 className="size-4" /> Delete weigh-in
        </Button>
      ) : null}
    </Sheet>
  );
}

const RANGES = [
  { value: 30, label: "1M" },
  { value: 90, label: "3M" },
  { value: 365, label: "1Y" },
  { value: 0, label: "All" }
];

export function BodyweightPage() {
  const entries = useValue(bodyweights) as any[];
  const s = useValue(settings) as any;
  const [sheet, setSheet] = useState<any>(null);
  const [range, setRange] = useState(90);
  const avg = useMemo(() => movingAverage(entries), [entries]) as any[];
  const from = range ? dateKey(Date.now() - range * 86_400_000) : "";
  const shown = [...entries].reverse().filter((p) => p.date >= from);
  const shownAvg = avg.filter((p) => p.date >= from);
  const latestAvg = avg[avg.length - 1]?.value;
  const monthAgo = [...entries].reverse().filter((p) => p.date <= dateKey(Date.now() - 30 * 86_400_000)).pop();
  const change = entries.length && monthAgo ? entries[0].weight - monthAgo.weight : null;

  return (
    <Page>
      <TopBar
        backLabel="Progress"
        backTo="progress"
        title="Bodyweight"
        trailing={
          <button aria-label="Log bodyweight" className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground" onClick={() => setSheet("new")} type="button">
            <Plus className="size-5" strokeWidth={1.75} />
          </button>
        }
      />
      {!entries.length ? (
        <Empty action={<Button onClick={() => setSheet("new")} variant="tinted">Log bodyweight</Button>} icon={Scale} title="No weigh-ins yet">
          Log your weight to see the trend. The 7-day average smooths out daily swings.
        </Empty>
      ) : (
        <>
          <FadeIn className="flex flex-col gap-3">
            <Card className="p-4">
              <LineChart caption="Latest" decimals={1} points={shown.map((p) => ({ x: fromDateKey(p.date), y: p.weight }))} secondary={shownAvg.map((p) => ({ x: fromDateKey(p.date), y: p.value }))} unit={s.unit} />
            </Card>
            <Segmented label="Range" onChange={setRange} options={RANGES} size="sm" value={range} />
          </FadeIn>
          <StatTiles
            items={[
              { label: "Latest", value: format.weight(entries[0].weight), unit: s.unit },
              { label: "7-day avg", value: format.weight(Math.round(latestAvg * 10) / 10), unit: s.unit },
              { label: "30 days", value: change === null ? "–" : `${change > 0 ? "+" : ""}${format.weight(Math.round(change * 10) / 10)}`, unit: change === null ? undefined : s.unit }
            ]}
          />
          <Section footer="The dashed line on the chart is your 7-day average." title="All weigh-ins">
            <Card className="divide-y divide-border">
              {entries.map((e) => (
                <Row chevron key={e.id} onClick={() => setSheet(e)} title={format.date(fromDateKey(e.date), { weekday: "short", month: "short", day: "numeric", year: "numeric" })} value={`${format.weight(e.weight)} ${s.unit}`} />
              ))}
            </Card>
          </Section>
        </>
      )}
      <BodyweightSheet entry={sheet && sheet !== "new" ? sheet : null} onClose={() => setSheet(null)} open={sheet !== null} />
    </Page>
  );
}
