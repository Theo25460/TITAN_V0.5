#!/usr/bin/env python3
"""Original sound design for the TITAN hero ad, synthesised from scratch (no sample, no third-party music).
Usage: ad-audio.py <cues.json> <out.wav>. Cues come from the ad page (window.CUES): cuts land on a 100 BPM grid."""
import json, sys, wave
import numpy as np

SR = 44100
cues = json.load(open(sys.argv[1])); OUT = sys.argv[2]
T = cues["total"]; N = int((T + 0.02) * SR)
rng = np.random.default_rng(7)
stems = {k: np.zeros((2, N)) for k in ("pad", "drums", "bass", "bells", "fx")}

def tt(d): return np.arange(int(d * SR)) / SR
def filt(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    if hi: X *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: X *= 1 - 1 / np.sqrt(1 + (f / lo) ** 4)
    return np.fft.irfft(X, len(x))
def add(stem, sig, t, gain=1.0, pan=0.0):
    i = int(round(t * SR)); n = min(len(sig), N - i)
    if n <= 0 or i < 0: return
    a = (pan + 1) * np.pi / 4
    stems[stem][0, i:i + n] += sig[:n] * gain * np.cos(a) * 1.414
    stems[stem][1, i:i + n] += sig[:n] * gain * np.sin(a) * 1.414
def env(n, att, rel):
    e = np.ones(n); a = int(att * SR); r = int(rel * SR)
    e[:a] = np.linspace(0, 1, a) ** 1.5; e[n - r:] = np.linspace(1, 0, r) ** 1.5
    return e

def kick(d=0.45, f0=150, f1=50, tau=0.13, click=0.2):
    t = tt(d); f = f1 + (f0 - f1) * np.exp(-t / 0.03); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / tau) + 0.35 * np.sin(2 * ph) * np.exp(-t / (tau * 0.6)) + rng.standard_normal(len(t)) * np.exp(-t / 0.004) * click
def impact(d=2.2, tau=0.45):
    t = tt(d); body = kick(d, 120, 40, 0.34, 0.3)
    air = filt(rng.standard_normal(len(t)), lo=180, hi=1400) * np.exp(-t / tau) * 0.5
    return body + air
def riser(d):
    t = tt(d); n = filt(rng.standard_normal(len(t)), lo=500, hi=6000) * (t / d) ** 2.4
    sw = np.sin(2 * np.pi * np.cumsum(260 + 900 * (t / d) ** 2) / SR) * (t / d) ** 2 * 0.25
    return (n * 0.6 + sw) * env(len(t), 0.02, 0.012)
def pad(freqs, d, att=0.22, rel=0.45):
    t = tt(d); s = np.zeros(len(t))
    for k, f in enumerate(freqs):
        s += np.sin(2 * np.pi * f * t) + 0.55 * np.sin(2 * np.pi * f * 1.004 * t + k) + 0.22 * np.sin(2 * np.pi * 2 * f * t + 2 * k) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 0.42 * t)
    return s / len(freqs) * env(len(t), att, rel) * trem
def pluck(f, d=0.42, tau=0.15):
    t = tt(d); s = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2 * f * t) + 0.18 * np.sin(2 * np.pi * 3 * f * t) + 0.08 * np.sin(2 * np.pi * 4 * f * t)
    return s * np.exp(-t / tau) * env(len(t), 0.004, 0.03)
def bell(f, d=2.0, tau=0.55):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / tau) + 0.45 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (tau * 0.55)) + 0.2 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / (tau * 0.3))
    return s * env(len(t), 0.003, 0.05)
def tick(f, d=0.05):
    t = tt(d); return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t / 0.008)

D3, F3, G3, A3, Bb3, C4, D4, E4, F4, G4, A4, C5, D5, E5 = 146.83, 174.61, 196.0, 220.0, 233.08, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 523.25, 587.33, 659.25
Bb2, C3, F2, D2 = 116.54, 130.81, 87.31, 73.42
CH = {"Dm": ([D3, A3, D4, F4], D2 * 2), "Bb": ([Bb2, F3, Bb3, D4], Bb2), "F": ([F3, A3, C4, F4], F2 * 2), "C": ([C3, G3, C4, E4], C3), "Dm9": ([D3, A3, D4, F4, A4, E5 / 2], D2 * 2)}
cuts = cues["cuts"]; B = 0.6
# One chord per scene (i–VI–III–VII twice); the tonic resolves exactly on the end card.
plan = [(cuts[0], cuts[1], "Dm"), (cuts[1], cuts[2], "Bb"), (cuts[2], cuts[2] + 1.8, "F"), (cuts[2] + 1.8, cuts[3], "C"),
        (cuts[3], cuts[4], "Dm"), (cuts[4], cuts[5], "Bb"), (cuts[5], cuts[6], "F"), (cuts[6], cuts[7], "C"), (cuts[7], T, "Dm9")]
