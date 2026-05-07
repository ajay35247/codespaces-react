# Speedy Trucks — Brand Identity System

> A premium, India-rooted, future-proof visual language for the Speedy Trucks
> logistics ecosystem. This document is the single source of truth for the
> brand, logo usage, color, typography, motion, and accessibility.

---

## 1. Brand Strategy

**Speedy Trucks** is an India-first logistics command center serving four
distinct audiences from one platform: **Shippers, Drivers, Brokers, and Fleet
Managers**. The product spans freight marketplace, GST invoicing, real-time
GPS tracking, escrow payments, KYC, and AI-assisted dispatch.

The identity therefore needs to communicate, in a single glance:

| Brand attribute     | Why it matters                                                |
| ------------------- | ------------------------------------------------------------- |
| **Trust**           | Money, vehicles, and cargo move through the platform          |
| **Velocity**        | Logistics is judged on speed of execution                     |
| **Indian rooted**   | Compliance, GST, regional scale — without being a cliché      |
| **Enterprise-ready** | Fleet managers and Fortune-500 logistics buyers              |
| **Future-proof**    | Survives the move from mobile to in-vehicle to AI dispatch    |

Positioning: **"The command center of Indian logistics."**

---

## 2. The Logo — *Velocity Trine*

The mark is a stack of three forward-pointing chevrons rendered with a
trailing-to-leading opacity gradient, set inside a cobalt rounded square.

### Symbolism

- **Three chevrons** — the three primary roles served (Shippers · Drivers ·
  Brokers/Fleet). The platform is one container, the people are three.
- **Forward direction** — every chevron points the same way: delivery,
  momentum, the next mile.
- **Opacity gradient (trailing → leading)** — the visual metaphor of motion
  blur. The eye reads it as speed without any literal "swoosh."
- **Amber leading chevron** — the destination, the payout, the reward. It is
  also a tonal nod to India's saffron, paired with cobalt depth, without
  reducing the brand to a flag.
- **Cobalt rounded square** — a digital "gem." Authority, trust, and the
  squircle silhouette modern OSes (iOS, One UI, Material You) reward.
- **Subtle horizon line** — the road. Anchors the chevrons to ground.

### Geometry rules

- Master canvas: `512 × 512`
- Container corner radius: `112` (≈22%, iOS squircle compatible)
- Chevron stroke width: `44`, `linecap=round`, `linejoin=round`
- Chevron vertices on horizontal axis y=`256`, spaced `100` apart on x
- Safe zone (clear space): equal to the height of one chevron arm (`60`)
  on every side of the container.

### Variants

| File                                           | Use                                          |
| ---------------------------------------------- | -------------------------------------------- |
| `public/brand/logo-mark.svg`                   | Master icon mark, full color                 |
| `public/brand/logo-horizontal.svg`             | Mark + wordmark lockup for headers/footers   |
| `public/brand/logo-mark-mono.svg`              | Single-color (uses `currentColor`)           |
| `public/brand/app-icon-maskable.svg`           | Android adaptive / iOS / Material You        |
| `public/favicon.svg`                           | Browser tab favicon (16/32 px optimized)     |

In React, use the `<BrandLogo />` component
(`src/components/BrandLogo.jsx`) with `variant="mark | horizontal | mono"`.

### Don'ts

- ❌ Don't recolor the cobalt container to a non-brand hue.
- ❌ Don't reorder the chevrons (the amber must lead).
- ❌ Don't rotate, shear, or outline the chevrons.
- ❌ Don't drop shadows; the gradient + glass highlight is the depth system.
- ❌ Don't place the mark on busy photography without a cobalt or white plate.

---

## 3. Color System

### Primary — *Cobalt Authority*

| Token            | Hex       | Use                                              |
| ---------------- | --------- | ------------------------------------------------ |
| Cobalt 900       | `#062463` | Gradient bottom, deep brand                      |
| **Cobalt 700**   | `#0B3D91` | **Primary brand color** (existing, preserved)    |
| Cobalt 600       | `#0A2F73` | Gradient mid-stop                                |

Cobalt is the trust register: financial-grade, enterprise-grade, and
high-contrast on white surfaces.

### Accent — *Velocity Amber*

| Token            | Hex       | Use                                              |
| ---------------- | --------- | ------------------------------------------------ |
| Amber 400        | `#FBBF24` | Gradient highlight                               |
| **Amber 500**    | `#F59E0B` | **Accent — leading chevron, CTAs, active state** |

Amber drives action: dopamine on CTAs, the "you've arrived" feeling on
delivery, and a culturally resonant warm hue.

### Neutrals & UI

