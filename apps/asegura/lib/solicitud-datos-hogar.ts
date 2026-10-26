/**
 * Tras COMPLETAR el enlace de datos de HOGAR (25/10/2026): Catastro → riesgo de la oportunidad → Telegram.
 * Corre en `after()` (la respuesta al cliente no espera al Catastro) y NUNCA lanza: lo que falle se dice en el aviso.
 *
 * 1. Catastro con la dirección declarada (`inmueblesPorDireccion`, calle OFICIAL si la eligió del callejero):
 *    solo un inmueble INEQUÍVOCO (`inmuebleUnicoCatastro`: el único que casa con CP/planta/puerta) da referencia,
 *    m² y año. Varios, ninguno o caído → sin datos del Catastro, y el aviso dice cuál fue.
 * 2. Lo declarado + el Catastro se escribe en `info_riesgo.datosVivienda` por BLOQUES atómicos (`planEscrituraVivienda`:
 *    dirección solo si la guardada está vacía entera; Catastro solo sin referencia previa o con la misma) y SIN confirmar,
 *    por `calcularEdicionRiesgo` con la precarga de la póliza. Un bloque confirmado por Alberto no se toca. Los choques
 *    van al aviso. La ficha del cliente no se toca.
 * 3. Telegram a Alberto con el resumen (`textoAvisoDatosHogar`).
 *
 * Ni la dirección ni la referencia van a ningún log: solo el motivo.
 * El SQL crudo NO prefija `seguros.`: la conexión ya trae `?schema=seguros`.
 */
import { tgSend } from '@central/core-telegram'
import { bajarCatastro, inmueblesPorDireccion } from '@central/core-catastro/http'
import { caracterizarVivienda, precalificarHogar } from '@central/core-catastro'
import {
  CLAVES_BLOQUE_CATASTRO,
  CLAVES_BLOQUE_DIRECCION,
  calcularEdicionRiesgo,
  direccionDeRespuestas,
  leerBloqueDeRamo,
  planEscrituraVivienda,
  viviendaDeSolicitud,
  type CampoSolicitud,
  type CatastroSolicitud,
  type Respuesta,
} from '@central/module-seguros'
import { deducirViviendaCatastro, inmuebleUnicoCatastro, type ViviendaDeducida } from '@central/module-tarificacion'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { precargaDePolizaDeOportunidad } from './oportunidad-riesgo'
import { textoAvisoDatosHogar } from './aviso-datos-hogar.ts'
import { enlaceFichaCliente, URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import { partirDireccion, siglaDeTipoVia } from './codeoscopic/direccion.ts'

const TOPE_CATASTRO_MS = 12_000

const conTope = <T,>(p: Promise<T>, ms: number): Promise<T | 'tope'> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve('tope'), ms)
    p.then((x) => { clearTimeout(t); resolve(x) }, () => { clearTimeout(t); resolve('tope') })
  })

export type CatastroYDeduccion = { catastro: CatastroSolicitud; deducida: ViviendaDeducida | null }

/**
 * El Catastro para la dirección declarada + el TIPO de vivienda deducido (26/10/2026: división horizontal, planta
 * declarada contra las de la parcela → piso / bajo / último; ficha → unifamiliar). Nunca lanza.
 */
