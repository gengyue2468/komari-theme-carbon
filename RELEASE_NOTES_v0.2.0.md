# Komari Carbon v0.2.0

## Highlights

- Improved the Carbon dashboard layout, responsive behavior, and accessibility.
- Fixed 12-hour and 1-day ping charts with task-specific history, packet-loss gaps, and accurate all-loss statistics.
- Made node cards fully clickable and simplified monitoring-point presentation by removing redundant hover details.
- Improved visitor information with localized device/browser labels, IP masking, geolocation caching, and safer fallbacks.
- Unified traffic usage formatting, including unlimited plans shown as `used / ∞`.
- Removed unused helpers, translations, legacy styles, and obsolete component code.

## Validation

- `pnpm typecheck`
- `pnpm build`
- `git diff --check`
