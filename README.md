# cc-utility-mods

Mods utilitários para o Claude Code.

## Instalar

No prompt do Claude Code:

```
/plugin install <mod> --marketplace MateusAlgayer/cc-utility-mods
```

No shell:

```
claude plugin install <mod> --marketplace MateusAlgayer/cc-utility-mods
```

## Adicionar um mod

Cada mod fica em `mods/<nome>/` (`.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`) e é listado em `.claude-plugin/marketplace.json`:

```json
{ "name": "<nome>", "source": "./mods/<nome>" }
```

Desenvolvimento local: `claude --plugin-dir mods/<nome>`.
