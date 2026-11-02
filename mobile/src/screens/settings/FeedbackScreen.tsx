import * as Application from "expo-application";
import { useState } from "react";
import { Linking, Platform } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Checkbox } from "../../components/Checkbox";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { Section } from "../../components/Section";
import { Segmented } from "../../components/Segmented";
import { T } from "../../components/Text";
import { SUPPORT_EMAIL } from "../../lib/config";
import { composeMail, FEEDBACK_MAX, problemWith, type FeedbackKind } from "../../lib/feedback";

/** V11-79: a problem or an idea, written in the application and sent by the user from their mail app. No server ticket, no confirmation made up. */
export function FeedbackScreen() {
  const [kind, setKind] = useState<FeedbackKind>("problem");
  const [text, setText] = useState("");
  const [withInfo, setWithInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<boolean | null>(null);
  const native = (Platform.OS === "android" ? Platform.constants : {}) as { Manufacturer?: string; Model?: string; Release?: string };
  const info = { app: `${Application.nativeApplicationVersion ?? "?"} (${Application.nativeBuildVersion ?? "?"})`, android: `${native.Release ?? "?"} (API ${String(Platform.Version)})`, device: [native.Manufacturer, native.Model].filter(Boolean).join(" ") || "inconnu" };
  async function send() {
    const problem = problemWith(text);
    setError(problem);
    if (problem) return;
    const mail = composeMail(kind, text, withInfo ? info : null);
    try {
      await Linking.openURL(mail.url);
      setOpened(true);
    } catch {
      setOpened(false);
    }
  }
  return (
    <Screen keyboard>
      <Section title="Ton retour">
        <Segmented
          accessibilityLabel="Type de retour"
          value={kind}
          onChange={setKind}
          options={[{ value: "problem", label: "Un problème" }, { value: "idea", label: "Une idée" }]}
        />
        <Field
          label={kind === "problem" ? "Que s’est-il passé ?" : "Quelle idée ?"}
          hint={`Entre 10 et ${FEEDBACK_MAX} caractères. N’écris jamais ton mot de passe.`}
          value={text}
          onChangeText={(v) => { setText(v); if (error) setError(null); }}
          multiline
          numberOfLines={6}
          maxLength={FEEDBACK_MAX + 200}
          textAlignVertical="top"
          error={error}
          testID="feedback-text"
        />
        <Checkbox checked={withInfo} onChange={setWithInfo} accessibilityLabel="Ajouter des informations techniques">
          <T variant="small">Ajouter la version de l’application, d’Android et le modèle du téléphone (facultatif)</T>
        </Checkbox>
        {withInfo ? (
          <Card style={{ gap: 4 }}>
            <T variant="caption" tone="muted">Ce qui sera ajouté au message</T>
            <T variant="small">{`Application : ${info.app}`}</T>
            <T variant="small">{`Android : ${info.android}`}</T>
            <T variant="small">{`Téléphone : ${info.device}`}</T>
          </Card>
        ) : null}
        <Button label="Écrire l’e-mail" icon="send" onPress={send} testID="feedback-send" accessibilityHint="Ouvre ton application e-mail avec le message prêt à envoyer" />
        {opened === true ? <T variant="small" tone="muted" testID="feedback-opened">Ton application e-mail s’est ouverte : relis le message puis envoie-le. Rien n’est envoyé tant que tu ne l’as pas fait.</T> : null}
        {opened === false ? <T variant="small" tone="warn" testID="feedback-failed">Aucune application e-mail n’a pu s’ouvrir. Écris-nous à {SUPPORT_EMAIL}.</T> : null}
      </Section>
      <T variant="caption" tone="faint">
        TITAN n’envoie rien lui-même et ne crée aucun ticket : c’est toi qui envoies le message depuis ton e-mail. Ni ton compte, ni ton adresse, ni tes séances ne sont ajoutés.
      </T>
    </Screen>
  );
}
