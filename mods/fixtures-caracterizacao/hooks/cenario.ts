/** Lógica pura que explica o que muda entre duas versões de um cenário. */

export type Passo = {
  secao: string
  notas: string[]
  tipo: string
  opcoes: string[]
  conteudo: string
  resultado: string | null
}

export type Cenario = {
  meta: Record<string, string>
  titulo: string
  descricao: string[]
  passos: Passo[]
  /** Prosa depois do último passo. */
  sobra: string[]
}

export type Estilo = 'titulo' | 'secao' | 'normal' | 'fraco' | 'antes' | 'agora' | 'alerta'
export type Linha = { texto: string; estilo: Estilo }

/** Toda linha não vazia do documento fica em algum campo, para nada ser aprovado sem aparecer. */
export function ler(documento: string): Cenario {
  const linhas = documento.replace(/\r\n/g, '\n').split('\n')
  const cenario: Cenario = { meta: {}, titulo: '', descricao: [], passos: [], sobra: [] }
  let i = 0
  if (linhas[0] === '---') {
    for (i = 1; i < linhas.length && linhas[i] !== '---'; i++) {
      const [nome = '', ...resto] = linhas[i]!.split(':')
      cenario.meta[nome.trim()] = resto.join(':').trim()
    }
    i++
  }
  let secao = ''
  let secaoUsada = true
  let notas: string[] = []
  for (; i < linhas.length; i++) {
    const linha = linhas[i]!
    if (linha.startsWith('```')) {
      const [tipo = '', ...opcoes] = linha.slice(3).trim().split(/ +/)
      const corpo: string[] = []
      for (i++; i < linhas.length && linhas[i] !== '```'; i++) {
        corpo.push(linhas[i]!)
      }
      const ultimo = cenario.passos.at(-1)
      if (tipo === 'resultado' && ultimo !== undefined && ultimo.resultado === null) {
        ultimo.resultado = corpo.join('\n')
      } else {
        cenario.passos.push({ secao, notas, tipo, opcoes, conteudo: corpo.join('\n'), resultado: null })
        notas = []
        secaoUsada = true
      }
    } else if (linha.startsWith('## ')) {
      if (!secaoUsada) notas.push(secao)
      secao = linha.slice(3).trim()
      secaoUsada = false
    } else if (linha.startsWith('# ') && cenario.titulo === '') {
      cenario.titulo = linha.slice(2).trim()
    } else if (linha.trim() !== '') {
      if (cenario.passos.length === 0 && secao === '') cenario.descricao.push(linha)
      else notas.push(linha)
    }
  }
  cenario.sobra = secaoUsada ? notas : [...notas, secao]
  return cenario
}

export type Par = { antes?: Passo; agora?: Passo }

const ehRequisicao = (p: Passo): boolean => p.tipo === 'http' || p.tipo === 'preparar'
const primeiraLinha = (p: Passo): string => p.conteudo.split('\n')[0] ?? ''

/** Quanto dois passos se parecem; zero quando não podem ser o mesmo passo. */
function afinidade(a: Passo, b: Passo): number {
  const mesmoGrupo = ehRequisicao(a) ? ehRequisicao(b) : a.tipo === b.tipo
  if (!mesmoGrupo || (a.tipo !== 'esperar' && primeiraLinha(a) !== primeiraLinha(b))) return 0
  return 1 + (a.conteudo === b.conteudo ? 4 : 0) + (a.secao === b.secao ? 2 : 0) + (a.tipo === b.tipo ? 1 : 0)
}

