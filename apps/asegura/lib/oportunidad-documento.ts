// Todo documento de seguro subido, donde se suba, abre (o completa) una oportunidad (29/09/2026).
//
// Alberto: «toda documentación que se suba —recibo, póliza, imagen— […] no se puede perder porque
// hay que llamarlo un mes y pico antes del vencimiento». Las reglas que deciden (a qué ficha va,
// cuándo se llama, qué es un documento de seguro) son puras y están en `oportunidad-documento-reglas.ts`.
// Aquí solo se orquesta: leer, decidir, dar de alta el lead si hace falta, relacionar y abrir.
//
// - Nunca lanza: devuelve un desenlace con nombre. Quien lo llama tras guardar un fichero NO puede
//   perder el fichero porque la oportunidad falle.
// - Una póliza en vigor con nosotros no es una oportunidad (`ya_nuestra`).
// - La deduplicación es la de `crearOportunidad`: el mismo seguro ya abierto se COMPLETA, no se repite.
// - El DNI del documento no sale de aquí.
import { prepararAltaDesdeDocumento, seguroAnteriorDe, type LecturaPoliza } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { altaCliente, altaLeadSinContacto, coincidencias, descifrarCampo } from './cartera-edicion'
import { crearRelacion } from './cartera-relaciones'
import { crearOportunidad } from './oportunidad-seguimiento'
import { polizaEnCartera } from './poliza-en-cartera'
import { leerPoliza, type ResultadoLecturaPoliza } from './documentos/extraer-poliza'
import { contrasenasDeLaFicha } from './documentos/contrasenas-ficha'
import {
  decidirFicha,
  esDocumentoDeSeguro,
  fechaLlamada,
  proximoVencimiento,
  ramoOportunidad,
} from './oportunidad-documento-reglas'

export type ResultadoOportunidadDocumento =
  | {
      estado: 'creada' | 'actualizada'
      oportunidadId: string
      clienteId: string
      /** Se ha abierto un lead nuevo para el tomador (era otra persona). */
      clienteNuevo: boolean
      /** El documento era de otra persona: queda relacionada con la ficha donde se subió. */
      relacionado: boolean
      vence: string | null
      llamada: string
    }
  | { estado: 'ya_nuestra' }
  | { estado: 'no_es_seguro' }
  | { estado: 'sin_lectura'; motivo: string }
  | { estado: 'sin_persona' }
  | { estado: 'error'; motivo: string }

export type EntradaOportunidadDocumento = {
  correduriaId: string
  /** Ficha donde se ha subido el documento (null si se sube sin ficha). */
  clienteSube: string | null
  /** Dónde se subió, para el rastro: `ficha`, `portal`, `solicitud`, `subir-poliza`… */
  origen: string
  actor: string
  hoy?: Date
}

const txt = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)
const fmt = (iso: string) => iso.split('-').reverse().join('/')

/** Lee el fichero (probando el DNI de la ficha si el PDF tiene contraseña) y sigue con lo leído. */
export async function oportunidadDesdeFichero(
  e: EntradaOportunidadDocumento & { fichero: { contenido: Buffer; mime: string; nombre: string } },
): Promise<ResultadoOportunidadDocumento> {
  try {
    const clienteSube = e.clienteSube
    const lectura = await leerPoliza(e.fichero.contenido, e.fichero.mime, e.fichero.nombre, {
      contrasenas: clienteSube ? () => contrasenasDeLaFicha(e.correduriaId, clienteSube) : undefined,
    })
    return await oportunidadDesdeLectura({ ...e, lectura })
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo leer el documento:', err instanceof Error ? err.message : err)
    return { estado: 'error', motivo: err instanceof Error ? err.message : String(err) }
  }
}

