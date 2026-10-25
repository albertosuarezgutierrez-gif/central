/**
 * Tras COMPLETAR el enlace de datos de HOGAR (25/10/2026): Catastro → riesgo de la oportunidad → Telegram.
 * Corre en `after()` (la respuesta al cliente no espera al Catastro) y NUNCA lanza: lo que falle se dice en el aviso.
 *
 * 1. Catastro con la dirección declarada (`inmueblesPorDireccion`, calle OFICIAL si la eligió del callejero):
 *    solo un inmueble INEQUÍVOCO (`inmuebleUnicoCatastro`: el único que casa con CP/planta/puerta) da referencia,
 *    m² y año. Varios, ninguno o caído → sin datos del Catastro, y el aviso dice cuál fue.
 * 2. Lo declarado + el Catastro se escribe en `info_riesgo.datosVivienda` SOLO en los huecos y SIN confirmar, por
 *    `calcularEdicionRiesgo` (el mismo cálculo que la pantalla del riesgo). La ficha del cliente no se toca.
 * 3. Telegram a Alberto con el resumen (`textoAvisoDatosHogar`).
 *
 * Ni la dirección ni la referencia van a ningún log: solo el motivo.
 * El SQL crudo NO prefija `seguros.`: la conexión ya trae `?schema=seguros`.
 */
import { tgSend } from '@central/core-telegram'
import { bajarCatastro, inmueblesPorDireccion } from '@central/core-catastro/http'
import { precalificarHogar } from '@central/core-catastro'
import {
  calcularEdicionRiesgo,
  direccionDeRespuestas,
  soloHuecos,
  viviendaDeSolicitud,
  type CatastroSolicitud,
  type Respuesta,
} from '@central/module-seguros'
import { inmuebleUnicoCatastro } from '@central/module-tarificacion'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { textoAvisoDatosHogar } from './aviso-datos-hogar.ts'
import { enlaceFichaCliente, URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import { partirDireccion, siglaDeTipoVia } from './codeoscopic/direccion.ts'

const TOPE_CATASTRO_MS = 12_000

const conTope = <T,>(p: Promise<T>, ms: number): Promise<T | 'tope'> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve('tope'), ms)
    p.then((x) => { clearTimeout(t); resolve(x) }, () => { clearTimeout(t); resolve('tope') })
  })

/** El Catastro para la dirección declarada. Nunca lanza. */
export async function catastroDeSolicitud(r: Record<string, Respuesta>): Promise<CatastroSolicitud> {
  const d = direccionDeRespuestas(r)
  // La sigla: la del callejero si la eligió; si la escribió a mano, la que se deduzca del texto (o no se busca).
  const libre = d && !d.viaNombre ? partirDireccion(d.calle) : null
  const sigla = d?.viaTipo ?? (libre?.tipoVia ? siglaDeTipoVia(libre.tipoVia) : null)
  const calle = d?.viaNombre ?? libre?.nombre ?? null
  if (!d || !d.provincia || !d.municipio || !calle || !d.numero || !sigla) return { estado: 'sin_direccion' }
  const consulta = (async (): Promise<CatastroSolicitud> => {
    const lista = await inmueblesPorDireccion({
      provincia: d.provincia!.toUpperCase(), municipio: d.municipio!.toUpperCase(), sigla, calle, numero: d.numero!,
      ...(d.viaNombre ? { viaOficial: d.viaNombre } : {}),
    })
    if (lista === null) return { estado: 'via_ambigua' }
    if (lista.inmuebles.length === 0) return { estado: 'no_encontrado' }
    const e = inmuebleUnicoCatastro(lista.inmuebles, { planta: d.planta, puerta: d.puerta, codigoPostal: d.cp })
    if (e.estado !== 'unico') return { estado: e.estado }
    const datos = await bajarCatastro(e.refCompleta)
    if (datos === null) return { estado: 'no_encontrado' }
    const p = precalificarHogar(datos)
    return { estado: 'ok', referencia: e.refCompleta, metrosCuadrados: p.datos.metrosCuadrados, anioConstruccion: p.datos.anioConstruccion, uso: p.datos.uso }
  })()
  const r2 = await conTope(consulta, TOPE_CATASTRO_MS)
  if (r2 === 'tope') {
    console.warn('[solicitud-datos-hogar] Catastro sin respuesta a tiempo')
    return { estado: 'error' }
  }
  return r2
}

/** Escribe en los huecos de `datosVivienda` (sin confirmar). Devuelve cuántos campos, o `null` si no se pudo. */
async function anotarEnRiesgo(correduriaId: string, oportunidadId: string, propuesta: Record<string, string | number | boolean>): Promise<number | null> {
  try {
    return await prismaAsegura().$transaction(async (tx) => {
      const [op] = await tx.$queryRaw<{ tipo: string; info: unknown }[]>(Prisma.sql`
        select tipo::text as tipo, info_riesgo as info from oportunidades
        where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid for update`)
      if (!op || op.tipo !== 'hogar') return null
      const info = op.info !== null && typeof op.info === 'object' && !Array.isArray(op.info) ? (op.info as Record<string, unknown>) : {}
      const actual = info.datosVivienda !== null && typeof info.datosVivienda === 'object' ? (info.datosVivienda as Record<string, unknown>) : null
      let parcial = soloHuecos(actual, propuesta)
      const ahora = new Date().toISOString()
      // Un campo que no valide se descarta (y se reintenta una vez sin él): no tumba al resto.
      for (let intento = 0; intento < 2 && Object.keys(parcial).length > 0; intento++) {
        const e = calcularEdicionRiesgo({ ramo: 'hogar', clave: 'datosVivienda', info, parcial, confirmar: false, ahora, precarga: null })
        if (e.ok) {
          if (!e.hayQueEscribir) return 0
          await tx.$executeRaw(Prisma.sql`
            update oportunidades set info_riesgo = ${JSON.stringify(e.infoNueva)}::jsonb, updated_at = now()
            where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
          await tx.$executeRaw(Prisma.sql`
            insert into oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
            values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'datos_enlace_riesgo',
                    ${JSON.stringify({ campos: e.cambios.map((c) => c.campo) })}::jsonb, 'el cliente, por el enlace')`)
          return e.cambios.length
        }
        const malos = new Set((e.errores ?? []).map((x) => x.campo))
        if (malos.size === 0) return null
        parcial = Object.fromEntries(Object.entries(parcial).filter(([k]) => !malos.has(k)))
      }
      return 0
    })
  } catch (err) {
    console.error('[solicitud-datos-hogar] no se pudo anotar en el riesgo:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function trasCompletarHogar(p: {
  correduriaId: string
  oportunidadId: string
  /** Ficha del CLIENTE de la oportunidad (la del enlace en plataforma). */
  clienteId: string
  respuestas: Record<string, Respuesta>
  tercero: boolean
}): Promise<void> {
  try {
    const catastro = await catastroDeSolicitud(p.respuestas)
    const propuesta = viviendaDeSolicitud(p.respuestas, catastro, new Date().toISOString())
    const anotados = await anotarEnRiesgo(p.correduriaId, p.oportunidadId, propuesta)
    const enlace = `${enlaceFichaCliente(p.clienteId, process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO)}`
    await tgSend(textoAvisoDatosHogar({ respuestas: p.respuestas, catastro, enlaceFicha: enlace, tercero: p.tercero, anotados }))
  } catch (e) {
    console.error('[solicitud-datos-hogar] aviso tras completar falló:', e instanceof Error ? e.message : e)
  }
}
