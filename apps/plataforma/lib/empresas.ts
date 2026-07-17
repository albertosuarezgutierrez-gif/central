// Lectura para la sección Empresas: agrupa los eventos BORME por empresa, los puntúa (sumando las señales
// financieras del enriquecimiento si las hay) y arma el radar. Añade facturación/CNAE/preconcurso.
import { prisma } from '@/lib/db'
import { puntuarEmpresa } from '@/lib/empresas-scoring'
import { enriquecimientoASenales, type FilaEnriquecimiento } from '@/lib/empresas-senales'
import { agregarRadar, type FilaRadar, type PuntoRadar } from '@/lib/empresas-radar'
import type { TipoEvento } from '@/lib/borme'

export interface FiltroEmpresas {
  provincia?: string
  tipos?: TipoEvento[]
  desde?: string
  cnae?: string
  facturacionMin?: number
  facturacionMax?: number
}

interface FilaEvento {
  empresa: string
  empresa_norm: string
  provincia: string | null
  tipo: TipoEvento
  fecha: string
}

// Fila de enriquecimiento + campos de presentación (cif/cnae/facturación).
interface FilaEnriq extends FilaEnriquecimiento {
  empresa_norm: string
  cif: string | null
  cnae: string | null
  facturacion: number | null
}

/** Empresa puntuada + datos de enriquecimiento/ficha para la UI. */
export interface EmpresaFila {
  empresa: string
  empresaNorm: string
  provincia: string | null
  score: number
  motivo: string
  cif: string | null
  cnae: string | null
  facturacion: number | null
  enriquecida: boolean
  preconcurso: boolean
}

export interface DatosEmpresas {
  empresas: EmpresaFila[]
  radar: PuntoRadar[]
  total: number
}

/** Días por defecto de ventana temporal si no se pasa `desde`. */
const VENTANA_DIAS = 90

export async function getEmpresasYRadar(f: FiltroEmpresas = {}): Promise<DatosEmpresas> {
  const desde = f.desde ?? new Date(Date.now() - VENTANA_DIAS * 86_400_000).toISOString().slice(0, 10)
  const provincia = f.provincia ?? null

  const [filas, enriqRows, fichaRows] = await Promise.all([
    prisma.$queryRaw<FilaEvento[]>`
      SELECT empresa, empresa_norm, provincia, tipo, to_char(fecha, 'YYYY-MM-DD') AS fecha
      FROM borme_eventos
      WHERE fecha >= ${desde}::date
        AND (${provincia}::text IS NULL OR provincia = ${provincia})
      ORDER BY fecha DESC
      LIMIT 5000`,
    prisma.$queryRaw<FilaEnriq[]>`
      SELECT empresa_norm, cif, cnae, facturacion::float AS facturacion, patrimonio_neto::float AS patrimonio_neto,
             ebitda_n::float AS ebitda_n, ebitda_n1::float AS ebitda_n1, fondo_maniobra::float AS fondo_maniobra,
             to_char(ultimo_deposito, 'YYYY-MM-DD') AS ultimo_deposito, incidencias_pago,
             deuda_ebitda::float AS deuda_ebitda, refinanciaciones
      FROM empresas_enriquecimiento`,
    prisma.$queryRaw<{ empresa_norm: string; preconcurso: boolean | null }[]>`
      SELECT empresa_norm, preconcurso FROM empresas_ficha WHERE preconcurso IS TRUE`,
  ])

  const enriqPorNorm = new Map(enriqRows.map((r) => [r.empresa_norm, r]))
  const preconcursoSet = new Set(fichaRows.filter((r) => r.preconcurso).map((r) => r.empresa_norm))

  // Agrupar por empresa_norm → score.
  const porEmpresa = new Map<string, FilaEvento[]>()
  for (const fila of filas) {
    const arr = porEmpresa.get(fila.empresa_norm) ?? []
    arr.push(fila)
    porEmpresa.set(fila.empresa_norm, arr)
  }

  let empresas: EmpresaFila[] = [...porEmpresa.values()].map((evs) => {
    const norm = evs[0].empresa_norm
    const enr = enriqPorNorm.get(norm)
    const res = puntuarEmpresa({
      empresa: evs[0].empresa,
      empresaNorm: norm,
      provincia: evs[0].provincia,
      eventos: evs.map((e) => ({ tipo: e.tipo, fecha: e.fecha })),
      financiero: enr ? enriquecimientoASenales(enr) : undefined,
    })
    return {
      ...res,
      cif: enr?.cif ?? null,
      cnae: enr?.cnae ?? null,
      facturacion: enr?.facturacion ?? null,
      enriquecida: Boolean(enr),
      preconcurso: preconcursoSet.has(norm),
    }
  })

  if (f.tipos?.length) {
    const set = new Set(f.tipos)
    const permitidas = new Set(filas.filter((x) => set.has(x.tipo)).map((x) => x.empresa_norm))
    empresas = empresas.filter((e) => permitidas.has(e.empresaNorm))
  }
  // Filtro por sector (CNAE): estricto, solo empresas con ese CNAE (requiere enriquecimiento).
  if (f.cnae) empresas = empresas.filter((e) => e.cnae === f.cnae)
  // Filtro por facturación: las NO enriquecidas (sin dato) se conservan (no se pueden juzgar).
  if (typeof f.facturacionMin === 'number') empresas = empresas.filter((e) => e.facturacion == null || e.facturacion >= f.facturacionMin!)
  if (typeof f.facturacionMax === 'number') empresas = empresas.filter((e) => e.facturacion == null || e.facturacion <= f.facturacionMax!)

  empresas.sort((a, b) => b.score - a.score)

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

/** CNAEs presentes en el enriquecimiento (para el desplegable de sector; vacío hasta que haya datos). */
export async function getCnaes(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ cnae: string }[]>`
    SELECT DISTINCT cnae FROM empresas_enriquecimiento WHERE cnae IS NOT NULL AND cnae <> '' ORDER BY cnae`
  return rows.map((r) => r.cnae)
}
