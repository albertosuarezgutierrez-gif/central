/**
 * Tras COMPLETAR el enlace de datos de un ramo que NO es hogar (26/10/2026, fase 2): riesgo de la oportunidad → Telegram.
 * Hermano de `solicitud-datos-hogar.ts` (que además consulta el Catastro). Corre en `after()` y NUNCA lanza: lo que
 * falle se dice en el aviso.
 *
 * 1. Lo declarado → propuesta del bloque del ramo (`propuestaRiesgoDeSolicitud`, PURO).
 * 2. Vehículo: la versión del catálogo que eligió el cliente (y que su marca/modelo en texto sean los de esos ids) se
 *    COMPRUEBA contra el catálogo de Codeoscopic (GET gratis,
 *    con el interruptor de tarificación apagado: no gasta nada); si no casa o no se puede leer, los ids no se escriben
 *    (marca y modelo en texto, sí). La compañía actual en texto → su código DGS solo si casa con UNA del directorio.
 * 3. Se escribe por BLOQUES (`planEscrituraRiesgo`), sin confirmar, por `calcularEdicionRiesgo`: lo que ya había manda,
 *    un bloque confirmado por Alberto no se toca, los choques van al aviso. La ficha del cliente no se toca.
 * 4. Telegram a Alberto con el resumen (`textoAvisoDatosRiesgo`).
 *
 * El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.
 */
