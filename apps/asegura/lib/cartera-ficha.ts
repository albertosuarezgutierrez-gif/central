// Lecturas de la cartera para la pantalla de retarificación: buscar un cliente
// y sacar de UNA póliza lo que hace falta para pedir precio de calle.
//
// Vive aparte de `lib/cartera.ts` (que es la lista de vencimientos) porque lo
// que se lee aquí es distinto y más sensible: para cotizar hacen falta DNI,
// fecha de nacimiento y teléfono, que van CIFRADOS en la base. Concentrarlo en
// un fichero deja en un solo sitio la regla de qué se descifra y para qué.
//
// ─── Reglas heredadas de `lib/cartera.ts`, que aquí también valen ───────────
// - `correduriaId` SIEMPRE explícito en el WHERE (la conexión tiene BYPASSRLS:
//   sin filtro no falla nada, simplemente salen los datos de otro).
// - Las filas fusionadas (`merged_into_*`) son lápidas y se excluyen siempre.
// - Un fallo de descifrado NO se convierte en «ese cliente no tiene DNI»: se
//   devuelve `null` y quien pinta lo llama «no disponible», que es distinto.

import {
  objetoAsegurado,
  primaReferencia,
  resumirRecibos,
  type ObjetoAsegurado,
  type RecibosPoliza,
} from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import type { ClienteCartera, PolizaCartera } from './codeoscopic/desde-cartera.ts'

/** Un resultado de búsqueda: lo justo para elegir a quién abrir. */
export type ClienteEncontrado = {
  id: string
  nombre: string
  /** `cliente` = entra por CIMA · `lead` = ficha histórica sin póliza viva. */
  tipo: string
  polizas: number
}

/**
 * Descifra sin convertir un fallo en una ausencia silenciosa.
 *
 * Los valores cifrados llevan el prefijo `v1:`. Si no lo llevan, es que están
 * en claro (así llegaron algunos del volcado) y se devuelven tal cual. Si lo
 * llevan y la clave no abre, `null` — que la pantalla dirá como «no se ha
 * podido descifrar», nunca como «no lo tiene».
 */
function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}

/** `datos_especificos` es JSON libre: puede llegar como array, número o null. */
function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function fechaIso(d: Date | null | undefined): string | null {
  return d instanceof Date ? d.toISOString().slice(0, 10) : null
}

/**
 * Busca clientes por nombre o apellidos. Nombre y apellidos van EN CLARO en la
 * base, así que esta búsqueda no depende del índice ciego — que es justo lo que
 * la hace fiable: si fallara la clave de lookup, buscar por DNI devolvería
 * «no existe» sobre un cliente que sí está (ver `apps/asegura/CLAUDE.md`).
 */
export async function buscarClientes(
  correduriaId: string,
  termino: string,
  limite = 20,
): Promise<ClienteEncontrado[]> {
  const q = termino.trim()
  if (!aseguraConfigurada() || q.length < 3) return []
  const db = prismaAsegura()

  const palabras = q.split(/\s+/).slice(0, 4)
  const filas = await db.cliente.findMany({
    where: {
      correduriaId,
      mergedIntoClienteId: null,
      // Cada palabra tiene que aparecer en el nombre O en los apellidos: así
      // «jose suarez» encuentra a José Suárez sin depender del orden.
      AND: palabras.map((p) => ({
        OR: [
          { nombre: { contains: p, mode: 'insensitive' as const } },
          { apellidos: { contains: p, mode: 'insensitive' as const } },
        ],
      })),
    },
    select: {
      id: true,
      nombre: true,
      apellidos: true,
      tipo: true,
      _count: { select: { polizas: true } },
    },
    orderBy: [{ apellidos: 'asc' }, { nombre: 'asc' }],
    take: limite,
  })

  return filas.map((f) => ({
    id: f.id,
    nombre: `${f.nombre} ${f.apellidos}`.trim(),
    tipo: String(f.tipo),
    polizas: f._count.polizas,
  }))
}

