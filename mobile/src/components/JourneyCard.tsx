import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Codex, Format } from '../core';
import { worldImages } from '../core/images';
import { useJourney } from '../data/journey';
import { journeyModel, sourceLabel } from '../lib/journey';
import { colors, radius, space } from '../theme/tokens';
import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';
import { ProgressBar } from './Progress';
import { RewardReveal, type RevealContent } from './RewardReveal';
import { Shade } from './Shade';
import { T } from './Text';
const n = (v: number) => Format.number(v);
const date = (v: string) => new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Four familiar landscapes revealed exclusively by confirmed server acquisitions. */
export function JourneyCard({ owner }: { owner: string }) {
  const q = useJourney(), navigation = useNavigation();
  const [album, setAlbum] = useState(false), [visible, setVisible] = useState(8);
  const [scene, setScene] = useState<{ owner: string; content: RevealContent } | null>(null);
  const m = journeyModel(q.snapshot, owner), s = m?.snapshot;
  const observed = s?.observedToday;
  const confirm = async () => {
    const before = new Set(m?.earned.map(d => d.id));
    const after = await q.sync(), v = journeyModel(after, owner);
    const d = v?.earned.find(d => !before.has(d.id));
    if (d) setScene({ owner, content: { color: Codex.worlds.find(w => w.id === d.world)?.color ?? colors.cy, eyebrow: 'Découverte confirmée', title: d.name, insignia: `${n(d.steps)} pas explorés`, text: d.story, next: v?.next?.name } });
  };
  return <Card testID="journey-card" style={{ gap: space.s3 }}>
    <View style={styles.heading}><Icon name="compass" color={colors.cy} /><T variant="h3" style={{ flex: 1 }}>Les Sentiers du Titan</T></View>
    <T variant="small">Tes pas explorent les lieux ; tes séances ouvrent les chapitres. Le niveau raconte ta carrière. Trois chemins, le même effort réel.</T>
    {!m || !s ? <>
      <T variant="small" accessibilityRole={q.error ? 'alert' : undefined}>{q.loading ? 'La carte se prépare…' : 'Tes campagnes restent disponibles. Les sentiers attendent une connexion au serveur compatible.'}</T>
      {!q.loading ? <Button label="Réessayer" kind="secondary" onPress={q.refresh} /> : null}
    </> : <>
      <View style={styles.map} accessible accessibilityRole="image" accessibilityLabel={Codex.worlds.map(w => `${w.name}, ${m.earned.filter(d => d.world === w.id).length} découvertes confirmées`).join('. ')}>
        {Codex.worlds.map(w => {
          const count = m.earned.filter(d => d.world === w.id).length;
          return <View key={w.id} style={styles.region}>
            <Image source={worldImages[w.image]} resizeMode="cover" style={[StyleSheet.absoluteFill, styles.landscape, { opacity: count ? 1 : .25 }]} />
            <Shade from={count ? .1 : .35} to={.96} />
            <View style={{ gap: 4 }}><Icon name={count ? 'compass' : 'lock'} size={18} color={count ? w.color : colors.tx3} /><T variant="caption" tone={count ? 'default' : 'muted'}>{w.name}</T><T variant="caption" color={colors.tx3}>{count ? `${count} découverte${count > 1 ? 's' : ''}` : m.next?.world === w.id ? 'Le sentier se dessine' : 'Sous la brume'}</T></View>
          </View>;
        })}
      </View>
      {m.hasStepData ? <><T variant="h2">{n(s.totalSteps)} pas explorés</T><T variant="caption" tone="muted">{s.today ? `Aujourd’hui (UTC) : ${n(s.today.steps)} pas · ${s.today.sources.map(sourceLabel).join(', ')} · reçus le ${date(s.today.updatedAt)}` : 'Aucun chiffre reçu pour aujourd’hui. Tes découvertes restent acquises.'}</T></> : <T variant="small">Pas de données de pas confirmées pour le moment. Tu peux continuer les campagnes avec tes séances habituelles.</T>}
      {observed || (s.observedSteps ?? 0) > 0 ? (
        <View style={{ gap: space.s2 }}>
          <T variant="eyebrow">Aperçu des pas reçus</T>
          <T variant="small">{n(s.observedSteps ?? 0)} pas enregistrés par tes sources connectées.</T>
          {observed ? <T variant="caption" tone="muted">{n(observed.steps)} pas aujourd’hui (UTC) · {observed.sources.map(sourceLabel).join(', ')}</T> : null}
          <T variant="caption" tone="muted">Ces relevés attendent une vérification avant de débloquer des souvenirs.</T>
        </View>
      ) : null}
      {m.next ? <View style={{ gap: space.s2 }}><T variant="eyebrow" tone="accent">Prochaine découverte</T><T variant="bodyStrong">{m.next.name}</T><T variant="small">{n(m.remaining)} pas vers cette découverte</T><ProgressBar value={m.segmentPercent / 100} accessibilityLabel="Vers la prochaine découverte" />{m.nextGrand && m.nextGrand.id !== m.next.id ? <T variant="caption">Grand jalon : {m.nextGrand.name} · encore {n(m.grandRemaining)} pas.</T> : null}</View> : <T variant="bodyStrong" tone="accent">La première saga est explorée. Ton aventure continue.</T>}
      <View style={{ gap: 6 }}><T variant="caption" tone="muted">Première saga · {n(s.totalSteps)} / {n(s.goal)} pas</T><ProgressBar value={m.sagaPercent / 100} height={4} accessibilityLabel="Première saga d’exploration" /></View>
      {m.readyCount ? <><T variant="small" tone="accent">{m.readyCount} découverte{m.readyCount > 1 ? 's' : ''} prête{m.readyCount > 1 ? 's' : ''} à confirmer.</T><Button label="Révéler mes découvertes" loading={q.busy} onPress={confirm} /></> : null}
      {q.error ? <T variant="small" tone="err" accessibilityRole="alert">{q.error}</T> : null}
      <T variant="caption" tone="faint">Le maximum journalier des sources vérifiées alimente les sentiers. Les souvenirs sont cosmétiques.</T>
      <Button label={`Journal de voyage · ${m.earned.length}`} kind="ghost" icon="journal" onPress={() => setAlbum(v => !v)} />
      {album ? <View style={{ gap: space.s3 }}>{!m.earned.length ? <T variant="small">Ton premier souvenir apparaîtra après confirmation d’une découverte.</T> : m.earned.slice().reverse().slice(0, visible).map(d => <View key={d.id} style={styles.entry}><Icon name="check" color={colors.cy} size={18} /><View style={{ flex: 1, gap: 4 }}><T variant="bodyStrong">{d.name}</T><T variant="small">{d.story}</T><T variant="caption" tone="faint">{n(d.steps)} pas · Confirmé le {date(d.earnedAt!)}</T></View></View>)}{visible < m.earned.length ? <Button label="Voir les souvenirs précédents" kind="secondary" onPress={() => setVisible(v => v + 8)} /> : null}</View> : null}
    </>}
    <Button label="Mes sources de pas" kind="ghost" icon="cloud" onPress={() => navigation.navigate('Sources')} />
    <RewardReveal content={scene?.owner === owner ? scene.content : null} onClose={() => setScene(null)} />
  </Card>;
}

