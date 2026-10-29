import { Image, View } from "react-native";
import { FRAMES } from "../core/cosmetics";
import { avatarImages } from "../core/images";
import { colors } from "../theme/tokens";

/** RPG portrait with its Atelier frame. */
export function Avatar({ id, frame, size = 64 }: { id?: string | null; frame?: string | null; size?: number }) {
  const style = FRAMES[frame ?? ""] ?? FRAMES["frame-standard"];
  const total = style.rings.reduce((n, r) => n + r.width, 0);
  let node = <Image source={avatarImages[id ?? "scout"] ?? avatarImages.scout} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bg3 }} accessibilityIgnoresInvertColors />;
  let inner = size;
  for (const ring of style.rings) {
    inner += ring.width * 2;
    node = <View style={{ width: inner, height: inner, borderRadius: inner / 2, borderWidth: ring.width, borderColor: ring.color, alignItems: "center", justifyContent: "center" }}>{node}</View>;
  }
  return (
    <View style={{ width: size + total * 2, height: size + total * 2, borderRadius: size, alignItems: "center", justifyContent: "center", shadowColor: style.glow, elevation: style.glow ? 10 : 0 }}>
      {node}
    </View>
  );
}
