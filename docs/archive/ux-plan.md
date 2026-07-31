# UX Level-Up Plan — Cambrian Catalyst

**Based on:** UX Design Awards 2025-2026 winners, Linear/Notion/Vercel design patterns, SaaS onboarding best practices, and sales-intelligence competitor analysis.

**Principle:** The Lora serif + warm tan palette is a **brand differentiator** — we're NOT copying Linear's cold monochrome. We're taking what the best modern tools do structurally (depth, motion, density management, delight) and applying it through our editorial voice.

---

## Current vs. target

| Dimension | Current | Target |
|---|---|---|
| **Feel** | Functional, clean, slightly clinical | Warm, confident, alive — "I trust this tool" |
| **Loading** | Mix of spinners + pulse lines + progress dots | Consistent skeleton screens everywhere |
| **Depth** | Flat cards, 1px borders only | Subtle elevation tiers (shadow-1/2/3 on interaction) |
| **Motion** | `0.15s` opacity transitions + button lift | Spring-based ease, expand/collapse animations, stage transitions |
| **Navigation** | Horizontal stepper only | Stepper + Cmd-K command palette for power users |
| **Empty states** | Inconsistent (dashed box / emoji / text / nothing) | Unified pattern: illustration + headline + CTA |
| **Focus mode** | In-call = same chrome as prep | Minimal chrome, larger type, calmer palette |
| **Celebration** | None | Subtle pulse on milestone completion |
| **Data density** | One-size-fits-all | Expandable detail rows, collapsible sections |
| **Keyboard** | None | Shortcuts for every stage transition + Cmd-K |
| **Dark mode** | Tokens ready, not wired | "Lights off" toggle — valuable for call-mode |

---

## Phase 1 — Foundation polish (1-2 days)
*Highest visual impact, lowest risk. No JSX restructuring — CSS + small component tweaks.*

### 1a. Elevation system
Cards currently are flat (1px border, no shadow). Award-winning apps use subtle elevation to signal hierarchy:

```css
.card        { box-shadow: var(--sh-1); border: none; }           /* resting */
.card:hover  { box-shadow: var(--sh-2); transform: translateY(-1px); }  /* interactive hint */
.bb          { box-shadow: var(--sh-1); }                          /* brief blocks */
.bb:hover    { box-shadow: var(--sh-2); }
```

Remove `border: 1px solid var(--line-0)` from cards/bbs; replace with shadow. Borders feel "drawn"; shadows feel "physical." One-line CSS change per class.

### 1b. Consistent spacing scale
Currently spacing is ad-hoc: 8, 10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 40. Award winners use a strict 4px grid: 4, 8, 12, 16, 24, 32, 48, 64. Add tokens:

```css
:root {
  --sp-1: 4px;    --sp-2: 8px;   --sp-3: 12px;
  --sp-4: 16px;   --sp-5: 24px;  --sp-6: 32px;
  --sp-7: 48px;   --sp-8: 64px;
}
```

Migrate progressively — don't rewrite every `padding:13px` today, but new code uses scale.

### 1c. Transitions on everything
Currently `transition: all 0.15s` on some elements, nothing on others. Award winners: every visual state change has a transition.

```css
.card, .bb, .account-item, .cohort-card, .outcome-tile, .gate-choice,
.account-chip, .river-pill, .step-item, .pw-tab, .rt, .r-tab {
  transition: all var(--t-med) var(--ease);
}
```

One rule, immediately makes the app feel "alive."

### 1d. Skeleton screens
Replace the pulse-line shimmer (currently only on BriefLoader) with a reusable skeleton pattern:

```css
.skeleton {
  background: linear-gradient(90deg, var(--bg-1) 25%, var(--bg-0) 50%, var(--bg-1) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--r-sm);
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

Use `<div className="skeleton" style={{width:'60%',height:14,marginBottom:8}}/>` anywhere data hasn't loaded yet. Consistent visual signal.

### 1e. Empty state pattern
Create a reusable EmptyState component:

```jsx
function EmptyState({ icon, title, sub, action, actionLabel }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
      {action && <button className="btn btn-primary" onClick={action}>{actionLabel}</button>}
    </div>
  );
}
```

Replace every dashed-border-emoji-text-button block with this. Consistent. Scannable. One pattern to learn.

---

## Phase 2 — Interaction layer (2-3 days)
*New components + navigation patterns. Moderate JSX restructuring.*

### 2a. Command palette (Cmd-K)
The #1 pattern from Linear/Notion/Vercel. A modal search overlay that:
- Opens on `Cmd+K` (Mac) / `Ctrl+K`
- Searches across: stages, accounts, actions ("regenerate ICP", "build brief for Walmart")
- Recent actions at top
- Fuzzy match + keyboard navigation

Implementation: `<CommandPalette>` component, rendered in App's root, listens for keyboard. Actions are a declarative registry:

```js
const COMMANDS = [
  { label: "Go to ICP", action: () => setStep(1), section: "Navigate" },
  { label: "Build Brief for...", action: (account) => pickAccount(account), section: "Actions" },
  { label: "Regenerate ICP", action: () => buildSellerICP(sellerUrl, {forceRefresh:true}), section: "Actions" },
  // ... all accounts as searchable entries
];
```

Overlay: full-width modal with search input, results list, keyboard navigation. Same pattern as VS Code / Linear / Raycast.

### 2b. Section expand/collapse
Brief blocks (`.bb`) should expand/collapse on click. Currently every section is always open — overwhelming on first load. Award-winning pattern: show first 2-3 sections expanded, rest collapsed with a one-line preview. Click to expand.

### 2c. Keyboard shortcuts
| Key | Action |
|---|---|
| `Cmd+K` | Command palette |
| `←` `→` | Previous / next stage |
| `Cmd+P` | Print current stage |
| `Cmd+S` | Save session |
| `Escape` | Close modals / deselect |
| `1-9` | Jump to stage (in-call: jump to RIVER stage) |

Wire via `useEffect` with `keydown` listener. Only active on non-input-focused elements.

### 2d. Progress celebration
When a major milestone completes (ICP built, Brief finished, Deal routed), flash a subtle green check pulse in the stepper:

```css
@keyframes celebrate {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); box-shadow: 0 0 0 8px rgba(46,107,46,0.15); }
  100% { transform: scale(1); box-shadow: none; }
}
.step-num.just-completed { animation: celebrate 0.6s var(--ease); }
```

Triggered when a step transitions from `active` to `done`. Small, non-disruptive, gives emotional feedback.

---

## Phase 3 — Focus & immersion (2-3 days)
*Changes that make the tool feel different depending on context.*

### 3a. In-Call focus mode
When `step === 7` (In-Call), the UI should feel calmer. Changes:
- Header shrinks to ~40px (just logo + confidence % + End Call button)
- Stepper hides
- Background shifts to a slightly darker tint (`--bg-0-call: #F2F0EA`)
- Typography scales up (body → 15px, questions → 16px)
- All non-essential UI hidden (save button, session bar)
- RIVER stage pill navigation becomes the primary nav

