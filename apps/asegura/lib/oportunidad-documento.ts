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
import {
  companiaLegible,
  extraccionSinPii,
  normalizarContactoTomador,
  polizaFinanciada,
  prepararAltaDesdeDocumento,
  seguroAnteriorDe,
  vencimientoUrgente,
  type ContactoTomadorLeido,
  type LecturaPoliza,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { altaCliente, altaLeadSinContacto, anotarHistorialCliente, coincidencias, descifrarCampo } from './cartera-edicion'
import { crearRelacion } from './cartera-relaciones'
import { crearOportunidad } from './oportunidad-seguimiento'
import { polizaEnCartera } from './poliza-en-cartera'
import { leerPoliza, type ResultadoLecturaPoliza } from './documentos/extraer-poliza'
import { contrasenasDeLaFicha } from './documentos/contrasenas-ficha'
import { volcarPolizaEnFicha, type VolcadoFicha } from './ficha-desde-poliza'
import {
  decidirFicha,
  posiblesDuplicadosPorContacto,
  puedeVolcarEnFicha,
  esDocumentoDeSeguro,
  fechaLlamada,
  mismoNombre,
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
      /** `actualizada`: se rellenó algún hueco de la que ya había (false = ya lo tenía todo). */
      completada: boolean
      /**
       * Lo que la póliza sabía del tomador y se volcó a SU ficha (03/10/2026). `null` = no se intentó
       * (subida sin verificar, o documento sin tomador): no es «no había nada».
       */
      ficha: VolcadoFicha | null
      /** Póliza de concesionario / financiada: el motivo; `null` = no consta. */
      financiada: string | null
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
  /**
   * `false` = quien sube no está comprobado (el portal sin ficha vinculada): un documento sin DNI no
   * abre lead (sería uno por subida) y lo que caiga en una ficha que ya existe se marca «sin verificar».
   */
  verificado?: boolean
  /** Documento ya guardado del que sale esta lectura: se le guarda el JSON leído (`extraccion`). */
  documentoId?: string | null
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
    if (e.documentoId && lectura.fase !== 'ninguno') await guardarExtraccion(e.correduriaId, e.documentoId, lectura.bruto ?? null)
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
    // Contacto, domicilio, carné y mediador del tomador: ya normalizados si vienen del lector; de una
    // lectura a mano (`LecturaPoliza`), se normalizan aquí de las mismas claves.
    const contacto: ContactoTomadorLeido = ('contacto' in leida && leida.contacto) || normalizarContactoTomador(d)

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
    const verificado = e.verificado !== false
    if (!verificado && decision.tipo === 'lead' && !alta?.dni) return { estado: 'sin_persona' }

    let clienteId: string
    let clienteNuevo = false
    let compartenContacto: string[] = []
    if (decision.tipo === 'ficha') {
      clienteId = decision.clienteId
    } else {
      if (!alta) return { estado: 'sin_persona' }
      // Sin DNI, el mismo recibo subido dos veces (o reintentado) no puede abrir dos leads: se reusa
      // el lead sin DNI que se llama EXACTAMENTE igual.
      const previo = alta.dni ? null : await leadMismoNombre(e.correduriaId, `${alta.nombre} ${alta.apellidos}`)
      // Las fichas con su teléfono o email NO se usan (un móvil es un hogar): se anotan en el lead
      // como posibles duplicados (`posiblesDuplicadosPorContacto`).
      if (!previo) compartenContacto = await fichasPorContacto(e.correduriaId, contacto)
      const lead = previo
        ? { ok: true as const, id: previo }
        : alta.dni
        ? await altaCliente(e.correduriaId, { nombre: alta.nombre, apellidos: alta.apellidos, dni: alta.dni, fuente: 'venta_directa' }, e.actor)
        : await altaLeadSinContacto(e.correduriaId, { nombre: alta.nombre, apellidos: alta.apellidos, tipoPersona: alta.tipoPersona ?? null }, e.actor, e.origen)
      if (lead.ok) {
        clienteId = lead.id
        clienteNuevo = !previo
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
      // Ya relacionadas de antes (409) también es «relacionado»: la oportunidad está en OTRA ficha.
      relacionado = rel?.ok === true || rel?.estado === 'conflicto'
    }

    // Lo que la póliza sabe del TOMADOR va a SU ficha (03/10/2026): solo huecos, solo si el DNI del
    // documento es el de la ficha (o ella no tiene); quién puede volcar, en `puedeVolcarEnFicha`
    // (desde el portal, solo en la ficha propia de quien sube).
    const hoy = e.hoy ?? new Date()
    const identificado = puedeVolcarEnFicha({
      origen: e.origen,
      verificado,
      hayTomador: alta !== null,
      porqueFicha: decision.tipo === 'ficha' ? decision.porque : null,
      clienteId,
      clienteSube,
    })
    const volcado = identificado
      ? await volcarPolizaEnFicha({
          correduriaId: e.correduriaId,
          clienteId,
          actor: e.actor,
          origen: e.origen,
          hoy,
          leido: {
            ramo: r.ramo,
            dni: alta?.dni ?? null,
            fechaNacimiento: txt(d.fechaNacimiento, 10),
            fechaCarnet: txt(d.fechaCarnet, 10),
            contacto,
          },
        })
      : null
    if (clienteNuevo) await notaPosiblesDuplicados(e.correduriaId, clienteId, alta ? `${alta.nombre} ${alta.apellidos}` : null, compartenContacto, e.actor)

    const vence = proximoVencimiento(txt(d.fechaVencimiento, 10), hoy)
    const llamada = fechaLlamada(vence, hoy)
    const prima = typeof d.primaAnual === 'number' && Number.isFinite(d.primaAnual) && d.primaAnual > 0 && d.primaAnual < 1_000_000 ? d.primaAnual : null
    const vehiculo = [txt(d.marca, 40), txt(d.modelo, 40)].filter(Boolean).join(' ') || null
    const sinVerificar = verificado ? '' : ' — subido desde el portal por alguien sin ficha: SIN VERIFICAR'
    // La compañía (03/10/2026): lo leído si es un nombre; si es basura («P.P.») o no está, la del código DGS.
    const aseguradora = companiaLegible(txt(d.compania), await nombrePorDgs(txt(d.codigoEntidadDgs, 10)))
    const { motivo: financiada } = polizaFinanciada(contacto)
    const urgente = vencimientoUrgente(vence, hoy.toISOString().slice(0, 10))
    const avisoFinanciada = financiada ? ` · Póliza de concesionario/financiada (${financiada}): mira si está atada a la financiación antes de proponer el cambio.` : ''
    const datos = {
      ramo: ramoOportunidad(r.ramo),
      estado: 'competencia',
      fechaFinVigencia: vence,
      aseguradora,
      prima,
      numeroPoliza: txt(d.numeroPoliza, 60),
      matricula: txt(d.matricula, 20),
      vehiculo,
      seguroAnterior: r.fase === 'auto'
        ? seguroAnteriorDe({ codigoDgs: d.codigoEntidadDgs, fechaEfecto: d.fechaEfecto, aniosSinSiniestros: d.aniosSinSiniestros, siniestrosUltimos5: d.siniestrosUltimos5 })
        : null,
      tipoTarea: 'llamada',
      // Vence en ≤15 días: la llamada es URGENTE (la prioridad más alta de `gestion_prioridad`).
      prioridadTarea: urgente ? 'alta' : 'media',
      fechaTarea: llamada,
      financiada,
      nota: (vence
        ? `${urgente ? 'URGENTE — ' : ''}Llamar para su renovación: vence el ${fmt(vence)} (documento subido: ${e.origen})${sinVerificar}`
        : `Pedir la fecha de vencimiento: el documento subido (${e.origen}) no la trae legible${sinVerificar}`) + avisoFinanciada,
    }
    const o = await crearOportunidad(e.correduriaId, clienteId, datos, e.actor, hoy, `documento:${e.origen}`)
    if (o.ok) return { estado: 'creada', oportunidadId: o.id, clienteId, clienteNuevo, relacionado, vence, llamada, completada: false, ficha: volcado, financiada }
    if (o.estado === 'duplicada' && 'id' in o) return { estado: 'actualizada', oportunidadId: o.id, clienteId, clienteNuevo, relacionado, vence, llamada, completada: o.completada, ficha: volcado, financiada }
    return { estado: 'error', motivo: o.motivo }
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo abrir la oportunidad:', err instanceof Error ? err.message : err)
    return { estado: 'error', motivo: err instanceof Error ? err.message : String(err) }
  }
}

/** El lead SIN DNI que se llama exactamente igual (el más antiguo), o null. Solo leads: una ficha
 * de cliente o con DNI no se toma por nombre. */
async function leadMismoNombre(correduriaId: string, nombreCompleto: string): Promise<string | null> {
  const primera = nombreCompleto.trim().split(/\s+/)[0]
  if (!primera) return null
  const candidatos = await prismaAsegura().cliente.findMany({
    where: {
      correduriaId,
      mergedIntoClienteId: null,
      tipo: 'lead',
      OR: [{ dni: null }, { dni: '' }],
      AND: [{ OR: [{ nombre: { contains: primera, mode: 'insensitive' } }, { apellidos: { contains: primera, mode: 'insensitive' } }] }],
    },
    select: { id: true, nombre: true, apellidos: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  }).catch(() => [])
  return candidatos.find((c) => mismoNombre(`${c.nombre ?? ''} ${c.apellidos ?? ''}`, nombreCompleto, { exacto: true }))?.id ?? null
}

/**
 * Guarda con el documento lo leído por la IA (`documentos.extraccion`, 03/10/2026) SIN datos
 * personales: DNI, teléfono, email, fechas de nacimiento/carné y domicilio no se guardan en claro en
 * un campo SQL (en `clientes` van cifrados); de esos solo consta si se leyeron (`leidos`).
 * Best-effort: si falla (p. ej. la migración aún sin aplicar), el documento y la oportunidad siguen.
 */
export async function guardarExtraccion(correduriaId: string, documentoId: string, bruto: Record<string, unknown> | null): Promise<void> {
  const limpio = extraccionSinPii(bruto)
  if (!limpio) return
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      update documentos set extraccion = ${JSON.stringify(limpio)}::jsonb
      where id = ${documentoId}::uuid and correduria_id = ${correduriaId}::uuid`)
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo guardar la extracción del documento:', err instanceof Error ? err.message : err)
  }
}

/** El nombre de la compañía por su código DGS (C0058 → Mapfre), o null. */
async function nombrePorDgs(codigo: string | null): Promise<string | null> {
  const c = codigo?.toUpperCase().replace(/\s/g, '') ?? ''
  if (!/^C\d{4}$/.test(c)) return null
  const f = await prismaAsegura().companiaDgs.findUnique({ where: { codigoDgs: c }, select: { nombreComun: true } }).catch(() => null)
  return f?.nombreComun?.trim() || null
}

/** Ids de las fichas con el teléfono o el email de la póliza. `[]` si no trae o no se pudo buscar. */
async function fichasPorContacto(correduriaId: string, contacto: ContactoTomadorLeido): Promise<string[]> {
  if (!contacto.telefono && !contacto.email) return []
  const cs = await coincidencias(correduriaId, { telefono: contacto.telefono, email: contacto.email }).catch(() => null)
  return cs ? posiblesDuplicadosPorContacto(cs) : []
}

/**
 * En un lead RECIÉN abierto: «posible duplicado de <id>» por cada ficha que se llama exactamente
 * igual, y las que comparten su teléfono/email. NO se funde nada (duplicar se ve; mezclar a dos
 * personas, no): la fusión es por SQL con lote y guarda de identidad.
 */
async function notaPosiblesDuplicados(correduriaId: string, clienteId: string, nombre: string | null, compartenContacto: string[], actor: string): Promise<void> {
  try {
    const mismos = nombre ? (await fichasMismoNombre(correduriaId, nombre)).filter((id) => id !== clienteId) : []
    const contacto = compartenContacto.filter((id) => id !== clienteId && !mismos.includes(id))
    const partes = [
      mismos.length > 0 ? `Posible duplicado de ${mismos.join(', ')} (mismo nombre; sin DNI común que lo confirme): no se ha fundido.` : null,
      contacto.length > 0 ? `Posible duplicado de ${contacto.join(', ')} (comparte teléfono o email; puede ser otra persona de la casa): no se ha fundido ni se le ha escrito el DNI.` : null,
    ].filter(Boolean)
    if (partes.length === 0) return
    await anotarHistorialCliente(correduriaId, clienteId, 'gestion', `${partes.join(' ')} — por ${actor}`)
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo anotar el posible duplicado:', err instanceof Error ? err.message : err)
  }
}

/** Fichas vivas (no lápidas) que se llaman EXACTAMENTE igual, sin orden. Hasta 5. */
async function fichasMismoNombre(correduriaId: string, nombreCompleto: string): Promise<string[]> {
  const primera = nombreCompleto.trim().split(/\s+/)[0]
  if (!primera) return []
  const candidatos = await prismaAsegura().cliente.findMany({
    where: {
      correduriaId,
      mergedIntoClienteId: null,
      OR: [{ nombre: { contains: primera, mode: 'insensitive' } }, { apellidos: { contains: primera, mode: 'insensitive' } }],
    },
    select: { id: true, nombre: true, apellidos: true },
    orderBy: { createdAt: 'asc' },
    take: 300,
  }).catch(() => [])
  return candidatos.filter((c) => mismoNombre(`${c.nombre ?? ''} ${c.apellidos ?? ''}`, nombreCompleto, { exacto: true })).map((c) => c.id).slice(0, 5)
}
