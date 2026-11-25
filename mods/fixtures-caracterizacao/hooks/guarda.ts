/** Regras puras que decidem se uma ação do agente aprovaria um fixture. */

const BLOCO_RESULTADO = /^```resultado\n[\s\S]*?\n```$/gm
const STATUS_REGRA = /^---\n(?:(?!---\n).*\n)*?status:[ \t]*regra\b/

const resultados = (texto: string): string =>
  JSON.stringify(texto.replace(/\r\n/g, '\n').match(BLOCO_RESULTADO) ?? [])

const confirmaRegra = (texto: string): boolean =>
  STATUS_REGRA.test(texto.replace(/\r\n/g, '\n'))

/** Motivo para recusar a troca de `atual` por `proposto`, se houver. */
export function motivoParaRecusar(atual: string, proposto: string): string | undefined {
  if (resultados(atual) !== resultados(proposto)) {
    return 'os blocos `resultado` de um fixture aprovado só mudam quando uma pessoa aprova o .received.md'
  }
  if (!confirmaRegra(atual) && confirmaRegra(proposto)) {
    return '`status: regra` registra uma confirmação do time e só uma pessoa pode definir'
  }
  return undefined
}

const CITA_APROVADO = /\.approved\b|approved\.md/
const PROGRAMA_QUE_ESCREVE =
  /(^|[;&|(`\s/\\])(mv|cp|rm|tee|install|rsync|ln|dd|truncate|rename|patch|xargs|perl|ruby|node|python3?)(?=\s|$)/
const SED_NO_LUGAR = /\bsed\b[^|;&\n]*\s(-[a-zA-Z]*i|--in-place)/
const GIT_QUE_ESCREVE = /\bgit\b[^|;&\n]*\s(mv|rm|checkout|restore|reset|apply|stash|revert)(?=\s|$)/
const REDIRECIONAMENTO_INOCUO = /\d?>&\d|(\d|&)?>>?\s*\/dev\/null/g

/**
 * Heurística para o shell: recusa comandos que citam um arquivo aprovado e
 * também podem escrever. Pode ser contornada, por exemplo por um script.
 */
export function comandoPodeAprovar(comando: string): boolean {
  if (!CITA_APROVADO.test(comando)) {
    return false
  }
  return (
    PROGRAMA_QUE_ESCREVE.test(comando) ||
    SED_NO_LUGAR.test(comando) ||
    GIT_QUE_ESCREVE.test(comando) ||
    comando.replace(REDIRECIONAMENTO_INOCUO, '').includes('>')
  )
}
