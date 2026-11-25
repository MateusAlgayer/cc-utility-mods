---
name: novo-cenario
description: Cria ou revisa cenários de caracterização em Markdown (approved fixtures). Use quando a pessoa pedir um novo cenário, a cobertura de uma regra de negócio ou a conferência de um catálogo de regras.
---

# Novo cenário de caracterização

1. Encontre o `README.md` do catálogo, na pasta que contém os arquivos `*.approved.md`. Ele define o formato, os blocos aceitos e o comando de teste. Se não houver catálogo, diga isso e pergunte como o projeto faz caracterização. Não presuma um formato.
2. Leia o código e os fixtures existentes para confirmar que a regra ainda não está coberta.
3. Cubra uma regra por arquivo. Escreva somente o front matter, a prosa e os blocos de entrada. Use `status: observado`, ou `suspeito` quando parecer defeito. Nunca use `regra`.
4. Adicione a linha no catálogo.
5. Rode os testes de caracterização para gerar o `.received.md`.
6. Compare cada resultado com o título e a prosa. Se divergirem, corrija a descrição ou relate o comportamento inesperado. Não ajuste a entrada para esconder o resultado.
7. Peça que a pessoa revise com `/fixtures`.

Você não aprova fixtures: não escreva blocos `resultado` e não copie nem renomeie `.received.md` para `.approved.md`.
