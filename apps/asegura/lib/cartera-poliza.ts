// La ficha de UNA póliza: lo que la fila de la ficha del cliente no cabe.
// Coberturas, todos los recibos, siniestros, intervinientes, documentos y la
// COPIA GEMELA del volcado, que a veces sabe lo que CIMA no manda.
//
// ─── La copia gemela (medido 02/09/2026) ────────────────────────────────────
// 16 de las 109 pólizas vivas existen DOS veces: la copia de CIMA (`import_ref`
// NULL) trae el vencimiento y los recibos; la del volcado de junio
// (`asegura_app:`) trae la dirección del riesgo, los m² y el año — que CIMA no
// manda. En 10 cada copia tiene la mitad del dato. Aquí se leen las dos y se
// dice de dónde sale cada cosa; NO se fusiona nada (rol SELECT-only).
//
// Mismas reglas que `cartera-ficha.ts`: `correduriaId` siempre en el WHERE,
// las fusionadas fuera, y un fallo de descifrado es «cifrado», no «no tiene».

import {
  etiquetaFormaPago,
  importeEiac,
  objetoAsegurado,
  primaReferencia,
  recargoFraccionamiento,
  evolucionPrima,
  type EvolucionPrima,
  resumirRecibos,
  type IntervinienteFicha,
  type ObjetoAsegurado,
  type RecargoFraccionamiento,
  type ReciboResumen,
  type RecibosPoliza, extraerDetalleCobertura, type DetalleCobertura } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { retarificabilidad, type DocumentoResumen, type Retarificabilidad } from '@central/module-seguros'
import { esCarteraViva, WHERE_CARTERA_VIVA, WHERE_VOLCADO_HISTORICO } from '@central/module-seguros'
import { capitalesHogar, eurDeCapital, type CapitalAsegurado } from '@central/module-seguros'
import { contarDocumentosPoliza, listarDocumentos } from './cartera-documentos'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { casosDeRamo, type EjecutorLectura } from './codeoscopic/casos'
import { estimar, mereceLaPena, type RiesgoAEstimar } from './codeoscopic/horquilla'
import { elegirRiesgo, hogarDeDatos } from './codeoscopic/desde-cartera-hogar'
import type { SiniestroFicha } from './cartera-ficha'
import { SELECT_SINIESTRO, mapSiniestro } from './cartera-siniestros'

export type CoberturaFicha = {
  orden: number | null
  codigo: string | null
  descripcion: string | null
  /** Texto tal cual del EIAC («30000», «ILIMITADO», «VALOR VENAL»…): NO se numera. */
  capital: string | null
  descripcionCapital: string | null
  franquicia: string | null
  desde: string | null
  hasta: string | null
  /** Código EIAC de modalidad de valoración (VP/VT/VE…), tal cual: no hay tabla oficial en el repo. */
  modalidad: string | null
  /** Límites, franquicias y prima de la propia cobertura, leídos de `datos_extra` (null si no trae nada). */
  detalle: DetalleCobertura | null
}

/**
 * La estimación PROPIA de prima, aplanada para la pantalla.
 *
 * Es `Estimacion` (de `codeoscopic/horquilla.ts`) más el veredicto de
 * `mereceLaPena` y de dónde salieron los casos. 🚨 NO es un precio y el tipo
 * está hecho para que no pueda confundirse: `orientativa` es un literal `true`
 * y `etiqueta` viene siempre. Enseñar esto como si fuera la oferta de una
 * compañía es la forma más cara de perder un cliente.
 */
