# Contribuindo

Obrigado por contribuir com o cc-utility-mods!

## Adicionando um mod

Cada mod fica em `mods/<nome>/`:

```
mods/<nome>/
├── .claude-plugin/plugin.json
└── hooks/
    ├── hooks.json
    └── register.tsx
```

Liste o mod em `.claude-plugin/marketplace.json`:

```json
{ "name": "<nome>", "source": "./mods/<nome>", "description": "..." }
```

Para testar localmente: `claude --plugin-dir mods/<nome>`. Para validar: `claude plugin validate .`.
