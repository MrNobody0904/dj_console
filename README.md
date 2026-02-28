# 🎧 DJMIX PRO — Live DJ Console

A professional, browser-based DJ console built with the Web Audio API. Mix two tracks simultaneously with real-time EQ, effects, crossfading, BPM sync, hot cues, and a live spectrum analyzer — no plugins or installs required.

---

## Features

### Dual Deck System
- **Two independent decks (A & B)** — load and mix separate audio tracks simultaneously
- **Spinning vinyl animation** — rotates while the track plays
- **Waveform display** — clickable seek bar per deck
- **Playhead tracking** — visual position indicator in real time

### Playback Controls (per deck)
| Button | Action |
|--------|--------|
| ▶ PLAY / ⏸ PAUSE | Toggle playback |
| CUE | Set or return to cue point |
| ⟳ LOOP | Toggle loop on the active deck |
| ◄◄ / ►► | Nudge playback forward or backward |

### EQ & Mixing (per deck)
- **HIGH / MID / LOW** knobs — boost or cut frequency bands
- **FILTER** knob — sweep filter effect
- **VOL** knob — per-deck volume control
- **PITCH slider** — adjust playback speed from 50% to 200%
- **SYNC button** — match BPM to the other deck

### Master Mixer
- **Crossfader** — blend between Deck A and Deck B
- **Master Volume** — global output level control

### Effects (Master)
| Effect | Description |
|--------|-------------|
| ECHO | Delay/repeat effect |
| REVERB | Spatial room simulation |
| FLANGER | Jet-sweep modulation |
| BITCRUSH | Lo-fi digital distortion |
| PHASER | Phase shifting sweep |

### Loop Pads
Instantly set loop size: **1/2 · 1 BAR · 2 BAR · 4 BAR · 8 BAR · 16 BAR**

### Hot Cues
4 hot cue points per deck — set and trigger instant jump points during a mix.

### Visualizers
- **Spectrum Analyzer** — full-width frequency display across both decks
- **VU Meters** — real-time level meters per channel
- **BPM Display** — detected BPM shown per deck and in the master header

---

## File Structure

```
├── index.html     # App layout — dual deck UI, mixer, visualizer
├── style.css      # All styling, theming, animations
├── script.js      # Web Audio API engine, visualizer, all DJ logic
└── README.md      # This file
```

---


---

## How to Use

### Loading Tracks
1. Click **⊕ LOAD TRACK** on Deck A or Deck B
2. Select any supported audio file
3. The waveform and BPM will populate automatically

### Basic Mix Workflow
1. Load a track on **Deck A** → press **PLAY**
2. Load a track on **Deck B** → press **PLAY**
3. Use the **crossfader** to blend between the two
4. Use **PITCH** sliders + **SYNC** to match BPMs
5. Apply **EQ knobs** to shape each deck's sound
6. Drop **effects** from the master section for flair

### Hot Cues
- Click an empty **CUE** pad to mark the current position
- Click a **set** cue pad (yellow) to jump back to that point instantly

---

## Supported Audio Formats

| Format | Extension |
|--------|-----------|
| MP3    | `.mp3`    |
| WAV    | `.wav`    |
| OGG    | `.ogg`    |
| AAC    | `.aac`    |
| FLAC   | `.flac`   |
| M4A    | `.m4a`    |
| WebM   | `.webm`   |

> MP3 and WAV have the widest browser support. Use these if other formats fail to load.

---

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome 66+ | ✅ Full |
| Firefox 76+ | ✅ Full |
| Safari 14.1+ | ✅ Full |
| Edge 79+ | ✅ Full |

---

## Audio Signal Chain

```
Audio File (Deck A)          Audio File (Deck B)
       ↓                            ↓
  3-Band EQ                    3-Band EQ
  (High/Mid/Low)               (High/Mid/Low)
       ↓                            ↓
  Filter + Vol                 Filter + Vol
       ↓                            ↓
       └──────── Crossfader ────────┘
                     ↓
              Master Effects
          (Echo/Reverb/Flanger…)
                     ↓
              Master Gain Node
                     ↓
            Spectrum Analyser
                     ↓
           Audio Output (Speakers)
```


## Tech Stack

- **Vanilla JavaScript** — zero frameworks, zero dependencies
- **Web Audio API** — all audio processing is native browser DSP
- **HTML5 Canvas** — spectrum visualizer and knob rendering
- **CSS Custom Properties** — full theme via CSS variables
- **Google Fonts** — Orbitron & Share Tech Mono

---

## License

MIT — free to use, modify, and distribute.