export async function catastroDeSolicitud(r: Record<string, Respuesta>): Promise<CatastroYDeduccion> {
  const d = direccionDeRespuestas(r)
  // La sigla: la del callejero si la eligió; si la escribió a mano, la que se deduzca del texto (o no se busca).
  const libre = d && !d.viaNombre ? partirDireccion(d.calle) : null
  const sigla = d?.viaTipo ?? (libre?.tipoVia ? siglaDeTipoVia(libre.tipoVia) : null)
  const calle = d?.viaNombre ?? libre?.nombre ?? null
  if (!d || !d.provincia || !d.municipio || !calle || !d.numero || !sigla) return { catastro: { estado: 'sin_direccion' }, deducida: null }
  const consulta = (async (): Promise<CatastroYDeduccion> => {
    const lista = await inmueblesPorDireccion({
      provincia: d.provincia!.toUpperCase(), municipio: d.municipio!.toUpperCase(), sigla, calle, numero: d.numero!,
      ...(d.viaNombre ? { viaOficial: d.viaNombre } : {}),
    })
    if (lista === null) return { catastro: { estado: 'via_ambigua' }, deducida: null }
    if (lista.inmuebles.length === 0) return { catastro: { estado: 'no_encontrado' }, deducida: null }
    const e = inmuebleUnicoCatastro(lista.inmuebles, { planta: d.planta, puerta: d.puerta, codigoPostal: d.cp })
    if (e.estado !== 'unico') {
      // Sin el inmueble concreto aún se puede deducir por la parcela (varios inmuebles = piso) y la planta declarada.
      return { catastro: { estado: e.estado }, deducida: deducirViviendaCatastro({ tipoFicha: null, inmuebles: lista.inmuebles, plantaDeclarada: d.planta }) }
    }
    const datos = await bajarCatastro(e.refCompleta)
    if (datos === null) return { catastro: { estado: 'no_encontrado' }, deducida: null }
    const p = precalificarHogar(datos)
    const deducida = deducirViviendaCatastro({ tipoFicha: caracterizarVivienda(datos)?.tipo ?? null, inmuebles: lista.inmuebles, plantaDeclarada: d.planta })
    return { catastro: { estado: 'ok', referencia: e.refCompleta, metrosCuadrados: p.datos.metrosCuadrados, anioConstruccion: p.datos.anioConstruccion, uso: p.datos.uso }, deducida }
  })()
  const r2 = await conTope(consulta, TOPE_CATASTRO_MS)
  if (r2 === 'tope') {
    console.warn('[solicitud-datos-hogar] Catastro sin respuesta a tiempo')
    return { catastro: { estado: 'error' }, deducida: null }
  }
  return r2
}

export type ResultadoAnotar = {
  /** Campos escritos; `null` = no se pudo (error o la oportunidad ya no es de hogar). */
  anotados: number | null
  /** Lo que no se escribió por chocar con lo guardado. */
  conflictos: string[]
  /** El bloque de la vivienda estaba confirmado por Alberto: no se ha tocado. */
  confirmado: boolean
}

/** A qué bloque atómico pertenece cada campo (si uno no valida, cae su bloque ENTERO, no solo él). */
function bloqueDe(campo: string): string {
  if ((CLAVES_BLOQUE_DIRECCION as readonly string[]).includes(campo)) return 'direccion'
  if ((CLAVES_BLOQUE_CATASTRO as readonly string[]).includes(campo)) return 'catastro'
  if (campo === 'hipoteca' || campo === 'bancoHipoteca') return 'hipoteca'
  return campo
}

/**
 * Escribe en `datosVivienda` por BLOQUES (`planEscrituraVivienda`), sin confirmar, partiendo de lo que enseña la
 * pantalla del riesgo: lo estructurado o, sin ello, la PRECARGA de la póliza (que así no se pierde). Bloque confirmado =
 * no se toca.
 */
