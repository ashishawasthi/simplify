# Simplify — design system

Source of truth for tokens: `public/css/styles.css` (`:root`). Principles: [docs/product/design-principles.md](docs/product/design-principles.md).
Audience: autistic and special-needs learners, many of them teens, some non-readers, some with motor difficulties.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#ffffff` | page |
| `--color-text` | `#1a1a1a` | body text |
| `--color-muted` | `#444444` | secondary text |
| `--color-primary` / `-dark` | `#1565c0` / `#0d47a1` | actions, amounts (blue) |
| `--color-yes-bg` / `-text` | `#e8f5e9` / `#1b5e20` | "yes" (green) |
| `--color-no-bg` / `-text` | `#fdecea` / `#b71c1c` | "no" (red) |
| `--color-border` | `#757575` | borders (≥3:1) |
| `--font-body` | 22px | body |
| `--font-amount` | 32px | amounts |
| `--font-headline` | 34px | headlines (screen title 30px, menu 34px) |
| `--target` | 64px | primary touch target |
| `--target-small` | 56px | smallest touch target |
| `--gap` | 16px | spacing |
| `--radius` | 16px | corners |

Font: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, line-height 1.4. Content column max-width 520px.

## Guardrails

- **Always use tokens**; never hard-code colours or sizes.
- Touch targets 56–96px with generous spacing; never smaller than `--target-small`.
- Text contrast WCAG AAA (7:1); non-text parts ≥ 3:1.
- **Colour + icon + plain words together** for every state (green yes, red no, blue amount) — never colour alone.
- One screen, one job. Big buttons on one menu; no settings on learner screens (adults use `#setup`).
- Respect `prefers-reduced-motion` everywhere; no decorative animation.
- Silent by default; any sound is soft, optional and starts from a tap.
- Age-neutral: no mascots, confetti, streaks, points or praise. Neutral tool names (Wait, Steps, Show a card).
- Controls appear only when they can act; no disabled buttons. Undo toast instead of confirm dialogs.
- Ignore taps in a card's first moments (no stray double taps).
- The floating yes/no pill carries the short amount; if too long, drop the word, never digits.
- Pictures: multiracial, halal-safe food by default, no logos or brands; note/coin drawings use only colour,
  proportion, metal and relative size — never the artwork.
- Plain Singapore English: short literal sentences, one idea per screen.
- Screen title takes focus on screen change (no focus ring on it); every other control keeps a visible focus ring.
