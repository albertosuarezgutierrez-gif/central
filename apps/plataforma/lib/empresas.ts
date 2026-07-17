// Lectura para la sección Empresas: agrupa los eventos BORME por empresa, los puntúa y arma el radar.
import { prisma } from '@/lib/db'
import { puntuarEmpresa, type ResultadoScore } from '@/lib/empresas-scoring'
import { agregarRadar, type FilaRadar, type PuntoRadar } from '@/lib/empresas-radar'
import type { TipoEvento } from '@/lib/borme'

export interface FiltroEmpresas {
  provincia?: string
  tipos?: TipoEvento[]
  desde?: string
}

interface FilaEvento {
  empresa: string
  empresa_norm: string
  provincia: string | null
  tipo: TipoEvento
  fecha: string
}

export interface DatosEmpresas {
  empresas: ResultadoScore[]
  radar: PuntoRadar[]
  total: number
}

/** Días por defecto de ventana temporal si no se pasa `desde`. */
const VENTANA_DIAS = 90

export async function getEmpresasYRadar(f: FiltroEmpresas = {}): Promise<DatosEmpresas> {
  const desde = f.desde ?? new Date(Date.now() - VENTANA_DIAS * 86_400_000).toISOString().slice(0, 10)
  const provincia = f.provincia ?? null

  const filas = await prisma.$queryRaw<FilaEvento[]>`
    SELECT empresa, empresa_norm, provincia, tipo, to_char(fecha, 'YYYY-MM-DD') AS fecha
    FROM borme_eventos
    WHERE fecha >= ${desde}::date
      AND (${provincia}::text IS NULL OR provincia = ${provincia})
    ORDER BY fecha DESC
    LIMIT 5000`

  // Agrupar por empresa_norm → score.
  const porEmpresa = new Map<string, FilaEvento[]>()
  for (const fila of filas) {
    const arr = porEmpresa.get(fila.empresa_norm) ?? []
    arr.push(fila)
    porEmpresa.set(fila.empresa_norm, arr)
  }
  let empresas = [...porEmpresa.values()]
    .map((evs) =>
      puntuarEmpresa({
        empresa: evs[0].empresa,
        empresaNorm: evs[0].empresa_norm,
        provincia: evs[0].provincia,
        eventos: evs.map((e) => ({ tipo: e.tipo, fecha: e.fecha })),
      }),
    )
    .sort((a, b) => b.score - a.score)

  if (f.tipos?.length) {
    const set = new Set(f.tipos)
    const permitidas = new Set(filas.filter((x) => set.has(x.tipo)).map((x) => x.empresa_norm))
    empresas = empresas.filter((e) => permitidas.has(e.empresaNorm))
  }

  const radar = agregarRadar(
    filas.filter((x) => x.provincia).map((x): FilaRadar => ({ clave: x.provincia as string, tipo: x.tipo })),
  ).sort((a, b) => b.dificultad - a.dificultad)

  return { empresas, radar, total: empresas.length }
}

export async function getProvincias(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ provincia: string }[]>`
    SELECT DISTINCT provincia FROM borme_eventos WHERE provincia IS NOT NULL ORDER BY provincia`
  return rows.map((r) => r.provincia)
}
