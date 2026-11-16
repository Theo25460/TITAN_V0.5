import { StyleSheet, View } from "react-native";
import { Format, Sports } from "../core";
import type { ProgramCell, ProgramSpan, ProgramWeek } from "../core/program";
import { Program } from "../core/program";
import { useSpace } from "../theme/space";
import { colors, familyColors, fonts, space } from "../theme/tokens";
import { Icon } from "./Icon";
import { T } from "./Text";

/* « Le programme », TITAN's signature figure: the practice laid out like the schedule of a sports meeting. One line per sport,
   one column per day (a week) or per week (a period). A cell is inked in the colour of the sport's family, darker when the day
   was long; a day still to come in the usual week is an empty frame; a past day without a session is a small dot. Rest is
   never drawn as a fault. The figure is one accessible element with a sentence, not forty unlabeled squares. */

const INK = [0, 0.34, 0.56, 0.78, 1];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function Cell({ cell, color, planned, future, mark }: { cell: ProgramCell; color: string; planned?: boolean; future?: boolean; mark?: boolean }) {
  if (cell)
    return (
      <View style={[styles.cell, mark && styles.cellMark]}>
        <View style={[styles.ink, { backgroundColor: color, opacity: INK[cell.level] ?? 1 }]} />
      </View>
    );
  if (planned) return <View style={[styles.cell, mark && styles.cellMark]}><View style={[styles.frame, { borderColor: color }]} /></View>;
  return <View style={[styles.cell, mark && styles.cellMark]}>{future ? null : <View style={styles.dot} />}</View>;
}

function Line({ icon, label, sub, color, children }: { icon?: string; label: string; sub: string; color: string; children: React.ReactNode }) {
  return (
    <View style={styles.line}>
      <View style={styles.name}>
        {icon ? <Icon name={icon as never} size={18} color={color} /> : <View style={[styles.swatch, { backgroundColor: color }]} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="bodyStrong" numberOfLines={1}>{label}</T>
          <T variant="caption" tone="faint" numberOfLines={1}>{sub}</T>
        </View>
      </View>
      <View style={styles.cells}>{children}</View>
    </View>
  );
}

const sessions = (n: number) => `${n} séance${n > 1 ? "s" : ""}`;

export function ProgramGrid({ grid, testID }: { grid: ProgramWeek | ProgramSpan; testID?: string }) {
  const theme = useSpace();
  const week = grid.kind === "week" ? grid : null;
  const columns = week ? week.days.length : (grid as ProgramSpan).columns.length;
  const empty = !grid.rows.length && !grid.more;
  // A sport planned later this week that has no session yet gets its own line, so the usual week is visible from Monday morning.
  const plannedOnly = week ? week.planned.filter((p) => p.row < 0).reduce<{ sport: string; label: string; family: string; days: number[] }[]>((list, p) => {
    const hit = list.find((x) => x.sport === p.sport);
    if (hit) hit.days.push(p.day); else list.push({ sport: p.sport, label: p.label, family: p.family, days: [p.day] });
    return list;
  }, []) : [];
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={`${week ? "Programme de la semaine" : `Programme des ${columns} dernières semaines`}. ${Program.describe(grid)}`} style={{ gap: 2 }}>
      <View style={styles.line}>
        <View style={styles.name} />
        <View style={styles.cells}>
          {week
            ? week.days.map((d) => (
                <View key={d.key} style={styles.head}>
                  <T variant="caption" style={styles.letter} color={d.today ? theme.accent : colors.tx3}>{d.letter}</T>
                  <View style={[styles.today, d.today && { backgroundColor: theme.accent }]} />
                </View>
              ))
            : (grid as ProgramSpan).columns.map((c, i, all) => (
                <View key={c.key} style={styles.head}>
                  <T variant="caption" style={styles.letter} color={c.current ? theme.accent : colors.tx3} numberOfLines={1}>{c.current ? "Sem." : i === 0 || c.date <= 7 ? MONTHS[c.month]!.slice(0, 3) : all.length > 10 ? "" : String(c.date)}</T>
                  <View style={[styles.today, c.current && { backgroundColor: theme.accent }]} />
                </View>
              ))}
        </View>
      </View>
      {grid.rows.map((r, rowIndex) => (
        <Line key={r.sport} icon={Sports.iconOf(r.sport)} label={r.label} sub={`${sessions(r.sessions)} · ${Format.duration(r.minutes)}`} color={familyColors[r.family] ?? colors.tx2}>
          {r.cells.map((c, i) => (
            <Cell key={i} cell={c} color={familyColors[r.family] ?? colors.tx2} future={week ? week.days[i]!.future : false} planned={!!week && week.planned.some((p) => p.row === rowIndex && p.day === i)} mark={week ? week.days[i]!.today : (grid as ProgramSpan).columns[i]!.current} />
          ))}
        </Line>
      ))}
      {plannedOnly.map((p) => (
        <Line key={`plan-${p.sport}`} icon={Sports.iconOf(p.sport)} label={p.label} sub="Prévu cette semaine" color={familyColors[p.family] ?? colors.tx2}>
          {week!.days.map((d) => <Cell key={d.key} cell={null} color={familyColors[p.family] ?? colors.tx2} planned={p.days.includes(d.index)} future mark={d.today} />)}
        </Line>
      ))}
      {grid.more ? (
        <Line label={`${grid.more.sports} autre${grid.more.sports > 1 ? "s" : ""} sport${grid.more.sports > 1 ? "s" : ""}`} sub={`${sessions(grid.more.sessions)} · ${Format.duration(Math.round(grid.more.minutes))}`} color={colors.tx3}>
          {grid.more.cells.map((c, i) => <Cell key={i} cell={c} color={colors.tx2} future={week ? week.days[i]!.future : false} mark={week ? week.days[i]!.today : (grid as ProgramSpan).columns[i]!.current} />)}
        </Line>
      ) : null}
      {empty && !plannedOnly.length ? (
        <Line label="Aucune séance" sub={week ? "Rien encore cette semaine" : "sur cette période"} color={colors.tx4}>
          {Array.from({ length: columns }, (_, i) => <Cell key={i} cell={null} color={colors.tx4} future={week ? week.days[i]!.future : false} mark={week ? week.days[i]!.today : false} />)}
        </Line>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: 44 },
  name: { width: "47%", maxWidth: 230, flexDirection: "row", alignItems: "center", gap: space.s2 },
  swatch: { width: 18, height: 3 },
  cells: { flex: 1, flexDirection: "row", gap: 4, alignItems: "center" },
  head: { flex: 1, alignItems: "center", gap: 3, paddingTop: 2 },
  letter: { fontFamily: fonts.textBold, fontSize: 12, lineHeight: 15, textAlign: "center" },
  today: { width: "100%", height: 2, backgroundColor: "transparent" },
  cell: { flex: 1, aspectRatio: 1, maxHeight: 36, alignItems: "center", justifyContent: "center" },
  cellMark: { backgroundColor: "rgba(226,234,236,0.05)" },
  ink: { width: "100%", height: "100%", borderRadius: 2 },
  frame: { width: "100%", height: "100%", borderRadius: 2, borderWidth: 1.5, borderStyle: "dashed", opacity: 0.8 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.tx4 },
});