export type EstimacionFicha = {
  horquilla: { minEur: number; medianaEur: number; maxEur: number } | null
  /** Por qué NO hay horquilla, cuando no la hay. Nunca se calla. */
  sinBase: string | null
  casos: number
  desde: string | null
  hasta: string | null
  antiguedadMedianaMeses: number | null
  base: 'parecidos' | 'toda-la-cartera' | null
  etiqueta: string
  orientativa: true
  /** ¿Merece la pena gastar los 0,50€ de una cotización real? `no-se` es una respuesta. */
  veredicto: 'merece' | 'no-merece' | 'no-se'
  porque: string
  /**
   * Con qué se ha construido. `cotizacionesDisponibles: false` significa que la
   * tabla de cotizaciones no se ha podido leer — que NO es lo mismo que
   * `cotizaciones: 0`, que es «se ha mirado y no hay ninguna».
   */
  fuente: { cartera: number; cotizaciones: number; cotizacionesDisponibles: boolean }
}

export type FichaPoliza = {
  id: string
  cliente: { id: string; nombre: string }
  tipo: string
  aseguradora: string
  codigoEntidadDgs: string | null
  numeroPoliza: string | null
  idPolizaEntidad: string | null
  ramoDgs: string | null
  estado: string
  situacion: string | null
  origen: string
  viva: boolean
  fechaEfectoInicial: string | null
  fechaInicio: string | null
  fechaVencimiento: string | null
  prima: number | null
  primaAnual: number | null
  primaBruta: number | null
  primaMensual: number | null
  objeto: ObjetoAsegurado
  /**
   * La copia del volcado con el mismo número de póliza, si existe. `null` =
   * no hay gemela (se miró). Trae el objeto que CIMA no manda (dirección del
   * riesgo, m², año) y de qué ficha cuelga.
   */
  gemela: { polizaId: string; clienteId: string; importRef: string; objeto: ObjetoAsegurado; fechaVencimiento: string | null } | null
  coberturas: CoberturaFicha[]
  recibos: RecibosPoliza
  /** Todos, del más reciente al más antiguo. */
  listaRecibos: ReciboResumen[]
  siniestros: SiniestroFicha[]
  intervinientes: IntervinienteFicha[] | null
  /** `null` = no se pudo contar. `0` = la tabla existe y no hay ninguno (hoy: 0 en TODA la base). */
  documentos: number | null
  /** La lista (con estado pedido/recibido/revisado). `null` = no se pudo consultar. */
  listaDocumentos: DocumentoResumen[] | null
  pago: { fraccionamiento: string | null; formaCobro: string | null; recargo: RecargoFraccionamiento }
  /**
   * «Por qué ha subido»: prima por anualidad (aniversario a aniversario, recibos CA/NP)
   * y veredicto con siniestros del ciclo anterior. `sin_datos` cuando CIMA no manda la
   * anualidad anterior o el ciclo está incompleto — NUNCA se pinta como «no ha subido».
   */
  evolucionPrima: EvolucionPrima
  /** `retarificacion.retarificable`, mantenido por compatibilidad con quien ya lo lee. */
  retarificable: boolean
  /** Por qué ramo se puede pedir precio (auto/hogar), o por qué no, mirando también la gemela. */
  retarificacion: Retarificabilidad
  /**
   * Qué se puede esperar que cueste esto hoy, con los casos que ya conocemos
   * (cartera viva + cotizaciones reales guardadas). `null` = ni se ha intentado,
   * porque la póliza no es retarificable. Si hay estimación pero sin horquilla,
   * viene igual: su `sinBase` y su `etiqueta` dicen por qué.
   */
  estimacion: EstimacionFicha | null
  /**
   * Los dos capitales de hogar reconstruidos por corroboración entre garantías,
   * cada uno con su porqué (`consenso` / `solo_sublimites` / …). `null` cuando
   * la póliza no es de hogar.
   */
  capitalesHogar: { continente: CapitalAsegurado; contenido: CapitalAsegurado } | null
}

