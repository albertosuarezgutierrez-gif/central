// Fichas de producto del tarificador — VISTA (07/10/2026). PURO, sin red. Lo usa
// `app/(usuario)/correduria/tarificador/fichas/FichasTarificador.tsx`; cepos en `tarificador-fichas-vista.test.ts`.
//
// Las formas reflejan lo que sirve asegura (`@central/module-tarificacion`, fichas.ts): plataforma no depende
// del paquete, así que se re-declaran aquí y se leen DEFENSIVAMENTE (lo que no tiene forma, fuera).
// Tres estados: `null` = no consta (se pinta «No consta», nunca «Excluida» ni 0,00€).
import { eur } from './dinero.ts'

/** La pantalla. Constante para que la enlacen sus hermanas (`/correduria/tarificador`). */
export const RUTA_FICHAS = '/correduria/tarificador/fichas'

export type EstadoCobertura = 'incluida' | 'opcional' | 'excluida'
export type Limite =
  | { tipo: 'importe'; eur: number }
  | { tipo: 'porcentaje'; pct: number; sobre: string | null }
  | { tipo: 'primer_riesgo'; eur: number }
export type Franquicia =
  | { tipo: 'importe'; eur: number }
  | { tipo: 'porcentaje'; pct: number; minimoEur: number | null; maximoEur: number | null }
  | { tipo: 'sin_franquicia' }
export type Condicion = {
  literal: string | null
  estado: EstadoCobertura | null
  limite: Limite | null
  sublimites: { concepto: string; limite: Limite; cita: string }[] | null
  franquicia: Franquicia | null
  notas: string | null
  cita: string | null
  pagina: number | null
  origen: 'ia' | 'humano'
}
export type ValorCitado = { valor: number; cita: string; pagina: number | null }
export type ValoresPresupuesto = {
  primaTotalEur: ValorCitado | null
  primaNetaEur: ValorCitado | null
  capitales: Record<string, ValorCitado>
  franquiciaGeneral: { franquicia: Franquicia; cita: string; pagina: number | null } | null
}
export type AvisoExtraccion = { donde: string; motivo: string; detalle: string | null }

export type FichaResumen = {
  id: string; compania: string; ramo: string; producto: string; version: string | null; estado: string
  garantiasLeidas: number; avisos: number; validadaAt: string | null; actualizadaAt: string
}
export type FichaDetalle = FichaResumen & {
  condiciones: { garantias: Record<string, Condicion>; extras: { literal: string; cita: string; pagina: number | null }[] }
  avisosDetalle: AvisoExtraccion[]
  validadaPor: string | null
  catalogo: { clave: string; etiqueta: string; grupo: string; tipoValor: string }[]
  presupuestos: { tarificacionId: string; creadoEn: string; valores: ValoresPresupuesto; condicionadoCambiado: boolean | null; citasAusentes: string[] }[]
}
export type TarificacionConPdf = {
  tarificacionId: string; creadaEn: string; compania: string; ramo: string; producto: string | null; primaAnualEur: number | null
  tienePdf: boolean
  extraccion: { fichaId: string | null; textoLegible: boolean; avisos: number; condicionadoCambiado: boolean | null; actualizadaEn: string } | null
}

export const ROTULO_ESTADO: Record<EstadoCobertura, string> = { incluida: 'Incluida', opcional: 'Opcional', excluida: 'Excluida' }
export const ROTULO_GRUPO: Record<string, string> = { danos: 'Daños', rc: 'Responsabilidad civil', asistencia: 'Asistencia y servicios', juridica: 'Jurídico', otros: 'Otros' }

const pct = (n: number) => `${String(n).replace('.', ',')} %`

export function textoLimite(l: Limite | null): string | null {
  if (!l) return null
  if (l.tipo === 'importe') return eur(l.eur)
  if (l.tipo === 'primer_riesgo') return `${eur(l.eur)} a primer riesgo`
  return l.sobre ? `${pct(l.pct)} de ${l.sobre}` : pct(l.pct)
}

export function textoFranquicia(f: Franquicia | null): string | null {
  if (!f) return null
  if (f.tipo === 'sin_franquicia') return 'Sin franquicia'
  if (f.tipo === 'importe') return eur(f.eur)
  const topes = [f.minimoEur !== null ? `mín. ${eur(f.minimoEur)}` : null, f.maximoEur !== null ? `máx. ${eur(f.maximoEur)}` : null].filter(Boolean)
  return topes.length ? `${pct(f.pct)} (${topes.join(', ')})` : pct(f.pct)
}

const MOTIVO: Record<string, string> = {
  cita_ausente: 'la IA no dio cita',
  cita_no_encontrada: 'la cita no está en el PDF',
  importe_no_literal: 'el importe no está escrito en su cita',
  porcentaje_no_literal: 'el porcentaje no está escrito en su cita',
  primer_riesgo_no_literal: '«a primer riesgo» no figura en la cita',
  sin_franquicia_no_literal: '«sin franquicia» no figura en la cita',
  nota_no_literal: 'la nota no es texto literal del PDF',
  clave_duplicada: 'garantía repetida',
  forma_invalida: 'respuesta sin forma',
  pdf_sin_texto: 'el PDF no tiene texto (escaneo)',
  producto_desconocido: 'no consta el producto: no se ha creado ficha',
}

export function textoAviso(a: AvisoExtraccion): string {
  return `${a.donde}: ${MOTIVO[a.motivo] ?? a.motivo}${a.detalle ? ` («${a.detalle}»)` : ''}`
}

