/* Social lot D on Android — « Dans ton cercle depuis ta dernière visite », at the top of Communauté > Amis. Behind screens.digest.
   It reads the same last-visit time as the QG card (src/lib/visit.ts, per account, on this phone) without writing it, asks the server
   digest (titan_social_digest_v1) and words it with the website's module. Nothing shows when nothing happened. */
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { T } from "../../components/Text";
import { SocialDigestWords, type DigestLine } from "../../core/cordee";
import * as api from "../../data/api";
import { useServerFlag } from "../../data/flags";
import { loadLastVisit } from "../../lib/visit";
import { colors, space } from "../../theme/tokens";

const ICON = { celebrate: "medal", together: "route", circle: "heart", memory: "compass", suggest: "sparkle" } as const;

export function CircleDigestCard({ owner, online }: { owner: string; online: boolean }) {
  const enabled = useServerFlag("screens.digest");
  const q = useQuery({
    queryKey: ["social-digest", owner],
    queryFn: async () => {
      const since = await loadLastVisit(owner);
      return api.fetchSocialDigest(owner, typeof since === "number" && Number.isFinite(since) ? new Date(since).toISOString() : null);
    },
    enabled: enabled && online,
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (!enabled || !q.data || !SocialDigestWords.hasNews(q.data)) return null;
  const lines: DigestLine[] = SocialDigestWords.lines(q.data).filter((l) => l.kind !== "suggest");
  return (
    <Card style={{ gap: space.s2 }} testID="circle-digest">
      <T variant="h3">Dans ton cercle depuis ta dernière visite</T>
      {lines.map((l) => (
        <View key={l.id} style={{ flexDirection: "row", gap: space.s2, alignItems: "flex-start" }}>
          <Icon name={ICON[l.kind]} size={18} color={l.kind === "celebrate" ? colors.cy : colors.tx3} />
          <T variant="small" style={{ flex: 1 }}>{l.text}</T>
        </View>
      ))}
    </Card>
  );
}
