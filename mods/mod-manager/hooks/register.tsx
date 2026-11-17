import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

const PANE = 'mod-manager'
const tick = atom({ plugin: 'mod-manager', key: 'tick' } as const, 0)

type Mod = {
  name: string
  kind: 'dev' | 'settings'
  isOn: boolean
  path: string // dev: mod folder; settings: plugin key
  key?: string // settings key of the same mod, when it has one
}

const OFF = '{ "modules": [] }\n'

const home = ($: EngineInterface) => $.env.get('HOME')

async function listMods($: EngineInterface): Promise<Mod[]> {
  const base = `${await home($)}/.claude/dev-mods`
  const mods: Mod[] = []
  const sessions = await $.fs.list(base).catch(() => [])
  for (const s of sessions) {
    if (s.kind !== 'dir') continue
    const entries = await $.fs.list(`${base}/${s.name}`).catch(() => [])
    for (const m of entries) {
      if (m.kind !== 'dir' || m.name === $.plugin.name) continue
      const dir = `${base}/${s.name}/${m.name}`
      if (!(await $.fs.exists(`${dir}/.claude-plugin/plugin.json`))) continue
      const hooks = await $.fs.read(`${dir}/hooks/hooks.json`).catch(() => '')
      let isOn = hooks !== ''
      try {
        const mods = JSON.parse(hooks).modules
        if (Array.isArray(mods) && mods.length === 0) isOn = false
      } catch {}
      mods.push({ name: m.name, kind: 'dev', isOn, path: dir })
    }
  }
  const raw = await $.fs.read(`${await home($)}/.claude/settings.json`).catch(() => '{}')
  let enabled: Record<string, boolean> = {}
  try {
    enabled = JSON.parse(raw).enabledPlugins ?? {}
  } catch {}
  for (const [key, v] of Object.entries(enabled)) {
    const name = key.split('@')[0]
    if (name === $.plugin.name) continue
    const twin = mods.find(m => m.kind === 'dev' && m.name === name)
    if (twin) {
      twin.key = key
      twin.isOn = twin.isOn && v === true
    }
  }
  return mods
}

async function setPlugin($: EngineInterface, key: string, value: boolean) {
  const file = `${await home($)}/.claude/settings.json`
  const json = JSON.parse(await $.fs.read(file))
  json.enabledPlugins = { ...json.enabledPlugins, [key]: value }
  await $.fs.write(file, JSON.stringify(json, null, 2) + '\n')
}

async function toggle($: EngineInterface, mod: Mod) {
  if (mod.kind === 'dev') {
    const file = `${mod.path}/hooks/hooks.json`
    const backup = `${mod.path}/hooks/hooks.json.disabled`
    const current = await $.fs.read(file).catch(() => OFF)
    const isEmpty = current.replace(/\s/g, '') === OFF.replace(/\s/g, '')
    if (mod.isOn && !isEmpty) {
      await $.fs.write(backup, current)
      await $.fs.write(file, OFF)
    } else if (!mod.isOn && isEmpty) {
      await $.fs.write(file, await $.fs.read(backup))
    }
    if (mod.key) await setPlugin($, mod.key, !mod.isOn)
  } else {
    await setPlugin($, mod.path, !mod.isOn)
  }
  await update($, tick, n => n + 1)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: 'Open the mods sidebar to enable or disable mods' })
    return next(e)
  })

  on('command.run', { command: 'mods' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Mods', backgroundColor: 'transparent' })
    return { text: 'Mods sidebar opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const mods = await listMods($)

    const sorted = [...mods].sort((x, y) => x.name.localeCompare(y.name))
    const width = Math.max(8, ...sorted.map(m => m.name.length))
    const total = sorted.length
    const active = sorted.filter(m => m.isOn).length
    const rule = '─'.repeat(Math.max(12, Math.min(e.props.bodyColumns - 2, width + 14)))

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold>Mods</Text>
        <Text dimColor>
          {active} of {total} enabled
        </Text>
        <Text dimColor>{rule}</Text>
        {total === 0 && <Text dimColor>No mods found.</Text>}
        {sorted.map(mod => (
          <Button plain key={`${mod.kind}:${mod.path}`} onPress={() => toggle($, mod)}>
            <Text>{mod.isOn ? '◉  ' : '○  '}</Text>
            <Text dimColor={!mod.isOn}>{mod.name.padEnd(width)}</Text>
            <Text dimColor>{mod.isOn ? '  on' : '  off'}</Text>
          </Button>
        ))}
        <Text dimColor>{rule}</Text>
        <Text dimColor>Press a row to toggle</Text>
      </Box>
    )
  })
}
