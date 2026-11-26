/* « Partager » (before V2): the preview of a story card before anything leaves the phone. The person picks a style (Champ, Feuille,
   Carnet), sees the exact picture, chooses what it shows (route, week, date; the name is off by default), then shares it through
   Android's share sheet or saves it in a folder. The route is a shape: first and last 300 m removed, no map, no coordinates. Never
   on the picture: a place, a note, a body signal. Nothing is published by TITAN, no session, reward, visibility or profile setting
   changes here. Inviting someone is a separate, explicit action. */
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { PixelRatio, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { StoryCard } from "../../components/StoryCard";
import { T } from "../../components/Text";
import { ToggleRow } from "../../components/Toggle";
import { useToast } from "../../components/Toast";
import { buildStory, ShareStory, type StoryOption, type StoryOptions, type StoryRequest, type StoryStyle } from "../../core/shareStory";
import { useOwner } from "../../data/auth";
import { readJSON, remove, writeJSON } from "../../lib/storage";
import { captureStory, saveStoryFile, shareStoryFile, StoryExportError } from "../../lib/storyExport";
import { storyRoute } from "../../lib/storyRoute";
import type { RootParams } from "../../navigation/types";
import { colors, space } from "../../theme/tokens";

const store = {
  get: (key: string) => readJSON<string | null>(key, null),
  set: (key: string, value: string) => writeJSON(key, value),
  remove: (key: string) => remove(key),
};

type Phase = "idle" | "capturing" | "sharing" | "saving";

export function ShareStoryScreen({ navigation, route }: NativeStackScreenProps<RootParams, "ShareStory">) {
  const params = route.params;
  const owner = useOwner();
  const toast = useToast();
  const { width, height } = useWindowDimensions();
  // The session's route is loaded here (phone outbox first, then the account's library), as a shape without coordinates.
  const eventId = params.kind === "session" ? params.input.routeEventId ?? null : null;
  const routeQuery = useQuery({ queryKey: ["story-route", owner, eventId], queryFn: () => storyRoute(owner, eventId), enabled: !!eventId, staleTime: 5 * 60_000, retry: false });
  const request = useMemo<StoryRequest>(
    () => (params.kind === "session" && routeQuery.data ? { kind: "session", input: { ...params.input, route: routeQuery.data } } : params),
    [params, routeQuery.data],
  );
  const [options, setOptions] = useState<StoryOptions>(() => ShareStory.options(ShareStory.DEFAULTS));
  const available = useMemo(() => ShareStory.availableOptions(request.input, options.style), [request, options.style]);
  const model = useMemo(() => buildStory(request, options), [request, options]);
  const captureRef = useRef<View>(null);
  const file = useRef<{ key: string; uri: string } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<{ message: string; retry: "share" | "save" } | null>(null);
  const key = JSON.stringify([options, !!routeQuery.data]);

  // The preview fits the screen; the capture view is drawn off screen at exactly 1080 physical pixels wide.
  const preview = Math.min(width - space.s4 * 2, Math.round((height * 0.5 * ShareStory.SIZE.width) / ShareStory.SIZE.height));
  const captureWidth = ShareStory.SIZE.width / PixelRatio.get();

  async function image(): Promise<string> {
    if (file.current?.key === key) return file.current.uri;
    setPhase("capturing");
    const uri = await captureStory(captureRef);
    file.current = { key, uri };
    return uri;
  }

  async function run(action: "share" | "save") {
    if (phase !== "idle") return;
    setError(null);
    try {
      const uri = await image();
      if (action === "share") {
        setPhase("sharing");
        await shareStoryFile(uri, model.kind === "achievement" ? "Partager mon succès" : "Partager ma séance");
      } else {
        setPhase("saving");
        const saved = await saveStoryFile(uri, ShareStory.fileName(model.kind), store);
        if (saved) toast({ kind: "ok", title: "Image enregistrée", message: "Elle est dans le dossier que tu as choisi." });
      }
    } catch (e) {
      setError({ message: e instanceof StoryExportError ? e.message : "L’image n’a pas pu être partagée. Réessaie, ou enregistre-la.", retry: action });
    } finally {
      setPhase("idle");
    }
  }

  const set = (id: StoryOption, value: boolean) => setOptions((o) => ({ ...o, [id]: value }));
  const busy = phase !== "idle";
  const status = phase === "capturing" ? "Création de l’image…" : phase === "sharing" ? "Ouverture du partage…" : phase === "saving" ? "Enregistrement…" : routeQuery.isFetching ? "Chargement du tracé…" : "";

  const footer = (
    <View style={{ gap: space.s2 }}>
      {status ? <T variant="small" tone="muted" accessibilityLiveRegion="polite">{status}</T> : null}
      {error ? (
        <View style={{ gap: space.s2 }} testID="story-error">
          <T variant="small" tone="err" accessibilityLiveRegion="assertive">{error.message}</T>
          <Button small kind="secondary" label="Réessayer" onPress={() => run(error.retry)} testID="story-retry" />
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button label="Enregistrer" icon="download" kind="secondary" loading={phase === "saving"} disabled={busy} onPress={() => run("save")} style={{ flex: 1 }} testID="story-save" />
        <Button label="Partager" icon="share" loading={phase === "capturing" || phase === "sharing"} disabled={busy} onPress={() => run("share")} style={{ flex: 1 }} testID="story-share" />
      </View>
    </View>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.previewWrap} testID="story-preview">
        <View style={[styles.preview, { width: preview }]}>
          <StoryCard model={model} style={options.style} width={preview} />
        </View>
      </View>
      <Segmented<StoryStyle>
        accessibilityLabel="Style de l’image"
        options={ShareStory.STYLES.map((s) => ({ value: s, label: ShareStory.STYLE_LABELS[s] }))}
        value={options.style}
        onChange={(style) => setOptions((o) => ({ ...o, style }))}
      />

      {available.length ? (
        <Section title="Ce que montre l’image">
          <Card tone="flat" style={{ paddingVertical: 0 }}>
            {available.map((id, i) => (
              <ToggleRow key={id} label={ShareStory.OPTION_LABELS[id]} hint={ShareStory.OPTION_HINTS[id]} value={options[id]} onChange={(v) => set(id, v)} disabled={busy} last={i === available.length - 1} testID={`story-option-${id}`} />
            ))}
          </Card>
        </Section>
      ) : null}
      <View style={styles.note}>
        <Icon name="lock" size={16} color={colors.tx3} />
        <T variant="caption" tone="faint" style={{ flex: 1 }}>
          Image créée sur ton téléphone. Jamais dessus : fond de carte, coordonnées, lieu, notes, ressenti ou données de santé. Rien n’est publié tant que tu ne la partages pas, et la visibilité de ta séance ne change pas.
        </T>
      </View>
      <T variant="caption" tone="faint">
        Le partage ouvre le sélecteur d’Android : tu choisis l’application (Instagram, WhatsApp, Messages…) et ce que tu publies.
      </T>

      <Section title="Faire découvrir TITAN">
        <T variant="small" tone="muted">
          Une adresse écrite sur une image ne se clique pas. Là où c’est possible (messages, WhatsApp…), envoie le lien à part.
        </T>
        <View style={{ gap: space.s3 }}>
          <Button
            small
            kind="secondary"
            icon="send"
            label="Envoyer le lien titan-app.fr"
            disabled={busy}
            onPress={() => Share.share({ message: "TITAN — tous tes sports, une seule progression : https://titan-app.fr" }).catch(() => {})}
            testID="story-link"
          />
          <Button small kind="ghost" icon="userPlus" label="Inviter un ami sur TITAN" disabled={busy} onPress={() => navigation.navigate("Community", { sheet: "invite" })} testID="story-invite" />
        </View>
      </Section>

      <View style={styles.offscreen} pointerEvents="none">
        <StoryCard ref={captureRef} model={model} style={options.style} width={captureWidth} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewWrap: { alignItems: "center" },
  preview: { borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.line2 },
  note: { flexDirection: "row", gap: space.s2, alignItems: "flex-start" },
  offscreen: { position: "absolute", left: -10000, top: 0 },
  actions: { flexDirection: "row", gap: space.s3 },
});
