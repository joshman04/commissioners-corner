# Private FootClan input policy

`Update WFC Analytics` is a local, subscriber-authorized refresh—not a GitHub
Action, crawler, or public mirror. The private snapshot lives outside this
website repository and feeds only derived WFC model signals.

A complete refresh requires current structured captures for QB/RB/WR/TE
Premium Rankings, Trade Analyzer, Rest-of-Season Ranks, Research & Usage,
Strength of Schedule, Consistency Snapshots, and Red Zone Report. It also
requires every new or revised current football-analysis article since the prior
checkpoint to be reviewed and converted, when relevant, to a short
WFC-authored player signal.

The refresh validator rejects a claimed complete run if any coverage category
is missing or the article queue has pending entries. Premium tables, expert
splits, projections, article text, clips, and podcasts remain private and are
never committed to this public website. The site can disclose that a private
forward input was used and show WFC-derived values only.

For a development preview of an incomplete capture, the local coordinator can
be run with an explicit `--allow-partial` flag. That output remains labeled
partial in Trade Alley and is not a substitute for a complete update.
