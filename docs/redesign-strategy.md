# Telekonferans — "Living Translation OS" Redesign Strategy

> Pre-implementation deliverable. Audit → strategy → wireframes → motion language →
> design tokens → phased plan. Functionality is **frozen**; only experience changes.

## 0. Honest constraints (these shape every decision)

1. **Functionality is identical.** All LiveKit/Gemini logic, the per-(language,voice)
   bridge model, floor control, transcripts, screen-share, and security stay byte-for-byte.
   This is a **presentation** rewrite.
2. **Capability-honest presence.** The product does **voice translation + screen share**.
   It does **not** do computer vision, object detection, or tool-calling. We will NOT
   fake "vision processing" / "tool execution" states — that's deceptive UI. The real,
   alive states are: **Connecting · Idle · Listening · Translating · Speaking ·
   Sharing screen · Floor handoff**. (Camera was intentionally removed earlier.)
3. **Blind authoring.** This environment can't screenshot the running app, so pixel-level
   award polish requires the user's eyes for iteration. The plan front-loads tokens +
   motion primitives so iteration is cheap.
4. **Stack migration is real work.** App is currently plain CSS. Tailwind v4 + shadcn/ui +
   Radix is a full restyle migration (see Phase plan). Decision gate before Phase 1.

## 1. UI/UX audit — current state

### Strengths (keep)
- Dark theme, glass panels, aurora background, framer-motion, lucide icons already in.
- Solid loading feedback (mic handoff, "preparing", request spinners).
- Per-listener language + voice selection — genuinely differentiated.
- Full-screen app shell; only inner regions scroll.

### Weak points (fix)
| # | Area | Problem | Direction |
|---|------|---------|-----------|
| W1 | Empty/first screen | Landing is a centered column — not the "living AI" moment | Cinematic hero with an interactive **AI orb** that reacts to presence |
| W2 | Conversation surface | Transcript is a plain stacked list | **Spatial conversation canvas**: speaker-anchored, streaming token reveal, depth |
| W3 | Voice presence | A 5-bar waveform only | **Voice visualizer**: breathing orb + live audio spectrum, state-morphing |
| W4 | Hierarchy | Panels are visually equal "cards everywhere" | Establish a **primary stage** (conversation) vs. ambient **side rails** (controls) |
| W5 | Controls | Selects/buttons are utilitarian | shadcn/Radix primitives: command-style language picker, segmented voice control |
| W6 | Depth | Single elevation, flat panels | **4-level elevation** + parallax + dynamic shadow on interaction |
| W7 | Motion | Entrance + a few transitions | Cohesive **spring-based motion system**, shared-layout transitions between states |
| W8 | Type | One display face | Premium **type hierarchy** (display / heading / body / mono / numeric) |

## 2. Redesign strategy & information architecture

**North star:** a calm, cinematic "translation console" where the **conversation is the
stage** and everything else is ambient, floating, and recedes until needed.

Three surfaces (same routes/logic):
- **/** → *Empty State as Hero.* AI orb, ambient particles, one decisive CTA. Award target.
- **/session/[id]/broadcast** → *Host Console.* Conversation stage center; floating
  control rail (mic/screen/voice/language), floating presence rail (participants/floor),
  invite as a glass overlay.
- **/session/[id]/watch** → *Listener Canvas.* Conversation stage center; compact floating
  control dock (language + voice + speak); presence chip in the spatial top bar.

IA principle: **one primary focus per screen**, controls orbit it. Mobile collapses the
rails into a bottom **dock** (Raycast/Arc-style), stage stays full-bleed.

## 3. Design tokens (grounded in ui-ux-pro-max: Spatial UI + Dimensional Layering)

