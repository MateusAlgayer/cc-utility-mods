# cc-utility-mods

Marketplace de mods utilitários para o Claude Code.

## Mods disponíveis

| Mod | Descrição |
| --- | --- |
| [`mod-manager`](mods/mod-manager) | Sidebar para ativar e desativar mods, aberta com `/mods`. |
| [`effort-advisor`](mods/effort-advisor) | Avalia cada prompt com o Sonnet e pergunta se o effort level deve mudar. |
| [`input-router`](mods/input-router) | Bloqueia leituras de arquivos grandes e as encaminha para um subagente Haiku que resume o conteúdo. |
| [`handoff`](mods/handoff) | `/handoff` gera um handoff da sessão (intenção inicial, skills, arquivos lidos) e permite copiá-lo ou abrir uma nova sessão com ele; avisa quando o contexto passa de 70%. |
| [`fixtures-caracterizacao`](mods/fixtures-caracterizacao) | `/fixtures` abre um painel para revisar e aprovar approved fixtures em Markdown; bloqueia tentativas do agente de aprová-los. |

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

Substitua `<mod>` por `mod-manager`, `effort-advisor`, `input-router`, `handoff` ou `fixtures-caracterizacao`. Depois, rode `/reload-plugins` para carregar o mod na sessão atual.

Para atualizar: `claude plugin update <mod>`.

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para saber como adicionar um mod.

## Licença

Veja [LICENSE](LICENSE).
