// La cola de retención: los recibos devueltos o impagados de la cartera, con
// cuánto tiempo queda para rescatar cada póliza.
//
// ─── Por qué esto es lo primero que hay que mirar cada mañana ───────────────
// Un recibo devuelto no avisa a nadie. La compañía lo anota, la póliza deja de
// cubrir al mes (art. 15 LCS) y el cliente se entera el día que tiene un
// accidente. Mientras tanto, esa póliza está perdida salvo que alguien llame:
// pagando, la cobertura vuelve en 24 horas.
//
// Lo que decide el orden NO es el importe, es el RELOJ: una póliza de 200€ a la
// que le quedan tres días de ventana vale más que una de 800€ recién devuelta.
// La urgencia la calcula `retencion()`, que es puro y está probado.
//
// ─── Tres estados, como siempre ────────────────────────────────────────────
// Aquí el «no se sabe» es TRIPLE y hay que separarlo:
//   · la póliza no tiene NINGÚN recibo informado → no sale en esta lista, y eso
//     NO significa que esté pagada (18 de 109 vivas están así, medido el
//     01/09/2026). Se cuenta aparte, en `sinRecibosInformados`.
//   · el recibo está devuelto pero sin fecha de vencimiento → sí sale, con
//     estado `sin_fecha`, porque podría ser el más viejo de todos.
//   · 🚨 el recibo está `pendiente` y ya venció → sale con estado
//     `sin_confirmar`. Que no conste cobrado NO es que se haya devuelto: nadie
//     ha dicho eso. Ver la cabecera de `retencion.ts` (caso 03/09/2026).

import {
  retencion,
  resumirRetencion,
  retarificabilidad,
  primaReferencia,
  type EstadoRetencion,
  type SituacionRecibo,
  type ResumenRetencion,
  type Retarificabilidad,
} from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

// 🚨 Las situaciones que significan «este dinero no ha entrado» son DOS, y no
// son lo mismo (medido el 01/09/2026: 1 devuelto y 25 pendientes):
//   · `devuelto`  → el cobro se intentó y FALLÓ. Entra siempre en la cola.
//   · `pendiente` → emitido y aún sin cobrar. Solo entra si YA VENCIÓ; si su
//     fecha es futura es un recibo normal, y meterlo llenaría la cola de gente
//     a la que no hay que llamar — que es la forma de que nadie la mire.
// El enum de la base NO tiene `impagado` (comprobado contra `recibo_estado`):
// las dos de arriba son todas las que hay.
const SITUACIONES_IMPAGO = ['devuelto', 'pendiente'] as const

export type ClienteEnRiesgo = {
  polizaId: string
  clienteId: string
  cliente: string
  /** Para llamar sin salir de la pantalla. `null` = no consta o no se descifra. */
  telefono: string | null
  telefonoIlegible: boolean
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  /** Qué asegura, para que la llamada no empiece preguntando. */
  matricula: string | null
  /** `null` = la compañía no informa la prima. NUNCA 0. */
  prima: number | null
  /** Importe del recibo devuelto. `null` = el texto del EIAC no se pudo leer. */
  importeRecibo: number | null
  fechaRecibo: string | null
  /**
   * Lo que AFIRMA la compañía del recibo. Va hasta la pantalla a propósito: sin
   * esto no se puede distinguir «se devolvió» de «no ha llegado el cobro», que
   * es la diferencia entre llamar a un cliente y mirar el portal.
   */
  situacionRecibo: SituacionRecibo
  estado: EstadoRetencion
  dias: number | null
  diasParaExtincion: number | null
  accion: string
  prioridad: number
  /** `retarificacion.retarificable`: se puede pedir precio de otra compañía. */
  retarificable: boolean
  /**
   * Por qué ramo (auto/hogar) o por qué no. Aquí se juzga SOLO con los datos de
   * la propia póliza: la copia gemela no se consulta en esta lista (sería una
   * consulta más por fila en la pantalla que hay que abrir cada mañana), así que
   * una de hogar cuyo riesgo vive en la gemela saldrá como «faltan datos» aquí
   * y como retarificable en su ficha. Es el estado conservador, no un error.
   */
  retarificacion: Retarificabilidad
}

