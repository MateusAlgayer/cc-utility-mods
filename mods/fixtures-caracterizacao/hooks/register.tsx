import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Painel, Revisao } from '../types'
import { explicar, type Estilo } from './cenario'
import { comandoPodeAprovar, motivoParaRecusar } from './guarda'

const PANE = 'fixtures'
const SUFIXO_RECEBIDO = '.received.md'
/** Acima disso o painel não tenta exibir, e sem exibir não permite aprovar. */
const LIMITE_EXIBICAO = 60_000

const VAZIO: Painel = {
  raiz: '',
  pendentes: [],
  indice: 0,
  revisao: null,
  confirmando: false,
  ajuda: false,
  aviso: '',
}

const painel = atom({ plugin: 'fixtures-caracterizacao', key: 'painel' } as const, VAZIO, {
  shape: 'painel-3',
})

async function raizDoProjeto($: EngineInterface): Promise<string> {
  const git = await $.process.run(['git', 'rev-parse', '--show-toplevel'])
  return git.exitCode === 0 ? git.stdout.trim() : '.'
}

async function listarPendentes($: EngineInterface, raiz: string): Promise<string[]> {
  const busca = await $.process.run([
    'find', raiz,
    '(', '-name', '.git', '-o', '-name', 'target', '-o', '-name', 'node_modules', ')', '-prune',
    '-o', '-type', 'f', '-name', `*${SUFIXO_RECEBIDO}`, '-print',
  ])
  return busca.stdout.split('\n').filter(Boolean).sort()
}

function mostrarContagem($: EngineInterface, total: number): void {
  $.ui.status(total === 0 ? undefined : `fixtures pendentes: ${total} (/fixtures)`)
}

/** Fora de um repositório Git não há contagem, para não varrer pastas enormes a cada comando. */
async function atualizarContagem($: EngineInterface): Promise<void> {
  const raiz = await raizDoProjeto($)
  if (raiz !== '.') {
    mostrarContagem($, (await listarPendentes($, raiz)).length)
  }
}

async function lerSeExistir($: EngineInterface, caminho: string): Promise<string | null> {
  return (await $.fs.exists(caminho)) ? await $.fs.read(caminho) : null
}

/**
 * A comparação é feita com o último commit. O arquivo aprovado no disco pode já
 * ter descrição e entradas alteradas, e compará-lo esconderia essas mudanças.
 */
async function abrirRevisao($: EngineInterface, recebido: string): Promise<Revisao> {
  const aprovado = `${recebido.slice(0, -SUFIXO_RECEBIDO.length)}.approved.md`
  const conteudoRecebido = await $.fs.read(recebido)
  const conteudoAprovado = await lerSeExistir($, aprovado)
  const corte = aprovado.lastIndexOf('/')
  const git = await $.process.run(['git', 'show', `HEAD:./${aprovado.slice(corte + 1)}`], {
    cwd: aprovado.slice(0, corte),
  })
  const temCommit = git.exitCode === 0 && !git.isStdoutTruncated
  return {
    recebido,
    aprovado,
    conteudoRecebido,
    conteudoAprovado,
    base: temCommit ? git.stdout : conteudoAprovado,
    origem: temCommit ? 'commit' : 'arquivo',
  }
}

/** Relê o disco e posiciona a revisão no índice pedido. */
async function carregar($: EngineInterface, indice: number, aviso = ''): Promise<void> {
  const raiz = await raizDoProjeto($)
  const pendentes = await listarPendentes($, raiz)
  const posicao = pendentes.length === 0 ? 0 : (indice + pendentes.length) % pendentes.length
  const recebido = pendentes[posicao]
  const revisao = recebido === undefined ? null : await abrirRevisao($, recebido)
  await update($, painel, () => ({
    raiz, pendentes, indice: posicao, revisao, confirmando: false, ajuda: false, aviso,
  }))
  mostrarContagem($, pendentes.length)
}

