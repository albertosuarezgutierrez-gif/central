/**
 * «Hay cambios en tu póliza» (27/09/2026). Alberto, 15/09: «todo lo que sea la intranet de un
 * cliente, que automáticamente hay notificación de algo, modificación, un vencimiento, todo… a esa
 * persona habrá que mandarle un correo cortito, educado… con acceso a la intranet directamente».
 *
 * Hasta hoy una póliza podía cambiar de precio, de fechas, de coberturas o darse de baja y el
 * cliente no se enteraba por ningún canal. No hay disparador en la BD (CIMA escribe por el CRM de
 * Manuel), así que se hace como el resto del portal: se DERIVA del estado. Una vez al día se saca
 * una FOTO de cada póliza de la cartera viva, se compara con la anterior y lo que difiere se guarda
 * como un cambio (`portal_poliza_cambio`). De ahí beben la campana y el correo de la intranet, que
 * así dicen lo mismo.
 *
 * PURO: la foto, la comparación y el aviso. Quien lee y escribe es `apps/asegura`.
 *
 * 🚨 Los cepos, cada uno contra un fallo concreto:
 *  1. **Semilla silenciosa.** La primera foto de una póliza no es un cambio: sin esto, el día que
 *     se activa le llegaría a toda la cartera «ha cambiado tu póliza».
 *  2. **Completar un dato no es cambiarlo.** Un `null` que pasa a tener valor es CIMA rellenando lo
 *     que faltaba (la prima llega días después de la emisión); un valor que pasa a `null` es un dato
 *     perdido, no algo que le haya pasado al cliente. Solo cuenta un valor que pasa a OTRO valor.
 *  3. **Estados equivalentes no cambian.** `activa`, `en_vigor`, `en_renovacion`, `cambio_clave` son
 *     la misma cosa para el cliente. Y `recibo_devuelto` NO avisa por aquí: el aviso del devuelto al
 *     cliente pasa a propósito por la cola de aprobación de Alberto (`aprobaciones.ts`).
 *  4. **Versión de la foto.** Si se cambia qué entra en ella, las fotos viejas se re-siembran sin
 *     avisar en vez de salir todas como «cambiadas» a la vez.
 *  5. **Nada de importes ni números en el texto**: el aviso dice QUÉ cambió; el valor se ve dentro.
 */
import { etiquetaRamo } from './poliza-leida.ts'

/** Sube este número si cambia lo que entra en la foto: las viejas se re-siembran en silencio. */
export const VERSION_FOTO_POLIZA = 1

/** Días que el aviso sigue en la campana desde que se detectó el cambio. */
export const DIAS_AVISO_POLIZA_MODIFICADA = 14

export const CAMPOS_CAMBIO_POLIZA = ['estado', 'fechas', 'prima', 'forma_pago', 'coberturas', 'documentos', 'siniestros'] as const
export type CampoCambioPoliza = (typeof CAMPOS_CAMBIO_POLIZA)[number]

/** Lo que se compara de una póliza. Todo normalizado a texto para que la comparación sea exacta. */
export type FotoPoliza = {
  v: number
  /** Grupo de estado (`grupoEstado`), no el estado en bruto. */
  estado: string
  fechaInicio: string | null
  fechaVencimiento: string | null
  /** Importe con dos decimales, o `null`. */
  prima: string | null
  formaPago: string | null
  /** `codigo|capital|franquicia`, ordenadas. */
  coberturas: string[]
  /** Ids de documentos VISIBLES para el cliente, ordenados. */
  documentos: string[]
  /** `id:estado`, ordenados. */
  siniestros: string[]
}

/** Lo mínimo que hace falta leer de la BD para sacar la foto. */
export type FilaFotoPoliza = {
  estado: string
  fechaInicio: Date | null
  fechaVencimiento: Date | null
  primaAnual: { toString(): string } | number | null
  primaBruta: { toString(): string } | number | null
  fraccionamiento: string | null
  coberturas: { codigo: string | null; capitalAsegurado: string | null; franquicia: string | null }[]
  documentosVisibles: string[]
  siniestros: { id: string; estado: string }[]
}

const ESTADOS_VIGENTES = new Set(['activa', 'en_vigor', 'en_renovacion', 'cambio_clave', 'recibo_devuelto'])

/** El estado tal como lo vive el cliente. */
export function grupoEstado(estado: string): string {
  const e = estado.trim().toLowerCase()
  if (ESTADOS_VIGENTES.has(e)) return 'vigente'
  if (e === 'cancelada' || e === 'fin_riesgo') return 'baja'
  return e
}

