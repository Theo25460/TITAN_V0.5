/* Social lot A — the friend paths that do not require being findable.
   InvitationCard: an opened personal link (https://titan-app.fr/social?invitation=…) shows who invites, then Accept or Ignore; nothing is
   written before « Accepter ». FriendLinkCard: create a one-use link (7 days) and send it through the system share sheet.
   BlockedAccounts: one's own blocks, with « Débloquer » (unblocking never restores the friendship). The server checks everything. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Sheet } from "../../components/Sheet";
import { T } from "../../components/Text";
import { useToast } from "../../components/Toast";
import { Format } from "../../core";
import * as api from "../../data/api";
import { keys } from "../../data/hooks";
import { errorMessage } from "../../lib/errors";
import { friendLinkMessage } from "../../lib/invite";
import { space } from "../../theme/tokens";

const LINK_MESSAGES: Record<string, string> = {
  LINK_INVALID: "Ce lien n’est plus valable : il a déjà servi, a expiré ou a été retiré. Demande un nouveau lien.",
  LINK_OWN: "C’est ton propre lien : envoie-le à la personne que tu veux inviter.",
  LINK_LIMIT_5: "Tu as déjà 5 liens en attente. Attends qu’ils servent ou qu’ils expirent.",
  SOCIAL_RATE_LIMIT: "Beaucoup d’invitations en peu de temps. Réessaie plus tard.",
};
export function linkMessage(error: unknown): string {
  const raw = String((error as { message?: string })?.message ?? error ?? "");
  const key = Object.keys(LINK_MESSAGES).find((k) => raw.includes(k));
  return key ? LINK_MESSAGES[key] : errorMessage(error);
}

export function InvitationCard({ owner, token, online, onDone }: { owner: string; token: string; online: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const preview = useQuery({ queryKey: ["friend-link", owner, token], queryFn: () => api.friendLinkPreview(owner, token), enabled: online, retry: false, staleTime: Infinity });
  const p = preview.data;
  if (!online) return <Card><T variant="small">Reconnecte-toi pour voir l’invitation que tu as reçue.</T></Card>;
  if (preview.isLoading) return <Card><T variant="small">Lecture de l’invitation…</T></Card>;
  if (preview.isError || !p?.valid) return <Card testID="invitation-invalid"><T variant="small">{LINK_MESSAGES.LINK_INVALID}</T><Button small kind="ghost" label="Fermer" onPress={onDone} /></Card>;
  if (p.own) return <Card><T variant="small">{LINK_MESSAGES.LINK_OWN}</T><Button small kind="ghost" label="Fermer" onPress={onDone} /></Card>;
  if (p.friends) return <Card><T variant="small">Vous êtes déjà amis avec {p.inviter?.name ?? "cette personne"}.</T><Button small kind="ghost" label="Fermer" onPress={onDone} /></Card>;
  async function accept() {
    setBusy(true);
    try {
      const r = await api.friendLinkAccept(owner, token);
      toast({ kind: "ok", title: `Toi et ${r.name} êtes amis`, message: "Vous voyez maintenant ce que chacun partage." });
      await qc.invalidateQueries({ queryKey: keys.social(owner) });
      onDone();
    } catch (e) {
      toast({ kind: "err", title: "Invitation impossible", message: linkMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: space.s3 }} testID="invitation-card">
      <View style={styles.row}>
        <Avatar id={p.inviter?.avatar ?? "scout"} size={44} />
        <T variant="bodyStrong" style={{ flex: 1 }}>{p.inviter?.name ?? "Un athlète"} t’invite à devenir ami</T>
      </View>
      <T variant="small">En acceptant, vous voyez ce que chacun a choisi de partager. Tu peux retirer ou bloquer à tout moment.</T>
      <View style={styles.row}>
        <Button small label="Accepter" loading={busy} onPress={accept} testID="invitation-accept" />
        <Button small kind="ghost" label="Ignorer" disabled={busy} onPress={onDone} testID="invitation-ignore" />
      </View>
    </Card>
  );
}

export function FriendLinkCard({ owner, online }: { owner: string; online: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!online) return toast({ kind: "warn", title: "Connexion requise", message: "Créer un lien demande Internet." });
    setBusy(true);
    try {
      const r = await api.friendLinkCreate(owner);
      await Share.share({ message: friendLinkMessage(r.token) }).catch(() => {});
    } catch (e) {
      toast({ kind: "err", title: "Lien non créé", message: linkMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: space.s2 }} testID="friend-link-card">
      <T variant="bodyStrong">Inviter un ami par lien</T>
      <T variant="small">Un lien pour une seule personne, valable 7 jours. Ton profil reste privé : seule la personne qui l’ouvre te voit et choisit d’accepter.</T>
      <Button small icon="share" label="Créer et partager un lien" loading={busy} onPress={create} testID="friend-link-create" />
    </Card>
  );
}

export function BlockedAccounts({ owner, online }: { owner: string; online: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["blocks", owner], queryFn: () => api.fetchBlocks(owner), enabled: open && online, retry: false, staleTime: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  async function unblock(id: string) {
    setBusy(id);
    try {
      await api.unblockUser(owner, id);
      toast({ kind: "ok", title: "Compte débloqué" });
      await q.refetch();
    } catch (e) {
      toast({ kind: "err", title: "Action impossible", message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }
  const list = q.data ?? [];
  return (
    <>
      <Button small kind="ghost" icon="lock" label="Comptes bloqués" onPress={() => setOpen(true)} testID="blocked-open" />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Comptes bloqués">
        {!online ? <T variant="small">Reconnecte-toi pour voir tes blocages.</T>
          : q.isLoading ? <T variant="small">Chargement…</T>
          : q.isError ? <T variant="small">{errorMessage(q.error)}</T>
          : !list.length ? <T variant="small">Tu n’as bloqué personne.</T>
          : (
            <View style={{ gap: space.s3 }}>
              <T variant="caption" tone="muted">Débloquer permet de nouveau les demandes et les liens. L’amitié n’est pas rétablie : il faudra se redemander.</T>
              {list.map((b) => (
                <View key={b.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong">{b.name}</T>
                    <T variant="caption" tone="faint">Bloqué {Format.relativeDay(b.at)}</T>
                  </View>
                  <Button small kind="secondary" label="Débloquer" loading={busy === b.id} onPress={() => unblock(b.id)} testID={`unblock-${b.id}`} />
                </View>
              ))}
            </View>
          )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: space.s3, flexWrap: "wrap" } });
