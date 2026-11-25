import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { alinhar, explicar, ler } from './cenario'
import { comandoPodeAprovar, motivoParaRecusar } from './guarda'

const ENTRADA = '---\nregra: X-01\nstatus: suspeito\n---\n# T\n\n```http\nGET /a\n```\n'
const COM_RESULTADO = `${ENTRADA}\n\`\`\`resultado\n200\n\`\`\`\n`

test('a guarda recusa mudança de resultado e de status para regra', async () => {
  expect(motivoParaRecusar('', ENTRADA)).toBe(undefined)
  expect(motivoParaRecusar(COM_RESULTADO, COM_RESULTADO.replace('# T', '# Outro'))).toBe(undefined)
  expect(motivoParaRecusar(ENTRADA, COM_RESULTADO)).toMatch(/resultado/)
  expect(motivoParaRecusar(COM_RESULTADO, COM_RESULTADO.replace('200', '404'))).toMatch(/resultado/)
  expect(motivoParaRecusar(ENTRADA, ENTRADA.replace('suspeito', 'regra'))).toMatch(/regra/)
})

test('a guarda do shell separa leitura de escrita', async () => {
  const recusados = [
    'mv a.received.md a.approved.md',
    '/bin/mv a.received.md a.approved.md',
    'for r in *.received.md; do mv "$r" "${r%.received.md}.approved.md"; done',
    'cp a.received.md a.approved.md',
    'cat a.received.md > a.approved.md',
    "sed -i 's/200/404/' a.approved.md",
    'git checkout -- a.approved.md',
    'find . -name "*.approved.md" -delete | xargs echo',
  ]
  const permitidos = [
    'cat a.approved.md',
    'git diff --no-index a.approved.md a.received.md',
    'grep -l resultado *.approved.md 2>/dev/null',
    'sed -n 1,20p a.approved.md',
    'git add src/a.approved.md',
    './mvnw test -Dtest=CaracterizacaoTest 2>&1',
    'mv notas.txt antigas.txt',
  ]
  for (const comando of recusados) {
    expect(`${comando} => ${comandoPodeAprovar(comando)}`).toBe(`${comando} => true`)
  }
  for (const comando of permitidos) {
    expect(`${comando} => ${comandoPodeAprovar(comando)}`).toBe(`${comando} => false`)
  }
})

