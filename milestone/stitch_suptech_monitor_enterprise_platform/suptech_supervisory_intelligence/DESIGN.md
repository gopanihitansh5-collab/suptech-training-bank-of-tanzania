---
name: SupTech Supervisory Intelligence
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3c4947'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6c7a77'
  outline-variant: '#bbcac6'
  surface-tint: '#006b5f'
  primary: '#006b5f'
  on-primary: '#ffffff'
  primary-container: '#14b8a6'
  on-primary-container: '#00423b'
  inverse-primary: '#4fdbc8'
  secondary: '#00668a'
  on-secondary: '#ffffff'
  secondary-container: '#40c2fd'
  on-secondary-container: '#004d6a'
  tertiary: '#545f74'
  on-tertiary: '#ffffff'
  tertiary-container: '#99a4bc'
  on-tertiary-container: '#303a4e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#71f8e4'
  primary-fixed-dim: '#4fdbc8'
  on-primary-fixed: '#00201c'
  on-primary-fixed-variant: '#005048'
  secondary-fixed: '#c4e7ff'
  secondary-fixed-dim: '#7bd0ff'
  on-secondary-fixed: '#001e2c'
  on-secondary-fixed-variant: '#004c69'
  tertiary-fixed: '#d8e3fc'
  tertiary-fixed-dim: '#bcc7df'
  on-tertiary-fixed: '#111c2e'
  on-tertiary-fixed-variant: '#3c475b'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.005em
  data-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.02em
  data-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
  label-caps:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
  micro:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.375rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an institutional, sovereign-grade visual environment built for central bank regulatory oversight and financial system telemetry. It balances dense analytic utility with modern, frictionless productivity. The target audience comprises central bank governors, risk modelers, banking supervisors, and compliance examiners handling sensitive macroprudential data.

The design movement combines **Modern High-Density Technical UI** with **Precision Utility**:
- **Institutional Authority:** Grounded, unshakeable layout structure prioritizing clarity, trust, and auditability.
- **Bloomberg-Grade Density:** Tight vertical rhythms, monospaced tabular numerals, and compact structural framing to minimize unnecessary viewport scrolling.
- **Linear Precision:** Sharp 1px borders, subtle surface offsets, restrained accent pops, and surgical typography hierarchies.
- **Stripe Architecture:** Clear visual strata, pristine cards, and effortless visual scannability across multi-layered data tables and risk heatmaps.

## Colors

The palette leverages an architectural deep-navy infrastructure juxtaposed against a clinical, high-readability daylight canvas. 

### Palette Architecture
- **Primary Accent (`#14B8A6` - Teal):** Primary action endpoints, active tab markers, verified signals, and forward progress indicators.
- **Secondary Accent (`#38BDF8` - Cyan):** Analytic highlights, comparative series lines, interactive data hover states, and live streaming monitors.
- **Sovereign Dark Infrastructure (`#0B1220` deep navy, `#111C2E` navy slate):** Reserved for persistent global navigation, pinned inspection drawers, and high-security telemetry monitors.
- **Canvas & Surface Tier:**
  - Base Platform Canvas: `#F8FAFC`
  - Active Card / Table Surface: `#FFFFFF`
  - Subtle Borders & Separators: `#E2E8F0`
- **Text & Content Contrast:**
  - Primary Text: `#0F172A` (optimal contrast for dense data sets)
  - Muted Text: `#64748B` (metadata, field labels, secondary indicators)
- **Supervisory Status Signals:**
  - Critical / Capital Deficit: `#EF4444` (Restrained Crimson)
  - Warning / Under Review: `#F59E0B` (Amber)
  - Compliant / Sound: `#10B981` (Emerald)
  - Informational / System Notice: `#3B82F6` (Cobalt)

## Typography

The typographic hierarchy prioritizes systematic scanning and zero visual ambiguity:
- **Primary Interface (`Inter`):** Renders institutional copy, documentation, and dense regulatory notices with balanced legibility. Always render body text with standard numeric metrics.
- **Structural Headings (`Geist`):** Features neutral, engineered proportions and tight kerning for module headers, KPI titles, and platform sections.
- **Financial & Telemetry Data (`JetBrains Mono`):** Dedicated to ledger balances, liquidity ratios (LCR/NSFR), capital adequacy figures, timestamps, and stress indices. Tabular figures (`tnum`) must be enforced globally on all numeric displays to eliminate jitter during real-time updates.
- **Case System:** Metric group identifiers and table headers employ uppercase `label-caps` with slight positive letter spacing to establish immediate grouping cues without relying on heavy weights.

## Layout & Spacing