/** Só é chamada pelo botão de confirmação, ou seja, por um gesto da pessoa. */
async function aprovar($: EngineInterface): Promise<void> {
  const { revisao, indice, confirmando } = await read($, painel)
  if (revisao === null || !confirmando) {
    return
  }
  const recebidoAtual = await lerSeExistir($, revisao.recebido)
  const aprovadoAtual = await lerSeExistir($, revisao.aprovado)
  if (recebidoAtual !== revisao.conteudoRecebido || aprovadoAtual !== revisao.conteudoAprovado) {
    await carregar($, indice, 'Os arquivos mudaram depois que o diff foi exibido. Revise de novo.')
    return
  }
  const mv = await $.process.run(['mv', '--', revisao.recebido, revisao.aprovado])
  const aviso = mv.exitCode === 0
    ? `Aprovado: ${nomeCurto(revisao.aprovado)}`
    : `Falha ao aprovar: ${mv.stderr.trim()}`
  await carregar($, indice, aviso)
}

const nomeCurto = (caminho: string): string => caminho.split('/').slice(-2).join('/')

const APARENCIA: Record<Estilo, { color?: string; bold?: boolean; dimColor?: boolean }> = {
  titulo: { bold: true },
  secao: { bold: true },
  normal: {},
  fraco: { dimColor: true },
  antes: { color: 'error' },
  agora: { color: 'success' },
  alerta: { color: 'warning', bold: true },
}