/** Estado de la extracción de una tarificación, para la etiqueta de la tarjeta. */
export function estadoExtraccion(t: TarificacionConPdf): { texto: string; tono: 'neutral' | 'positivo' | 'aviso' | 'info' } {
  if (!t.tienePdf) return { texto: 'Sin PDF del proyecto', tono: 'neutral' }
  const e = t.extraccion
  if (!e) return { texto: 'Coberturas sin extraer', tono: 'info' }
  if (!e.textoLegible) return { texto: 'PDF sin texto: sin leer', tono: 'aviso' }
  if (e.condicionadoCambiado) return { texto: 'El condicionado ha cambiado', tono: 'aviso' }
  if (e.avisos > 0) return { texto: `Extraídas con ${e.avisos} aviso${e.avisos === 1 ? '' : 's'}`, tono: 'aviso' }
  return { texto: 'Coberturas extraídas', tono: 'positivo' }
}

/** Respuesta del puerto → dato o mensaje legible. `sin_tabla`/`sin_configurar`/red con su texto. */
export function leerRespuesta<T>(status: number, json: unknown, extraer: (j: Record<string, unknown>) => T | null): { ok: true; dato: T } | { ok: false; mensaje: string } {
  const j = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (status >= 200 && status < 300 && j) {
    const d = extraer(j)
    if (d !== null) return { ok: true, dato: d }
    return { ok: false, mensaje: 'La respuesta no tiene la forma esperada.' }
  }
  if (j?.estado === 'sin_tabla') return { ok: false, mensaje: typeof j.mensaje === 'string' ? j.mensaje : 'Las fichas aún no están activadas (falta el SQL).' }
  if (j?.estado === 'sin_configurar') return { ok: false, mensaje: 'Falta configurar el puerto de asegura (ASEGURA_OPERADOR_SECRET).' }
  if (j?.motivo === 'red' || status === 502 && !j?.mensaje) return { ok: false, mensaje: 'No se ha podido hablar con asegura (red).' }
  if (typeof j?.mensaje === 'string') return { ok: false, mensaje: j.mensaje }
  if (status === 404) return { ok: false, mensaje: 'No encontrada.' }
  return { ok: false, mensaje: `No se ha podido leer (${status}).` }
}

/** «3.500,00», «3500», «3500.5» → número positivo; lo demás `null`. */
export function numeroFormulario(s: string): number | null {
  let t = s.replace(/[€%\s ]/g, '')
  if (t === '') return null
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^\d+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

export type FormularioEdicion = {
  estado: '' | EstadoCobertura
  limiteTipo: '' | Limite['tipo']
  limiteValor: string
  limiteSobre: string
  franquiciaTipo: '' | Franquicia['tipo']
  franquiciaValor: string
  franquiciaMinimo: string
  franquiciaMaximo: string
  notas: string
}

export function formularioDe(c: Condicion | undefined): FormularioEdicion {
  const l = c?.limite ?? null
  const f = c?.franquicia ?? null
  const num = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))
  return {
    estado: c?.estado ?? '',
    limiteTipo: l?.tipo ?? '',
    limiteValor: l ? num(l.tipo === 'porcentaje' ? l.pct : l.eur) : '',
    limiteSobre: l?.tipo === 'porcentaje' ? (l.sobre ?? '') : '',
    franquiciaTipo: f?.tipo ?? '',
    franquiciaValor: f && f.tipo !== 'sin_franquicia' ? num(f.tipo === 'porcentaje' ? f.pct : f.eur) : '',
    franquiciaMinimo: f?.tipo === 'porcentaje' ? num(f.minimoEur) : '',
    franquiciaMaximo: f?.tipo === 'porcentaje' ? num(f.maximoEur) : '',
    notas: c?.notas ?? '',
  }
}

/** Formulario → cuerpo `edicion` del PATCH. Campo vacío = `null` («no consta»), nunca 0. */
export function edicionDeFormulario(f: FormularioEdicion): { ok: true; edicion: Record<string, unknown> } | { ok: false; mensaje: string } {
  let limite: Limite | null = null
  if (f.limiteTipo !== '') {
    const n = numeroFormulario(f.limiteValor)
    if (n === null) return { ok: false, mensaje: 'El límite necesita un número mayor que 0.' }
    if (f.limiteTipo === 'porcentaje') {
      if (n > 100) return { ok: false, mensaje: 'Un porcentaje no pasa de 100.' }
      limite = { tipo: 'porcentaje', pct: n, sobre: f.limiteSobre.trim() || null }
    } else limite = { tipo: f.limiteTipo, eur: n }
  }
  let franquicia: Franquicia | null = null
  if (f.franquiciaTipo === 'sin_franquicia') franquicia = { tipo: 'sin_franquicia' }
  else if (f.franquiciaTipo !== '') {
    const n = numeroFormulario(f.franquiciaValor)
    if (n === null) return { ok: false, mensaje: 'La franquicia necesita un número mayor que 0 (o «Sin franquicia»).' }
    if (f.franquiciaTipo === 'porcentaje') {
      if (n > 100) return { ok: false, mensaje: 'Un porcentaje no pasa de 100.' }
      franquicia = { tipo: 'porcentaje', pct: n, minimoEur: numeroFormulario(f.franquiciaMinimo), maximoEur: numeroFormulario(f.franquiciaMaximo) }
    } else franquicia = { tipo: 'importe', eur: n }
  }
  return { ok: true, edicion: { estado: f.estado === '' ? null : f.estado, limite, franquicia, notas: f.notas.trim() || null } }
}