The platform utilizes a structured 12-column fluid grid system optimized for high information display across workstations and desktop multi-monitors:
- **Desktop (1440px+):** Pinned persistent sidebar (`240px`), 12-column dynamic work canvas with `gutter: 1rem` and `margin: 1.5rem`. Multi-pane supervisory workflows can split the central canvas into two independent 6-column synchronised streams.
- **Compact Desktop / Tablet Landscape (1024px - 1439px):** Sidebar collapses to an icon-only rail (`64px`), 12-column layout persists with `margin: 1.25rem`. Complex comparative matrices collapse tertiary data columns.
- **Tablet Portrait & Mobile (<1024px):** Layout switches to single-column card flows with vertical stacked tables, off-canvas navigation drawer, and pinned bottom risk indicators. `margin-mobile: 1rem` and `gutter-dense: 0.5rem`.

Spacing rules enforce compactness:
- Tables use `0.375rem` vertical cell padding (`space-sm`) and `0.75rem` horizontal padding (`space-md`).
- Filter rows and control bars have a fixed height of `36px` to maximize vertical analytical screen area.

## Elevation & Depth

To maintain visual rigor and avoid visual noise across massive datasets, this design system rejects heavy blur drops and deep shadows. Hierarchy is achieved through **low-contrast outlines, micro-borders, and subtle surface stepping**:

- **Tier 0 (Base Platform Canvas):** `#F8FAFC`. Background for entire supervisory viewport.
- **Tier 1 (Cards, Analytic Panes, Tables):** `#FFFFFF` paired with an explicit 1px crisp outline using `#E2E8F0`. No drop shadow in resting state.
- **Tier 2 (Pinned Headers, Contextual Menus, Dropdown Panels):** `#FFFFFF` with 1px border (`#CBD5E1`) and ambient containment shadow: `0 4px 12px -2px rgba(15, 23, 42, 0.08)`.
- **Tier 3 (Modal Overlays, Risk Override Confirmations):** Centered `#FFFFFF` card with elevated border and backdrop barrier: `rgba(11, 18, 32, 0.40)` with `4px` subtle blur. Shadow: `0 12px 24px -4px rgba(15, 23, 42, 0.16)`.
- **Dark Telemetry Containers (System Health, Real-Time Ingestion Logs):** `#0B1220` with an interior boundary border of `#1E293B`, creating purposeful focal depth against daylight modules.

## Shapes

The design system enforces a precise, disciplined shape language aligned with **Level 1 (Soft)**:
- Standard interactive elements (buttons, inputs, dropdown triggers, pill toggles) adhere strictly to a crisp `6px` radius (`0.375rem`).
- Module boundaries, analytical cards, data tables, and modal dialogs use `8px` (`0.5rem` / `rounded-lg`).
- Status micro-badges, health dots, and small metrics indicators use an interior `4px` radius or full `rounded-full` for pure numeric count pills.
- Tabs and filter segments use inner border-radius alignment: parent containment at `6px`, inner selected item at `4px` with a 2px interior gutter.

## Components

### Buttons
- **Primary:** Teal fill (`#14B8A6`), `#FFFFFF` semi-bold text, 32px height, 12px horizontal padding. Hover: `#0D9488`. Active: 1px scale inset.
- **Secondary / Action Outline:** Transparent background, 1px border (`#E2E8F0`), `#0F172A` text. Hover: `#F1F5F9` background, `#CBD5E1` border.
- **Destructive (Supervisory Intervention):** Muted Crimson outline (`#EF4444`), transparent background. Hover: `#FEF2F2` background, solid crimson text.

### Data Tables & Grids
- **Header:** Height 32px, background `#F8FAFC`, uppercase label-caps font (`11px`), 1px bottom border (`#E2E8F0`), muted text (`#64748B`).
- **Rows:** Height 36px to 40px, alternating hover state `#F8FAFC`. All currency and metric values right-aligned using `JetBrains Mono`.
- **Inline Row Actions:** Visible on row hover only; styled as icon-only 24px squares to reduce interface clutter.

### Status Badges & Micro-Pills
- Compact indicators (18px height) with 1px border and 8% alpha matching background:
  - **Healthy:** `#ECFDF5` background, `#10B981` text, `#A7F3D0` border.
  - **Supervisory Warning:** `#FFFBEB` background, `#D97706` text, `#FDE68A` border.
  - **Critical Non-Compliance:** `#FEF2F2` background, `#DC2626` text, `#FECACA` border.

### Input Fields & Filter Toggles
- Height 32px, text `13px Inter`, background `#FFFFFF`, border 1px `#E2E8F0`, corner radius 6px.
- Focus State: 1px border `#14B8A6` with a `0 0 0 2px rgba(20, 184, 166, 0.15)` optical ring.

### Cards & Analytical Modules
- Padding: 16px (`space-lg`). Header section features a persistent title, inline timeframe selector, and an icon trigger for data dictionary/metadata drawer.
- Card divider: 1px horizontal rule `#E2E8F0`.

### Real-Time Ingestion Logs (Dark Component)
- Background `#0B1220`, border 1px `#1E293B`, monospace typography (`11px`), colored timestamp tags (`#38BDF8`), and auto-scrolling telemetry rows.