import { tgSend } from '@central/core-telegram'
import {
  calcularEdicionRiesgo,
  codigoDgsPorNombre,
  leerBloqueDeRamo,
  planEscrituraRiesgo,
  propuestaRiesgoDeSolicitud,
  type CampoSolicitud,
  type ClaveDatosRiesgo,
  type PropuestaRiesgo,
  type RamoSolicitud,
  type Respuesta,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { precargaDePolizaDeOportunidad } from './oportunidad-riesgo'
import { textoAvisoDatosRiesgo } from './aviso-datos-riesgo.ts'
import { enlaceFichaCliente, URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import { resolverCatalogo } from './retarificar-cartera'
import { textosCasanConCatalogo } from './catalogo-vehiculo-portal.ts'

const CATALOGO_VEHICULO = ['codigoVehiculo', 'marcaId', 'modeloId', 'motorId', 'version'] as const

/**
 * ¿La versión elegida existe en el catálogo para esa marca, modelo y combustible? `null` = no se ha podido mirar (sin
 * configurar o caído): entonces tampoco se escribe. Solo GET de catálogo: 0,00€.
 */
export async function versionEnCatalogo(ramo: 'auto' | 'moto', p: PropuestaRiesgo): Promise<boolean | null> {
  const [marcaId, modeloId, motor, codigo] = [p.marcaId, p.modeloId, p.motorId, p.codigoVehiculo].map((x) => (typeof x === 'string' ? x : ''))
  if (!marcaId || !modeloId || !motor || !codigo) return false
  const moto = ramo === 'moto'
  try {
    const [vs, ms, mds] = await Promise.all([
      resolverCatalogo(new URLSearchParams({ tipo: moto ? 'versiones-moto' : 'versiones', marcaId, modeloId, motor })),
      resolverCatalogo(new URLSearchParams({ tipo: moto ? 'marcas-moto' : 'marcas' })),
      resolverCatalogo(new URLSearchParams({ tipo: moto ? 'modelos-moto' : 'modelos', marcaId })),
    ])
    if (vs.estado === 'invalido') return false
    if (vs.estado !== 'ok' || ms.estado !== 'ok' || mds.estado !== 'ok') return null
    if (!vs.opciones.some((o) => o.id === codigo)) return false
    // Revisión del PR #5080: la marca y el modelo en texto tienen que ser los de esos ids (si los cambió a mano, no).
    return textosCasanConCatalogo({ marca: p.marca, modelo: p.modelo }, { marcaId, modeloId }, { marcas: ms.opciones, modelos: mds.opciones })
  } catch {
    return null
  }
}

type ResultadoAnotar = { anotados: number | null; conflictos: string[]; confirmado: boolean; cambiados?: string[] }

/** A qué bloque atómico pertenece cada campo (si uno no valida, cae su bloque ENTERO). */
function bloqueDe(clave: ClaveDatosRiesgo, campo: string): string {
  if (clave === 'datosVehiculo' && (CATALOGO_VEHICULO as readonly string[]).includes(campo)) return 'catalogo'
  if (clave === 'datosVehiculo' && ['aseguradoAntes', 'companiaAnterior', 'companiaAnteriorCodigo', 'vencimientoAnterior', 'aniosSinSiniestros'].includes(campo)) return 'historial'
  if (clave === 'datosVehiculo' && (campo === 'marca' || campo === 'modelo')) return 'identidad'
  if (clave === 'datosCapital' && ['hipoteca', 'vinculadaHipoteca', 'bancoHipoteca', 'capitalPendienteHipoteca'].includes(campo)) return 'hipoteca'
  if (clave === 'datosCapital' && (campo === 'numeroAsegurados' || campo === 'edadesAsegurados')) return 'personas'
  if (clave === 'datosRiesgoLibre' && ['especie', 'raza', 'fechaNacimientoAnimal', 'ppp', 'microchip'].includes(campo)) return 'mascota'
  return campo
}

async function anotarEnRiesgo(correduriaId: string, oportunidadId: string, ramo: RamoSolicitud, clave: ClaveDatosRiesgo, propuesta: PropuestaRiesgo): Promise<ResultadoAnotar> {
  try {
    return await prismaAsegura().$transaction(async (tx) => {
      const [op] = await tx.$queryRaw<{ tipo: string; info: unknown; polizaId: string | null }[]>(Prisma.sql`
        select tipo::text as tipo, info_riesgo as info, poliza_id::text as "polizaId" from oportunidades
        where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid for update`)
      if (!op || op.tipo !== ramo) return { anotados: null, conflictos: [], confirmado: false }
      const info = op.info !== null && typeof op.info === 'object' && !Array.isArray(op.info) ? (op.info as Record<string, unknown>) : {}
      const precarga = info[clave] === undefined ? await precargaDePolizaDeOportunidad(tx, correduriaId, op.polizaId, ramo) : null
      const visto = leerBloqueDeRamo(ramo, info, precarga).datos
      const confirmadoAt = typeof visto.confirmadoAt === 'string' && visto.confirmadoAt !== '' ? visto.confirmadoAt : null
      const plan = planEscrituraRiesgo(clave, visto, propuesta, confirmadoAt)
      if (plan.confirmado) return { anotados: 0, conflictos: [], confirmado: true }
      let parcial: PropuestaRiesgo = plan.escribir
      const ahora = new Date().toISOString()
      for (let intento = 0; intento < 3 && Object.keys(parcial).length > 0; intento++) {
        const e = calcularEdicionRiesgo({ ramo, clave, info, parcial, confirmar: false, ahora, precarga })
        if (e.ok) {
          if (!e.hayQueEscribir) return { anotados: 0, conflictos: plan.conflictos, confirmado: false }
          await tx.$executeRaw(Prisma.sql`
            update oportunidades set info_riesgo = ${JSON.stringify(e.infoNueva)}::jsonb, updated_at = now()
            where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
          await tx.$executeRaw(Prisma.sql`
            insert into oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
            values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'datos_enlace_riesgo',
                    ${JSON.stringify({ campos: e.cambios.map((c) => c.campo), conflictos: plan.conflictos })}::jsonb, 'el cliente, por el enlace')`)
          return { anotados: e.cambios.length, conflictos: plan.conflictos, confirmado: false, cambiados: e.cambios.filter((c) => c.antes !== null).map((c) => c.campo) }
        }
        const malos = new Set((e.errores ?? []).map((x) => bloqueDe(clave, x.campo)))
        if (malos.size === 0) return { anotados: null, conflictos: plan.conflictos, confirmado: false }
        parcial = Object.fromEntries(Object.entries(parcial).filter(([k]) => !malos.has(bloqueDe(clave, k))))
      }
      return { anotados: 0, conflictos: plan.conflictos, confirmado: false }
    })
  } catch (err) {
    console.error('[solicitud-datos-riesgo] no se pudo anotar en el riesgo:', err instanceof Error ? err.message : err)
    return { anotados: null, conflictos: [], confirmado: false }
  }
}

/** La compañía actual (texto del cliente) → código DGS del directorio, solo si casa con UNA. Nunca lanza. */
async function dgsDeCompania(nombre: unknown): Promise<string | null> {
  if (typeof nombre !== 'string' || nombre.trim() === '') return null
  try {
    const cat = await prismaAsegura().$queryRaw<{ codigoDgs: string; nombreComun: string; nombreCima: string | null }[]>(Prisma.sql`
      select codigo_dgs as "codigoDgs", nombre_comun as "nombreComun", nombre_cima as "nombreCima" from companias_dgs where activa`)
    return codigoDgsPorNombre(cat, nombre)
  } catch {
    return null
  }
}

export async function trasCompletarRiesgo(p: {
  correduriaId: string
  oportunidadId: string
  clienteId: string
  ramo: RamoSolicitud
  respuestas: Record<string, Respuesta>
  campos: readonly CampoSolicitud[]
  tercero: boolean
}): Promise<void> {
  try {
    const prop = propuestaRiesgoDeSolicitud(p.ramo, p.respuestas)
    if (!prop) return
    const propuesta: PropuestaRiesgo = { ...prop.propuesta }
    let catalogoComprobado: boolean | null = null
    let companiaDgs: string | null = null
    if (prop.clave === 'datosVehiculo') {
      if ('codigoVehiculo' in propuesta) {
        catalogoComprobado = await versionEnCatalogo(p.ramo === 'moto' ? 'moto' : 'auto', propuesta)
        // Sin comprobar, no se escribe: un id que no es del catálogo es una versión que no existe.
        if (catalogoComprobado !== true) for (const k of CATALOGO_VEHICULO) delete propuesta[k]
      }
      if (propuesta.aseguradoAntes === true) {
        companiaDgs = await dgsDeCompania(propuesta.companiaAnterior)
        if (companiaDgs) propuesta.companiaAnteriorCodigo = companiaDgs
      }
    }
    const r = Object.keys(propuesta).length > 0
      ? await anotarEnRiesgo(p.correduriaId, p.oportunidadId, p.ramo, prop.clave, propuesta)
      : { anotados: 0, conflictos: [], confirmado: false }
    const enlace = enlaceFichaCliente(p.clienteId, process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO)
    await tgSend(textoAvisoDatosRiesgo({
      ramo: p.ramo, respuestas: p.respuestas, campos: p.campos, enlaceFicha: enlace, tercero: p.tercero,
      anotados: r.anotados, conflictos: r.conflictos, confirmado: r.confirmado, cambiados: r.cambiados ?? [], catalogoComprobado, companiaDgs,
    }))
  } catch (e) {
    console.error('[solicitud-datos-riesgo] aviso tras completar falló:', e instanceof Error ? e.message : e)
  }
}