/** Alinha os passos preservando a ordem e maximizando a semelhança. */
export function alinhar(antes: Passo[], agora: Passo[]): Par[] {
  const total: number[][] = Array.from({ length: antes.length + 1 }, () =>
    new Array<number>(agora.length + 1).fill(0))
  for (let i = antes.length - 1; i >= 0; i--) {
    for (let j = agora.length - 1; j >= 0; j--) {
      const a = afinidade(antes[i]!, agora[j]!)
      total[i]![j] = Math.max(
        total[i + 1]![j]!, total[i]![j + 1]!, a > 0 ? a + total[i + 1]![j + 1]! : 0)
    }
  }
  const pares: Par[] = []
  let i = 0
  let j = 0
  while (i < antes.length || j < agora.length) {
    const a = i < antes.length && j < agora.length ? afinidade(antes[i]!, agora[j]!) : 0
    if (a > 0 && total[i]![j] === a + total[i + 1]![j + 1]!) {
      pares.push({ antes: antes[i++]!, agora: agora[j++]! })
    } else if (j >= agora.length || (i < antes.length && total[i]![j] === total[i + 1]![j]!)) {
      pares.push({ antes: antes[i++]! })
    } else {
      pares.push({ agora: agora[j++]! })
    }
  }
  return pares
}

function oQueValida(opcoes: string[]): string {
  const nomes = opcoes.map(opcao => {
    const [nome = '', campos] = opcao.split(':')
    const lista = campos?.split(',').join(', ')
    if (nome === 'chamadas') return 'chamadas à API externa'
    if (nome === 'ttl') return 'chaves do Redis e TTL'
    if (nome === 'redis') return lista ? `TTL e campos ${lista} no Redis` : 'valor inteiro no Redis'
    if (nome === 'corpo') return lista ? `campos ${lista} da resposta` : 'resposta inteira'
    return `header ${nome}`
  })
  return ['status', ...nomes].join('; ')
}

const NOME_DO_TIPO: Record<string, string> = {
  http: 'Verificação',
  preparar: 'Preparação (só monta o cenário, não é validada)',
  'stub-mtg': 'Resposta simulada da API externa',
  esperar: 'Espera',
}

/** O que mudou em um passo; lista vazia quando nada mudou. */
function mudancas({ antes, agora }: Par): string[] {
  if (antes === undefined) return ['passo novo']
  if (agora === undefined) return ['passo removido']
  const lista: string[] = []
  if (antes.tipo !== agora.tipo) lista.push('tipo do passo')
  if (antes.conteudo !== agora.conteudo) lista.push('entrada')
  if (antes.opcoes.join(' ') !== agora.opcoes.join(' ')) lista.push('o que é validado')
  if (antes.resultado !== agora.resultado) lista.push('resultado')
  if (antes.secao !== agora.secao || antes.notas.join('\n') !== agora.notas.join('\n')) lista.push('texto')
  return lista
}

/**
 * Explica a versão proposta em relação à anterior: o que a regra afirma, o que
 * cada passo envia e valida e como o resultado muda.
 */