/** Una póliza tal y como se pinta en la ficha del cliente. */
export type PolizaFicha = {
  id: string
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  estado: string
  fechaInicio: string | null
  fechaVencimiento: string | null
  /** `null` = la compañía no informó la prima. NUNCA 0. */
  prima: number | null
  fraccionamiento: string | null
  /** Qué asegura, con su propio estado (conocido / no informado / cifrado / sin objeto). */
  objeto: ObjetoAsegurado
  matricula: string | null
  /** `true` cuando entra por CIMA (`import_ref` a null) = cartera viva. */
  viva: boolean
  /** Solo las de auto con matrícula se pueden retarificar hoy. */
  retarificable: boolean
  /** Lo que se sabe de los recibos de ESTA póliza. Ver `RecibosPoliza`. */
  recibos: RecibosPoliza
}

export type SiniestroFicha = {
  id: string
  polizaId: string
  estado: string
  tipo: string | null
  referencia: string | null
  fecha: string | null
  /** Reserva e indemnización: `null` = la compañía no las informa (0% hoy). */
  reserva: number | null
  indemnizacion: number | null
  /** Quién lo lleva en la compañía. Sin esto la llamada empieza a ciegas. */
  tramitador: string | null
  abierto: boolean
}

/** Lo que hace falta para LLAMAR al cliente. El DNI y el IBAN no salen de aquí. */
export type ContactoFicha = {
  telefono: string | null
  email: string | null
  /** `true` cuando el valor venía cifrado y la clave no lo abrió. Eso NO es
   *  «no tiene teléfono»: es que aquí no se puede leer, y se dice. */
  telefonoIlegible: boolean
  emailIlegible: boolean
  ciudad: string | null
  provincia: string | null
  codigoPostal: string | null
}

export type FichaCliente = {
  id: string
  nombre: string
  tipo: string
  segmento: string | null
  contacto: ContactoFicha
  polizas: PolizaFicha[]
  siniestros: SiniestroFicha[]
}

/**
 * La ficha entera de un cliente en UNA consulta: quién es, cómo se le llama,
 * qué tiene contratado, cómo va de recibos y qué siniestros arrastra.
 *
 * Es el corazón del «pincho en el nombre y lo tengo todo». Por eso trae de
 * golpe lo que antes obligaba a tres pantallas — pero cada bloque conserva su
 * propio «no se sabe»: un cliente sin recibos y uno cuyos recibos no han
 * llegado se pintan distinto, porque son cosas distintas.
 */
