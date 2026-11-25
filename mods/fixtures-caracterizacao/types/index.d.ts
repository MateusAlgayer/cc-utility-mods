/** O fixture em revisão, como foi lido no momento em que foi exibido. */
export type Revisao = {
  recebido: string
  aprovado: string
  conteudoRecebido: string
  /** `null` quando ainda não existe arquivo aprovado. */
  conteudoAprovado: string | null
  /** Versão usada na comparação; `null` quando o cenário é novo. */
  base: string | null
  /** De onde veio a base: o último commit ou o arquivo no disco. */
  origem: 'commit' | 'arquivo'
}

export type Painel = {
  raiz: string
  pendentes: string[]
  indice: number
  revisao: Revisao | null
  confirmando: boolean
  /** A ajuda está aberta no lugar do cenário. */
  ajuda: boolean
  aviso: string
}

declare module 'claude-code' {
  interface PluginState {
    'fixtures-caracterizacao': { painel: Shaped<Painel> }
  }
}
