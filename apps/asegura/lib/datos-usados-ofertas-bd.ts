// La lectura de «Datos con los que hemos calculado tu precio» de un presupuesto de ofertas DEL BOT (18/10/2026). Las
// reglas PURAS en `datos-usados-ofertas.ts`. Todo SQL por `correduria_id`; del conductor solo salen AÑOS (edad,
// antigüedad del carné): las fechas se descifran en memoria y no salen de aquí.
import { datosVehiculoDeInfoRiesgo } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { registrarErrorCartera } from './error-cartera'
import { personaDeFicha } from './oportunidad-riesgo'
import type { GrupoDatos } from './datos-cotizados'
import { gruposDatosUsadosOfertas, leerDatosUsados } from './datos-usados-ofertas'

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/**
 * Los grupos del cálculo para un presupuesto de ofertas. `[]` = no son ofertas del bot (PDF de compañía: no hubo
 * cálculo que enseñar). Si la lectura FALLA no se calla: se devuelve un grupo que lo dice (no es «no hay datos»).
 */
export async function gruposDatosUsadosDePresupuesto(correduriaId: string, presupuestoId: string, ramo: string, hoy: string): Promise<GrupoDatos[]> {
  try {
    const db = prismaAsegura()
    const filas = await db.$queryRaw<{ compania: string; datos_extra: unknown; oportunidad_id: string | null; cliente_id: string }[]>`
      select coalesce(f.compania, o.compania) as compania, f.datos_extra, p.oportunidad_id::text as oportunidad_id, p.cliente_id::text as cliente_id
      from presupuesto p
      join presupuesto_opcion o on o.presupuesto_id = p.id and o.oculta_at is null
      join oportunidad_oferta f on f.id = o.oferta_id and f.correduria_id = p.correduria_id
      where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid
      order by o.orden`
    const delBot = filas.filter((f) => (f.datos_extra as { origen?: unknown } | null)?.origen === 'rpa')
    if (delBot.length === 0) return []
    const oportunidadId = delBot[0].oportunidad_id
    let vehiculoFicha: Parameters<typeof gruposDatosUsadosOfertas>[0]['vehiculoFicha'] = null
    let conductorId = delBot[0].cliente_id
    let conductorEsTomador = true
    if (oportunidadId) {
      const [op] = await db.$queryRaw<{ info_riesgo: unknown; conductor: string | null }[]>`
        select o.info_riesgo,
               (select f.cliente_id::text from oportunidad_figura f
                 where f.oportunidad_id = o.id and f.correduria_id = o.correduria_id and f.rol = 'conductor_habitual'
                 order by f.creado_at asc limit 1) as conductor
        from oportunidades o where o.id = ${oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid`
      if (op) {
        const v = datosVehiculoDeInfoRiesgo(op.info_riesgo)
        vehiculoFicha = { marca: v.marca, modelo: v.modelo, version: v.version, matricula: v.matricula }
        if (op.conductor) { conductorId = op.conductor; conductorEsTomador = false }
      }
    }
    // El que CONDUCE: el habitual si lo hay; si no, el tomador (y el rótulo lo dice). Un fallo de su ficha (o una
    // ficha que no aparece) = «no lo hemos podido leer», no se calla. Persona jurídica = no hay edad que pintar.
    const p = await personaDeFicha(correduriaId, conductorId, ramo === 'moto' ? 'moto' : 'auto').catch((e: unknown) => {
      registrarErrorCartera('presupuesto/datos-usados/conductor', e)
      return null
    })
    const conductor = p === null
      ? 'ilegible' as const
      : 'tipo' in p && p.tipo === 'juridica'
        ? null
        : { fechaNacimiento: (p as { fechaNacimiento?: string }).fechaNacimiento ?? null, fechaCarnet: (p as { fechaCarnet?: string }).fechaCarnet ?? null }
    return gruposDatosUsadosOfertas({
      ofertas: delBot.map((f) => ({ compania: capital(f.compania), datosUsados: leerDatosUsados(f.datos_extra) })),
      vehiculoFicha,
      conductor,
      conductorEsTomador,
      // Ofertas de PDF junto a las del bot: las filas sin compañía tienen que decir a cuáles corresponden.
      mezclaConPdf: delBot.length < filas.length,
      hoy,
    })
  } catch (e) {
    registrarErrorCartera('presupuesto/datos-usados', e)
    return [{ titulo: 'Datos del cálculo', filas: [{ etiqueta: 'Ahora mismo', valor: 'no los hemos podido leer; te los confirmamos antes de emitir' }] }]
  }
}