/** Hoy en Madrid, `YYYY-MM-DD`: la horquilla pesa la antigüedad de cada caso. */
function hoyEnMadrid(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

/**
 * Qué se enseña cuando NO se han podido leer los casos.
 *
 * Los ceros de `fuente` aquí no dicen «no hay»: dicen «no se ha podido contar»,
 * y por eso van SIEMPRE acompañados de la etiqueta, que es lo que la pantalla
 * pinta. Se degrada en vez de tumbar la ficha entera —la estimación es un
 * añadido, no la póliza— pero no se calla, que es lo que `CLAUDE.md` prohíbe.
 */
function estimacionIlegible(motivo: string): EstimacionFicha {
  const texto = `No se han podido leer los casos con los que comparar: ${motivo}`
  return {
    horquilla: null,
    sinBase: texto,
    casos: 0,
    desde: null,
    hasta: null,
    antiguedadMedianaMeses: null,
    base: null,
    etiqueta: texto,
    orientativa: true,
    veredicto: 'no-se',
    porque: texto,
    fuente: { cartera: 0, cotizaciones: 0, cotizacionesDisponibles: false },
  }
}

/**
 * La estimación de una póliza: reúne los casos, construye la horquilla y dice
 * si merece la pena gastar los 0,50€ de una cotización de verdad.
 *
 * 🚨 Solo LEE la base de datos. No llama a Codeoscopic ni de lejos.
 */
async function estimacionPoliza(input: {
  correduriaId: string
  ramo: string
  /** La que se estima: queda fuera de sus propios casos, no se compara consigo misma. */
  polizaId: string
  primaActual: number | null
  riesgo: RiesgoAEstimar
  tx: EjecutorLectura
}): Promise<EstimacionFicha> {
  let reunidos
  try {
    reunidos = await casosDeRamo({
      correduriaId: input.correduriaId,
      ramo: input.ramo,
      tx: input.tx,
      excluirPolizaId: input.polizaId,
    })
  } catch (e) {
    return estimacionIlegible(e instanceof Error ? e.message : String(e))
  }
  const estimacion = estimar(reunidos.casos, input.riesgo, hoyEnMadrid())
  const { veredicto, porque } = mereceLaPena(input.primaActual, estimacion)
  return {
    ...estimacion,
    veredicto,
    porque,
    fuente: {
      cartera: reunidos.cartera,
      cotizaciones: reunidos.cotizaciones,
      cotizacionesDisponibles: reunidos.cotizacionesDisponibles,
    },
  }
}

function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}
function ilegible(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith('v1:') && descifrar(v) === null
}
function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function fechaIso(d: Date | null | undefined): string | null {
  return d instanceof Date ? d.toISOString().slice(0, 10) : null
}
function num(d: unknown): number | null {
  if (d === null || d === undefined) return null
  const n = Number(d)
  return Number.isFinite(n) ? n : null
}

/** La dirección del riesgo va cifrada en `datos_especificos`; se descifra si se puede. */
export function datosConDireccion(datos: unknown): Record<string, unknown> | null {
  if (!esObjetoPlano(datos)) return null
  const dir = datos.direccion
  if (typeof dir !== 'string' || !dir.startsWith('v1:')) return datos
  const claro = descifrar(dir)
  return claro === null ? datos : { ...datos, direccion: claro }
}


