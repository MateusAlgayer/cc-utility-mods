# cc-utility-mods

Marketplace de mods utilitários para o Claude Code.

## Mods disponíveis

| Mod | Descrição |
| --- | --- |
| [`mod-manager`](mods/mod-manager) | Sidebar para ativar e desativar mods, aberta com `/mods`. |
| [`effort-advisor`](mods/effort-advisor) | Avalia cada prompt com o Sonnet e pergunta se o effort level deve mudar. |
| [`input-router`](mods/input-router) | Bloqueia leituras de arquivos grandes e as encaminha para um subagente Haiku que resume o conteúdo. |

## Instalar o marketplace

No prompt do Claude Code:

```
/plugin marketplace add MateusAlgayer/cc-utility-mods
```

No shell:

```
claude plugin marketplace add MateusAlgayer/cc-utility-mods
```

Para listar os mods disponíveis, use `/plugin` e abra a aba de marketplaces.

## Instalar um mod

Com o marketplace adicionado, no prompt do Claude Code:

```
/plugin install <mod> --marketplace MateusAlgayer/cc-utility-mods
```

No shell:

```
claude plugin install <mod> --marketplace MateusAlgayer/cc-utility-mods
```

Substitua `<mod>` por `mod-manager`, `effort-advisor` ou `input-router`. Depois, rode `/reload-plugins` para carregar o mod na sessão atual.

Para atualizar: `claude plugin update <mod>`.

## Adicionar um mod ao repositório

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

## Licença

Veja [LICENSE](LICENSE).
