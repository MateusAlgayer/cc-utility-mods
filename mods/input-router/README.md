# Input Router

Blocks `Read` calls whose content exceeds ~2000 tokens (estimated at 4 characters per token, honoring `offset`/`limit`) and routes them to a subagent running the model in `ANTHROPIC_DEFAULT_HAIKU_MODEL` (falls back to `haiku`) (`input-router:reader`). The subagent reads the whole file in chunks and returns a summary of what matters, which the main model receives in place of the raw file. The subagent inherits the main task's effort level. Images, PDFs and notebooks are not routed; reading a smaller range (under ~2000 tokens) goes straight through.

## Install

```
/plugin install input-router --marketplace MateusAlgayer/cc-utility-mods
```