/** Con el documento ya leído (p. ej. `subir-poliza`, que lo leyó antes de guardar). */
export async function oportunidadDesdeLectura(
  e: EntradaOportunidadDocumento & { lectura: ResultadoLecturaPoliza | LecturaPoliza },
): Promise<ResultadoOportunidadDocumento> {
  try {
    const leida = e.lectura
    if ('fase' in leida && leida.fase === 'ninguno') return { estado: 'sin_lectura', motivo: leida.motivo }
    const r = 'tipoLectura' in leida
      ? { ramo: leida.ramo, fase: leida.tipoLectura, datos: leida.datos as Record<string, unknown> }
      : { ramo: leida.ramo, fase: leida.fase, datos: leida.datos as unknown as Record<string, unknown> }
    const d = r.datos
    if (!esDocumentoDeSeguro(d)) return { estado: 'no_es_seguro' }

    const nuestra = await polizaEnCartera(e.correduriaId, txt(d.numeroPoliza, 60)).catch(() => null)
    if (nuestra && nuestra.length > 0) return { estado: 'ya_nuestra' }

    const l = { ramo: r.ramo, tipoLectura: r.fase, datos: d } as LecturaPoliza
    const { alta } = prepararAltaDesdeDocumento(l)

    const db = prismaAsegura()
    const ficha = e.clienteSube
      ? await db.cliente.findFirst({
          where: { id: e.clienteSube, correduriaId: e.correduriaId, mergedIntoClienteId: null },
          select: { id: true, nombre: true, apellidos: true, dni: true },
        })
      : null
    const clienteSube = ficha?.id ?? null
    const cs = alta?.dni
      ? await coincidencias(e.correduriaId, { dni: alta.dni })
          .then((xs) => xs.filter((x) => x.por === 'dni').map((x) => ({ id: x.id, activo: true })))
          .catch(() => null)
      : null
    const decision = decidirFicha({
      clienteSube,
      nombreFicha: ficha ? `${ficha.nombre ?? ''} ${ficha.apellidos ?? ''}` : null,
      dniFicha: ficha ? descifrarCampo(ficha.dni) : null,
      tomador: alta ? `${alta.nombre} ${alta.apellidos}` : null,
      dniDocumento: alta?.dni ?? null,
      coincidencias: cs,
    })
    if (decision.tipo === 'sin_persona') return { estado: 'sin_persona' }

    let clienteId: string
    let clienteNuevo = false
    if (decision.tipo === 'ficha') {
      clienteId = decision.clienteId
    } else {
      if (!alta) return { estado: 'sin_persona' }
      const lead = alta.dni
        ? await altaCliente(e.correduriaId, { nombre: alta.nombre, apellidos: alta.apellidos, dni: alta.dni, fuente: 'venta_directa' }, e.actor)
        : await altaLeadSinContacto(e.correduriaId, { nombre: alta.nombre, apellidos: alta.apellidos, tipoPersona: alta.tipoPersona ?? null }, e.actor, e.origen)
      if (lead.ok) {
        clienteId = lead.id
        clienteNuevo = true
      } else {
        // El DNI ya estaba en una ficha que la búsqueda no vio: esa es la persona.
        const porDni = 'coincidencias' in lead ? lead.coincidencias?.find((c) => c.por === 'dni') : undefined
        if (!porDni) return { estado: 'error', motivo: `No se pudo abrir el lead del tomador: ${lead.motivo}` }
        clienteId = porDni.id
      }
    }

    let relacionado = false
    if (clienteSube && clienteId !== clienteSube) {
      const rel = await crearRelacion(e.correduriaId, clienteSube, {
        relacionadoId: clienteId,
        tipo: 'Otra',
        observaciones: 'Documento de su seguro subido desde esta ficha',
        actor: e.actor,
      }).catch(() => null)
      relacionado = rel?.ok === true
    }

    const hoy = e.hoy ?? new Date()
    const vence = proximoVencimiento(txt(d.fechaVencimiento, 10), hoy)
    const llamada = fechaLlamada(vence, hoy)
    const prima = typeof d.primaAnual === 'number' && Number.isFinite(d.primaAnual) && d.primaAnual > 0 && d.primaAnual < 1_000_000 ? d.primaAnual : null
    const vehiculo = [txt(d.marca, 40), txt(d.modelo, 40)].filter(Boolean).join(' ') || null
    const datos = {
      ramo: ramoOportunidad(r.ramo),
      estado: 'competencia',
      fechaFinVigencia: vence,
      aseguradora: txt(d.compania),
      prima,
      numeroPoliza: txt(d.numeroPoliza, 60),
      matricula: txt(d.matricula, 20),
      vehiculo,
      seguroAnterior: r.fase === 'auto'
        ? seguroAnteriorDe({ codigoDgs: d.codigoEntidadDgs, fechaEfecto: d.fechaEfecto, aniosSinSiniestros: d.aniosSinSiniestros, siniestrosUltimos5: d.siniestrosUltimos5 })
        : null,
      tipoTarea: 'llamada',
      fechaTarea: llamada,
      nota: vence
        ? `Llamar para su renovación: vence el ${fmt(vence)} (documento subido: ${e.origen})`
        : `Pedir la fecha de vencimiento: el documento subido (${e.origen}) no la trae legible`,
    }
    const o = await crearOportunidad(e.correduriaId, clienteId, datos, e.actor, hoy, `documento:${e.origen}`)
    if (o.ok) return { estado: 'creada', oportunidadId: o.id, clienteId, clienteNuevo, relacionado, vence, llamada }
    if (o.estado === 'duplicada' && 'id' in o) return { estado: 'actualizada', oportunidadId: o.id, clienteId, clienteNuevo, relacionado, vence, llamada }
    return { estado: 'error', motivo: o.motivo }
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo abrir la oportunidad:', err instanceof Error ? err.message : err)
    return { estado: 'error', motivo: err instanceof Error ? err.message : String(err) }
  }
}
