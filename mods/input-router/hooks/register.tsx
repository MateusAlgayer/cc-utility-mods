import type { Register } from 'claude-code'

// Files whose Read would exceed this many (estimated) tokens are routed.
const MAX_TOKENS = 2000
// Rough estimate: ~4 characters per token.
const CHARS_PER_TOKEN = 4
const AGENT = 'reader'
const WAIT_MS = 180_000
// Not set on purpose: the subagent inherits the main task's effort level.
// Uses the model set in ANTHROPIC_DEFAULT_HAIKU_MODEL, falling back to the 'haiku' alias.
const MODEL = (globalThis as any).process?.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'haiku'

// Formats the Read tool renders itself (images, PDFs, notebooks): not text-sized.
const SKIP = /\.(png|jpe?g|gif|webp|bmp|svg|pdf|ipynb|ico|mp[34]|mov|zip|gz|tar|wasm|bin)$/i

const PROMPT = `You are the Input Router's reader. Your job: read ONE large file in its entirety and report what matters.

Rules:
- Read the whole file with the Read tool, in consecutive chunks (offset/limit, ~400 lines each) until you reach the end. Do not skip any part and do not stop early.
- Then reply with a compact, faithful summary: purpose of the file, structure (sections/classes/functions with line numbers), key logic, important constants/config, notable risks or TODOs. Prefer line references like \`L120-L180\` so the caller can read exact ranges.
- Quote verbatim only short, critical snippets. Never invent content you did not read.
- You may only use Read. Do not edit anything. Keep the answer under ~800 words.`

type Waiter = (answer: string) => void

export const register: Register = (on) => {
  const waiters = new Map<string, Waiter>()
  const early = new Map<string, string>()
  let isRegistered = false
  const LABEL = '🧭 Input Router'


  const waitFor = (id: string): Promise<string> =>
    new Promise((resolve) => {
      const done = early.get(id)
      if (done !== undefined) {
        early.delete(id)
        resolve(done)
      } else {
        waiters.set(id, resolve)
      }
    })

  on('agent.offer', { agent: `input-router:${AGENT}` }, () => ({ isOffered: false })).catch(($, e, next) => next(e))

  on('turn.complete', ($, e, next) => {
    if (e.agentId) {
      const w = waiters.get(e.agentId)
      if (w) {
        waiters.delete(e.agentId)
        w(e.answer)
      } else {
        early.set(e.agentId, e.answer)
      }
    }
    return next(e)
  })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    // The router's own reader must be free to read the file.
    if (e.agentId) {
      const info = (await $.agent.list()).find((a) => a.id === e.agentId)
      if (info?.type === `input-router:${AGENT}`) return next(e)
    }
    if (SKIP.test(e.file_path) || e.pages) return next(e)

    let text: string
    try {
      text = await $.fs.read(e.file_path)
    } catch (err) {
      // Missing, unreadable or over 4 MiB: over 4 MiB is certainly too big.
      const msg = String(err)
      if (!/4 ?MiB|too large|exceed/i.test(msg)) return next(e)
      text = ''.padEnd(MAX_TOKENS * CHARS_PER_TOKEN + 1)
    }

    // Estimate just the range the call asks for.
    let slice = text
    if (e.offset !== undefined || e.limit !== undefined) {
      const lines = text.split('\n')
      const start = Math.max(0, (e.offset ?? 1) - 1)
      slice = lines.slice(start, e.limit !== undefined ? start + e.limit : undefined).join('\n')
    }
    const tokens = Math.ceil(slice.length / CHARS_PER_TOKEN)
    if (tokens <= MAX_TOKENS) return next(e)

    try {
      if (!isRegistered) {
        await $.agent.register({
          name: AGENT,
          description: 'Reads one large file in full and summarizes it (used by Input Router).',
          prompt: PROMPT,
          tools: ['Read'],
          model: MODEL,
        })
        isRegistered = true
      }
      const range = e.offset !== undefined || e.limit !== undefined
        ? ` (the caller asked for offset=${e.offset ?? 1}, limit=${e.limit ?? 'all'}; read and summarize only that range)`
        : ''
      const { agentId, deny } = await $.agent.spawn({
        subagentType: `input-router:${AGENT}`,
        description: 'Summarize large file',
        model: MODEL,
        prompt: `Read this file in full and summarize it: ${e.file_path}${range}\nIt is about ${tokens} tokens.`,
      })
      if (deny || !agentId) {
        return { deny: `input-router: file is ~${tokens} tokens (limit ${MAX_TOKENS}) and the reader subagent could not start (${deny ?? 'no id'}). Read it in ranges of under ${MAX_TOKENS} tokens instead.` }
      }
      const answer = await Promise.race([
        waitFor(agentId),
        $.clock.sleep(WAIT_MS).then(() => undefined),
      ])
      waiters.delete(agentId)
      if (answer === undefined || answer.trim() === '') {
        return { deny: `input-router: the reader subagent returned nothing for ${e.file_path} (~${tokens} tokens). Read it in ranges of under ${MAX_TOKENS} tokens instead.` }
      }
      $.ui.toast(`${LABEL}: ${e.file_path.split('/').pop()} (~${tokens} tokens) summarized by ${MODEL}`)
      return {
        deny: `${LABEL} · ${e.file_path} is ~${tokens} tokens (limit ${MAX_TOKENS}), so the Read was routed to a subagent (${MODEL}) that read the whole file. Its summary follows. For exact text, Read a smaller range (offset/limit, under ~${MAX_TOKENS} tokens).\n\n${answer}`,
      }
    } catch (err) {
      return { deny: `input-router: routing failed (${String(err)}). Read the file in ranges of under ${MAX_TOKENS} tokens.` }
    }
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  // Badge under the Read row of a call this mod routed (recognized by the
  // label it puts at the start of the refusal the model received).
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const out = e.props.output
    const isRouted =
      e.props.tool === 'Read' &&
      e.props.isErrored &&
      typeof out === 'string' &&
      out.includes('🧭 Input Router')
    if (!isRouted || e.props.isExpanded) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text color="cyan">🧭 Input Router · routed to a subagent ({MODEL})</Text>
      </Box>
    )
  })
}
