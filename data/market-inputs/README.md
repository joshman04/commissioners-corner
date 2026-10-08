# WFC market model inputs

These are reviewed WFC inputs, not canon data and not third-party scrapes. Each refresh reads them and writes the derived public snapshot separately.

- `news-signals.json`: one short-lived, dated player adjustment at a time. Use an `impact` from `-10` to `10`, an `expires_on` date, a `reason`, and a supporting URL when one is publicly linkable.
- `schedule-signals.json`: optional NFL-team rest-of-season strength adjustment from `-5` to `5`. Missing teams are explicitly neutral.
- `manual-overrides.json`: disclosed commissioner correction for an exceptional market situation. It is not a source-import format and is never used to infer another publisher's formula.
- `nflverse-weekly.json`: generated, derived cache of public nflverse weekly player-stat usage and EPA inputs. Refresh it with `node tools/refresh_nflverse_weekly_stats.cjs`; it is attributed to nflverse / FTN Data under CC-BY-SA 4.0.
- `ros-projections.json`: optional approved/permissioned rest-of-season points projections. It is deliberately separate from third-party trade-value imports.
- `availability-signals.json`: optional, dated commissioner-reviewed injury, role, and depth-chart confidence signals. It is not an automated news scraper.

Example news signal:

```json
{
  "player": "Example Player",
  "impact": -7,
  "reason": "Placed on IR",
  "source_url": "https://example.com/report",
  "expires_on": "2026-11-01"
}
```
