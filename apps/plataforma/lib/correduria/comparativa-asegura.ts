// La COMPARATIVA ÚNICA de una oportunidad, vista desde la pantalla de Alberto (21/10/2026). Lo pide la oportunidad al
// abrirse: `GET /api/operador/oportunidad/comparativa` de asegura (GRATIS: solo lee lo guardado, ni Codeoscopic ni IA).
// Lo PURO (tipos, `interpretarComparativa`, textos) lo importa el client component; la RED solo la ruta API.
//
// 🚨 Tres estados de cada cobertura (incluida · no incluida · no se sabe), nunca «no» por no figurar. Un precio que no es
//    de un año (`primaPeriodo`) se enseña con su periodo y NO entra en el orden. El orden es por prima, no una
//    recomendación (`criterio`). El aviso de «ya hay cotización de Avant2» va ANTES del botón de 0,50€.

import { etiquetasOfertas, type EstadoTriple, type OfertaNormalizada, type ResultadoComparacion } from '@central/module-seguros'
import { eur } from '../dinero.ts'

export type Avant2Guardada = { cotizacionId: string; creadaEn: string; caducada: boolean; precios: number; enCuadro: number; aviso: string }
export type ResumenGuardado = { presupuestoId: string; generadoAt: string | null; vigente: boolean; etiqueta: string | null; narrativa: { resumen: string; recomendacion: string; fuente: string } | null }

/** Un precio de bot: su proyecto guardado en la compañía (26/10/2026). Lo calcula asegura; aquí solo se lee y se escribe. */
export type ProyectoBot = {
  ofertaId: string
  referencia: string | null
  guardadoEn: string | null
  caduca: string | null
  estadoCaducidad: 'desconocida' | 'vigente' | 'caduca_pronto' | 'caducado'
  /** `null` = PDF no comprobado contra lo tarificado. */
  verificacion: { estado: 'ok' | 'discrepancia' | null; discrepancias: string[] } | null
  /** `null` = no se pudieron mirar sus avisos (nunca «limpio» por defecto). */
  precio: { estado: 'limpio' | 'con_supuestos'; supuestos: string[] } | null
}

export type DatosComparativa = {
  comparacion: ResultadoComparacion
  avant2: Avant2Guardada | null
  guardado: ResumenGuardado | null
  polizaCartera: 'incluida' | 'no_aplica' | 'ya_hay_actual' | 'no_encontrada'
  ofertasBot: ProyectoBot[]
}
export type LecturaComparativa =
  | { estado: 'ok'; datos: DatosComparativa }
  | { estado: 'sin_configurar' }
  | { estado: 'no_encontrado' }
  | { estado: 'error'; motivo: string }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

const ESTADOS_CAD = ['desconocida', 'vigente', 'caduca_pronto', 'caducado'] as const

/** `ofertasBot` del puerto → lista tipada. Una entrada con forma rara se descarta; la ausencia del campo (puerto anterior) es lista vacía. PURO. */
export function leerOfertasBot(v: unknown): ProyectoBot[] {
  if (!Array.isArray(v)) return []
  const out: ProyectoBot[] = []
  for (const e of v) {
    const o = obj(e)
    const id = txt(o?.ofertaId)
    if (!o || !id) continue
    const est = ESTADOS_CAD.find((x) => x === o.estadoCaducidad) ?? 'desconocida'
    const ver = obj(o.verificacion)
    const pre = obj(o.precio)
    out.push({
      ofertaId: id, referencia: txt(o.referencia), guardadoEn: txt(o.guardadoEn), caduca: txt(o.caduca), estadoCaducidad: est,
      verificacion: ver ? { estado: ver.estado === 'ok' || ver.estado === 'discrepancia' ? ver.estado : null, discrepancias: Array.isArray(ver.discrepancias) ? ver.discrepancias.filter((x): x is string => typeof x === 'string') : [] } : null,
      precio: pre && (pre.estado === 'limpio' || pre.estado === 'con_supuestos') ? { estado: pre.estado, supuestos: Array.isArray(pre.supuestos) ? pre.supuestos.filter((x): x is string => typeof x === 'string') : [] } : null,
    })
  }
  return out
}

const fechaCorta = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** «Proyecto nº X · guardado el 20/10 · caduca el 19/11» — o «caducidad desconocida» (nunca una fecha inventada). PURO. */
export function textoProyecto(p: Pick<ProyectoBot, 'referencia' | 'guardadoEn' | 'caduca'>): string {
  return [
    p.referencia ? `Proyecto nº ${p.referencia}` : 'Proyecto sin nº',
    p.guardadoEn ? `guardado el ${fechaCorta(p.guardadoEn)}` : 'fecha de guardado desconocida',
    p.caduca ? `caduca el ${fechaCorta(p.caduca)}` : 'caducidad desconocida',
  ].join(' · ')
}

/** La línea del PDF contra lo tarificado. PURO. */
export function textoVerificacionPdf(v: ProyectoBot['verificacion']): string {
  if (!v || v.estado === null) return 'PDF sin comprobar contra lo tarificado'
  return v.estado === 'ok' ? 'El PDF cuadra con lo tarificado' : `El PDF no cuadra con lo tarificado: ${v.discrepancias.join(', ') || 'revisa'}`
}