| Token       | Hex       | Use                              |
| ----------- | --------- | -------------------------------- |
| Ink 950     | `#0A0F1F` | Dark mode surface                |
| Slate 100   | `#F1F5F9` | Light mode surface               |
| White       | `#FFFFFF` | Container highlights, mark fills |

### Accessibility

- Cobalt 700 on white: contrast ratio **8.9 : 1** — passes WCAG AAA for body.
- Amber 500 on cobalt: contrast ratio **5.8 : 1** — passes WCAG AA for UI.
- Never place amber text on white below 14pt (insufficient contrast).

---

## 4. Typography

The brand uses a **system-first stack** for resilience and zero font-loading
penalty, with progressive enhancement to Inter / Geist where available:

```
'Inter', 'Geist', 'SF Pro Display', system-ui,
-apple-system, 'Segoe UI', sans-serif
```

| Role            | Weight | Tracking | Notes                            |
| --------------- | ------ | -------- | -------------------------------- |
| Display / "SPEEDY" wordmark | 800 | -1.6 | Tight, confident, modern        |
| Sub-wordmark / "TRUCKS"     | 700 | +14   | Wide-tracked for engineered feel |
| H1 page title               | 600 | -0.5  | Tracking-tight                   |
| Body                        | 400 | 0     | Default                          |
| Eyebrow / Caption           | 600 | +0.3em (uppercase) | Eyebrow style          |

---

## 5. Motion & Interaction

The trine is built for motion. Recommended animations:

- **Splash / boot reveal** — chevrons enter sequentially left → right, each
  with a 120 ms stagger and 220 ms ease-out fade (total ≈ 600 ms). Reads as
  a vehicle accelerating.
- **Loading state** — cycle the trailing → leading opacity in a 1.2 s loop
  to suggest continuous forward motion. Never bounce.
- **Hover (web)** — translate the leading amber chevron 4 px right with a
  180 ms cubic-bezier(0.2, 0.8, 0.2, 1) ease.
- **Reduced-motion** — honor `prefers-reduced-motion`; show static mark.

---

## 6. App Icon System

The maskable variant (`brand/app-icon-maskable.svg`) is engineered for the
Android adaptive icon spec:

- The mark sits inside the **inner 60%** of the canvas (the guaranteed safe
  zone for circular, squircle, teardrop, and rounded-square mask shapes).
- The cobalt fill bleeds to all four edges so OS-level masks always render
  on brand color, never on a transparent background.
- It is **Material You compatible** — when themed, the chevrons retain
  contrast against the dynamic-color background.

For the iOS App Store, the same maskable SVG can be exported to a flat
1024×1024 PNG without rounded corners (Apple applies the squircle).

---

## 7. Social & Marketing

- **Open Graph / Twitter image** — use `logo-horizontal.svg` rendered to
  `1200 × 630` over a cobalt background with 80 px safe-zone padding.
- **Profile pictures** — `app-icon-maskable.svg` exported to 1080 × 1080.
- **Banners** — cobalt background, mark on the left, headline in white,
  amber underline accent (max 6 px tall, 240 px wide) under the headline.

---

## 8. Future Scalability

This system is intentionally engineered to grow:

1. **Multi-product extension** — sub-products (e.g., *Speedy Trucks
   Wallet*, *Speedy Trucks Toll*) can adopt the same cobalt gem with the
   third chevron tinted in a product-specific accent (e.g., emerald for
   wallet, magenta for toll), preserving family resemblance.
2. **Animated brand** — the trine geometry maps cleanly to Lottie /
   Rive / Framer Motion. Sequential opacity is a one-line keyframe.
3. **3D / spatial** — extruding the chevrons by 16 % depth produces a
   ready-to-render 3D mark for VisionOS, in-vehicle HUDs, and packaging.
4. **Print / vehicle livery** — the monochrome variant scales to truck
   wraps, hard-hat stencils, and embroidery without redrawing.

---

## 9. File & Code Index

| Asset / Component                          | Purpose                            |
| ------------------------------------------ | ---------------------------------- |
| `public/brand/logo-mark.svg`               | Master mark (full color)           |
| `public/brand/logo-horizontal.svg`         | Horizontal lockup (mark + wordmark) |
| `public/brand/logo-mark-mono.svg`          | Monochrome mark                    |
| `public/brand/app-icon-maskable.svg`       | Android / iOS adaptive app icon    |
| `public/favicon.svg`                       | Browser tab favicon                |
| `src/components/BrandLogo.jsx`             | React component (3 variants)       |
| `src/components/BrandHeader.jsx`           | Reference implementation in header |
| `public/manifest.json`                     | PWA icon manifest                  |
| `index.html`                               | Favicon + OG image wiring          |

---

*Last updated: 2026 · Speedy Trucks Brand Architecture*