for a, b, name in plan:
    notes, root = CH[name]
    level = 0.34 if a >= cuts[7] else 0.3 if cuts[2] <= a < cuts[3] else 0.24
    add("pad", pad(notes, b - a + 0.3, 0.2 if a else 0.05, 0.5 if b < T else 1.2), a, level)
    # Driving 8th-note pulse from the three steps to the last places; quarter notes before, nothing on the end card.
    if cuts[3] <= a < cuts[7]:
        t = a
        while t < b - 1e-6:
            add("drums", kick(), t, 0.26); add("bass", pluck(root), t, 0.3); add("bass", pluck(root * 2), t + B / 2, 0.16, 0.25)
            t += B
    elif a < cuts[3]:
        t = a
        while t < b - 1e-6:
            add("bass", pluck(root * 2), t, 0.15, -0.2); t += B

add("drums", impact(1.6, 0.3), cuts[0], 0.26)                       # hook
add("drums", impact(1.6, 0.3), cuts[1], 0.24)                        # « Il se gagne à l'effort »
add("fx", riser(0.6), cues["prize"] - 0.6, 0.3)                     # into the prize
add("drums", impact(2.4, 0.6), cues["prize"], 0.42)                 # 20 accès TITAN+ à vie
add("bells", bell(A4 * 2, 2.2, 0.7), cues["prize"] + 0.02, 0.2, 0.2); add("bells", bell(F4 * 2, 2.2, 0.7), cues["prize"] + 0.02, 0.13, -0.2)
for k, t in enumerate(cues["steps"]):
    add("bells", bell([D5, F4 * 2, A4 * 2][k], 0.9, 0.22), t + 0.02, 0.1, [-0.3, 0, 0.3][k])   # one rising note per step
add("bells", bell(A4 * 2, 1.8, 0.5), cues["confirm"], 0.17, -0.15); add("bells", bell(D5 * 2, 2.0, 0.6), cues["confirm"] + 0.16, 0.17, 0.15)  # séance confirmée
for i, t in enumerate(cues["ticks"]):
    add("fx", tick(1500 + 55 * i), t, 0.07 + 0.002 * i, -0.6 + 1.2 * (i % 5) / 4)             # the 20 places
add("bells", bell(E5, 1.6, 0.45), cues["lock"], 0.2)
add("fx", riser(0.6), cues["end"] - 0.6, 0.22)
add("drums", impact(2.6, 0.7), cues["end"], 0.4)                    # end card
add("bells", bell(A4 * 2, 2.6, 0.9), cues["end"] + 0.04, 0.15, -0.2); add("bells", bell(D5 * 2, 2.8, 1.0), cues["end"] + 0.34, 0.16, 0.2)

def rms_db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
for k, v in stems.items(): print(f"stem {k:6s} rms {rms_db(v):6.1f} dB  peak {20 * np.log10(np.abs(v).max() + 1e-9):6.1f} dB")
dry = sum(stems.values())
# Light hall: convolution with a decaying noise tail; drums stay mostly dry.
ir_t = tt(1.5); wet_in = stems["pad"] * 0.8 + stems["bells"] * 1.0 + stems["fx"] * 0.6 + stems["drums"] * 0.18 + stems["bass"] * 0.3
wet = np.zeros_like(dry)
for c in range(2):
    ir = filt(np.random.default_rng(11 + c).standard_normal(len(ir_t)) * np.exp(-ir_t / 0.38), lo=250, hi=5200); ir /= np.sqrt(np.sum(ir ** 2))
    n = N + len(ir) - 1; wet[c] = np.fft.irfft(np.fft.rfft(wet_in[c], n) * np.fft.rfft(ir, n), n)[:N]
mix = dry + 0.2 * wet
mix = np.stack([filt(mix[c], lo=38) for c in range(2)])
mix /= np.abs(mix).max(); mix = np.tanh(1.3 * mix) / np.tanh(1.3)          # gentle saturation instead of hard clipping
fade = int(0.9 * SR); mix[:, -fade:] *= np.linspace(1, 0, fade) ** 1.6; mix[:, :64] *= np.linspace(0, 1, 64)
mix *= 10 ** (-1.5 / 20) / np.abs(mix).max()
print(f"mix rms {rms_db(mix):.1f} dB peak {20 * np.log10(np.abs(mix).max()):.1f} dB len {N / SR:.2f}s")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix.T * 32767).astype("<i2").tobytes())