```css
/* ——— Color: deep space + electric blue, violet companion ——— */
--bg-0: #05070D;            /* deepest */
--bg-1: #090C14;
--bg-2: #0E121C;
--glass: rgba(255,255,255,0.045);
--glass-strong: rgba(255,255,255,0.08);
--glass-border: rgba(255,255,255,0.10);
--glass-blur: 40px;         /* backdrop blur */
--glass-saturate: 180%;

--fg: #ECF0F7;
--fg-2: #A4AEC0;
--fg-3: #6B7588;
--fg-ghost: #3C4454;

--brand: #4F8DF7;           /* trust blue (user-chosen) */
--brand-2: #8B5CF6;         /* violet */
--brand-3: #22D3EE;         /* cyan edge for spectrum */
--brand-soft: rgba(79,141,247,0.14);
--brand-glow: rgba(79,141,247,0.45);

--ok: #34D399;  --warn: #FBBF24;  --err: #F87171;

/* ——— Elevation (4 levels) + dynamic ——— */
--e1: 0 1px 3px rgba(0,0,0,0.4);
--e2: 0 6px 16px -6px rgba(0,0,0,0.55);
--e3: 0 18px 40px -16px rgba(0,0,0,0.65);
--e4: 0 40px 80px -28px rgba(0,0,0,0.75);
--glow: 0 0 0 1px var(--brand-soft), 0 0 40px -6px var(--brand-glow);

/* ——— Radius ——— */
--r-sm: 12px; --r-md: 18px; --r-lg: 26px; --r-pill: 999px;

/* ——— Space (4px base) ——— */
4 8 12 16 20 24 32 40 56 72 96

/* ——— Type ——— */
--font-display: "Space Grotesk";   /* or Geist if added */
--font-body: "DM Sans";
--font-mono: "DM Mono";
scale: 72/56 display · 32/24 heading · 18/15 body · 13 small · 11 label(mono,upper)

/* ——— Motion ——— */
--spring-soft:  { stiffness: 260, damping: 30 }
--spring-snappy:{ stiffness: 420, damping: 32 }
--ease-out: cubic-bezier(0.22, 1, 0.36, 1)
--dur-fast: 0.18s  --dur: 0.32s  --dur-slow: 0.6s
```

## 4. Motion language

Principles: **spring over linear; enter from intent; nothing static; reduced-motion honored.**

| Token | Use | Behavior |
|-------|-----|----------|
| `presence.orb` | AI orb | continuous breathing scale 0.96↔1.04; hue/scale shifts per state |
| `enter.stage` | panels/stage | fade + y:14 + scale:0.98 → spring-soft, staggered 60ms |
| `transition.state` | speak/floor/presence | AnimatePresence cross-fade + y, spring-snappy |
| `stream.token` | translation text | tokens reveal with 12ms stagger, opacity+blur(2px)→0 |
| `spectrum` | voice bars | per-bar height driven by audio level (or idle breathing) |
| `hover.lift` | interactive surfaces | y:-2, shadow e2→e3, 150ms |
| `press` | buttons | scale 0.97 spring |
| `layout` | dock/rail reflow | framer `layout` shared transitions |

Presence → motion mapping (honest):
- **Connecting**: orb slow pulse, muted; skeletons on rails.
- **Listening** (mic live): orb cyan ring, spectrum reactive.
- **Translating** (Gemini active, before audio): orb violet shimmer + "Çeviriliyor" with streaming dots.
- **Speaking** (translated audio playing): orb blue bloom, spectrum strong, transcript streams.
- **Sharing**: stage adds a framed screen tile with soft-focus vignette.

## 5. Wireframes (markdown)

### 5.1 Landing — Empty State as Hero
```
┌───────────────────────────────────────────────────────────┐
│  ·  ambient particles + layered gradient + grain          │
│                                                            │
│                   ╭─────────────╮                          │
│                   │   ◜ AI ORB ◝ │   ← breathing, reactive  │
│                   ╰─────────────╯                          │
│            CANLI ÇEVİRİ PLATFORMU (eyebrow)                │
│        Herkes kendi dilinde **dinler.**  (display)         │
│        tek cümle değer önermesi (body, muted)              │
│                                                            │
│              ▰▰▰  Yayın başlat  →   (primary, glow)        │
│                                                            │
│   01 konuş   02 paylaş   03 herkes kendi dilinde dinler    │
│        (floating glass step chips, hover-lift)             │
└───────────────────────────────────────────────────────────┘
UX: one decision. Orb = "living AI". Steps recede as chips, not a list.
Motion: orb breathing loop; content staggers in; CTA magnetic hover.
A11y: orb decorative (aria-hidden); CTA real button; reduced-motion stills orb.
```

### 5.2 Broadcast — Host Console (desktop)
```
┌── glass top bar ───────────────────────────────────────────┐
│ ◉ Yayın · {id}        ●Canlı  ◴ 12 dinleyici      [Bitir]  │
├───────────────┬─────────────────────────────┬──────────────┤
│  CONTROL RAIL │      CONVERSATION STAGE       │ PRESENCE RAIL│
│ (floating)    │      (primary focus)          │ (floating)   │
│               │                               │              │
│  ◜orb◝ state  │   ┌ speaker bubble ─────────┐ │  Katılımcılar│
│  ▰▰▰ spectrum │   │ 🗣 source (muted)        │ │  ◯ Ada  ✋   │
│               │   │ 🌐 translation (stream)  │ │  ◯ Mert 🎙  │
│  Mikrofon  ⏺  │   └──────────────────────────┘ │   söz ver →  │
│  Ekran     ⤴  │   ┌──────────────────────────┐ │              │
│  Dil    ⌘K    │   │ … streaming tokens …     │ │  Çeviriler   │
│  Ses    ◑     │   └──────────────────────────┘ │  🇹🇷 Kore ·3 │
│               │                               │  🇬🇧 Puck ·1 │
│  [QR davet]   │   (auto-scroll, depth fade)    │              │
└───────────────┴─────────────────────────────┴──────────────┘
UX: stage centered; rails float with blur over the ambient bg.
Mobile: rails → bottom dock (swipe), stage full-bleed, presence in a sheet.
```

