import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Field } from "./Field";
import { T } from "./Text";
import { useOwner } from "../data/auth";
import { loadGuildChat, postGuildMessage, type GuildMessage } from "../lib/nativeConnections";
import { useOnline } from "../lib/network";

type Chat = { owner: string; messages: GuildMessage[]; maxLength: number; cost: number };
export function GuildChat() {
  const owner = useOwner(); const online = useOnline();
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const sending = useRef(false); const generation = useRef(0);
  async function reload(epoch = generation.current) {
    try { const result = await loadGuildChat(owner); if (epoch === generation.current) { setChat({ ...result, owner }); setError(null); } }
    catch { if (epoch === generation.current) setError("Messages indisponibles. Réessaie avec une connexion."); }
  }
  useEffect(() => { const epoch = ++generation.current; setText(""); setChat(null); reload(epoch); return () => { generation.current++; }; }, [owner]);
  async function send() {
    if (sending.current || !online || chat?.owner !== owner) return;
    const epoch = generation.current; sending.current = true; setBusy(true); setError(null);
    try {
      await postGuildMessage(owner, text, chat.maxLength);
      if (epoch !== generation.current) return;
      setText(""); await reload(epoch);
    } catch { if (epoch === generation.current) setError("Envoi non confirmé. Ton texte est conservé : actualise les messages avant de réessayer."); }
    finally { sending.current = false; if (epoch === generation.current) setBusy(false); }
  }
  const current = chat?.owner === owner ? chat : null;
  return <Card>
    <T variant="bodyStrong">Messages de la guilde</T>
    <T variant="caption" tone="muted">Visibles par les membres de ta guilde pendant 72 heures. Aucun envoi automatique.</T>
    {current?.messages.map((m) => <Card key={m.id}><T variant="small">{m.sender_name}</T><T>{m.content}</T></Card>)}
    {current && !current.messages.length ? <T tone="muted">Aucun message récent.</T> : null}
    <Field label="Ton message" value={text} onChangeText={setText} multiline maxLength={current?.maxLength ?? 280} editable={!busy} testID="guild-message" />
    <Button label={current?.cost ? `Envoyer · ${current.cost} crédits` : "Envoyer"} disabled={!current || !text.trim() || !online} loading={busy} onPress={send} testID="guild-send" />
    <Button small kind="ghost" label="Actualiser les messages" onPress={() => reload()} disabled={busy} />
    {error ? <T tone="warn" accessibilityRole="alert">{error}</T> : null}
  </Card>;
}
