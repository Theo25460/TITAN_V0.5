// TITAN V2 — planche animée (A1 bis). Uses only real material: Blender renders (public/objects), real page captures before /
// after the dressing layer (public/shots), the SVG family (public/svg). Archivo is the product's font (OFL), loaded from public/.
import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";

const C = { bg: "#090C10", bg2: "#131920", bg3: "#1A222C", tx: "#F1F3EF", tx2: "#AEB7BD", tx3: "#838E97", cy: "#3DD9E8", am: "#F4BB54", lime: "#D7F25A" };
const font = `@font-face{font-family:Archivo;src:url(${staticFile("archivo.woff2")}) format("woff2");font-weight:100 900;font-stretch:62% 125%}`;
const T: React.CSSProperties = { fontFamily: "Archivo", color: C.tx };

const Settle: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, children, style }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
  return <div style={{ ...style, opacity: interpolate(s, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }), transform: `translateY(${(1 - s) * 18}px) scale(${0.94 + s * 0.06})` }}>{children}</div>;
};
const Title: React.FC<{ kicker?: string; title: string; sub?: string }> = ({ title, sub }) => (
  <div style={{ position: "absolute", left: 64, top: 52, width: 400 }}>
    <div style={{ ...T, fontSize: 44, fontWeight: 800, fontStretch: "75%", lineHeight: 1.05 }}>{title}</div>
    {sub ? <div style={{ ...T, color: C.tx2, fontSize: 19, marginTop: 8 }}>{sub}</div> : null}
    <div style={{ width: 64, height: 2, background: C.tx, marginTop: 14 }} />
  </div>
);

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Settle delay={4} style={{ position: "absolute", left: 640, top: 70 }}><Img src={staticFile("objects/titan-crest-512.webp")} style={{ width: 560, height: 560 }} /></Settle>
      <div style={{ position: "absolute", left: 80, top: 250, ...T }}>
        <div style={{ fontSize: 96, fontWeight: 800, fontStretch: "75%", lineHeight: 0.95, opacity: interpolate(f, [8, 22], [0, 1], { extrapolateRight: "clamp" }) }}>TITAN</div>
        <div style={{ fontSize: 30, color: C.tx2, marginTop: 14, opacity: interpolate(f, [18, 32], [0, 1], { extrapolateRight: "clamp" }) }}>Habillage V2 · matière, objets, états, mouvement</div>
        <div style={{ fontSize: 16, color: C.tx3, marginTop: 26, opacity: interpolate(f, [26, 40], [0, 1], { extrapolateRight: "clamp" }) }}>Rendus Blender réels · captures des vraies pages · aucune image générée</div>
      </div>
    </AbsoluteFill>
  );
};

const BeforeAfter: React.FC<{ before: string; after: string; title: string; sub: string; w?: number }> = ({ before, after, title, sub, w = 300 }) => {
  const f = useCurrentFrame();
  const wipe = interpolate(f, [24, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
  const h = w * 844 / 390;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Title title={title} sub={sub} />
      {[["Avant", before, 520], ["Après", after, 880]].map(([label, src, x], i) => (
        <div key={i} style={{ position: "absolute", left: x as number, top: 720 - h - 0, width: w }}>
          <div style={{ ...T, fontSize: 15, color: i ? C.cy : C.tx3, position: "absolute", top: -26 }}>{label as string}</div>
          <div style={{ width: w, height: h, overflow: "hidden", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,.5)", opacity: i ? interpolate(wipe, [0, 0.3], [0, 1]) : 1, transform: i ? `translateX(${(1 - wipe) * 40}px)` : undefined }}>
            <Img src={staticFile(src as string)} style={{ width: w }} />
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};

const Objects: React.FC = () => {
  const rows: [string, string[]][] = [
    ["Récompenses", ["record-medal", "week-pennant", "trophy", "exploration-seal", "mastery-relic", "supply-chest"]],
    ["Quatre mondes", ["veilleur-stone", "buoy", "anvil", "aurora-beacon-lit", "beacon-lit", "camp-tent"]],
    ["Ensemble · données · familles", ["rope-carabiner", "relay-baton", "stopwatch", "gps-watch", "running-shoe", "dumbbell"]],
  ];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Title title="Une seule bibliothèque d’objets" sub="Même studio, même lumière, matière qui raconte : acier, ambre = record, corail = ensemble" />
      {rows.map(([label, ids], r) => (
        <div key={r} style={{ position: "absolute", left: 64, top: 196 + r * 172, display: "flex", alignItems: "flex-end", gap: 18 }}>
          <div style={{ ...T, width: 150, fontSize: 15, color: C.tx2, alignSelf: "center" }}>{label}</div>
          {ids.map((id, i) => <Settle key={id} delay={8 + r * 10 + i * 4}><Img src={staticFile(`objects/${id}-256.webp`)} style={{ width: 160, height: 160 }} /></Settle>)}
        </div>
      ))}
    </AbsoluteFill>
  );
};

const Empty: React.FC = () => {
  const ids = ["empty-no-session", "empty-no-record", "empty-no-quest", "empty-no-friend", "empty-no-gps", "empty-sync-queue", "state-offline", "state-error"];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Title title="États vides et états système" sub="Un dessin d’une ligne, une couleur de sens, le texte reste natif et traduisible" />
      <div style={{ position: "absolute", left: 64, top: 210, display: "grid", gridTemplateColumns: "repeat(4, 270px)", gap: 18 }}>
        {ids.map((id, i) => (
          <Settle key={id} delay={6 + i * 4}><div style={{ background: C.bg2, borderRadius: 10, padding: 18, height: 200, display: "grid", placeItems: "center" }}>
            <Img src={staticFile(`svg/${id}.svg`)} style={{ width: 220, height: 165 }} /></div></Settle>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center" }}>
      <Settle delay={2}><Img src={staticFile("objects/record-medal-512.webp")} style={{ width: 300, height: 300 }} /></Settle>
      <div style={{ ...T, fontSize: 40, fontWeight: 800, fontStretch: "75%", marginTop: 10, opacity: interpolate(f, [10, 24], [0, 1], { extrapolateRight: "clamp" }) }}>L’effort réel, mis en matière.</div>
      <div style={{ ...T, fontSize: 16, color: C.tx3, marginTop: 10, opacity: interpolate(f, [16, 30], [0, 1], { extrapolateRight: "clamp" }) }}>A1 bis · démonstrateur, rien n’est publié</div>
    </AbsoluteFill>
  );
};

export const Board: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <style>{font}</style>
    <Sequence durationInFrames={90}><Intro /></Sequence>
    <Sequence from={90} durationInFrames={120}><BeforeAfter before="shots/qg--390--connected--fold.png" after="shots/v2--qg--390--connected--fold.png" title="QG" sub="La journée, la prochaine action, la progression — et les pas au premier écran" /></Sequence>
    <Sequence from={210} durationInFrames={150}><Objects /></Sequence>
    <Sequence from={360} durationInFrames={110}><BeforeAfter before="shots/profil--390--connected--full-crop.png" after="shots/v2--profil--390--connected--full-crop.png" title="Profil" sub="Une vitrine d’objets gagnés, posés sur l’acier" /></Sequence>
    <Sequence from={470} durationInFrames={110}><Empty /></Sequence>
    <Sequence from={580} durationInFrames={80}><Outro /></Sequence>
  </AbsoluteFill>
);
