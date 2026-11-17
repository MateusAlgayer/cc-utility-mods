# Input Router

Bloqueia chamadas `Read` cujo conteúdo passa de ~2000 tokens (estimados em 4 caracteres por token, respeitando `offset`/`limit`) e as encaminha para um subagente (`input-router:reader`) que usa o modelo de `ANTHROPIC_DEFAULT_HAIKU_MODEL` (com `haiku` como padrão). O subagente lê o arquivo inteiro em partes e devolve um resumo do que importa, que o modelo principal recebe no lugar do arquivo bruto. O subagente herda o nível de effort da tarefa principal.

Imagens, PDFs e notebooks não são encaminhados. Leituras menores (abaixo de ~2000 tokens) passam direto.

## Instalação

```
/plugin install input-router --marketplace MateusAlgayer/cc-utility-mods
```

Se ainda não adicionou o marketplace, veja o [README principal](../../README.md#instalar-o-marketplace).
