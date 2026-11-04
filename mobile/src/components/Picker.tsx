import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { addMonths, allowed, monthGrid, monthReachable, MONTHS, sameDay, startOfDay, WEEKDAYS, withDay, withTime } from "../lib/calendar";
import { haptic } from "../lib/haptics";
import { colors, radius, space, TOUCH } from "../theme/tokens";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { Sheet } from "./Sheet";
import { T } from "./Text";

/* TITAN's own date and time pickers: a calendar and two wheels in a TITAN sheet, instead of Android's system dialogs.
   The signature is the one of the system picker's `open`, so a call site only changes its import:
   DateTimePickerAndroid.open({ value, mode: "date" | "time", maximumDate, minimumDate, onChange: (event, date) => … }). */

export type PickerEvent = { type: "set" | "dismissed" };
export type PickerRequest = { value: Date; mode: "date" | "time"; maximumDate?: Date; minimumDate?: Date; is24Hour?: boolean; onChange: (event: PickerEvent, date?: Date) => void };

let current: PickerRequest | null = null;
let listener: ((r: PickerRequest | null) => void) | null = null;
let hosted = 0;

export const DateTimePickerAndroid = {
  open(request: PickerRequest) {
    current = request;
    if (hosted) listener?.(request);
    else {
      // No host mounted (isolated tests): answer "dismissed" rather than hang, the form keeps its previous value.
      current = null;
      request.onChange({ type: "dismissed" });
    }
  },
};

export function PickerHost() {
  const [req, setReq] = useState<PickerRequest | null>(null);
  useEffect(() => {
    hosted += 1;
    listener = setReq;
    return () => {
      hosted -= 1;
      if (listener === setReq) listener = null;
    };
  }, []);
  const finish = (date?: Date) => {
    const r = req;
    current = null;
    setReq(null);
    if (r) r.onChange(date ? { type: "set" } : { type: "dismissed" }, date);
  };
  if (!req) return null;
  return req.mode === "date" ? <DateSheet key={`d${req.value.getTime()}`} req={req} onDone={finish} /> : <TimeSheet key={`t${req.value.getTime()}`} req={req} onDone={finish} />;
}

/* ---------------------------------- date ---------------------------------- */

export function DateSheet({ req, onDone }: { req: PickerRequest; onDone: (d?: Date) => void }) {
  const [picked, setPicked] = useState(startOfDay(req.value));
  const [view, setView] = useState({ year: req.value.getFullYear(), month: req.value.getMonth() });
  const weeks = monthGrid(view.year, view.month);
  const today = new Date();
  const prev = addMonths(view.year, view.month, -1);
  const next = addMonths(view.year, view.month, 1);
  const canPrev = monthReachable(prev.year, prev.month, req.minimumDate, req.maximumDate);
  const canNext = monthReachable(next.year, next.month, req.minimumDate, req.maximumDate);
  const todayOk = allowed(today, req.minimumDate, req.maximumDate);
  return (
    <Sheet
      visible
      onClose={() => onDone()}
      title="Choisis le jour"
      footer={
        <View style={styles.footer}>
          {todayOk ? <Button kind="ghost" label="Aujourd’hui" onPress={() => { setPicked(startOfDay(today)); setView({ year: today.getFullYear(), month: today.getMonth() }); }} style={{ flex: 1 }} testID="picker-today" /> : null}
          <Button label="Valider" icon="check" onPress={() => onDone(withDay(req.value, picked))} style={{ flex: 1.4 }} testID="picker-ok" />
        </View>
      }
    >
      <View style={styles.monthRow}>
        <Tap onPress={() => canPrev && setView(prev)} disabled={!canPrev} accessibilityLabel="Mois précédent" style={styles.arrow} testID="picker-prev">
          <Icon name="chevronLeft" size={22} color={canPrev ? colors.tx : colors.tx4} />
        </Tap>
        <T variant="h3" center style={{ flex: 1 }} accessibilityLiveRegion="polite" testID="picker-month">
          {MONTHS[view.month]} {view.year}
        </T>
        <Tap onPress={() => canNext && setView(next)} disabled={!canNext} accessibilityLabel="Mois suivant" style={styles.arrow} testID="picker-next">
          <Icon name="chevron" size={22} color={canNext ? colors.tx : colors.tx4} />
        </Tap>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <T key={i} variant="caption" tone="faint" center style={{ flex: 1 }}>
            {d}
          </T>
        ))}
      </View>
      {weeks.map((row, w) => (
        <View key={w} style={styles.week}>
          {row.map((day, i) => {
            if (!day) return <View key={i} style={styles.cell} />;
            const ok = allowed(day, req.minimumDate, req.maximumDate);
            const on = sameDay(day, picked);
            const isToday = sameDay(day, today);
            return (
              <Tap
                key={i}
                disabled={!ok}
                haptics={false}
                onPress={() => {
                  haptic("selection");
                  setPicked(day);
                }}
                accessibilityLabel={`${day.getDate()} ${MONTHS[day.getMonth()]}${isToday ? ", aujourd’hui" : ""}`}
                accessibilityState={{ selected: on, disabled: !ok }}
                style={[styles.cell, on && styles.cellOn, !on && isToday && styles.cellToday, !ok && { opacity: 0.3 }]}
                testID={`picker-day-${day.getDate()}`}
              >
                <T variant="bodyStrong" color={on ? colors.cyInk : colors.tx} center>
                  {day.getDate()}
                </T>
              </Tap>
            );
          })}
        </View>
      ))}
    </Sheet>
  );
}

