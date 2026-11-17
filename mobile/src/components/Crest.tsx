/* TITAN's RPG heraldry: seven rank crests (Éclaireur → Légende) that grow richer with the rank, and the beacon of a chapter.
   A rank whose sculpted badge was approved (core/images.ts `rankImages`, shipped in the app so it shows offline) is drawn from that image;
   the others keep the vector crest below until theirs is approved. The palette is the house one (steel → cyan for progression, amber for
   the rare). Purely visual: a crest is earned by the rank the server confirms, it is never sold or unlocked by anything else. */
import { useId } from "react";
import { Image } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import { EffortRules } from "../core";
import { rankImages } from "../core/images";
import { colors } from "../theme/tokens";

export const RANK_IDS = ["eclaireur", "explorateur", "sentinelle", "gardien", "champion", "titan", "legende"] as const;
export type RankId = (typeof RANK_IDS)[number];

/** Steel at the start, cyan for the middle ranks, amber for the rare ones, a pale gold for the legend. */
export const RANK_ACCENT: Record<RankId, string> = { eclaireur: "#8EA2B3", explorateur: "#7FCBD6", sentinelle: "#3DD9E8", gardien: "#8CEAF2", champion: "#F4BB54", titan: "#F7C96B", legende: "#FFE7A8" };
const CHEVRONS: Record<RankId, number> = { eclaireur: 1, explorateur: 2, sentinelle: 2, gardien: 3, champion: 3, titan: 3, legende: 3 };

export const rankIdOf = (level: number): RankId => {
  const id = EffortRules.rank(level).id as RankId;
  return (RANK_IDS as readonly string[]).includes(id) ? id : "eclaireur";
};

const SHIELD = "M60 14 L100 26 V64 C100 94 82 116 60 128 C38 116 20 94 20 64 V26 Z";
const INNER = "M60 23 L92 33 V64 C92 89 77 107 60 117 C43 107 28 89 28 64 V33 Z";

/** Above this width the large file is used: 86 dp is 258 px on a 3x screen, the limit of the small one. */
const LARGE_BADGE_FROM = 86;

/** The crest of a rank. `size` is the width of the whole drawing (wings, crown and rays included, so the vector shield itself is about 46 % of it).
    An approved badge fills the same box, so a screen keeps its layout whichever rank is shown. `vector` forces the drawn crest. */
export function RankCrest({ rank, size = 96, glow = true, vector = false }: { rank: RankId; size?: number; glow?: boolean; vector?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const t = RANK_IDS.indexOf(rank);
  const accent = RANK_ACCENT[rank];
  const chevrons = CHEVRONS[rank];
  const h = (size * 182) / 172;
  const label = `Blason ${EffortRules.RANKS.find((r: { id: string }) => r.id === rank)?.name ?? ""}`;
  const badge = vector ? undefined : rankImages[rank];
  if (badge) {
    return (
      <Image
        source={size > LARGE_BADGE_FROM ? badge.large : badge.small}
        style={{ width: size, height: h }}
        resizeMode="contain"
        fadeDuration={0}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        accessibilityIgnoresInvertColors
        testID={`rank-badge-${rank}`}
      />
    );
  }
  return (
    <Svg width={size} height={h} viewBox="-26 -16 172 182" accessibilityLabel={label}>
      <Defs>
        <RadialGradient id={`g${uid}`} cx="60" cy="72" r="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={accent} stopOpacity={0.18 + t * 0.05} />
          <Stop offset="1" stopColor={accent} stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id={`f${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.bg4} />
          <Stop offset="1" stopColor={colors.bg1} />
        </LinearGradient>
        <LinearGradient id={`m${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={accent} stopOpacity="0.28" />
          <Stop offset="1" stopColor={accent} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {glow ? <Circle cx="60" cy="72" r="70" fill={`url(#g${uid})`} /> : null}
      {/* The legend is surrounded by rays. */}
      {t >= 6
        ? Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            const r1 = 66;
            const r2 = i % 2 ? 72 : 80;
            return <Line key={i} x1={60 + Math.cos(a) * r1} y1={72 + Math.sin(a) * r1} x2={60 + Math.cos(a) * r2} y2={72 + Math.sin(a) * r2} stroke={accent} strokeWidth={i % 2 ? 2 : 3} strokeLinecap="round" opacity={0.55} />;
          })
        : null}
      {/* Wings from the Gardien on; a second, longer pair for the Titan and the Legend. */}
      {t >= 3 ? <Wings accent={accent} long={t >= 5} /> : null}
      {/* Crown spikes for the Titan and the Legend. */}
      {t >= 5 ? <Polygon points="38,22 44,4 52,18 60,-6 68,18 76,4 82,22" fill={accent} stroke={colors.bg} strokeWidth={1.5} strokeLinejoin="round" /> : null}
      <Path d={SHIELD} fill={`url(#f${uid})`} stroke={accent} strokeWidth={4} strokeLinejoin="round" />
      <Path d={INNER} fill={`url(#m${uid})`} stroke={accent} strokeOpacity={0.45} strokeWidth={1.5} strokeLinejoin="round" />
      {/* Laurel branches from the Champion on. */}
      {t >= 4 ? (
        <G stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.9}>
          <Path d="M36 104 C24 90 23 72 31 56" />
          <Path d="M84 104 C96 90 97 72 89 56" />
          <Path d="M30 92 l-7 -2 M27 80 l-7 -4 M30 68 l-6 -6" />
          <Path d="M90 92 l7 -2 M93 80 l7 -4 M90 68 l6 -6" />
        </G>
      ) : null}
      {/* Chevrons: the rank's stripes. */}
      <G stroke={accent} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {Array.from({ length: chevrons }, (_, i) => {
          const y = 96 - i * 14;
          return <Path key={i} d={`M42 ${y} L60 ${y - 14} L78 ${y}`} />;
        })}
      </G>
      {/* A gem at the top from the Sentinelle on. */}
      {t >= 2 ? <Circle cx="60" cy="46" r={t >= 5 ? 7 : 6} fill={accent} stroke={colors.bg} strokeWidth={2} /> : null}
      {t >= 2 ? <Circle cx="58" cy="44" r="2" fill="#fff" opacity={0.85} /> : null}
    </Svg>
  );
}

