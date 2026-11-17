import type { Register, SessionMessage } from 'claude-code'

const THRESHOLD = 70 // % da janela de contexto
const REARM_BELOW = 50 // volta a avisar depois de /clear ou compactação
const MAX_LIST = 60
const OPT_COPY = 'Copiar conteúdo'
const OPT_OPEN = 'Abrir nova sessão'

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
const uniq = (xs: string[]) => [...new Set(xs)]
const list = (xs: string[]) =>
  xs.length === 0
    ? '- (nenhum)'
    : xs.slice(-MAX_LIST).map(x => `- ${x}`).join('\n') +
      (xs.length > MAX_LIST ? `\n- … e mais ${xs.length - MAX_LIST} anteriores` : '')

// Linhas injetadas pelo harness (reminders, caveats de comandos) não são intenção do usuário.
const isReal = (m: SessionMessage) =>
  m.role === 'user' && m.text.trim() !== '' && !/^\s*<(system-reminder|local-command|command-)/.test(m.text)

const SUMMARY_PROMPT = `Você prepara um handoff para outra sessão do Claude Code continuar este trabalho.
Com base na conversa abaixo, escreva em português, em markdown, EXATAMENTE estas seções:
## Progresso
(o que já foi feito, decisões tomadas e por quê)
## Estado atual
(onde o trabalho parou, o que está quebrado ou em andamento)
## Próximos passos
(lista objetiva e ordenada)
## Pontos de atenção
(armadilhas, restrições, preferências do usuário)
Seja fiel: não invente nada que não esteja na conversa. Máximo ~400 palavras.

Conversa:
`

// Terminais a tentar, na ordem. Cada um recebe cwd e o argv do claude.
const TERMINALS: { bin: string; argv: (cwd: string, cmd: string[]) => string[] }[] = [
  { bin: 'kitty', argv: (cwd, cmd) => ['kitty', '--directory', cwd, ...cmd] },
  { bin: 'alacritty', argv: (cwd, cmd) => ['alacritty', '--working-directory', cwd, '-e', ...cmd] },
  { bin: 'wezterm', argv: (cwd, cmd) => ['wezterm', 'start', '--cwd', cwd, '--', ...cmd] },
  { bin: 'ghostty', argv: (cwd, cmd) => ['ghostty', `--working-directory=${cwd}`, '-e', ...cmd] },
  { bin: 'gnome-terminal', argv: (cwd, cmd) => ['gnome-terminal', `--working-directory=${cwd}`, '--', ...cmd] },
  { bin: 'konsole', argv: (cwd, cmd) => ['konsole', '--workdir', cwd, '-e', ...cmd] },
  { bin: 'xfce4-terminal', argv: (cwd, cmd) => ['xfce4-terminal', `--working-directory=${cwd}`, '-x', ...cmd] },
  { bin: 'xterm', argv: (_cwd, cmd) => ['xterm', '-e', ...cmd] },
]

