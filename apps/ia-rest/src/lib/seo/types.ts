// Tipos del agente SEO autónomo (iarest)

export interface SeoOverride {
  ruta: string
  title?: string | null
  description?: string | null
  canonical?: string | null
  og?: Record<string, unknown> | null
  jsonld?: Record<string, unknown> | null
  activo?: boolean
}

export interface SeoContentBlock {
  ruta: string
  posicion: number
  titulo?: string | null
  html: string
  activo?: boolean
}

export interface SeoArticuloBloque {
  h2: string
  html: string
}

export interface SeoArticulo {
  slug: string
  titulo: string
  meta_description?: string | null
  keyword?: string | null
  bloques: SeoArticuloBloque[]
  activo?: boolean
  published_at?: string | null
}

export type TipoCambio = 'metadata' | 'schema' | 'content_block' | 'articulo'

export interface SeoCambio {
  run_id: string
  ruta: string
  tipo: TipoCambio
  valor_antes: unknown
  valor_despues: unknown
  motivo?: string
}
