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

export type DatosComparativa = {
  comparacion: ResultadoComparacion
  avant2: Avant2Guardada | null
  guardado: ResumenGuardado | null
  polizaCartera: 'incluida' | 'no_aplica' | 'ya_hay_actual' | 'no_encontrada'
}
export type LecturaComparativa =
  | { estado: 'ok'; datos: DatosComparativa }
  | { estado: 'sin_configurar' }
  | { estado: 'no_encontrado' }
  | { estado: 'error'; motivo: string }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** La respuesta del puerto → lo que pinta la pantalla. Una forma que no cuadra es `error` (no se pinta a medias). PURO. */
export function interpretarComparativa(status: number, json: unknown): LecturaComparativa {
  const j = obj(json)
  if (j?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'no_encontrado' }
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