export const register: Register = on => {
  let isWarned = false
  const skillsSeen: string[] = [] // skills disparadas por /slash (não aparecem como tool use)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoff',
      description: 'Gera um handoff desta sessão; copia ou abre uma nova sessão com ele',
    })
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    skillsSeen.push(e.skill)
    return next(e)
  })

  // Aviso (não bloqueia nada): ao fim de cada turno do agente principal.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        const { context } = await $.session.usage()
        const pct = context.percent ?? 0
        if (pct < REARM_BELOW) isWarned = false
        else if (pct >= THRESHOLD && !isWarned) {
          isWarned = true
          const msg = `Contexto em ${pct}% da janela. Rode /handoff para passar o trabalho a uma nova sessão.`
          $.ui.toast(`handoff: ${msg}`)
          $.ui.log(`handoff: ${msg}`)
        }
      } catch {
        // sem medição disponível: sem aviso
      }
    }
    return next(e)
  })

  on('command.run', { command: 'handoff' }, async $ => {
    $.ui.toast('handoff: gerando…')
    const msgs = await $.session.messages()
    if (!Array.isArray(msgs) || msgs.length === 0) return { text: 'handoff: a conversa está vazia.' }

    // --- fatos da conversa ---
    const real = msgs.filter(isReal)
    const first = real[0]?.text ?? '(não encontrado)'
    const recent = real.slice(-3).map(m => clip(m.text.trim(), 600))
    const uses = msgs.flatMap(m => m.toolUses ?? [])
    const skills = uniq([
      ...uses.filter(u => u.tool === 'Skill').map(u => str(u.input.skill) ?? str(u.input.name) ?? '?'),
      ...skillsSeen,
    ])
    const read = uniq(uses.filter(u => u.tool === 'Read').map(u => str(u.input.file_path)).filter((x): x is string => !!x))
    const changed = uniq(
      uses
        .filter(u => ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(u.tool))
        .map(u => str(u.input.file_path) ?? str(u.input.notebook_path))
        .filter((x): x is string => !!x),
    )
    const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant' && m.text.trim())

    const [cwd, id, model, usage, repo] = await Promise.all([
      $.session.cwd(),
      $.session.id(),
      $.session.model(),
      $.session.usage().catch(() => undefined),
      $.session.repo().catch(() => null),
    ])

    // --- resumo pelo modelo (opcional) ---
    const transcript = [
      `[intenção original] ${clip(first, 1500)}`,
      ...msgs.slice(-40).map(m => `[${m.role}] ${clip(m.text.trim(), 500)}${m.toolUses?.length ? ` (ferramentas: ${m.toolUses.map(u => u.tool).join(', ')})` : ''}`),
    ].join('\n')
    let summary = ''
    try {
      const r = await $.model.complete({
        model: 'sonnet',
        prompt: SUMMARY_PROMPT + clip(transcript, 24000),
        effort: 'low',
        maxTokens: 1200,
        timeoutMs: 60000,
      })
      if (r.isAnswered) summary = r.text.trim()
    } catch {
      // segue com o resumo mecânico
    }
    if (!summary) {
      summary = `## Estado atual\n${lastAssistant ? clip(lastAssistant.text.trim(), 1500) : '(sem resposta do assistente)'}`
    }

    const body = `# Handoff de sessão

> Gerado por /handoff. Leia tudo antes de agir e continue de onde a sessão anterior parou.

## Contexto
- Diretório: ${cwd}
- Sessão anterior: ${id}
- Modelo: ${model}
- Contexto usado: ${usage?.context.percent ?? '?'}%
${repo ? `- Repositório git: ${JSON.stringify(repo)}\n` : ''}
## Intenção original (primeiro prompt)
${first.trim()}

${summary}

## Pedidos mais recentes do usuário
${recent.length ? recent.map(r => `> ${r.replace(/\n/g, '\n> ')}`).join('\n\n') : '(nenhum)'}

## Skills usadas
${list(skills)}

## Arquivos modificados
${list(changed)}

## Arquivos lidos
${list(read)}
`

    // --- arquivo temporário ---
    const tmp = (await $.env.get('TMPDIR')) ?? '/tmp'
    const path = `${tmp.replace(/\/$/, '')}/claude-handoff-${id.slice(0, 8)}-${Date.now()}.md`
    await $.fs.write(path, body)

    // --- ações ---
    let picked = ''
    try {
      picked = await $.ui.ask(`Handoff salvo em ${path}. O que fazer com ele?`, {
        header: 'Handoff',
        options: [OPT_COPY, OPT_OPEN],
        multiSelect: true,
      })
    } catch {
      return { text: `Handoff salvo em ${path}` }
    }

    const done: string[] = [`salvo em ${path}`]
    if (picked.includes(OPT_COPY)) {
      const r = await $.ui.copy({ text: body })
      done.push(r.isCopied ? 'conteúdo copiado' : `cópia falhou (${r.reason})`)
    }
    if (picked.includes(OPT_OPEN)) {
      const claude = ['claude', `Leia o handoff em ${path} e continue o trabalho a partir dele.`]
      const tmux = await $.env.get('TMUX')
      let argv: string[] | undefined
      if (tmux) argv = ['tmux', 'new-window', '-c', cwd, ...claude]
      else {
        for (const t of TERMINALS) {
          const w = await $.process.run(['which', t.bin]).catch(() => undefined)
          if (w && w.exitCode === 0) {
            argv = t.argv(cwd, claude)
            break
          }
        }
      }
      if (argv) {
        // sh em segundo plano: o terminal novo não prende este processo.
        await $.process.run(['sh', '-c', '"$@" >/dev/null 2>&1 &', 'sh', ...argv])
        done.push('nova sessão aberta')
      } else {
        await $.ui.copy({ text: `claude "Leia o handoff em ${path} e continue o trabalho a partir dele."` })
        done.push('nenhum terminal encontrado: comando para a nova sessão copiado')
      }
    }
    return { text: `handoff: ${done.join('; ')}.` }
  })
}
