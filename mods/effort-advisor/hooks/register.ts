import type { ModelEffort, Register } from 'claude-code'

const LEVELS: readonly ModelEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const MIN_CHARS = 8

const RUBRIC = `Você escolhe o nível de esforço de raciocínio (effort) para um assistente de código.
Níveis: low (pergunta simples, edição trivial, conversa), medium (tarefa comum de código),
high (bug difícil, refatoração, design), xhigh (arquitetura/multi-arquivo complexo), max (problema muito difícil/pesquisa profunda).
Responda SOMENTE JSON: {"level":"low|medium|high|xhigh|max","reason":"<até 15 palavras, em português>"}

Prompt do usuário:
`

const parse = (text: string): { level: ModelEffort; reason: string } | null => {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as { level?: string; reason?: string }
    const level = LEVELS.find(l => l === j.level)
    return level ? { level, reason: j.reason ?? '' } : null
  } catch {
    return null
  }
}

export const register: Register = on => {
  let current: ModelEffort | undefined // último effort visto no loop principal
  let override: ModelEffort | undefined // escolhido pelo usuário para o turno atual
  let disabled = false // usuário escolheu continuar com o effort atual: não sugere mais nesta sessão

  on('prompt.submit', async ($, e, next) => {
    override = undefined
    const skip = disabled || e.command || e.isMeta || e.origin.kind !== 'composer' || e.text.trim().length < MIN_CHARS
    if (skip) return next(e)

    try {
      const r = await $.model.complete({
        model: 'sonnet', // resolve via ANTHROPIC_DEFAULT_SONNET_MODEL
        prompt: RUBRIC + e.text.slice(0, 4000),
        effort: 'low',
        maxTokens: 120,
        timeoutMs: 15000,
      })
      const rec = r.isAnswered ? parse(r.text) : null
      if (rec && rec.level !== current) {
        const keep = `Continuar com effort ${current ?? 'atual'}`
        const use = `Usar ${rec.level}`
        const answer = await $.ui.ask(
          `Sugestão de effort: ${rec.level} (atual: ${current ?? 'desconhecido'}). ${rec.reason} Trocar?`,
          { header: 'Effort', options: [use, keep] },
        )
        if (answer === use) override = rec.level
        else if (answer === keep) disabled = true // não roda mais nesta sessão
      }
    } catch {
      // diálogo dispensado, sem terminal (-p) ou erro: segue sem mudar
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    if (override !== undefined && e.effort !== undefined) {
      return yield* next({ ...e, effort: override })
    }
    if (typeof e.effort === 'string') current = e.effort as ModelEffort
    return yield* next(e)
  })
}