export async function fichaCliente(
  correduriaId: string,
  clienteId: string,
): Promise<FichaCliente | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  const c = await db.cliente.findFirst({
    where: { id: clienteId, correduriaId, mergedIntoClienteId: null },
    select: {
      id: true,
      nombre: true,
      apellidos: true,
      tipo: true,
      segmento: true,
      telefono: true,
      email: true,
      ciudad: true,
      provincia: true,
      codigoPostal: true,
      polizas: {
        where: { mergedIntoPolizaId: null },
        select: {
          id: true,
          tipo: true,
          aseguradora: true,
          numeroPoliza: true,
          estado: true,
          fechaInicio: true,
          fechaVencimiento: true,
          primaAnual: true,
          primaBruta: true,
          fraccionamiento: true,
          datosEspecificos: true,
          importRef: true,
        },
        orderBy: { fechaVencimiento: 'desc' },
      },
    },
  })
  if (!c) return null

  const idsPolizas = c.polizas.map((p) => p.id)
  // Recibos y siniestros de TODAS sus pólizas de una vez. Sin esto la ficha
  // haría una consulta por póliza y con 8 pólizas ya se nota.
  const [recibos, siniestros] = await Promise.all([
    idsPolizas.length === 0
      ? Promise.resolve([])
      : db.polizaRecibo.findMany({
          where: { correduriaId, polizaId: { in: idsPolizas } },
          select: {
            id: true,
            polizaId: true,
            situacion: true,
            primaTotal: true,
            fechaEmision: true,
            fechaVencimiento: true,
            formaPago: true,
          },
          orderBy: { fechaEmision: 'desc' },
        }),
    db.siniestro.findMany({
      where: { correduriaId, clienteId },
      select: {
        id: true,
        polizaId: true,
        estado: true,
        tipo: true,
        referencia: true,
        fechaHora: true,
        reservaImporte: true,
        indemnizacionImporte: true,
        tramitadorNombre: true,
      },
      orderBy: { fechaHora: 'desc' },
    }),
  ])

  const recibosPorPoliza = new Map<string, typeof recibos>()
  for (const r of recibos) {
    const lista = recibosPorPoliza.get(r.polizaId) ?? []
    lista.push(r)
    recibosPorPoliza.set(r.polizaId, lista)
  }

  return {
    id: c.id,
    nombre: `${c.nombre} ${c.apellidos}`.trim(),
    tipo: String(c.tipo),
    segmento: c.segmento === null ? null : String(c.segmento),
    contacto: {
      telefono: descifrar(c.telefono),
      email: descifrar(c.email),
      telefonoIlegible: ilegible(c.telefono),
      emailIlegible: ilegible(c.email),
      ciudad: c.ciudad ?? null,
      provincia: c.provincia ?? null,
      codigoPostal: c.codigoPostal ?? null,
    },
    polizas: c.polizas.map((p) => {
      const datos = esObjetoPlano(p.datosEspecificos) ? p.datosEspecificos : null
      const matricula = datos ? texto(datos.matricula) : null
      return {
        id: p.id,
        tipo: String(p.tipo),
        aseguradora: p.aseguradora,
        numeroPoliza: p.numeroPoliza ?? null,
        estado: String(p.estado),
        fechaInicio: fechaIso(p.fechaInicio),
        fechaVencimiento: fechaIso(p.fechaVencimiento),
        prima: primaReferencia({
          primaAnual: p.primaAnual === null ? null : Number(p.primaAnual),
          primaBruta: p.primaBruta === null ? null : Number(p.primaBruta),
        }),
        fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento),
        objeto: objetoAsegurado({ tipo: String(p.tipo), datos, coberturas: null }),
        matricula,
        viva: p.importRef === null,
        retarificable: String(p.tipo) === 'auto' && matricula !== null,
        recibos: resumirRecibos(
          (recibosPorPoliza.get(p.id) ?? []).map((r) => ({
            id: r.id,
            situacion: r.situacion === null ? null : String(r.situacion),
            primaTotal: r.primaTotal,
            fechaEmision: fechaIso(r.fechaEmision),
            fechaVencimiento: fechaIso(r.fechaVencimiento),
            formaPago: r.formaPago,
          })),
        ),
      }
    }),
    siniestros: siniestros.map((s) => ({
      id: s.id,
      polizaId: s.polizaId,
      estado: String(s.estado),
      tipo: s.tipo ?? null,
      referencia: s.referencia ?? null,
      fecha: fechaIso(s.fechaHora),
      // Decimal de Prisma: `null` se queda en null, jamás en 0 (hoy están al 0%
      // de cobertura, así que TODOS caen aquí y la pantalla lo dice).
      reserva: s.reservaImporte === null ? null : Number(s.reservaImporte),
      indemnizacion: s.indemnizacionImporte === null ? null : Number(s.indemnizacionImporte),
      tramitador: s.tramitadorNombre ?? null,
      abierto: ESTADOS_SINIESTRO_ABIERTO.has(String(s.estado)),
    })),
  }
}

/** Los estados que significan «esto sigue vivo» (mismo criterio que el resumen). */
const ESTADOS_SINIESTRO_ABIERTO = new Set(['abierto', 'en_tramitacion'])

/** `true` si el valor venía cifrado y NO se ha podido abrir. Distinto de vacío. */
function ilegible(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith('v1:') && descifrar(v) === null
}

