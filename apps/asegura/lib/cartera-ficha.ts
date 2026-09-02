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
  etiquetaFormaPago,
  importeEiac,
  objetoAsegurado,
  primaReferencia,
  recargoFraccionamiento,
  resumirRecibos,
  type IntervinienteFicha,
  type ObjetoAsegurado,
  type RecargoFraccionamiento,
  type RecibosPoliza,
} from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { retarificabilidad, type DocumentoResumen, type Retarificabilidad } from '@central/module-seguros'
import { listarDocumentos } from './cartera-documentos'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import type { ClienteCartera, PolizaCartera } from './codeoscopic/desde-cartera.ts'
import { elegirRiesgo, hogarDeDatos, type HogarCartera } from './codeoscopic/desde-cartera-hogar.ts'

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
  /** Por qué ramo se puede (o por qué no). Misma frase en todas las pantallas. */
  retarificacion: Retarificabilidad
  /** Lo que se sabe de los recibos de ESTA póliza. Ver `RecibosPoliza`. */
  recibos: RecibosPoliza
  /**
   * Forma de pago (Alberto, 02/09/2026): el contrato es ANUAL y solo se anula
   * al vencimiento; fraccionar es que la compañía financia y cobra por ello.
   * `fraccionamiento` lo trae CIMA (108 de 109 vivas); el recargo NO — se
   * deriva de los recibos del ciclo y por eso tiene tres estados.
   */
  pago: {
    fraccionamiento: string | null
    /** Forma de cobro del último recibo (domiciliado / oficina / tarjeta). */
    formaCobro: string | null
    recargo: RecargoFraccionamiento
  }
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
  /**
   * Quién más hay en sus pólizas (propietario, conductor habitual, persona de
   * contacto…). Es lo que convierte «sin teléfono» en un teléfono cuando el
   * tomador es una empresa: el de Esquiansa lo tiene su conductor habitual.
   *
   * `null` = no se ha podido consultar (la tabla falló). NO es «no hay nadie».
   */
  intervinientes: IntervinienteFicha[] | null
  /**
   * Los documentos del cliente (propios y de sus pólizas/siniestros), con su
   * estado pedido/recibido/revisado. `null` = no se ha podido consultar.
   */
  documentos: DocumentoResumen[] | null
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
  const [recibos, siniestros, intervinientes] = await Promise.all([
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
    leerIntervinientes(db, correduriaId, clienteId, idsPolizas),
  ])

  // 🧬 La copia GEMELA del volcado: 16 de las 109 vivas existen dos veces y en
  // 10 la copia de junio trae la dirección del riesgo (localidad/CP/m²/año)
  // que CIMA no manda. Se lee de una vez para todas las pólizas de CIMA sin
  // objeto. Si la consulta falla, no pasa nada: el objeto queda «sin informar»,
  // que es lo que ya decía — nunca se inventa.
  const numerosCima = c.polizas.filter((p) => p.importRef === null && p.numeroPoliza).map((p) => p.numeroPoliza as string)
  const gemelas = numerosCima.length === 0
    ? new Map<string, unknown>()
    : await db.poliza
        .findMany({
          where: { correduriaId, mergedIntoPolizaId: null, importRef: { not: null }, numeroPoliza: { in: numerosCima } },
          select: { numeroPoliza: true, datosEspecificos: true },
        })
        .then((filas) => new Map(filas.map((f) => [f.numeroPoliza as string, f.datosEspecificos])))
        .catch(() => new Map<string, unknown>())

  const recibosPorPoliza = new Map<string, typeof recibos>()
  for (const r of recibos) {
    const lista = recibosPorPoliza.get(r.polizaId) ?? []
    lista.push(r)
    recibosPorPoliza.set(r.polizaId, lista)
  }

  // Todos los suyos: los del cliente y los colgados de sus pólizas/siniestros.
  const documentos = await listarDocumentos(correduriaId, { clienteId: c.id })

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
    intervinientes,
    documentos,
    polizas: c.polizas.map((p) => {
      const datos = esObjetoPlano(p.datosEspecificos) ? p.datosEspecificos : null
      const datosGemela = p.importRef === null && p.numeroPoliza ? gemelas.get(p.numeroPoliza) : undefined
      const retarificacion = retarificabilidad({
        tipo: String(p.tipo),
        estado: String(p.estado),
        datos,
        datosGemela: esObjetoPlano(datosGemela) ? datosGemela : null,
      })
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
        objeto: objetoConGemela(String(p.tipo), datos, p.importRef === null && p.numeroPoliza ? gemelas.get(p.numeroPoliza) : undefined),
        matricula,
        viva: p.importRef === null,
        retarificable: retarificacion.retarificable,
        retarificacion,
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
        pago: {
          fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento),
          formaCobro: etiquetaFormaPago(recibosPorPoliza.get(p.id)?.[0]?.formaPago ?? null),
          recargo: recargoFraccionamiento({
            fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento),
            primaAnual: p.primaAnual === null ? null : Number(p.primaAnual),
            vencimiento: fechaIso(p.fechaVencimiento),
            recibos: (recibosPorPoliza.get(p.id) ?? []).map((r) => ({
              importe: importeEiac(r.primaTotal),
              fechaEmision: fechaIso(r.fechaEmision),
              situacion: r.situacion === null ? null : String(r.situacion),
            })),
          }),
        },
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

/**
 * El objeto de la póliza; si CIMA no lo informa y la gemela del volcado sí,
 * el de la gemela con una nota que dice de dónde sale. «Cifrado» manda sobre
 * «no informado» (la dirección existe, solo que no se puede leer aquí).
 */
