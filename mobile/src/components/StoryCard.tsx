/* « Partager » (before V2): draws the story card the shared layout describes (src/core/web/share-story.js `layout`), on the 1080 grid
   scaled by `width / 1080`: the same component shows the preview on the phone and is captured at exactly 1080 × 1920. It draws
   the operations in their order: shapes in SVG layers, text with the app's own Archivo cuts, the brand's contour lines tinted.
   Text never follows the system font size here: the picture must look the same for everyone. */
import { forwardRef, type ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { G, Path, Polyline, Rect } from "react-native-svg";
import { ShareStory, type StoryCardModel, type StoryOp, type StoryStyle } from "../core/shareStory";
import { fonts } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { ICONS } from "../core/icons.generated";

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const relief = require("../../assets/brand/relief.png");

const FONT: Record<string, string> = {
  display: fonts.display, figure: fonts.figure, figureBold: fonts.figureBold, text: fonts.text, semi: fonts.textSemi, bold: fonts.textBold,
};

function shape(op: StoryOp, key: number): ReactNode {
  switch (op.t) {
    case "rect": {
      if (op.cut) {
        const { x, y, w, h, cut } = op;
        return <Path key={key} d={`M${x} ${y}H${x + w}V${y + h - cut}L${x + w - cut} ${y + h}H${x}Z`} fill={op.color} opacity={op.opacity ?? 1} />;
      }
      const filled = op.color && op.color !== "transparent";
      return <Rect key={key} x={op.x} y={op.y} width={op.w} height={op.h} rx={op.radius || 0} fill={filled ? op.color : "none"} opacity={op.opacity ?? 1} stroke={op.stroke} strokeWidth={op.stroke ? op.strokeWidth || 2 : 0} />;
    }
    case "line":
      return <Path key={key} d={`M${op.x1} ${op.y1}L${op.x2} ${op.y2}`} stroke={op.color} strokeWidth={op.width} />;
    case "route":
      return (
        <G key={key}>
          {op.segs.map((seg, i) => (
            <Polyline key={i} points={seg.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={op.color} strokeWidth={op.width} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </G>
      );
    case "mark":
      // The TITAN mark (image/titan-mark.svg, the app icon): two chevrons on a square.
      return (
        <G key={key} transform={`translate(${op.x} ${op.y}) scale(${op.size / 32})`}>
          <Rect width={32} height={32} rx={7} fill={op.bg} />
          <Path d="m9 15.5 7-7 7 7" fill="none" stroke={op.fg} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="m9 23.5 7-7 7 7" fill="none" stroke={op.fg} strokeOpacity={0.5} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        </G>
      );
    default:
      return null;
  }
}

const isShape = (op: StoryOp) => op.t === "rect" || op.t === "line" || op.t === "route" || op.t === "mark";

export type StoryCardProps = { model: StoryCardModel; style: StoryStyle; width: number };

export const StoryCard = forwardRef<View, StoryCardProps>(function StoryCard({ model, style, width }, ref) {
  const plan = ShareStory.layout(model, style);
  const k = width / plan.width;
  const px = (n: number) => n * k;
  const fill = plan.ops.find((o) => o.t === "fill");
  const layers: ReactNode[] = [];
  let shapes: { op: StoryOp; i: number }[] = [];
  const flush = () => {
    if (!shapes.length) return;
    const batch = shapes;
    shapes = [];
    layers.push(
      <Svg key={`s${batch[0]!.i}`} style={StyleSheet.absoluteFill} width={px(plan.width)} height={px(plan.height)} viewBox={`0 0 ${plan.width} ${plan.height}`}>
        {batch.map(({ op, i }) => shape(op, i))}
      </Svg>,
    );
  };
  plan.ops.forEach((op, i) => {
    if (op.t === "fill") return;
    if (isShape(op)) {
      shapes.push({ op, i });
      return;
    }
    flush();
    if (op.t === "text") {
      layers.push(
        <Text
          key={i}
          allowFontScaling={false}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            position: "absolute", left: px(op.x), top: px(op.y), width: px(op.w), height: px(op.lh),
            fontFamily: FONT[op.font] ?? fonts.text, fontSize: px(op.size), lineHeight: px(op.lh), letterSpacing: px(op.tracking || 0),
            color: op.color, textAlign: op.align, includeFontPadding: false, textAlignVertical: "center",
          }}
        >
          {op.text}
        </Text>,
      );
    } else if (op.t === "icon") {
      const name = (op.name in ICONS ? op.name : "bolt") as IconName;
      layers.push(
        <View key={i} style={{ position: "absolute", left: px(op.x), top: px(op.y) }}>
          <Icon name={name} size={px(op.size)} color={op.color} strokeWidth={1.8} />
        </View>,
      );
    } else if (op.t === "relief") {
      const c = op.clip ?? { x: op.x, y: op.y, w: op.w, h: op.h };
      // The asset's strokes are faint on purpose (7 to 34 %): drawn twice they read on a bright field without competing with it.
      const img = (n: number) => <Image key={n} source={relief} resizeMode="stretch" style={{ position: "absolute", left: px(op.x - c.x), top: px(op.y - c.y), width: px(op.w), height: px(op.h), opacity: op.opacity, tintColor: op.color }} />;
      layers.push(
        <View key={i} style={{ position: "absolute", left: px(c.x), top: px(c.y), width: px(c.w), height: px(c.h), overflow: "hidden" }}>
          {img(0)}
          {img(1)}
        </View>,
      );
    }
  });
  flush();
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ width: px(plan.width), height: px(plan.height), backgroundColor: fill?.t === "fill" ? fill.color : "#090C10", overflow: "hidden" }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {layers}
    </View>
  );
});