const dia = (d: Date | null): string | null => (d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null)

function importe(x: FilaFotoPoliza['primaAnual']): string | null {
  if (x === null || x === undefined) return null
  const n = Number(typeof x === 'number' ? x : x.toString())
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null
}

const limpio = (s: string | null): string => (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ')

export function fotoDePoliza(f: FilaFotoPoliza): FotoPoliza {
  return {
    v: VERSION_FOTO_POLIZA,
    estado: grupoEstado(f.estado),
    fechaInicio: dia(f.fechaInicio),
    fechaVencimiento: dia(f.fechaVencimiento),
    prima: importe(f.primaAnual) ?? importe(f.primaBruta),
    formaPago: f.fraccionamiento?.trim() || null,
    coberturas: [...new Set(f.coberturas.map((c) => `${limpio(c.codigo)}|${limpio(c.capitalAsegurado)}|${limpio(c.franquicia)}`))].sort(),
    documentos: [...new Set(f.documentosVisibles)].sort(),
    siniestros: [...new Set(f.siniestros.map((s) => `${s.id}:${s.estado}`))].sort(),
  }
}

/** Lee una foto guardada. `null` = no hay, o es de otra versión: se re-siembra, no se compara. */
export function leerFoto(x: unknown): FotoPoliza | null {
  if (!x || typeof x !== 'object') return null
  const f = x as Partial<FotoPoliza>
  if (f.v !== VERSION_FOTO_POLIZA) return null
  if (typeof f.estado !== 'string' || !Array.isArray(f.coberturas) || !Array.isArray(f.documentos) || !Array.isArray(f.siniestros)) return null
  return f as FotoPoliza
}

/** Un valor que pasa a OTRO valor. `null → x` es completar y `x → null` es perder: ninguno avisa. */
const cambiaValor = (a: string | null, b: string | null): boolean => a !== null && b !== null && a !== b

/**
 * Qué ha cambiado entre dos fotos, en el orden del catálogo. `[]` = nada que contarle al cliente
 * (aunque la foto sí haya cambiado: por ejemplo, CIMA completando la prima).
 */
export function camposCambiados(antes: FotoPoliza, ahora: FotoPoliza): CampoCambioPoliza[] {
  const c = new Set<CampoCambioPoliza>()
  if (antes.estado !== ahora.estado) c.add('estado')
  if (cambiaValor(antes.fechaInicio, ahora.fechaInicio) || cambiaValor(antes.fechaVencimiento, ahora.fechaVencimiento)) c.add('fechas')
  if (cambiaValor(antes.prima, ahora.prima)) c.add('prima')
  if (cambiaValor(antes.formaPago, ahora.formaPago)) c.add('forma_pago')
  // Coberturas que llegan por primera vez (lista vacía antes) son CIMA completando, no un cambio.
  if (antes.coberturas.length > 0 && ahora.coberturas.length > 0 && antes.coberturas.join('\n') !== ahora.coberturas.join('\n')) c.add('coberturas')
  // Documento nuevo sí; uno que desaparece (despublicado) no es algo que contarle.
  const docsAntes = new Set(antes.documentos)
  if (ahora.documentos.some((d) => !docsAntes.has(d))) c.add('documentos')
  // Siniestro nuevo o con otro estado.
  const sinAntes = new Set(antes.siniestros)
  if (ahora.siniestros.some((s) => !sinAntes.has(s))) c.add('siniestros')
  return CAMPOS_CAMBIO_POLIZA.filter((k) => c.has(k))
}

/**
 * 🚨 El cortacircuitos. Si en una sola pasada «cambia» una parte grande de la cartera, lo más
 * probable no es que 50 clientes hayan tocado su póliza el mismo día: es que CIMA (o un despliegue)
 * ha cambiado el FORMATO de un campo. Avisar sería mandar un correo falso a media cartera. En ese
 * caso se re-siembra sin avisar y quien llama lo deja escrito en el log y en el resumen.
 */
export function cambioMasivo(conCambios: number, comparadas: number): boolean {
  return conCambios > Math.max(5, Math.ceil(comparadas * 0.3))
}

/** Una fila de `portal_poliza_cambio` con lo que hace falta para nombrar la póliza. */
export type FilaCambioPoliza = {
  id: string
  polizaId: string
  campos: string[]
  estadoNuevo: string | null
  detectadoEn: Date
  compania: string | null
  tipo: string | null
}

export type PolizaModificadaParaAviso = {
  /** Id del cambio MÁS RECIENTE de esa póliza en la ventana: es la clave con la que se sella el correo. */
  id: string
  polizaId: string
  compania: string | null
  ramo: string | null
  campos: CampoCambioPoliza[]
  /** Grupo de estado nuevo si el estado es uno de los cambios. */
  estadoNuevo: string | null
}

const esCampo = (x: string): x is CampoCambioPoliza => (CAMPOS_CAMBIO_POLIZA as readonly string[]).includes(x)

/**
 * Los cambios de la ventana, UNO por póliza: si cambió el lunes el precio y el jueves las fechas,
 * la campana dice «precio y fechas» una vez, no dos avisos de la misma póliza.
 */
export function polizasModificadasParaAviso(filas: readonly FilaCambioPoliza[], hoy: Date): PolizaModificadaParaAviso[] {
  const desde = hoy.getTime() - DIAS_AVISO_POLIZA_MODIFICADA * 86_400_000
  const ordenadas = [...filas]
    .filter((f) => f.detectadoEn.getTime() >= desde && f.detectadoEn.getTime() <= hoy.getTime() + 60_000)
    .sort((a, b) => a.detectadoEn.getTime() - b.detectadoEn.getTime())
  const por = new Map<string, PolizaModificadaParaAviso>()
  for (const f of ordenadas) {
    const campos = f.campos.filter(esCampo)
    if (campos.length === 0) continue
    const ya = por.get(f.polizaId)
    const union = new Set<CampoCambioPoliza>([...(ya?.campos ?? []), ...campos])
    por.set(f.polizaId, {
      id: f.id,
      polizaId: f.polizaId,
      compania: f.compania?.trim() || null,
      ramo: etiquetaRamo(f.tipo),
      campos: CAMPOS_CAMBIO_POLIZA.filter((k) => union.has(k)),
      estadoNuevo: campos.includes('estado') ? f.estadoNuevo : (ya?.estadoNuevo ?? null),
    })
  }
  return [...por.values()]
}

const NOMBRE_CAMPO: Record<CampoCambioPoliza, string> = {
  estado: 'su situación',
  fechas: 'las fechas',
  prima: 'el precio',
  forma_pago: 'la forma de pago',
  coberturas: 'las coberturas',
  documentos: 'la documentación',
  siniestros: 'un siniestro',
}

function enumerar(p: readonly string[]): string {
  return p.length <= 1 ? (p[0] ?? '') : `${p.slice(0, -1).join(', ')} y ${p[p.length - 1]}`
}

/** Título y detalle de la campana. Sin importes, sin número de póliza. */
export function textoPolizaModificada(p: PolizaModificadaParaAviso): { titulo: string; detalle: string } {
  const cual = `tu póliza${p.ramo ? ` de ${p.ramo}` : ''}${p.compania ? ` con ${p.compania}` : ''}`
  if (p.campos.includes('estado')) {
    const que =
      p.estadoNuevo === 'baja'
        ? 'se ha dado de baja'
        : p.estadoNuevo === 'anula_al_vencimiento'
          ? 'no se renovará a su vencimiento'
          : p.estadoNuevo === 'vencida'
            ? 'ha vencido'
            : p.estadoNuevo === 'vigente'
              ? 'vuelve a estar en vigor'
              : 'ha cambiado de situación'
    return { titulo: `${cual[0]!.toUpperCase()}${cual.slice(1)} ${que}`, detalle: 'Entra en «Mis seguros» para ver el detalle. Si no lo esperabas, llámanos.' }
  }
  if (p.campos.length === 1 && p.campos[0] === 'documentos') {
    return { titulo: `Tienes documentación nueva de ${cual}`, detalle: 'La tienes en «Mis seguros».' }
  }
  if (p.campos.length === 1 && p.campos[0] === 'siniestros') {
    return { titulo: `Hay novedades de un siniestro de ${cual}`, detalle: 'Entra en «Mis seguros» para ver en qué punto está.' }
  }
  const datos = p.campos.filter((c) => c !== 'documentos' && c !== 'siniestros').map((c) => NOMBRE_CAMPO[c])
  const frases = [
    datos.length > 0 ? `Ha cambiado ${enumerar(datos)}.` : null,
    p.campos.includes('documentos') ? 'Hay documentación nueva.' : null,
    p.campos.includes('siniestros') ? 'Hay novedades de un siniestro.' : null,
    'Revísalo en «Mis seguros».',
  ].filter(Boolean)
  return { titulo: `Hay cambios en ${cual}`, detalle: frases.join(' ') }
}