export async function fichaPoliza(correduriaId: string, polizaId: string): Promise<FichaPoliza | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  const p = await db.poliza.findFirst({
    where: { id: polizaId, correduriaId, mergedIntoPolizaId: null },
    select: {
      id: true, tipo: true, aseguradora: true, codigoEntidadDgs: true, numeroPoliza: true, idPolizaEntidad: true,
      ramoDgs: true, estado: true, situacion: true, origen: true, importRef: true, eiacXmlHash: true,
      fechaEfectoInicial: true, fechaInicio: true, fechaVencimiento: true,
      primaAnual: true, primaBruta: true, primaMensual: true, fraccionamiento: true, datosEspecificos: true,
      cliente: { select: { id: true, nombre: true, apellidos: true } },
      coberturasRel: {
        select: { numeroOrden: true, codigo: true, descripcion: true, capitalAsegurado: true, descripcionCapital: true, franquicia: true, fechaInicio: true, fechaFin: true, modalidadValoracion: true, datosExtra: true },
        orderBy: { numeroOrden: 'asc' },
      },
      recibos: {
        select: { id: true, situacion: true, primaTotal: true, primaNeta: true, claseRecibo: true, fechaEfectoInicial: true, fechaEmision: true, fechaVencimiento: true, formaPago: true },
        orderBy: { fechaEmision: 'desc' },
      },
      siniestros: { select: SELECT_SINIESTRO, orderBy: { fechaHora: 'desc' } },
    },
  })
  if (!p) return null

  const [intervinientes, gemela, documentos, listaDocumentos] = await Promise.all([
    db.polizaInterviniente
      .findMany({
        where: { correduriaId, polizaId: p.id },
        // Determinista a propósito: ver la nota de `cartera-ficha`.
        orderBy: [{ rol: 'asc' }, { id: 'asc' }],
        select: {
          polizaId: true, rol: true, clienteId: true, origen: true, nombre: true, apellidos: true, telefono: true, email: true,
          nifLookupHash: true,
          cliente: { select: { nombre: true, apellidos: true, telefono: true, email: true } },
        },
      })
      .then((filas): IntervinienteFicha[] => {
        // Etiqueta opaca por NIF; ver la nota de `cartera-ficha`.
        const claves = new Map<string, string>()
        for (const f of filas) {
          if (f.nifLookupHash && !claves.has(f.nifLookupHash)) claves.set(f.nifLookupHash, `p${claves.size + 1}`)
        }
        return filas.map((f) => {
          const propio = [descifrar(f.nombre), descifrar(f.apellidos)].filter(Boolean).join(' ').trim() || null
          const deFicha = f.cliente ? `${f.cliente.nombre} ${f.cliente.apellidos}`.trim() || null : null
          const telefono = descifrar(f.telefono) ?? descifrar(f.cliente?.telefono)
          const email = descifrar(f.email) ?? descifrar(f.cliente?.email)
          return {
            polizaId: f.polizaId, rol: String(f.rol), nombre: propio ?? deFicha,
            nombreIlegible: propio === null && deFicha === null && (ilegible(f.nombre) || ilegible(f.apellidos)),
            telefono, email,
            telefonoIlegible: telefono === null && (ilegible(f.telefono) || ilegible(f.cliente?.telefono)),
            emailIlegible: email === null && (ilegible(f.email) || ilegible(f.cliente?.email)),
            fichaId: f.clienteId ?? null, esTomador: f.clienteId === p.cliente.id, origen: String(f.origen),
            personaClave: f.nifLookupHash ? claves.get(f.nifLookupHash) ?? null : null,
          }
        })
      })
      .catch((): IntervinienteFicha[] | null => null),
    // La gemela: mismo número, la OTRA cara. Solo tiene sentido si esta es de
    // CIMA (la del volcado ya es la que tiene la dirección).
    p.numeroPoliza === null
      ? Promise.resolve(null)
      : db.poliza
          .findFirst({
            where: {
              correduriaId, mergedIntoPolizaId: null, numeroPoliza: p.numeroPoliza, id: { not: p.id },
              // La gemela es la de la OTRA cara: si ésta es viva, la copia del volcado;
              // si ésta es del volcado, la que mantiene CIMA.
              ...(esCarteraViva(p) ? WHERE_VOLCADO_HISTORICO : WHERE_CARTERA_VIVA),
            },
            select: { id: true, clienteId: true, importRef: true, eiacXmlHash: true, datosEspecificos: true, tipo: true, fechaVencimiento: true },
          })
          .catch(() => null),
    contarDocumentosPoliza(correduriaId, p.id),
    listarDocumentos(correduriaId, { polizaId: p.id }),
  ])

  const datos = datosConDireccion(p.datosEspecificos)
  const datosGemela = esObjetoPlano(gemela?.datosEspecificos) ? gemela.datosEspecificos : null
  const retarificacion = retarificabilidad({ tipo: String(p.tipo), estado: String(p.estado), datos, datosGemela })
  const coberturasTexto = p.coberturasRel.map((c) => c.descripcion).filter((d): d is string => !!d)

  // El capital asegurado de hogar se RECONSTRUYE por corroboración entre
  // garantías: ninguna compañía manda una fila que diga «este es el
  // continente», y coger el importe más alto daría un número plausible y falso
  // (ver `garantias.ts` en `@central/module-seguros`).
  //
  // 🚨 Y se le pasa la SEGUNDA fuente: los capitales que la copia del volcado
  // guarda en su `datos_especificos` («61000» / «7000», como texto). El dato ya
  // está en memoria —es el mismo objeto del que salen los m² y el año que la
  // ficha ya pintaba—, así que aquí no se consulta nada nuevo. Hasta el
  // 03/09/2026 se cogían unos campos de ese objeto y no otros, y luego la ficha
  // afirmaba que el capital «no consta»: el «no lo he mirado» disfrazado de «no
  // lo hay» que prohíbe `CLAUDE.md`.
  //
  // Cuál de las dos caras ES el volcado depende de cuál se está mirando: si
  // ésta es la viva, el volcado es la gemela; si ésta ya es la del volcado, es
  // ella misma. Con `null` el módulo entiende «no se ha mirado» y no dice nada
  // del volcado en sus motivos.
  const datosVolcado = esCarteraViva(p) ? datosGemela : datos
  const capitales =
    String(p.tipo) === 'hogar'
      ? capitalesHogar(
          p.coberturasRel.map((c) => ({ descripcion: c.descripcion, capital: c.capitalAsegurado })),
          datosVolcado ? { continente: datosVolcado.continente, contenido: datosVolcado.contenido } : null,
        )
      : null
  // El riesgo puede venir de la póliza o de su copia gemela: CIMA no manda el
  // objeto de hogar y la del volcado sí. Lo que no traiga ninguna sigue a
  // `null` — un 0 aquí torcería la horquilla.
  const riesgoHogar = elegirRiesgo(hogarDeDatos(datos, 'poliza'), hogarDeDatos(datosGemela, 'gemela'))
  const prima = primaReferencia({ primaAnual: num(p.primaAnual), primaBruta: num(p.primaBruta) })
  // Solo se estima lo RETARIFICABLE: la pregunta que responde esto es «¿gasto
  // los 0,50€ de una cotización?», y no se puede gastar en algo que no se puede
  // pedir (un ramo que Codeoscopic no sirve, o una póliza cancelada). Cuando no,
  // `null` — la pantalla ya tiene el motivo en `retarificacion.motivo`.
  const estimacion = retarificacion.retarificable
    ? await estimacionPoliza({
        correduriaId,
        ramo: String(p.tipo),
        polizaId: p.id,
        primaActual: prima,
        // Se lee con la MISMA conexión que la ficha (schema `seguros`): así la
        // horquilla y la póliza salen de la misma cartera, no de dos copias.
        tx: db,
        riesgo: {
          metrosCuadrados: riesgoHogar?.metrosCuadrados ?? null,
          anioConstruccion: riesgoHogar?.anioConstruccion ?? null,
          // El capital corroborado manda sobre el tecleado en la ficha; si
          // ninguno lo sabe, sigue siendo «no lo sé».
          capitalContinente:
            (capitales ? eurDeCapital(capitales.continente) : null) ?? riesgoHogar?.capitalContinente ?? null,
        },
      })
    : null
  const recibosCrudos = p.recibos.map((r) => ({
    id: r.id, situacion: r.situacion === null ? null : String(r.situacion), primaTotal: r.primaTotal,
    fechaEmision: fechaIso(r.fechaEmision), fechaVencimiento: fechaIso(r.fechaVencimiento), formaPago: r.formaPago,
  }))
  const fraccionamiento = p.fraccionamiento === null ? null : String(p.fraccionamiento)

  return {
    id: p.id,
    cliente: { id: p.cliente.id, nombre: `${p.cliente.nombre} ${p.cliente.apellidos}`.trim() },
    tipo: String(p.tipo),
    aseguradora: p.aseguradora,
    codigoEntidadDgs: p.codigoEntidadDgs ?? null,
    numeroPoliza: p.numeroPoliza ?? null,
    idPolizaEntidad: p.idPolizaEntidad ?? null,
    ramoDgs: p.ramoDgs ?? null,
    estado: String(p.estado),
    situacion: p.situacion ?? null,
    origen: String(p.origen),
    viva: esCarteraViva(p),
    fechaEfectoInicial: fechaIso(p.fechaEfectoInicial),
    fechaInicio: fechaIso(p.fechaInicio),
    fechaVencimiento: fechaIso(p.fechaVencimiento),
    prima,
    primaAnual: num(p.primaAnual),
    primaBruta: num(p.primaBruta),
    primaMensual: num(p.primaMensual),
    objeto: objetoAsegurado({ tipo: String(p.tipo), datos, coberturas: coberturasTexto.length ? coberturasTexto : null }),
    gemela:
      gemela === null
        ? null
        : {
            polizaId: gemela.id,
            clienteId: gemela.clienteId,
            // Con qué cara se etiqueta la gemela. `'cima'` cuando es cartera viva —
            // incluida la fila del volcado que CIMA mantiene, que SÍ lleva `import_ref`.
            importRef: esCarteraViva(gemela) ? 'cima' : (gemela.importRef ?? 'cima'),
            objeto: objetoAsegurado({ tipo: String(gemela.tipo), datos: datosConDireccion(gemela.datosEspecificos), coberturas: null }),
            fechaVencimiento: fechaIso(gemela.fechaVencimiento),
          },
    coberturas: p.coberturasRel.map((c) => ({
      orden: c.numeroOrden ?? null, codigo: c.codigo ?? null, descripcion: c.descripcion ?? null,
      capital: c.capitalAsegurado ?? null, descripcionCapital: c.descripcionCapital ?? null, franquicia: c.franquicia ?? null,
      desde: fechaIso(c.fechaInicio), hasta: fechaIso(c.fechaFin),
      modalidad: c.modalidadValoracion ?? null, detalle: extraerDetalleCobertura(c.datosExtra),
    })),
    recibos: resumirRecibos(recibosCrudos),
    listaRecibos: recibosCrudos.map((r) => ({
      id: r.id, situacion: (r.situacion ?? '').trim() || 'sin_informar', importe: importeEiac(r.primaTotal),
      fechaEmision: r.fechaEmision, fechaVencimiento: r.fechaVencimiento, formaPago: etiquetaFormaPago(r.formaPago),
    })),
    siniestros: p.siniestros.map(mapSiniestro),
    evolucionPrima: evolucionPrima({
      fechaInicio: fechaIso(p.fechaInicio),
      fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento),
      recibos: p.recibos.map((r) => ({
        id: r.id, claseRecibo: r.claseRecibo ?? null, fechaEfectoInicial: fechaIso(r.fechaEfectoInicial), fechaEmision: fechaIso(r.fechaEmision),
        situacion: r.situacion === null ? null : String(r.situacion), primaTotal: r.primaTotal, primaNeta: r.primaNeta,
      })),
      siniestros: p.siniestros.map((x) => ({ fechaHora: x.fechaHora instanceof Date ? x.fechaHora.toISOString() : null, estado: String(x.estado) })),
    }),
    intervinientes,
    documentos,
    listaDocumentos,
    pago: {
      fraccionamiento,
      formaCobro: etiquetaFormaPago(p.recibos[0]?.formaPago ?? null),
      recargo: recargoFraccionamiento({
        fraccionamiento, primaAnual: num(p.primaAnual), vencimiento: fechaIso(p.fechaVencimiento),
        recibos: recibosCrudos.map((r) => ({ importe: importeEiac(r.primaTotal), fechaEmision: r.fechaEmision, situacion: r.situacion })),
      }),
    },
    retarificable: retarificacion.retarificable,
    retarificacion,
    estimacion,
    capitalesHogar: capitales,
  }
}
