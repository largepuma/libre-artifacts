# Night Market

A 12-second libre-motion film for a made-up night market: lanterns drop onto a wire, three stalls rise, an end card. It's the film in the README screenshot.

```bash
cd examples/night-market
node ../../skills/libre-motion/scripts/artifact.mjs write-db film batch.json   # writes film/db/…
node ../../skills/libre-motion/scripts/artifact.mjs open film                  # prints the player's URL
```

`src/` holds the scenes and `base.css`; `batch.json` names them with `{"$file": …}`.