async function anotarEnRiesgo(correduriaId: string, oportunidadId: string, propuesta: Record<string, string | number | boolean>): Promise<ResultadoAnotar> {
  try {
    return await prismaAsegura().$transaction(async (tx) => {
      const [op] = await tx.$queryRaw<{ tipo: string; info: unknown; polizaId: string | null }[]>(Prisma.sql`
        select tipo::text as tipo, info_riesgo as info, poliza_id::text as "polizaId" from oportunidades
        where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid for update`)
      if (!op || op.tipo !== 'hogar') return { anotados: null, conflictos: [], confirmado: false }
      const info = op.info !== null && typeof op.info === 'object' && !Array.isArray(op.info) ? (op.info as Record<string, unknown>) : {}
      const precarga = info.datosVivienda === undefined ? await precargaDePolizaDeOportunidad(tx, correduriaId, op.polizaId, 'hogar') : null
      const visto = leerBloqueDeRamo('hogar', info, precarga).datos
      const confirmadoAt = typeof visto.confirmadoAt === 'string' && visto.confirmadoAt !== '' ? visto.confirmadoAt : null
      const plan = planEscrituraVivienda(visto, propuesta, confirmadoAt)
      if (plan.confirmado) return { anotados: 0, conflictos: [], confirmado: true }
      let parcial = plan.escribir
      const ahora = new Date().toISOString()
      for (let intento = 0; intento < 3 && Object.keys(parcial).length > 0; intento++) {
        const e = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info, parcial, confirmar: false, ahora, precarga })
        if (e.ok) {
          if (!e.hayQueEscribir) return { anotados: 0, conflictos: plan.conflictos, confirmado: false }
          await tx.$executeRaw(Prisma.sql`
            update oportunidades set info_riesgo = ${JSON.stringify(e.infoNueva)}::jsonb, updated_at = now()
            where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
          await tx.$executeRaw(Prisma.sql`
            insert into oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
            values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'datos_enlace_riesgo',
                    ${JSON.stringify({ campos: e.cambios.map((c) => c.campo), conflictos: plan.conflictos })}::jsonb, 'el cliente, por el enlace')`)
          return { anotados: e.cambios.length, conflictos: plan.conflictos, confirmado: false }
        }
        const malos = new Set((e.errores ?? []).map((x) => bloqueDe(x.campo)))
        if (malos.size === 0) return { anotados: null, conflictos: plan.conflictos, confirmado: false }
        parcial = Object.fromEntries(Object.entries(parcial).filter(([k]) => !malos.has(bloqueDe(k))))
      }
      return { anotados: 0, conflictos: plan.conflictos, confirmado: false }
    })
  } catch (err) {
    console.error('[solicitud-datos-hogar] no se pudo anotar en el riesgo:', err instanceof Error ? err.message : err)
    return { anotados: null, conflictos: [], confirmado: false }
  }
}

/**
 * Lo que ya se sabe de la vivienda de la oportunidad (26/10/2026), para que el enlace pregunte SOLO lo que falta
 * (`camposHogarSinLoSabido`): lo mismo que enseña la pantalla del riesgo (lo estructurado o, sin él, la precarga de la
 * póliza). Solo para OCULTAR preguntas: nada de esto viaja a la página. `null` = no se ha podido leer (o la oportunidad
 * ya no es de hogar) → se pregunta todo. Nunca lanza.
 */
export async function viviendaSabidaDeOportunidad(correduriaId: string, oportunidadId: string): Promise<Record<string, unknown> | null> {
  try {
    const db = prismaAsegura()
    const [op] = await db.$queryRaw<{ tipo: string; info: unknown; polizaId: string | null }[]>(Prisma.sql`
      select tipo::text as tipo, info_riesgo as info, poliza_id::text as "polizaId" from oportunidades
      where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!op || op.tipo !== 'hogar') return null
    const info = op.info !== null && typeof op.info === 'object' && !Array.isArray(op.info) ? (op.info as Record<string, unknown>) : {}
    const precarga = info.datosVivienda === undefined ? await precargaDePolizaDeOportunidad(db, correduriaId, op.polizaId, 'hogar') : null
    return leerBloqueDeRamo('hogar', info, precarga).datos
  } catch (e) {
    console.warn('[solicitud-datos-hogar] vivienda sabida sin leer (se pregunta todo):', e instanceof Error ? e.message : e)
    return null
  }
}

export async function trasCompletarHogar(p: {
  correduriaId: string
  oportunidadId: string
  /** Ficha del CLIENTE de la oportunidad (la del enlace en plataforma). */
  clienteId: string
  respuestas: Record<string, Respuesta>
  /** Los campos que se pidieron (para listar lo que queda «a preguntar»). */
  campos: readonly CampoSolicitud[]
  tercero: boolean
}): Promise<void> {
  try {
    const { catastro, deducida } = await catastroDeSolicitud(p.respuestas)
    const propuesta = viviendaDeSolicitud(p.respuestas, catastro, new Date().toISOString(), deducida)
    const r = await anotarEnRiesgo(p.correduriaId, p.oportunidadId, propuesta)
    const enlace = enlaceFichaCliente(p.clienteId, process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO)
    await tgSend(textoAvisoDatosHogar({
      respuestas: p.respuestas, catastro, deducida, campos: p.campos, enlaceFicha: enlace, tercero: p.tercero,
      anotados: r.anotados, conflictos: r.conflictos, confirmado: r.confirmado,
    }))
  } catch (e) {
    console.error('[solicitud-datos-hogar] aviso tras completar falló:', e instanceof Error ? e.message : e)
  }
}