const RECEBIDO = '/p/c/a.received.md'
const APROVADO = '/p/c/a.approved.md'
const PROPS = {
  title: 'Fixtures',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

/** A última versão commitada: outra descrição, outra entrada e outro resultado. */
const NO_COMMIT = COM_RESULTADO.replace('# T', '# Título antigo').replace('GET /a', 'GET /a\n{"v": 1}')
  .replace('200', '201')

test('a explicação mostra a regra, as entradas e o resultado de antes e de agora', async () => {
  const texto = explicar(NO_COMMIT, COM_RESULTADO).map(l => `${l.estilo}|${l.texto}`).join('\n')

  expect(texto).toMatch(/antes\|Regra antes: Título antigo/)
  expect(texto).toMatch(/agora\|Regra agora: T/)
  expect(texto).toMatch(/MUDOU: entrada, resultado/)
  expect(texto).toMatch(/antes\| {4}\{"v": 1\}/)
  expect(texto).toMatch(/antes\| {4}201/)
  expect(texto).toMatch(/agora\| {4}200/)
  expect(texto).toMatch(/Valida: status/)
})

test('o resultado de um bloco de outro tipo também é exibido', async () => {
  const documento = (valor: string) => `# T\n\n\`\`\`sql\nSELECT 1\n\`\`\`\n\n\`\`\`resultado\n${valor}\n\`\`\`\n`

  const texto = explicar(documento('linha-antiga'), documento('linha-nova')).map(l => l.texto).join('\n')

  expect(texto).toMatch(/linha-antiga/)
  expect(texto).toMatch(/linha-nova/)
})

test('passos novos não desalinham os antigos', async () => {
  const passo = (secao: string, corpo: string) =>
    `## ${secao}\n\n\`\`\`http\nPOST /p\n${corpo}\n\`\`\`\n`
  const antes = `# T\n\n${passo('Alto', '{"v": 150}')}\n${passo('Negativo', '{"v": -1}')}`
  const agora = `# T\n\n${passo('Limites', '{"v": 0}')}\n${passo('Alto', '{"v": 150}')}\n${passo('Negativo', '{"v": -1}')}`

  const pares = alinhar(ler(antes).passos, ler(agora).passos)

  expect(pares.map(p => `${p.antes?.secao ?? '-'}>${p.agora?.secao ?? '-'}`))
    .toEqual(['->Limites', 'Alto>Alto', 'Negativo>Negativo'])
})

test('um passo que deixa de ser validado fica visível', async () => {
  const virouPreparacao = COM_RESULTADO.replace('```http', '```preparar').replace(/\n```resultado[\s\S]*$/, '')

  const texto = explicar(COM_RESULTADO, virouPreparacao).map(l => l.texto).join('\n')

  expect(texto).toMatch(/Antes era: Verificação/)
  expect(texto).toMatch(/deixa de ser verificado/)
})

test('o painel mostra o que mudou em relação ao commit', async ($, on) => {
  simular(on)
  await $.command.run({
    command: 'fixtures', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
  })
  const ui = await $.ui.mount({
    plugin: 'fixtures-caracterizacao', component: 'Pane', requestId: 'fixtures',
    props: PROPS, surface: 'terminal',
  })

  for (const trecho of [/último commit/, /Título antigo/, /Resultado ANTES/, /Resultado AGORA/]) {
    expect((await ui.find({ type: 'Text', text: trecho })) !== undefined).toBe(true)
  }
  await ui.unmount()
})

/** Disco e processos simulados no lugar do motor. */
function simular(on: On) {
  const arquivos = new Map([[RECEBIDO, COM_RESULTADO], [APROVADO, ENTRADA]])
  const movimentos: string[][] = []
  const saida = (stdout: string, exitCode = 0) => ({
    value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  })
  on('process.run', (_, e) => {
    const [programa, sub] = e.argv
    if (programa === 'git' && sub === 'rev-parse') return saida('/p\n')
    if (programa === 'git') return saida(NO_COMMIT)
    if (programa === 'find') return saida(arquivos.has(RECEBIDO) ? `${RECEBIDO}\n` : '')
    movimentos.push([...e.argv])
    arquivos.set(APROVADO, arquivos.get(RECEBIDO)!)
    arquivos.delete(RECEBIDO)
    return saida('')
  })
  const achar = (caminho: string) => [...arquivos.keys()].find(a => caminho.endsWith(a))
  on('fs.exists', (_, e) => ({ value: achar(e.path) !== undefined }))
  on('fs.read', (_, e) => ({ value: arquivos.get(achar(e.path)!)! }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  return { arquivos, movimentos }
}

test('o painel avisa sobre o foco e abre a ajuda com h', async ($, on) => {
  simular(on)
  await $.command.run({
    command: 'fixtures', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
  })
  const ui = await $.ui.mount({
    plugin: 'fixtures-caracterizacao', component: 'Pane', requestId: 'fixtures',
    props: { ...PROPS, isFocused: false }, surface: 'terminal',
  })
  const tem = async (trecho: RegExp) => (await ui.find({ type: 'Text', text: trecho })) !== undefined

  expect(await tem(/Atalhos inativos: pressione ctrl\+x tab/)).toBe(true)
  await $.ui.press({ plugin: 'fixtures-caracterizacao', key: 'ajuda' })
  expect(await tem(/confirmar a aprovação/)).toBe(true)
  // Com a ajuda aberta o cenário não aparece, então não há como aprovar.
  expect(await ui.find({ type: 'Button', text: /Aprovar/ })).toBe(undefined)
  await $.ui.press({ plugin: 'fixtures-caracterizacao', key: 'ajuda' })
  expect(await tem(/Título antigo/)).toBe(true)
  await ui.unmount()
})

test('aprovar exige dois passos e move só o arquivo exibido', async ($, on) => {
  const { movimentos } = simular(on)
  await $.command.run({
    command: 'fixtures', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
  })
  const ui = await $.ui.mount({
    plugin: 'fixtures-caracterizacao', component: 'Pane', requestId: 'fixtures',
    props: PROPS, surface: 'terminal',
  })

  await $.ui.press({ plugin: 'fixtures-caracterizacao', key: 'aprovar' })
  expect(movimentos.length).toBe(0)
  await $.ui.press({ plugin: 'fixtures-caracterizacao', key: 'confirmar' })

  expect(movimentos).toEqual([['mv', '--', RECEBIDO, APROVADO]])
  await ui.unmount()
})

test('não aprova se o recebido mudou depois do diff', async ($, on) => {
  const { arquivos, movimentos } = simular(on)
  await $.command.run({
    command: 'fixtures', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
  })
  const ui = await $.ui.mount({
    plugin: 'fixtures-caracterizacao', component: 'Pane', requestId: 'fixtures',
    props: PROPS, surface: 'terminal',
  })

  await $.ui.press({ plugin: 'fixtures-caracterizacao', key: 'aprovar' })
  arquivos.set(RECEBIDO, COM_RESULTADO.replace('200', '500'))
  await $.ui.press({ plugin: 'fixtures-caracterizacao', key: 'confirmar' })

  expect(movimentos.length).toBe(0)
  expect((await ui.find({ type: 'Text', text: /mudaram/ })) !== undefined).toBe(true)
  await ui.unmount()
})

test('o agente não consegue escrever nem mover um fixture aprovado', async ($, on) => {
  simular(on)
  let executadas = 0
  on('tool.call', () => {
    executadas++
    return { result: {} }
  })

  const escrita = await $.tool.call({ tool: 'Write', file_path: APROVADO, content: COM_RESULTADO })
  const edicao = await $.tool.call({
    tool: 'Edit', file_path: APROVADO, old_string: 'suspeito', new_string: 'regra',
  })
  const shell = await $.tool.call({ tool: 'Bash', command: `mv ${RECEBIDO} ${APROVADO}` })

  expect([escrita.deny, edicao.deny, shell.deny].every(d => d !== undefined)).toBe(true)
  expect(executadas).toBe(0)
})