const AJUDA: ReadonlyArray<readonly [string, Estilo]> = [
  [' ', 'normal'],
  ['Foco do painel', 'secao'],
  ['  ctrl+x tab ou clique   dar o teclado ao painel', 'normal'],
  ['  Esc                    voltar ao prompt', 'normal'],
  ['  ctrl+x x               fechar o painel', 'normal'],
  ['  setas                  rolar o cenário', 'normal'],
  [' ', 'normal'],
  ['Atalhos (com o painel em foco)', 'secao'],
  ['  a   pedir a aprovação do cenário exibido', 'normal'],
  ['  c   confirmar a aprovação (aparece depois de a)', 'normal'],
  ['  n   próximo cenário', 'normal'],
  ['  p   cenário anterior', 'normal'],
  ['  r   reler os arquivos do disco', 'normal'],
  ['  h   abrir ou fechar esta ajuda', 'normal'],
  [' ', 'normal'],
  ['Como ler um cenário', 'secao'],
  ['  Em vermelho: como era no último commit.', 'antes'],
  ['  Em verde: como fica se você aprovar.', 'agora'],
  ['  Confira a regra, as entradas, o que é validado e o resultado.', 'normal'],
  ['  Aprovar não confirma uma regra de negócio: o status não muda sozinho.', 'normal'],
  [' ', 'normal'],
  ['Os .received.md vêm dos testes. Para gerá-los, rode os testes do projeto.', 'fraco'],
]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'fixtures',
      description: 'Revisar e aprovar fixtures pendentes (no painel, h mostra os atalhos)',
    })
    const iniciado = await next(e)
    await atualizarContagem($)
    return iniciado
  })

  on('command.run', { command: 'fixtures' }, async $ => {
    await carregar($, 0)
    // O foco é um pedido: o motor só atende com o prompt vazio.
    await $.ui.open({ id: PANE, title: 'Fixtures', focus: true })
    const { pendentes } = await read($, painel)
    return {
      text: `Fixtures pendentes: ${pendentes.length}. No painel, h mostra a ajuda (foco: ctrl+x tab).`,
      isTextDisplayOnly: true,
    }
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (e.file_path.endsWith(SUFIXO_RECEBIDO)) {
      return { deny: `${$.plugin.name}: arquivos .received.md são gerados somente pelos testes.` }
    }
    if (!e.file_path.endsWith('.approved.md')) {
      return next(e)
    }
    const atual = (await lerSeExistir($, e.file_path)) ?? ''
    const motivo = motivoParaRecusar(atual, e.content)
    return motivo === undefined ? next(e) : { deny: `${$.plugin.name}: ${motivo}.` }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'fixtures-caracterizacao: a proteção falhou.' },
  )

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    if (e.file_path.endsWith(SUFIXO_RECEBIDO)) {
      return { deny: `${$.plugin.name}: arquivos .received.md são gerados somente pelos testes.` }
    }
    if (!e.file_path.endsWith('.approved.md')) {
      return next(e)
    }
    const atual = (await lerSeExistir($, e.file_path)) ?? ''
    const proposto = e.old_string === ''
      ? e.new_string
      : e.replace_all
        ? atual.split(e.old_string).join(e.new_string)
        : atual.replace(e.old_string, () => e.new_string)
    const motivo = motivoParaRecusar(atual, proposto)
    return motivo === undefined ? next(e) : { deny: `${$.plugin.name}: ${motivo}.` }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'fixtures-caracterizacao: a proteção falhou.' },
  )

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (comandoPodeAprovar(e.command)) {
      return {
        deny: `${$.plugin.name}: este comando cita um fixture aprovado e pode alterá-lo. `
          + 'A aprovação é da pessoa, pelo painel /fixtures. Para ler, use um comando sem escrita.',
      }
    }
    const executado = await next(e)
    await atualizarContagem($)
    return executado
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'fixtures-caracterizacao: a proteção falhou.' },
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { pendentes, indice, revisao, confirmando, ajuda, aviso } = await read($, painel)

    // O botão sem moldura mostra a tecla ao lado do nome: "a: Aprovar".
    const botao = (chave: string, tecla: string, rotulo: string, acao: () => unknown) => (
      <Button key={chave} hotkey={tecla} plain onPress={async () => { await acao() }}>{rotulo}</Button>
    )
    const alternarAjuda = () =>
      update($, painel, p => ({ ...p, ajuda: !p.ajuda, confirmando: false, aviso: '' }))
    const dica = e.props.isFocused ? (
      <Text dimColor>Atalhos ativos. h: ajuda · Esc: voltar ao prompt</Text>
    ) : (
      <Text color="warning" bold>
        Atalhos inativos: pressione ctrl+x tab ou clique no painel. Depois, h abre a ajuda.
      </Text>
    )

    if (ajuda) {
      return (
        <Box flexDirection="column">
          {dica}
          {botao('ajuda', 'h', 'Fechar ajuda', alternarAjuda)}
          {AJUDA.map(([texto, estilo]) => <Text {...APARENCIA[estilo]}>{texto}</Text>)}
        </Box>
      )
    }

    if (revisao === null) {
      return (
        <Box flexDirection="column">
          {dica}
          {aviso !== '' && <Text color="warning">{aviso}</Text>}
          <Text>Nenhum fixture pendente.</Text>
          <Box flexDirection="row" gap={2}>
            {botao('atualizar', 'r', 'Atualizar', () => carregar($, indice))}
            {botao('ajuda', 'h', 'Ajuda', alternarAjuda)}
          </Box>
        </Box>
      )
    }

    const textos = `${revisao.base ?? ''}${revisao.conteudoRecebido}`.replace(/\r\n/g, '\n')
    const exibivel = textos.length <= LIMITE_EXIBICAO && !/[\x00-\x08\x0b-\x1f]/.test(textos)
    const linhas = exibivel ? explicar(revisao.base, revisao.conteudoRecebido.replace(/\t/g, '  ')) : []

    return (
      <Box flexDirection="column">
        {dica}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {exibivel && !confirmando && botao('aprovar', 'a', 'Aprovar', () =>
            update($, painel, p => ({ ...p, confirmando: true, aviso: '' })))}
          {confirmando && botao('confirmar', 'c', 'CONFIRMAR aprovação', () => aprovar($))}
          {botao('anterior', 'p', 'Anterior', () => carregar($, indice - 1))}
          {botao('proximo', 'n', 'Próximo', () => carregar($, indice + 1))}
          {botao('atualizar', 'r', 'Atualizar', () => carregar($, indice))}
          {botao('ajuda', 'h', 'Ajuda', alternarAjuda)}
        </Box>
        {confirmando && (
          <Text color="warning">Pressione c para aprovar. Para desistir, use n, p ou r.</Text>
        )}
        {aviso !== '' && <Text color="warning">{aviso}</Text>}
        <Text bold>
          {indice + 1}/{pendentes.length} {nomeCurto(revisao.aprovado)}
        </Text>
        <Text dimColor>
          {revisao.origem === 'commit'
            ? 'Comparando com o último commit.'
            : 'Sem versão no Git: comparando com o arquivo no disco.'}
          {' '}Aprovar aceita tudo abaixo, inclusive descrição e entradas.
        </Text>
        {exibivel ? (
          linhas.map(l => <Text {...APARENCIA[l.estilo]}>{l.texto}</Text>)
        ) : (
          <Text color="warning">
            O cenário não pode ser exibido por inteiro aqui. Revise no terminal: git diff --no-index
          </Text>
        )}
      </Box>
    )
  })
}
