import { useEffect, useState } from "react";
import { View } from "react-native";
import { colors, spaces, space } from "../theme/tokens";
import { Button } from "./Button";
import { Tap } from "./Pressable";
import { T } from "./Text";

/* V1.5.3 mechanic of the Marées (map of currents), the Forge (order of pieces) or the Aurores (beacons to link), same view model
   as the website (core/web/adventure-campaigns.js). One token per slot; the answer stays local until it is sent, and the board
   starts from the last answer the server recorded, so a correction only changes what was wrong. */
export type MechanicAction = {
  kind: "solve"; primitive: "chart" | "sequence" | "link"; distinct: boolean; submit: string; note: string; incomplete: string; usedLabel: string;
  slots: { id: string; index: number; label: string; last: string | null; options: { id: string; label: string }[] }[];
};
const TITLE: Record<string, string> = { chart: "Carte des courants", sequence: "Ordre de montage", link: "Balises reliées" };

export function boardText(a: MechanicAction, list: (string | null)[]) {
  const name = (i: number) => a.slots[i].options.find(o => o.id === list[i])?.label ?? "—";
  if (a.primitive === "chart") return a.slots.map((s, i) => `${s.label} : ${name(i)}`).join(" · ");
  return a.slots.map((_, i) => a.primitive === "sequence" ? `${i + 1}. ${name(i)}` : name(i)).join(a.primitive === "link" ? " — " : " → ");
}

export function AdventureMechanic({ action, busy, online, onSolve, resetKey }: {
  action: MechanicAction; busy: boolean; online: boolean; onSolve: (answer: string[]) => void; resetKey: string;
}) {
  const [list, setList] = useState<(string | null)[]>(action.slots.map(s => s.last));
  const [hint, setHint] = useState("");
  // A new server answer (this device or another one) puts its last answer back on the board.
  useEffect(() => { setList(action.slots.map(s => s.last)); setHint(""); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (i: number, id: string) => { setHint(""); setList(prev => prev.map((x, k) => k === i ? id : x)); };
  const submit = () => {
    if (list.some(x => !x)) { setHint(action.incomplete); return; }
    onSolve(list as string[]);
  };
  return <View testID={`mechanic-${action.primitive}`} style={{ gap: space.s2 }}>
    {action.slots.map((slot, i) => <View key={slot.id} testID={`mechanic-slot-${slot.id}`} accessibilityRole="radiogroup" accessibilityLabel={slot.label} style={{ gap: 6 }}>
      <T variant="bodyStrong">{action.primitive === "chart" ? "" : `${slot.index}. `}{slot.label}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {slot.options.map(o => {
          const checked = list[i] === o.id, used = action.distinct && list.some((x, k) => k !== i && x === o.id);
          return <Tap key={o.id} testID={`mechanic-${slot.id}-${o.id}`} accessibilityRole="radio" accessibilityState={{ checked, disabled: busy }}
            accessibilityLabel={`${o.label}${used ? ` (${action.usedLabel})` : ""}`} disabled={busy} onPress={() => pick(i, o.id)}
            style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderRadius: 20, borderWidth: 1,
              borderColor: checked ? spaces.aventure.accent : colors.line3, backgroundColor: checked ? spaces.aventure.soft : "transparent", opacity: used ? 0.6 : 1 }}>
            <T variant={checked ? "bodyStrong" : "body"}>{o.label}{used ? ` (${action.usedLabel})` : ""}</T>
          </Tap>;
        })}
      </View>
    </View>)}
    <T testID="mechanic-board" accessibilityLiveRegion="polite" variant="small">{TITLE[action.primitive]} · {boardText(action, list)}</T>
    {hint ? <T testID="mechanic-incomplete" accessibilityRole="alert" tone="warn">{hint}</T> : null}
    <Button label={action.submit} onPress={submit} disabled={!online} loading={busy} />
    <T variant="caption">{action.note}</T>
  </View>;
}
