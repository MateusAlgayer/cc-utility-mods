# fixtures-caracterizacao

Plugin do Claude Code para approved fixtures em Markdown (`*.approved.md` e `*.received.md`).

## Recursos

- `/fixtures`: painel que explica um cenário por vez, comparado com o último commit: regra, descrição, entradas, o que cada passo valida e o resultado antes e depois. Aprovar exige dois passos (`a` e depois `c`). Se os arquivos mudarem depois que o diff foi exibido, nada é aprovado. `n` e `p` navegam, `r` atualiza e `h` abre a ajuda. Os atalhos exigem o foco no painel (`ctrl+x tab` ou clique; `Esc` volta ao prompt). Cada botão mostra a sua tecla.
- Barra de status com a quantidade de fixtures pendentes (somente em repositórios Git).
- Proteção: recusa que o agente altere blocos `resultado` ou defina `status: regra` com Write ou Edit, escreva um `.received.md` ou rode no shell um comando que cite um arquivo aprovado e possa escrever.
- Skill `novo-cenario`: ajuda a criar cenários seguindo o catálogo do projeto.

## Instalação

```
/plugin install fixtures-caracterizacao --marketplace MateusAlgayer/cc-utility-mods
```

Se ainda não adicionou o marketplace, veja o [README principal](../../README.md#instalar-o-marketplace).

## Requisitos

Linux ou macOS, com `git`, `find` e `mv`.

## Formato esperado

O plugin não inclui o runner dos testes. O seu projeto precisa gerar um `*.received.md` ao lado de cada `*.approved.md` que divergir. O painel entende este formato:

- front matter opcional (`regra`, `status`), um título `#`, a descrição e seções `##`;
- cada passo é um bloco de código; o resultado de um passo vem no bloco `resultado` logo abaixo;
- os tipos `http`, `preparar`, `stub-mtg` e `esperar` recebem um nome explicativo; outros aparecem com o próprio nome;
- o resultado de qualquer bloco é comparado; a explicação do que é validado existe só para `http`;
- as palavras após `http` dizem o que é validado: `chamadas`, `ttl`, `redis[:campos]`, `corpo[:campos]` ou o nome de um header.

## Limites

A proteção do shell é uma heurística. Um script que não cite o arquivo na linha de comando passa por ela, assim como ferramentas de outros plugins ou servidores MCP. Ela também pode recusar comandos inofensivos que citam um fixture aprovado. A garantia continua sendo a revisão do diff no pull request.

O plugin não roda os testes: gere os `.received.md` com o comando do seu projeto.

## Desenvolvimento

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .   # carrega o plugin em uma sessão
```