/* ---------------------------------- time ---------------------------------- */

const ITEM = 48;
const VISIBLE = 5;

/** A snapping wheel: the centred row is the value. Tapping a row also selects it (no precise flick needed). */
function Wheel({ count, value, onChange, label, format = (n: number) => String(n).padStart(2, "0"), testID }: { count: number; value: number; onChange: (n: number) => void; label: string; format?: (n: number) => string; testID: string }) {
  const ref = useRef<ScrollView>(null);
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM)));
    if (i !== value) {
      haptic("selection");
      onChange(i);
    }
  };
  return (
    <View style={styles.wheelBox} accessibilityLabel={label} accessibilityRole="adjustable" accessibilityValue={{ text: format(value) }} testID={testID}>
      <View style={styles.band} pointerEvents="none" />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: value * ITEM }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        contentContainerStyle={{ paddingVertical: ITEM * Math.floor(VISIBLE / 2) }}
        nestedScrollEnabled
      >
        {Array.from({ length: count }, (_, n) => (
          <Tap
            key={n}
            haptics={false}
            onPress={() => {
              ref.current?.scrollTo({ y: n * ITEM, animated: true });
              if (n !== value) {
                haptic("selection");
                onChange(n);
              }
            }}
            accessibilityLabel={`${label} ${format(n)}`}
            accessibilityState={{ selected: n === value }}
            style={styles.wheelItem}
            testID={`${testID}-${n}`}
          >
            <T variant={n === value ? "h2" : "title"} tone={n === value ? "default" : "faint"} center>
              {format(n)}
            </T>
          </Tap>
        ))}
      </ScrollView>
    </View>
  );
}

export function TimeSheet({ req, onDone }: { req: PickerRequest; onDone: (d?: Date) => void }) {
  const [h, setH] = useState(req.value.getHours());
  const [m, setM] = useState(req.value.getMinutes());
  return (
    <Sheet visible onClose={() => onDone()} title="Choisis l’heure" footer={<Button label="Valider" icon="check" onPress={() => onDone(withTime(req.value, h, m))} testID="picker-ok" />}>
      <View style={styles.wheels}>
        <Wheel count={24} value={h} onChange={setH} label="Heures" testID="wheel-h" />
        <T variant="h2" tone="faint">
          :
        </T>
        <Wheel count={60} value={m} onChange={setM} label="Minutes" testID="wheel-m" />
      </View>
    </Sheet>
  );
}

const CELL = 44;
const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space.s3, alignItems: "center" },
  monthRow: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  arrow: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center" },
  week: { flexDirection: "row", gap: 4 },
  cell: { flex: 1, height: CELL, borderRadius: radius.r2, alignItems: "center", justifyContent: "center" },
  cellOn: { backgroundColor: colors.cy },
  cellToday: { borderWidth: 1, borderColor: colors.cyLine },
  wheels: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s4, paddingVertical: space.s2 },
  wheelBox: { width: 112, height: ITEM * VISIBLE, borderRadius: radius.r3, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  band: { position: "absolute", left: 6, right: 6, top: ITEM * Math.floor(VISIBLE / 2), height: ITEM, borderRadius: radius.r2, backgroundColor: colors.cySoft, borderWidth: 1, borderColor: colors.cyLine },
  wheelItem: { height: ITEM, alignItems: "center", justifyContent: "center" },
});
