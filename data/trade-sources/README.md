# Trade-value provider snapshots

This directory is the only external-provider ingestion point. Each JSON file is a reviewed, permitted local snapshot; the build script never fetches or scrapes third-party sources.

`wfc-manual-values.json` is the exception: it is the commissioner-maintained board that powers the site’s tier layout. It supports optional `market_value` and `history` (`[{"date":"YYYY-MM-DD","market_value":79.3}]`) fields for the hover/focus value-history card.

Use this shape:

```json
{
  "provider_id": "draftsharks",
  "captured_at": "2026-10-07T16:00:00Z",
  "scoring_format": "PPR Superflex",
  "access": "Manually recorded from a public page permitted by the provider's terms",
  "rows": [
    { "player": "Example Player", "position": "WR", "rank": 1, "raw_value": 47, "tier": "1" }
  ]
}
```

Do not add data obtained through authentication, a subscription, reverse-engineered endpoints, a robots restriction, or anti-bot bypass. Confirm the source's terms/licensing before importing or publishing any provider data. Raw provider numbers are retained for transparency, but the consensus is calculated only from per-provider rank/percentile normalization.