export function CareerMilestones({ owner }: { owner: string }) {
  const q = useJourney(), [open, setOpen] = useState(false), m = journeyModel(q.snapshot, owner);
  const [scene, setScene] = useState<{ owner: string; content: RevealContent } | null>(null);
  if (!m) return null;
  const confirm = async () => {
    const before = new Set(m.careerEarned.map(d => d.id)), s = await q.sync(), after = journeyModel(s, owner);
    const d = after?.careerEarned.find(d => !before.has(d.id));
    if (d) setScene({ owner, content: { color: colors.am, eyebrow: 'Jalon de carrière confirmé', title: d.title, insignia: `Niveau ${d.level}`, text: d.description } });
  };
  return <Card testID="career-milestones" style={{ gap: space.s3 }}><T variant="eyebrow" tone="amber">Jalons de carrière</T>
    {m.nextCareer ? <><T variant="bodyStrong">Niveau {m.nextCareer.level} · {m.nextCareer.title}</T><T variant="small">{m.nextCareer.description}</T></> : <T variant="bodyStrong">Tous les jalons de cette carrière sont acquis.</T>}
    <T variant="caption">{m.careerEarned.length} souvenir{m.careerEarned.length > 1 ? 's' : ''} acquis · Tes XP et ton rang gardent les mêmes règles.</T>
    {m.careerReadyCount ? <Button label="Confirmer mes jalons" kind="secondary" loading={q.busy} onPress={confirm} /> : null}
    {q.error ? <T variant="small" tone="err" accessibilityRole="alert">{q.error}</T> : null}
    <Button label="Mes jalons de carrière" kind="ghost" onPress={() => setOpen(v => !v)} />
    {open ? m.snapshot.career.milestones.map(d => <View key={d.id} style={styles.entry}><Icon name={d.earnedAt ? 'medal' : 'lock'} size={20} color={d.earnedAt ? colors.am : colors.tx4} /><View style={{ flex: 1, gap: 4 }}><T variant="bodyStrong" tone={d.earnedAt ? 'default' : 'muted'}>{d.title}</T><T variant="caption">Niveau {d.level} · {d.earnedAt ? `Confirmé le ${date(d.earnedAt)}` : 'À découvrir'}</T><T variant="small">{d.description}</T></View></View>) : null}
    <RewardReveal content={scene?.owner === owner ? scene.content : null} onClose={() => setScene(null)} />
  </Card>;
}

export function JourneyPreview({ owner }: { owner: string }) {
  const q = useJourney(), navigation = useNavigation(), m = journeyModel(q.snapshot, owner);
  return <Card tone="flat" onPress={() => navigation.navigate('Tabs', { screen: 'Adventure' })} accessibilityLabel="Explorer les Sentiers du Titan" style={{ gap: 6 }}><View style={styles.heading}><Icon name="compass" size={20} color={colors.cy} /><T variant="bodyStrong" style={{ flex: 1 }}>Les Sentiers du Titan</T><Icon name="chevron" size={18} color={colors.tx4} /></View><T variant="small">{m?.hasStepData && m.next ? `${n(m.remaining)} pas confirmés vers ${m.next.name}.` : 'Tes pas confirmés révèlent les lieux. Les séances font avancer les chapitres, même sans capteur.'}</T></Card>;
}
const styles = StyleSheet.create({ heading: { flexDirection: 'row', alignItems: 'center', gap: space.s2 }, map: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.r2, overflow: 'hidden', borderWidth: 1, borderColor: colors.line2 }, region: { width: '50%', minHeight: 160, padding: space.s3, justifyContent: 'flex-end', overflow: 'hidden', backgroundColor: colors.bg }, landscape: { width: '100%', height: '100%' }, entry: { flexDirection: 'row', gap: space.s3, alignItems: 'flex-start', paddingVertical: space.s2 } });