export function explicar(documentoAnterior: string | null, documentoProposto: string): Linha[] {
  const antes = documentoAnterior === null ? null : ler(documentoAnterior)
  const agora = ler(documentoProposto)
  const saida: Linha[] = []
  const linha = (texto: string, estilo: Estilo = 'normal') => {
    saida.push({ texto: texto === '' ? ' ' : texto, estilo })
  }
  const bloco = (texto: string, estilo: Estilo = 'normal') => {
    for (const parte of texto.split('\n')) linha(`    ${parte}`, estilo)
  }
  const comparar = (rotulo: string, velho: string | undefined, novo: string, estilo: Estilo) => {
    if (antes !== null && velho !== undefined && velho !== novo) {
      linha(`${rotulo} antes: ${velho || '(vazio)'}`, 'antes')
      linha(`${rotulo} agora: ${novo || '(vazio)'}`, 'agora')
    } else {
      linha(`${rotulo}: ${novo || '(vazio)'}`, estilo)
    }
  }

  comparar('Regra', antes?.titulo, agora.titulo, 'titulo')
  comparar('Descrição', antes?.descricao.join(' '), agora.descricao.join(' '), 'normal')
  for (const nome of Object.keys({ ...antes?.meta, ...agora.meta })) {
    comparar(nome, antes === null ? undefined : (antes.meta[nome] ?? ''), agora.meta[nome] ?? '', 'fraco')
  }

  const pares = alinhar(antes?.passos ?? [], agora.passos)
  if (antes === null) {
    linha('Cenário sem versão anterior: tudo abaixo é novo.', 'alerta')
  } else {
    const contar = (aspecto: string) => pares.filter(p => mudancas(p).includes(aspecto)).length
    const resumo = ['resultado', 'entrada', 'o que é validado', 'tipo do passo', 'passo novo', 'passo removido']
      .filter(aspecto => contar(aspecto) > 0)
      .map(aspecto => `${aspecto}: ${contar(aspecto)}`)
    linha(
      resumo.length === 0 ? 'Resumo: nenhum passo mudou.' : `Resumo das mudanças por passo: ${resumo.join(' | ')}`,
      'alerta')
  }

  let secao = ''
  pares.forEach((par, indice) => {
    const passo = (par.agora ?? par.antes)!
    const lista = antes === null ? [] : mudancas(par)
    linha(' ')
    if (passo.secao !== secao) {
      secao = passo.secao
      linha(`## ${secao}`, 'secao')
    }
    for (const nota of passo.notas) linha(nota, 'fraco')
    const situacao = antes === null ? '' : lista.length === 0 ? ' · sem mudança' : ` · MUDOU: ${lista.join(', ')}`
    linha(
      `[${indice + 1}/${pares.length}] ${NOME_DO_TIPO[passo.tipo] ?? passo.tipo}${situacao}`,
      lista.length === 0 ? 'secao' : 'alerta')

    if (par.agora === undefined) {
      bloco(passo.conteudo, 'antes')
      if (passo.resultado !== null) {
        linha('  Resultado que deixa de ser verificado:', 'antes')
        bloco(passo.resultado, 'antes')
      }
      return
    }
    const velho = par.antes
    if (velho !== undefined && velho.conteudo !== passo.conteudo) {
      linha('  Enviava antes:', 'antes')
      bloco(velho.conteudo, 'antes')
      linha('  Envia agora:', 'agora')
      bloco(passo.conteudo, 'agora')
    } else {
      bloco(passo.conteudo)
    }
    if (velho !== undefined && velho.tipo !== passo.tipo) {
      linha(`  Antes era: ${NOME_DO_TIPO[velho.tipo] ?? velho.tipo}`, 'antes')
    }
    const anterior = velho?.resultado ?? null
    if (passo.tipo !== 'http' && passo.resultado === null) {
      if (anterior !== null) {
        linha('  Resultado que deixa de ser verificado:', 'antes')
        bloco(anterior, 'antes')
      }
      return
    }
    // Um resultado em qualquer tipo de bloco precisa aparecer, pois será aprovado.
    if (passo.tipo === 'http') {
      if (velho?.tipo === 'http' && velho.opcoes.join(' ') !== passo.opcoes.join(' ')) {
        linha(`  Validava antes: ${oQueValida(velho.opcoes)}`, 'antes')
      }
      linha(`  Valida: ${oQueValida(passo.opcoes)}`, 'fraco')
    }
    if (anterior !== null && anterior !== passo.resultado) {
      linha('  Resultado ANTES:', 'antes')
      bloco(anterior, 'antes')
      linha('  Resultado AGORA:', 'agora')
      bloco(passo.resultado ?? '(sem resultado)', 'agora')
    } else {
      linha(anterior === null ? '  Resultado (ainda não aprovado):' : '  Resultado (igual ao anterior):', 'fraco')
      bloco(passo.resultado ?? '(sem resultado)', anterior === null ? 'agora' : 'normal')
    }
  })

  const sobraAnterior = antes?.sobra.join('\n') ?? ''
  if (antes !== null && sobraAnterior !== agora.sobra.join('\n') && sobraAnterior !== '') {
    linha('Texto final antes:', 'antes')
    bloco(sobraAnterior, 'antes')
  }
  for (const nota of agora.sobra) linha(nota, 'fraco')
  return saida
}