This isn't a "dark mode" — it's a context-aware density reduction. The rep needs to focus on listening, not navigating.

### 3b. Dark mode
Token infrastructure is ready. Implementation:

```css
[data-theme="dark"] {
  --bg-0: #1a1a1e;
  --bg-1: #222226;
  --bg-2: #2a2a2e;
  --surface: #28282c;
  --ink-0: #e8e6e0;
  --ink-1: #a8a6a0;
  --ink-2: #787874;
  --ink-3: #585854;
  --tan-0: #C8A87A;
  --line-0: #363634;
  --line-1: #2e2e2c;
  --sh-1: 0 1px 4px rgba(0,0,0,0.25);
  /* ... etc */
}
```

Toggle via a header button or auto-detect `prefers-color-scheme`. Tie to in-call mode: "lights off when I'm on a call."

### 3c. Stage transition animations
Currently switching steps is an instant re-render. Award winners: slide/fade transitions between major views. Achievable with a `<TransitionGroup>` wrapper:

```css
.stage-enter { opacity: 0; transform: translateX(20px); }
.stage-enter-active { opacity: 1; transform: translateX(0); transition: all 0.3s var(--ease); }
.stage-exit { opacity: 1; }
.stage-exit-active { opacity: 0; transition: opacity 0.15s; }
```

Gives a sense of "moving through a workflow" rather than "clicking through tabs."

---

## Phase 4 — Data experience (3-4 days)
*Making data-heavy screens feel simple.*

### 4a. Expandable detail rows in Accounts table
Currently every account row shows the same fields. Award-winning pattern: compact summary row → click to expand → full detail panel inline (fit rationale, ICP match, ownership badge, recent signals).

### 4b. Inline editing on Brief fields
Currently uses the `EditableField` component (click to edit). Award winners: direct inline editing (cursor shows edit icon, field becomes editable on click, saves on blur). Already partly there — but styling should make it feel more native (no visible border until hover; placeholder text matches surrounding style).

### 4c. Collapsible sidebar (optional)
For power users who work 50+ accounts: a persistent left sidebar showing their account queue, current stage, saved sessions. Collapsible to icon-only mode. Not everyone wants this — feature-flag it.

### 4d. Contextual help tooltips
Replace the static `.page-sub` text with contextual help that appears on hover over section headers. "What does this score mean?" → tooltip with explanation + link to docs. Feels more polished than a permanent subtitle.

---

## Priority recommendation

**Do Phase 1 first** (1-2 days). Every change is CSS-only or tiny component. The app immediately feels more polished:
- Cards gain subtle depth (shadows replace borders)
- Everything transitions smoothly
- Loading states are consistent
- Empty states are unified

Then decide: **Phase 2a (Cmd-K)** is the single highest-leverage interaction improvement. It's how power users navigate. Or **Phase 3a (focus mode)** if the in-call experience is the most important moment to elevate.

Phases 2-4 can be done in any order based on user feedback.

---

## What we're NOT doing (and why)

| Trend | Skip? | Reason |
|---|---|---|
| Replace Lora serif with Inter/SF Pro | ✅ Skip | Lora is our brand identity — every SaaS tool looks like Linear. We don't. |
| Go full monochrome (black/white only) | ✅ Skip | Tan/cream/editorial palette is a differentiator. Cold monochrome feels generic. |
| Add a heavy illustration system | ✅ Skip | This is a sales tool, not a consumer app. Empty-state icons are enough. |
| Rebuild as a sidebar-nav SPA | ✅ Skip | The stepper IS the product metaphor (stages of a deal). Don't fight it. |
| Add AI chat widget (Pattern B/C) | ⏳ Defer | Coming later, separate project. Don't bolt onto the current UX without design intent. |

---

## Measuring success

Before shipping Phase 1, capture a baseline:
- Screenshot every stage at current state
- Time yourself going through a full deal workflow
- Note every moment you wait, get confused, or feel "stuck"

After Phase 1:
- Same screenshots — compare side-by-side
- Same workflow timing — measure difference
- Note: do the shadows + transitions + skeletons make it feel faster even if actual speed didn't change? (Perceived performance is a design win.)
