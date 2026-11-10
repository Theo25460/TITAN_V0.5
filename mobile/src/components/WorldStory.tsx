import { View } from "react-native";
import { worldStory } from "../lib/journey";
import { colors, space } from "../theme/tokens";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { T } from "./Text";

/** Persistent visual changes use campaign receipts without writing new rewards. */
export function WorldStory({ snapshot, world, owner, color }: { snapshot: unknown; world: string; owner: string; color: string }) {
  const story = worldStory(snapshot, world, owner);
  if (!story) return null;
  return (
    <Card testID="world-story" style={{ gap: space.s3 }}>
      <T variant="h3" accessibilityRole="header">Le monde change</T>
      <T variant="small">
        {owner.startsWith("guest_") ? "Aperçu de ton aventure sur cet appareil." : "Les balises allumées laissent une trace dans ce monde."}
      </T>
      {story.scenes.map(scene => (
        <View key={scene.chapter} style={{
          flexDirection: "row", alignItems: "flex-start", gap: space.s2, borderLeftWidth: 3,
          borderLeftColor: scene.earnedAt ? color : colors.line2, padding: space.s2,
          backgroundColor: scene.earnedAt ? colors.bg2 : undefined,
        }}>
          <Icon name={scene.earnedAt ? scene.icon : "lock"} color={scene.earnedAt ? color : colors.tx3} size={18} />
          <View style={{ flex: 1, gap: space.s1 }}>
            <T variant="bodyStrong">{scene.earnedAt ? scene.name : `Balise ${scene.chapter}`}</T>
            <T variant="small" tone="muted">{scene.earnedAt ? scene.description : "Changement à découvrir après validation."}</T>
          </View>
        </View>
      ))}
    </Card>
  );
}