/** Precios «con supuestos» a corregir antes de enviar, con su compañía. PURO. */
export function preciosConSupuestos(filas: readonly { id: string; etiqueta: string }[], proyectos: readonly ProyectoBot[]): { etiqueta: string; supuestos: string[] }[] {
  const por = new Map(proyectos.map((p) => [p.ofertaId, p]))
  return filas.flatMap((f) => {
    const p = por.get(f.id)
    return p?.precio?.estado === 'con_supuestos' ? [{ etiqueta: f.etiqueta, supuestos: p.precio.supuestos }] : []
  })
}

/** La respuesta del puerto → lo que pinta la pantalla. Una forma que no cuadra es `error` (no se pinta a medias). PURO. */
export function interpretarComparativa(status: number, json: unknown): LecturaComparativa {
  const j = obj(json)
  if (j?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  // Solo el 404 REAL del puerto (trae `estado:'no_encontrado'`) es «no existe»; un 404 de ruta/despliegue a medias es un error.
  if (status === 404) return j?.estado === 'no_encontrado' ? { estado: 'no_encontrado' } : { estado: 'error', motivo: 'el puerto de asegura no tiene esta ruta (HTTP 404; ¿despliegue a medias?)' }
  if (status !== 200 || j?.estado !== 'ok') return { estado: 'error', motivo: txt(j?.motivo) ?? txt(j?.causa) ?? `HTTP ${status}` }
  const c = obj(j.comparacion)
  if (!c || !Array.isArray(c.ofertas) || !Array.isArray(c.filas) || !Array.isArray(c.resumen)) return { estado: 'error', motivo: 'respuesta sin comparativa' }
  const a = obj(j.avant2)
  const avant2: Avant2Guardada | null = a && txt(a.cotizacionId) && txt(a.creadaEn) && txt(a.aviso)
    ? { cotizacionId: a.cotizacionId as string, creadaEn: a.creadaEn as string, caducada: a.caducada === true, precios: Number(a.precios) || 0, enCuadro: Number(a.enCuadro) || 0, aviso: a.aviso as string }
    : null
  const g = obj(j.guardado)
  const n = obj(g?.narrativa)
  const guardado: ResumenGuardado | null = g && txt(g.presupuestoId)
    ? {
        presupuestoId: g.presupuestoId as string, generadoAt: txt(g.generadoAt), vigente: g.vigente === true, etiqueta: txt(g.etiqueta),
        narrativa: n && typeof n.resumen === 'string' && typeof n.recomendacion === 'string' ? { resumen: n.resumen, recomendacion: n.recomendacion, fuente: String(n.fuente ?? '') } : null,
      }
    : null
  const pc = j.polizaCartera
  return {
    estado: 'ok',
    datos: {
      comparacion: c as unknown as ResultadoComparacion,
      avant2,
      guardado,
      polizaCartera: pc === 'incluida' || pc === 'ya_hay_actual' || pc === 'no_encontrada' ? pc : 'no_aplica',
      ofertasBot: leerOfertasBot(j.ofertasBot),
    },
  }
}

const FUENTE_TXT: Record<string, string> = { avant2: 'Avant2', pdf_compania: 'PDF de compañía', pdf_competencia: 'PDF de la competencia', poliza_actual: 'Póliza en cartera', bot: 'Bot de compañía' }
export const fuenteTxt = (f: string | null | undefined): string => (f ? FUENTE_TXT[f] ?? f : 'Origen sin dato')

/** El precio de una opción como se escribe: anual comparable, de otro periodo (con su periodo) o «No figura». PURO. */
export function precioOpcion(o: Pick<OfertaNormalizada, 'primaTotal' | 'primaPeriodo'>): { texto: string; comparable: boolean } {
  if (typeof o.primaTotal === 'number' && Number.isFinite(o.primaTotal)) return { texto: `${eur(o.primaTotal)}/año`, comparable: true }
  const pp = o.primaPeriodo
  if (pp && Number.isFinite(pp.importe)) {
    return { texto: `${eur(pp.importe)} (${typeof pp.meses === 'number' ? `${pp.meses} meses` : 'periodo sin confirmar'})`, comparable: false }
  }
  return { texto: 'No figura', comparable: false }
}

export const TEXTO_ESTADO3: Record<EstadoTriple, { glifo: string; texto: string }> = {
  incluida: { glifo: '✓', texto: 'Incluida' },
  no_incluida: { glifo: '✗', texto: 'No incluida' },
  no_se_sabe: { glifo: '?', texto: 'No se sabe' },
}

/** Las filas de la vista: cada opción con su etiqueta (compañía + nivel), precio, puesto y reservas, en el orden del ranking. PURO. */
export function filasPrecios(c: ResultadoComparacion) {
  const nombres = etiquetasOfertas(c.ofertas)
  const puesto = new Map((c.ranking?.puestos ?? []).map((p) => [p.ofertaId, p]))
  const filas = c.ofertas.map((o) => {
    const p = puesto.get(o.id) ?? null
    return {
      id: o.id, rol: o.rol, compania: o.compania, etiqueta: nombres.get(o.id) ?? o.compania, nivel: o.nivel ?? null, fuente: fuenteTxt(o.fuente),
      precio: precioOpcion(o), estimado: o.firmeza === 'estimado', posicion: p?.posicion ?? null, empate: p?.empate ?? false,
      motivos: p?.motivos ?? [], reservas: p?.reservas ?? [],
    }
  })
  const peso = (f: (typeof filas)[number]) => (f.rol === 'actual' ? -1 : f.posicion ?? Number.POSITIVE_INFINITY)
  return filas.map((f, i) => ({ f, i })).sort((a, b) => peso(a.f) - peso(b.f) || a.i - b.i).map(({ f }) => f)
}
