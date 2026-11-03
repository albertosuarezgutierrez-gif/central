// Aviso «🏡 Casa vacacional»: subastas nuevas que encajan con el perfil de Alberto
// (packages/module-subastas/src/perfil-casa-vacacional.ts), INDEPENDIENTE de los
// criterios de cada cuenta (que cubren otras provincias).
//
// Deduplicación SIN migración: las claves ya avisadas viven en `inversion_config`
// (tabla clave/valor que ya existe, fuera de Prisma) bajo `CLAVE_ESTADO`, como
// JSON. Si ese estado no se puede leer o escribir NO se envía nada (mejor
// callar que repetir el mismo aviso cada día).
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgAviso } from '@/lib/telegram'
import { eur } from '@/lib/dinero'
import {
  DORMITORIOS_IDEAL,
  encajaSubastaCasaVacacional,
  evaluarOportunidad,
  fusionarAvisadas,
} from '@central/module-subastas'
import { COLS_SUBASTA, SUBASTA_VIGENTE, filaASubasta } from '@/lib/subastas-radar'

export const CLAVE_ESTADO = 'subastas_casa_vacacional_avisadas'
const DIAS_FRESCURA = 2
const MAX_AVISOS = 10

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function leerAvisadas(): Promise<string[] | null> {
  try {
    const f = await prisma.$queryRaw<Array<{ value: string | null }>>(
      Prisma.sql`SELECT value FROM inversion_config WHERE key = ${CLAVE_ESTADO} LIMIT 1`,
    )
    if (!f.length || !f[0].value) return []
    const v = JSON.parse(String(f[0].value))
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return null
  }
}

async function guardarAvisadas(claves: string[]): Promise<boolean> {
  try {
    const json = JSON.stringify(claves)
    const n = await prisma.$executeRaw(
      Prisma.sql`UPDATE inversion_config SET value = ${json}, updated_at = now() WHERE key = ${CLAVE_ESTADO}`,
    )
    if (Number(n) === 0) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO inversion_config (key, value, updated_at)
        SELECT ${CLAVE_ESTADO}, ${json}, now()
        WHERE NOT EXISTS (SELECT 1 FROM inversion_config WHERE key = ${CLAVE_ESTADO})
      `)
    }
    return true
  } catch {
    return false
  }
}

export async function avisarCasaVacacional(): Promise<{ candidatas: number; avisadas: number; sinEstado?: boolean }> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ${COLS_SUBASTA} FROM subastas
    WHERE es_inmueble = true AND ${SUBASTA_VIGENTE}
      AND created_at >= now() - make_interval(days => ${DIAS_FRESCURA}::int)
    ORDER BY created_at DESC
    LIMIT 500
  `)
  const encajan = filas
    .map(filaASubasta)
    .map((s) => {
      const op = evaluarOportunidad(s, null, {})
      return { s, op, e: encajaSubastaCasaVacacional(s, op) }
    })
    .filter((x) => x.e.encaja)
  if (!encajan.length) return { candidatas: 0, avisadas: 0 }

  const previas = await leerAvisadas()
  if (previas === null) return { candidatas: encajan.length, avisadas: 0, sinEstado: true }
  const nuevas = encajan.filter((x) => !previas.includes(x.s.dedupeKey))
  if (!nuevas.length) return { candidatas: encajan.length, avisadas: 0 }

  // Primero se guarda el estado: si falla, no se manda (evita repetir a diario).
  const aEnviar = nuevas.slice(0, MAX_AVISOS)
  if (!(await guardarAvisadas(fusionarAvisadas(previas, aEnviar.map((x) => x.s.dedupeKey))))) {
    return { candidatas: encajan.length, avisadas: 0, sinEstado: true }
  }

  for (const { s, op, e } of aEnviar) {
    const desc = op.descuento == null ? null : `${Math.round(op.descuento * 100)}% bajo valor`
    const dorm = s.dormitorios
    const lineas = [`🏡 <b>Casa vacacional — subasta</b> ${escapar(s.identificador ?? s.dedupeKey)}`]
    lineas.push(
      escapar(
        [
          s.valorSubasta != null ? `Valor de subasta ${eur(s.valorSubasta)}` : 'Valor de subasta sin publicar',
          [s.municipio, s.provincia].filter(Boolean).join(' (') + (s.municipio && s.provincia ? ')' : ''),
          desc,
          s.fechaFin ? `cierra ${new Date(s.fechaFin).toLocaleDateString('es-ES')}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    )
    if (s.descripcion) lineas.push(`<i>${escapar(String(s.descripcion).slice(0, 160))}</i>`)
    const fisico = [
      dorm != null ? `${dorm} dorm.${dorm >= DORMITORIOS_IDEAL ? ' ⭐' : ''}` : null,
      s.banos != null ? `${s.banos} baños` : null,
    ].filter(Boolean)
    if (fisico.length) lineas.push(escapar(fisico.join(' · ')))
    if (e.pendientes.length) lineas.push(`⏳ Por comprobar: ${escapar(e.pendientes.join(', '))}`)
    if (s.url) lineas.push(escapar(s.url))
    await tgAviso('subastas.casa-vacacional', lineas.join('\n'), { html: true }).catch(() => {})
  }
  if (nuevas.length > MAX_AVISOS) {
    await tgAviso('subastas.casa-vacacional', `🏡 …y ${nuevas.length - MAX_AVISOS} subastas más que encajan en /subastas`, { html: true }).catch(() => {})
  }
  return { candidatas: encajan.length, avisadas: aEnviar.length }
}
