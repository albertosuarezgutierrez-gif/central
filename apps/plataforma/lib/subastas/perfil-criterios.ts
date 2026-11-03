// Mapeo PURO fila-jsonb de `subastas_criterios` → criterios del perfil de
// inversión. Las 6 columnas llegan en una migración aparte
// (2026-10-28_subastas_perfil_inversion.sql); mientras no exista, la fila no las
// trae y TODO sale «sin filtro». Así el código se despliega antes que la
// migración sin romper el radar.
import type { CriteriosSubasta } from '@central/module-subastas'

type Fila = Record<string, unknown> | null | undefined

const numOrUndef = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function perfilDesdeFila(f: Fila): Pick<
  CriteriosSubasta,
  'municipios' | 'soloUnifamiliar' | 'dormitoriosMin' | 'banosMin' | 'superficieParcelaMin' | 'requierePiscina'
> {
  return {
    municipios: Array.isArray(f?.municipios) ? (f!.municipios as unknown[]).map(String) : [],
    soloUnifamiliar: f?.solo_unifamiliar === true,
    dormitoriosMin: numOrUndef(f?.dormitorios_min),
    banosMin: numOrUndef(f?.banos_min),
    superficieParcelaMin: numOrUndef(f?.superficie_parcela_min),
    requierePiscina: f?.requiere_piscina === true,
  }
}