function Wings({ accent, long }: { accent: string; long: boolean }) {
  const feather = (side: 1 | -1, k: number, len: number) => {
    const x0 = 60 + side * 40;
    const y0 = 52 + k * 11;
    return <Path key={`${side}${k}`} d={`M${x0} ${y0} C${x0 + side * (len * 0.7)} ${y0 - 6} ${x0 + side * len} ${y0 - 2} ${x0 + side * (len + 4)} ${y0 + 12} C${x0 + side * (len * 0.6)} ${y0 + 8} ${x0 + side * 12} ${y0 + 10} ${x0} ${y0 + 8} Z`} fill={accent} opacity={0.82 - k * 0.12} stroke={colors.bg} strokeWidth={1} />;
  };
  const rows = long ? [0, 1, 2, 3] : [0, 1, 2];
  const base = long ? 36 : 24;
  return (
    <G>
      {rows.map((k) => feather(-1, k, base - k * 3))}
      {rows.map((k) => feather(1, k, base - k * 3))}
    </G>
  );
}

/** The beacon of a chapter: a tower holding a flame, in the colour of its world. `lit` = the flame is burning (the chapter was validated). */
export function BeaconEmblem({ color = colors.cy, size = 96, lit = true }: { color?: string; size?: number; lit?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel={lit ? "Balise allumée" : "Balise éteinte"}>
      <Defs>
        <RadialGradient id={`b${uid}`} cx="60" cy="46" r="48" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={lit ? 0.55 : 0.08} />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id={`t${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.bg4} />
          <Stop offset="1" stopColor={colors.bg2} />
        </LinearGradient>
      </Defs>
      <Circle cx="60" cy="46" r="48" fill={`url(#b${uid})`} />
      {/* Light beams. */}
      {lit
        ? [-62, -34, 0, 34, 62].map((d) => <Line key={d} x1="60" y1="36" x2={60 + d * 0.78} y2={d === 0 ? 6 : 16} stroke={color} strokeWidth={d === 0 ? 3 : 2} strokeLinecap="round" opacity={d === 0 ? 0.8 : 0.45} />)
        : null}
      {/* Tower. */}
      <Path d="M44 108 L50 54 H70 L76 108 Z" fill={`url(#t${uid})`} stroke={color} strokeOpacity={lit ? 0.9 : 0.35} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x="40" y="104" width="40" height="8" rx="3" fill={colors.bg3} stroke={color} strokeOpacity={lit ? 0.7 : 0.3} strokeWidth={2} />
      <Path d="M46 78 H74 M47.5 92 H72.5" stroke={color} strokeOpacity={0.35} strokeWidth={2} />
      {/* Lantern and flame. */}
      <Path d="M48 54 H72 L68 40 H52 Z" fill={colors.bg3} stroke={color} strokeOpacity={lit ? 0.9 : 0.35} strokeWidth={2.5} strokeLinejoin="round" />
      {lit ? (
        <>
          <Path d="M60 14 C68 24 72 30 66 42 H54 C48 30 54 24 60 14 Z" fill={color} />
          <Path d="M60 26 C64 32 65 36 62 42 H58 C55 36 56 32 60 26 Z" fill="#fff" opacity={0.85} />
        </>
      ) : (
        <Path d="M54 42 C54 36 57 34 60 30 C63 34 66 36 66 42 Z" fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={2} />
      )}
    </Svg>
  );
}