/**
 * Todo lo que necesita `precalificarAuto` de una póliza concreta: el tomador
 * (descifrado), la póliza y cuántos siniestros tiene ANOTADOS.
 *
 * 🚨 Ese recuento es «anotados», no «ocurridos». Se devuelve tal cual y es el
 * mapeador quien decide qué hacer con el cero — aquí no se interpreta.
 */
export type OrigenRetarificacion = {
  cliente: ClienteCartera
  poliza: PolizaCartera
  /** Para pintar de qué póliza se habla. */
  etiqueta: string
}

export async function origenRetarificacion(
  correduriaId: string,
  polizaId: string,
): Promise<OrigenRetarificacion | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()

  const p = await db.poliza.findFirst({
    where: { id: polizaId, correduriaId, mergedIntoPolizaId: null },
    select: {
      id: true,
      tipo: true,
      aseguradora: true,
      numeroPoliza: true,
      codigoEntidadDgs: true,
      fechaInicio: true,
      fechaEfectoInicial: true,
      fechaVencimiento: true,
      datosEspecificos: true,
      cliente: {
        select: {
          id: true,
          nombre: true,
          apellidos: true,
          dni: true,
          telefono: true,
          fechaNacimiento: true,
          estadoCivil: true,
          saludo: true,
          codigoPostal: true,
        },
      },
    },
  })
  if (!p) return null

  // La fecha del carnet vive en el CONDUCTOR HABITUAL de la póliza, cifrada.
  // Medido el 01/09/2026: de 500 intervinientes solo los 21 `conductor_habitual`
  // la traen, así que en la mayoría de pólizas seguirá faltando — y faltar es
  // exactamente lo que la pantalla debe decir, en vez de inventarse una.
  const [siniestros, conductor] = await Promise.all([
    db.siniestro.count({ where: { correduriaId, polizaId: p.id } }),
    db.polizaInterviniente.findFirst({
      where: { polizaId: p.id, correduriaId, rol: 'conductor_habitual' },
      select: { fechaCarnet: true },
    }),
  ])

  const datos = esObjetoPlano(p.datosEspecificos) ? p.datosEspecificos : null

  const cliente: ClienteCartera = {
    nombre: p.cliente.nombre,
    apellidos: p.cliente.apellidos,
    dni: descifrar(p.cliente.dni),
    telefono: descifrar(p.cliente.telefono),
    fechaNacimiento: normalizarFecha(descifrar(p.cliente.fechaNacimiento)),
    estadoCivil: p.cliente.estadoCivil ?? null,
    saludo: p.cliente.saludo ?? null,
    codigoPostal: p.cliente.codigoPostal ?? null,
    fechaCarnet: normalizarFecha(descifrar(conductor?.fechaCarnet)),
  }

  const poliza: PolizaCartera = {
    numeroPoliza: p.numeroPoliza ?? null,
    codigoEntidadDgs: p.codigoEntidadDgs ?? null,
    matricula: datos ? texto(datos.matricula) : null,
    // La relación con la compañía empieza en el efecto inicial; si no consta,
    // vale el inicio de esta póliza. Si tampoco, `null` = no se sabe.
    fechaEfectoInicial: fechaIso(p.fechaEfectoInicial) ?? fechaIso(p.fechaInicio),
    fechaVencimiento: fechaIso(p.fechaVencimiento),
    siniestrosRegistrados: siniestros,
  }

  return {
    cliente,
    poliza,
    etiqueta: `${p.aseguradora}${p.numeroPoliza ? ` · ${p.numeroPoliza}` : ''}`,
  }
}

/**
 * La fecha de nacimiento se guardó como texto cifrado y no siempre en ISO
 * (fue `date` antes). Se aceptan `aaaa-mm-dd` y `dd/mm/aaaa`; cualquier otra
 * cosa es `null` — no se adivina el orden de un `01/02/03`.
 */
export function normalizarFecha(v: string | null): string | null {
  if (v === null) return null
  const t = v.trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const es = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (es) return `${es[3]}-${es[2]}-${es[1]}`
  return null
}