### 5.3 Watch — Listener Canvas
```
┌── glass top bar ───────────────────────────────────────────┐
│ ◉ Dinleme · {id}     [presence chip: ●Çeviriliyor…]        │
├─────────────────────────────────────────────┬──────────────┤
│            CONVERSATION STAGE                 │  (optional   │
│       speaker bubbles + streaming text        │   screen     │
│            voice visualizer header            │   tile)      │
├───────────────────────────────────────────────┴─────────────┤
│  FLOATING DOCK:  [Dil ⌘K] [Ses ◑] [✋ Söz iste]            │
└──────────────────────────────────────────────────────────────┘
UX: listener's job is to read+hear → stage dominates; dock is one glass bar.
Motion: presence chip morphs Connecting→Listening→Translating→Speaking.
```

### 5.4 Mobile (all)
```
┌─────────────┐  top bar (compact, glass)
│ presence     │
├─────────────┤
│   STAGE      │  full-bleed, streaming bubbles
│  (scrolls    │
│   internally)│
├─────────────┤
│ ▰ dock ▰     │  Dil · Ses · Mikrofon/Söz  (44px targets)
└─────────────┘  page never scrolls; stage scrolls
```

## 6. Component library (shadcn/Radix/21st → ours)
- **Dialog/Sheet** (Radix) → invite overlay, mobile presence sheet.
- **Popover/Command** (shadcn `Command`) → ⌘K language picker (161-lang search).
- **Tooltip, Toggle, Tabs, ScrollArea, Avatar** (Radix) → controls, segmented voice, rails.
- **Sonner** (toasts) → "söz verildi", errors.
- **21st.dev** → animated hero, aurora background, spectrum/orb references (adapt, not copy).
- Custom (design-system/): `<AIOrb/>`, `<VoiceSpectrum/>`, `<PresenceChip/>`,
  `<SpeakerBubble/>`, `<GlassPanel/>`, `<StreamingText/>`.

## 7. Proposed architecture
```
src/
  design-system/   tokens.css, theme, primitives (GlassPanel, Orb, Spectrum)
  features/        broadcast/ watch/ landing/  (screen-specific composition)
  components/ui/   shadcn/Radix wrappers
  hooks/           usePresenceState, useAudioLevel, useFloor
  animations/      variants.ts (shared framer-motion variants), springs.ts
  lib/             (unchanged: livekit/gemini logic)
```

## 8. Phased implementation plan
- **Phase 0 — Foundation (decision gate):** add Tailwind v4 + shadcn init + tokens +
  motion primitives. No visual change to logic. *Verify build green.*
- **Phase 1 — Design system:** GlassPanel, AIOrb, VoiceSpectrum, PresenceChip,
  StreamingText, springs/variants. Storybook-less but isolated.
- **Phase 2 — Landing (hero/empty state):** the award screen first (highest ROI, lowest risk).
- **Phase 3 — Conversation stage:** SpeakerBubble + streaming transcript + auto-scroll depth.
- **Phase 4 — Broadcast console:** rails, controls (⌘K picker, segmented voice), invite overlay.
- **Phase 5 — Watch canvas + mobile dock.**
- **Phase 6 — Presence/motion polish, a11y pass, reduced-motion, perf (blur budget).**

Each phase: `tsc` green + page serves + **user visual review** before next.

## 9. Per-screen reasoning (summary)
- **Landing:** Goal = communicate "living AI" in 2s. Decision = single orb + one CTA
  (Perplexity/OpenAI calm). Motion = breathing + magnetic CTA. A11y = orb aria-hidden,
  full keyboard, reduced-motion stills.
- **Broadcast:** Goal = control without losing the conversation. Decision = center stage +
  floating rails (Arc/Linear). Motion = state cross-fades, floor handoff spring. A11y =
  focus order stage→controls→presence, live-region for transcript.
- **Watch:** Goal = effortless read+listen. Decision = stage-dominant + one dock. Motion =
  presence chip morph, token streaming. A11y = transcript `aria-live="polite"`.
```
```