function objetoConGemela(tipo: string, datos: Record<string, unknown> | null, datosGemela: unknown): ObjetoAsegurado {
  const propio = objetoAsegurado({ tipo, datos, coberturas: null })
  if (propio.estado !== 'no_informado' || datosGemela === undefined) return propio
  const dg = esObjetoPlano(datosGemela) ? datosGemela : null
  if (dg === null) return propio
  const dir = dg.direccion
  const conDir = typeof dir === 'string' && dir.startsWith('v1:') ? { ...dg, direccion: descifrar(dir) ?? dir } : dg
  const deGemela = objetoAsegurado({ tipo, datos: conDir, coberturas: null })
  if (deGemela.estado === 'no_informado') return propio
  return { ...deGemela, nota: `${deGemela.nota ? deGemela.nota + ' ' : ''}(Sale de la copia de esta póliza en el volcado de junio: CIMA no manda la dirección del riesgo.)` }
}

/** Los estados que significan «esto sigue vivo» (mismo criterio que el resumen). */
const ESTADOS_SINIESTRO_ABIERTO = new Set(['abierto', 'en_tramitacion'])

/**
 * Los intervinientes de las pólizas del cliente, ya descifrados.
 *
 * Nombre, teléfono y email del interviniente van cifrados (95 de 95 en las
 * pólizas vivas). Cuando CIMA lo enlaza a su PROPIA ficha (`clienteId`), esa
 * ficha tiene el nombre en claro y a menudo el teléfono que el interviniente
 * no trae: se lee de allí lo que falte. Así «Juan Manuel, conductor habitual»
 * sale con nombre y teléfono aunque su fila de interviniente solo traiga el NIF.
 *
 * `null` = la consulta falló. Devolver `[]` diría «no hay nadie más a quien
 * llamar», que es justo lo que no se sabe.
 */
async function leerIntervinientes(
  db: ReturnType<typeof prismaAsegura>,
  correduriaId: string,
  tomadorId: string,
  idsPolizas: string[],
): Promise<IntervinienteFicha[] | null> {
  if (idsPolizas.length === 0) return []
  try {
    const filas = await db.polizaInterviniente.findMany({
      where: { correduriaId, polizaId: { in: idsPolizas } },
      select: {
        polizaId: true, rol: true, clienteId: true, origen: true,
        nombre: true, apellidos: true, telefono: true, email: true,
        cliente: { select: { nombre: true, apellidos: true, telefono: true, email: true } },
      },
    })
    return filas.map((f) => {
      const propio = [descifrar(f.nombre), descifrar(f.apellidos)].filter(Boolean).join(' ').trim() || null
      const deFicha = f.cliente ? `${f.cliente.nombre} ${f.cliente.apellidos}`.trim() || null : null
      const telefono = descifrar(f.telefono) ?? descifrar(f.cliente?.telefono)
      const email = descifrar(f.email) ?? descifrar(f.cliente?.email)
      return {
        polizaId: f.polizaId,
        rol: String(f.rol),
        nombre: propio ?? deFicha,
        nombreIlegible: propio === null && deFicha === null && (ilegible(f.nombre) || ilegible(f.apellidos)),
        telefono,
        email,
        telefonoIlegible: telefono === null && (ilegible(f.telefono) || ilegible(f.cliente?.telefono)),
        emailIlegible: email === null && (ilegible(f.email) || ilegible(f.cliente?.email)),
        fichaId: f.clienteId ?? null,
        esTomador: f.clienteId === tomadorId,
        origen: String(f.origen),
      }
    })
  } catch {
    return null
  }
}

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
  tipo: string
  estado: string
  /**
   * El riesgo de HOGAR (m², año, CP, capitales, calle descifrada), de la póliza
   * o de su copia gemela del volcado. `null` = no hay riesgo legible en ninguna
   * de las dos — que NO es «no tiene casa». Solo se rellena en pólizas de hogar.
   */
  hogar: HogarCartera | null
  retarificacion: Retarificabilidad
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
      estado: true,
      importRef: true,
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

  // 🧬 La copia GEMELA (mismo número en la otra cara): CIMA no manda el objeto
  // de hogar, el volcado sí. Si la consulta falla queda `null` — «no se ha
  // podido mirar», y la pantalla lo dirá; nunca se inventa un riesgo.
  const gemelaDatos: unknown = p.numeroPoliza
    ? await db.poliza
        .findFirst({
          where: {
            correduriaId, mergedIntoPolizaId: null, numeroPoliza: p.numeroPoliza, id: { not: p.id },
            importRef: p.importRef === null ? { not: null } : null,
          },
          select: { datosEspecificos: true },
        })
        .then((g) => g?.datosEspecificos ?? null)
        .catch(() => null)
    : null
  const datosGemela = esObjetoPlano(gemelaDatos) ? gemelaDatos : null
  const esHogar = String(p.tipo) === 'hogar'
  const hogar = esHogar
    ? elegirRiesgo(
        hogarDeDatos(datos, 'poliza', descifrar(texto(datos?.direccion))),
        hogarDeDatos(datosGemela, 'gemela', descifrar(texto(datosGemela?.direccion))),
      )
    : null
  const retarificacion = retarificabilidad({ tipo: String(p.tipo), estado: String(p.estado), datos, datosGemela })

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
    tipo: String(p.tipo),
    estado: String(p.estado),
    hogar,
    retarificacion,
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
