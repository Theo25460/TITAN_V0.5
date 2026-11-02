import { View } from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { layoutPath, ARC_LABEL } from "../lib/worldPath";
import { colors, radius, space } from "../theme/tokens";
import { T } from "./Text";

/** A winding map of the nine chapters in three arcs, drawn from the real progress. Static: no motion to reduce, readable by a screen reader through its summary. */
export function WorldPathMap({ chapter, earned, color, worldName, finished }: { chapter: number; earned: Set<number>; color: string; worldName: string; finished: boolean }) {
  const W = 320, H = 400;
  const { nodes, d } = layoutPath(W, H, finished ? 10 : chapter, earned);
  const doneCount = nodes.filter((n) => n.state === "done").length;
  const current = nodes.find((n) => n.state === "current");
  const summary = `Chemin de ${worldName} : ${doneCount} chapitre${doneCount > 1 ? "s" : ""} validé${doneCount > 1 ? "s" : ""} sur 9${current ? `, chapitre ${current.index} en cours, ${ARC_LABEL[current.arc - 1]}` : finished ? ", monde terminé" : ", pas encore commencé"}.`;
  return (
    <View style={{ borderRadius: radius.r3, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.bg1, padding: space.s2 }} accessible accessibilityRole="image" accessibilityLabel={summary} testID="world-path-map">
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Path d={d} stroke={colors.line2} strokeWidth={5} strokeLinecap="round" fill="none" />
        {nodes.filter((n) => n.state === "done").length > 1 ? (
          <Path d={d} stroke={color} strokeWidth={5} strokeLinecap="round" fill="none" strokeDasharray={`${Math.max(0, (doneCount - 1) * 52)} 9999`} />
        ) : null}
        {[1, 2, 3].map((a) => {
          const first = nodes.find((n) => n.arc === a)!;
          return (
            <SvgText key={a} x={first.x < W / 2 ? W - 62 : 8} y={first.y + 4} fill={colors.tx3} fontSize={11} fontWeight="600">
              {ARC_LABEL[a - 1]}
            </SvgText>
          );
        })}
        {nodes.map((n) => (
          <G key={n.index}>
            {n.state === "current" ? <Circle cx={n.x} cy={n.y} r={22} fill="none" stroke={color} strokeWidth={2} opacity={0.5} /> : null}
            <Circle cx={n.x} cy={n.y} r={n.boss ? 17 : 13} fill={n.state === "done" ? color : colors.bg} stroke={n.state === "locked" ? colors.line3 : n.boss ? colors.am : color} strokeWidth={n.boss ? 3 : 2} />
            <SvgText x={n.x} y={n.y + 4} fill={n.state === "done" ? colors.bg : n.state === "current" ? colors.tx : colors.tx3} fontSize={12} fontWeight="700" textAnchor="middle">
              {n.boss ? "★" : n.index}
            </SvgText>
          </G>
        ))}
      </Svg>
      <T variant="caption" tone="faint" style={{ paddingHorizontal: space.s2, paddingBottom: space.s1 }}>
        Trois arcs de trois chapitres ; l’étoile est le gardien. Un chapitre se valide avec plusieurs jours de pratique, jamais en une séance.
      </T>
    </View>
  );
}
