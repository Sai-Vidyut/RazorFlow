# RazorFlow design system

Original identity for a merchant commerce agent. Not a dashboard template, not a chatbot, not a glass demo.

**Design read:** trust-first fintech product for merchants and hackathon judges, quiet premium-neutral language, custom Tailwind tokens, liquid glass used as a web approximation on high-value surfaces only.

**Phase 8 composition:** Landing uses conversion hierarchy (levels) and premium restraint on hero + bento metrics. Desk uses geometric stage rail (01–03) and agentic outcome focus on the decision column. Admin uses enterprise/ant data hierarchy on stat strips and tables. Glass remains selective: hero demo, decision panel, GMV metric, payment overlay, CTA band.

## Dials

| Surface | Variance | Motion | Density |
| --- | --- | --- | --- |
| Landing | 6 | 5 | 4 |
| Desk / Policies / Admin | 4 | 4 | 6 |

## Tokens

| Token | Light | Role |
| --- | --- | --- |
| `--rf-canvas` | `#E8EEF2` | Cool mist page ground |
| `--rf-ink` | `#101820` | Primary text |
| `--rf-muted` | `#5C6873` | Secondary text |
| `--rf-accent` | `#0B5F5A` | Single accent, primary actions |
| `--rf-success` | `#1F7A4D` | Allowed, captured |
| `--rf-warning` | `#9A6700` | Awaiting, caution |
| `--rf-danger` | `#B42318` | Failed, blocked |
| `--rf-radius-control` | `8px` | Buttons, inputs |
| `--rf-radius-panel` | `12px` | Surfaces |
| `--rf-radius-glass` | `16px` | Overlays |

Type: Outfit (UI) + IBM Plex Mono (money, IDs, audit). Icons: Phosphor Regular.

## Depth

1. Canvas (dotted field)
2. Primary surfaces (opaque)
3. Agent / metric glass
4. Sticky nav
5. Transaction overlay

## Glass

Web approximation of liquid glass (`backdrop-filter`, inner highlight, luminous border). Not an Apple CSS package. Use on the agent rail, payment overlay, active workflow step, and the GMV metric. Never on dense tables.

## Motion

Compositor-only (`transform`, `opacity`). Meaning: agent activity, policy result, payment progress, success, failure recovery. Disabled under `prefers-reduced-motion`.
