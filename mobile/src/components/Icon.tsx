import { memo } from "react";
import Svg, { Circle, Ellipse, Line, Path, Polyline, Rect } from "react-native-svg";
import { ICONS, type IconName } from "../core/icons.generated";
import { colors } from "../theme/tokens";

export type { IconName };

const TAGS = { path: Path, circle: Circle, rect: Rect, line: Line, polyline: Polyline, ellipse: Ellipse } as const;

/** The website icon set (24 grid, 1.65 stroke), drawn natively. */
export const Icon = memo(function Icon({ name, size = 22, color = colors.tx2, strokeWidth = 1.65 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const parts = ICONS[name] ?? ICONS.compass;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
      {parts.map(([tag, props], i) => {
        const C = TAGS[tag] as React.ComponentType<Record<string, unknown>>;
        return <C key={i} {...props} />;
      })}
    </Svg>
  );
});