export type ColaRetencion = {
  filas: ClienteEnRiesgo[]
  resumen: ResumenRetencion
  /**
   * 🚨 Pólizas VIVAS sin ningún recibo informado. No están en la cola porque no
   * se sabe nada de ellas — y eso no es «al corriente». La pantalla lo dice.
   */
  sinRecibosInformados: number
  /**
   * Recibos `pendiente` que NO se pueden juzgar todavía: o vencen en el futuro
   * (normal, no hay nada que hacer) o no traen fecha (no se sabe). Se cuentan
   * para que la cola no parezca la lista completa de lo que está sin cobrar.
   */
  pendientesSinJuzgar: number
}

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function fechaIso(d: Date | null | undefined): string | null {
  return d instanceof Date ? d.toISOString().slice(0, 10) : null
}

/** Descifra sin convertir un fallo en «no tiene teléfono». */
function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}

/** Importe del EIAC: solo la forma medida (`NNN.NN`). Cualquier otra → null. */
function importeRecibo(texto: string | null): number | null {
  if (typeof texto !== 'string') return null
  const t = texto.trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Pólizas con un descarte TEMPORAL vigente (`retencion_descartes.vence_at >
 * now()`): alguien ya gestionó esta llamada y pidió no verla un tiempo. No es
 * «resuelto» — si el recibo sigue sin cobrar cuando el descarte caduque,
 * vuelve a salir sola.
 *
 * Fail-CLOSED: si esta consulta falla, se devuelve el conjunto VACÍO (nada
 * descartado) en vez de propagar el error. Una cola de impagados que dejara de
 * cargar entera porque falló el filtro de "lo ya visto" sería peor que una que
 * a veces repite una fila ya gestionada.
 */
async function polizasDescartadas(correduriaId: string, hoy: Date): Promise<Set<string>> {
  try {
    const filas = await prismaAsegura().$queryRaw<{ poliza_id: string }[]>`
      select poliza_id
      from retencion_descartes
      where correduria_id = ${correduriaId}::uuid and vence_at > ${hoy}`
    return new Set(filas.map((f) => f.poliza_id))
  } catch {
    return new Set()
  }
}

export async function colaRetencion(
  correduriaId: string,
  hoy: Date = new Date(),
): Promise<ColaRetencion> {
  const vacia: ColaRetencion = {
    filas: [],
    resumen: resumirRetencion([]),
    sinRecibosInformados: 0,
    pendientesSinJuzgar: 0,
  }
  if (!aseguraConfigurada()) return vacia
  const db = prismaAsegura()

  const recibos = await db.polizaRecibo.findMany({
    where: {
      correduriaId,
      situacion: { in: [...SITUACIONES_IMPAGO] },
      // `activo: true`: una ficha descartada no aparece en la lista de impagos.
      poliza: { mergedIntoPolizaId: null, cliente: { mergedIntoClienteId: null, activo: true } },
    },
    select: {
      id: true,
      situacion: true,
      primaTotal: true,
      fechaVencimiento: true,
      poliza: {
        select: {
          id: true,
          tipo: true,
          aseguradora: true,
          numeroPoliza: true,
          estado: true,
          primaAnual: true,
          primaBruta: true,
          datosEspecificos: true,
          cliente: {
            select: { id: true, nombre: true, apellidos: true, telefono: true, tipo: true },
          },
        },
      },
    },
    orderBy: { fechaVencimiento: 'asc' },
  })

  // Un `pendiente` que aún no ha vencido no es un impago: es un recibo normal.
  // Se aparta y se CUENTA, en vez de descartarlo en silencio.
  const hoyIso = hoy.toISOString().slice(0, 10)
  let pendientesSinJuzgar = 0
  const accionables = recibos.filter((r) => {
    if (String(r.situacion) === 'devuelto') return true
    const f = fechaIso(r.fechaVencimiento)
    if (f === null || f >= hoyIso) {
      pendientesSinJuzgar++
      return false
    }
    return true
  })

  // Una póliza puede tener varios recibos sin cobrar. Se queda UNO, y el orden
  // de preferencia no es solo la fecha:
  //   1. 🚨 un `devuelto` gana a cualquier `pendiente`, sea cual sea la fecha.
  //      El devuelto es un HECHO que la compañía afirma; el pendiente es un
  //      dato que falta. Quedarse con el pendiente por ser más antiguo
  //      escondería el único impago confirmado de la póliza.
  //   2. dentro de la misma situación, el MÁS ANTIGUO, que es el que manda el
  //      reloj: si ese ya suspendió la cobertura, los posteriores no cambian
  //      nada y duplicar la fila duplicaría la llamada.
  //   3. sin fecha gana: no se sabe desde cuándo, y podría ser el más viejo.
  const porPoliza = new Map<string, (typeof recibos)[number]>()
  for (const r of accionables) {
    const previo = porPoliza.get(r.poliza.id)
    if (previo === undefined) {
      porPoliza.set(r.poliza.id, r)
      continue
    }
    const nuevoDevuelto = String(r.situacion) === 'devuelto'
    const previoDevuelto = String(previo.situacion) === 'devuelto'
    if (nuevoDevuelto !== previoDevuelto) {
      if (nuevoDevuelto) porPoliza.set(r.poliza.id, r)
      continue
    }
    if (previo.fechaVencimiento === null) continue
    if (r.fechaVencimiento === null || r.fechaVencimiento < previo.fechaVencimiento) {
      porPoliza.set(r.poliza.id, r)
    }
  }

  const descartadas = await polizasDescartadas(correduriaId, hoy)

  const filas: ClienteEnRiesgo[] = []
  for (const r of porPoliza.values()) {
    const p = r.poliza
    if (descartadas.has(p.id)) continue
    const datos = esObjetoPlano(p.datosEspecificos) ? p.datosEspecificos : null
    const matricula =
      datos && typeof datos.matricula === 'string' && datos.matricula.trim() !== ''
        ? datos.matricula.trim()
        : null
    const fecha = fechaIso(r.fechaVencimiento)
    // `SITUACIONES_IMPAGO` solo deja pasar estas dos, pero se estrecha aquí en
    // vez de castear: una situación nueva en el enum caería en el lado
    // conservador («no consta»), no en el que afirma que no hay cobertura.
    const situacion: SituacionRecibo = String(r.situacion) === 'devuelto' ? 'devuelto' : 'pendiente'
    const ret = retencion(fecha, situacion, hoy)
    const retarificacion = retarificabilidad({ tipo: String(p.tipo), estado: String(p.estado), datos, datosGemela: null })
    filas.push({
      polizaId: p.id,
      clienteId: p.cliente.id,
      cliente: `${p.cliente.nombre} ${p.cliente.apellidos}`.trim(),
      telefono: descifrar(p.cliente.telefono),
      telefonoIlegible:
        typeof p.cliente.telefono === 'string' &&
        p.cliente.telefono.startsWith('v1:') &&
        descifrar(p.cliente.telefono) === null,
      tipo: String(p.tipo),
      aseguradora: p.aseguradora,
      numeroPoliza: p.numeroPoliza ?? null,
      matricula,
      prima: primaReferencia({
        primaAnual: p.primaAnual === null ? null : Number(p.primaAnual),
        primaBruta: p.primaBruta === null ? null : Number(p.primaBruta),
      }),
      importeRecibo: importeRecibo(r.primaTotal),
      fechaRecibo: fecha,
      situacionRecibo: situacion,
      estado: ret.estado,
      dias: ret.dias,
      diasParaExtincion: ret.diasParaExtincion,
      accion: ret.accion,
      prioridad: ret.prioridad,
      retarificable: retarificacion.retarificable,
      retarificacion,
    })
  }

  // Por urgencia real (el reloj), y dentro de la misma urgencia por antigüedad.
  filas.sort((a, b) => b.prioridad - a.prioridad || (b.dias ?? 0) - (a.dias ?? 0))

  return {
    filas,
    resumen: resumirRetencion(filas.map((f) => ({ estado: f.estado, prima: f.prima }))),
    sinRecibosInformados: await polizasSinRecibo(correduriaId),
    pendientesSinJuzgar,
  }
}

export type DescarteRetencion =
  | { ok: true }
  | { ok: false; motivo: 'no_encontrada' | 'error' }

const DIAS_DESCARTE_MIN = 1
const DIAS_DESCARTE_MAX = 30
const DIAS_DESCARTE_DEFECTO = 10

/**
 * Quita una póliza de "Hay que llamar" durante `dias` (por defecto 10, tope 30):
 * NO la resuelve. Si al caducar el descarte el recibo sigue en `devuelto` o
 * `pendiente` vencido, `colaRetencion` la vuelve a servir sola — es la única
 * forma honesta de "quítamelo de la vista" sobre una lista derivada del cobro
 * real (ver cabecera del fichero: un botón que la ocultara para siempre
 * convertiría "ya he llamado" en "ya no circula sin seguro", y eso no lo sabe
 * nadie hasta que llegue el recibo).
 */
export async function descartarRetencion(
  correduriaId: string,
  polizaId: string,
  actor: string,
  motivo: string | null,
  dias: number = DIAS_DESCARTE_DEFECTO,
): Promise<DescarteRetencion> {
  const db = prismaAsegura()
  const d = Math.min(DIAS_DESCARTE_MAX, Math.max(DIAS_DESCARTE_MIN, Math.round(dias)))
  try {
    const poliza = await db.poliza.findFirst({
      where: { id: polizaId, correduriaId, mergedIntoPolizaId: null },
      select: { id: true, clienteId: true, numeroPoliza: true, aseguradora: true },
    })
    if (!poliza) return { ok: false, motivo: 'no_encontrada' }

    const motivoLimpio = typeof motivo === 'string' ? motivo.replace(/\s+/g, ' ').trim().slice(0, 500) : ''
    await db.$executeRaw`
      insert into retencion_descartes (correduria_id, poliza_id, actor, motivo, vence_at)
      values (${correduriaId}::uuid, ${polizaId}::uuid, ${actor}, ${motivoLimpio || null}, now() + make_interval(days => ${d}::int))`

    // Best-effort: el descarte ya está hecho, y un historial caído no puede
    // deshacerlo ni presentarse como un fallo de la operación.
    try {
      const texto =
        `Retención: descartada de "hay que llamar" ${d} día(s) por ${actor}` +
        ` (póliza ${poliza.numeroPoliza ?? poliza.id} · ${poliza.aseguradora})` +
        (motivoLimpio ? ` — ${motivoLimpio}` : '') +
        '. Vuelve a salir si el recibo sigue sin cobrar al caducar el plazo.'
      await db.$executeRaw`
        insert into historial_interno (correduria_id, cliente_id, tipo, texto)
        values (${correduriaId}::uuid, ${poliza.clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
    } catch (e) {
      console.error('[cartera-impagados] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
    }

    return { ok: true }
  } catch (e) {
    console.error('[cartera-impagados] descartarRetencion:', e instanceof Error ? e.message : e)
    return { ok: false, motivo: 'error' }
  }
}

/**
 * Pólizas VIVAS (las que entran por CIMA) de las que la compañía no ha mandado
 * ni un recibo. Es el hueco que la pantalla tiene que declarar: sin este
 * número, una cola de impagados vacía se leería como «está todo cobrado».
 */
async function polizasSinRecibo(correduriaId: string): Promise<number> {
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ n: bigint }[]>`
    select count(*)::bigint as n
    from polizas p
    where p.correduria_id = ${correduriaId}::uuid
      and p.merged_into_poliza_id is null
      -- Cartera VIVA: import_ref IS NULL NO basta. Una fila del volcado que la
      -- ingesta de CIMA mantiene al día conserva su import_ref viejo y se marca
      -- con eiac_xml_hash. Regla única en @central/module-seguros (cartera-viva.ts).
      and (p.import_ref is null or p.eiac_xml_hash is not null)
      and not exists (select 1 from poliza_recibos r where r.poliza_id = p.id)
  `
  return Number(filas[0]?.n ?? 0)
}
