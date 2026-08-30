# Technical Studio Design Tokens

The Technical Studio visual foundation is defined in `src/styles.css` on
`:root`. New visual work should use the `--ts-*` variables below rather than
introducing page-specific color, spacing, or control values.

## Surfaces

| Token                  | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `--ts-bg-app`          | Application shell and low-level chrome     |
| `--ts-bg-workspace`    | Main editor workspace                      |
| `--ts-bg-panel`        | Persistent panels and bars                 |
| `--ts-bg-raised`       | Neutral raised controls                    |
| `--ts-bg-inset`        | Panel-inset and compact secondary surfaces |
| `--ts-bg-hover`        | Hovered controls and rows                  |
| `--ts-bg-pressed`      | Pressed or transient neutral controls      |
| `--ts-bg-selected`     | Selected or active controls                |
| `--ts-bg-popover`      | Floating surfaces and tooltips             |
| `--ts-bg-input`        | Text-entry fields                          |
| `--ts-bg-canvas-frame` | Preview/canvas framing surface             |

## Text, borders, and semantic states

Text uses `--ts-text-primary`, `--ts-text-strong`, `--ts-text-control`,
`--ts-text-secondary`, `--ts-text-muted`, `--ts-text-disabled`,
`--ts-text-on-accent`, and `--ts-text-accent` according to information
priority. Structural lines use `--ts-border-subtle`,
`--ts-border-default`, `--ts-border-strong`, `--ts-border-selected`, and
`--ts-border-focus`.

The accent family is `--ts-accent`, `--ts-accent-surface`, and `--ts-focus`.
Interaction states are explicit through `--ts-state-hover-surface`,
`--ts-state-pressed-surface`, `--ts-state-selected-surface`,
`--ts-state-selected-border`, `--ts-state-disabled-surface`,
`--ts-state-disabled-text`, and `--ts-state-focus-ring`. Semantic messaging
uses `--ts-state-info`, `--ts-state-success`, `--ts-state-warning`, and
`--ts-state-danger`, with dedicated info/danger/warning surface and border
tokens where the existing UI needs them.

## Type and layout scales

Typography uses `--ts-font-family-ui` for interface text and
`--ts-font-family-mono` for exact technical values. The durable interface
scale is `--ts-font-size-meta` (11 px), `--ts-font-size-compact` (12 px),
`--ts-font-size-body` (13 px), and `--ts-font-size-value` (14 px).

Spacing is `--ts-space-micro` (4 px), `--ts-space-dense` (6 px),
`--ts-space-control` (8 px), `--ts-space-group` (12 px),
`--ts-space-section` (16 px), and `--ts-space-major` (24 px).

Controls use `--ts-control-height-compact` (28 px),
`--ts-control-height-standard` (32 px), and
`--ts-hit-target-toolbar` (32 px). Icon sizing starts at
`--ts-icon-size-small` (16 px) and `--ts-icon-size-medium` (20 px).

## States and motion

Use `--ts-border-width`, `--ts-radius-control`,
`--ts-radius-popover`, and `--ts-radius-canvas-frame` for structural sizing.
Interaction timing is intentionally restrained: `--ts-motion-hover` (80 ms),
`--ts-motion-popover` (120 ms), and `--ts-motion-collapse` (160 ms). The
shared `--ts-transition-interaction` covers ordinary control color changes;
painting and other latency-sensitive editor actions remain immediate.

The focus contract is `--ts-focus-ring` with
`--ts-focus-ring-offset`. Selected and disabled states must remain
distinguishable from color alone through borders, indicators, or text changes.

The older `--color-*` and `--radius-control` names remain compatibility
aliases for existing selectors during the Roadmap 4 migration. They should
not be extended in new code.

Canvas source colors and rendering behavior are not represented by these UI
tokens. The skin document remains the authority for pixel data.
