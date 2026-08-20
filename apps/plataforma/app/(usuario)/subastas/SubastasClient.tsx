'use client'
// Pantalla del radar de subastas. Sigue el patrón de `/empresas` (tokens de
// tema, 50 filas + «Ver más», controles de 44 px) y NO el de `/concursos`, que
// hardcodea colores y se vuelve ilegible en modo oscuro.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { eur } from '@/lib/dinero'
import { estadoDocumentacion, resumenDocumentos, type DocumentoAdjunto } from '@/lib/subastas/resumen-docs'
import { calcularCoste, direccionCatastro, esCasa, esDireccionPostal, estadoPujaMinima, titularCargas, umbralesPuja, urlFichaCatastro, urlGoogleMaps, urlStreetView, viviendaHabitualDeNotas, type ParamsCoste, type SubastaInmueble } from '@central/module-subastas'
import MapaSubastas from './MapaSubastas'

const PAGE = 50
const PROVINCIAS = ['Sevilla', 'Huelva', 'Cádiz', 'Asturias']

interface Oportunidad {
  puntuacion: number | null
  descuento: number | null
  deposito: number | null
  valorMercado: number | null
  origenValor?: 'tasacion' | 'valor_referencia' | 'comparables' | null
  /** El €/m² sale de la mediana de un municipio grande: orienta, no tasa. */
  valorOrientativo?: boolean
  /**
   * `comisionCompra` es OPCIONAL a propósito: el snapshot del radar solo guarda
   * el coste total, y ahí no se sabe cuánto era comisión. `undefined` = «este
   * camino no trae el desglose» y la línea no se pinta — un 0 diría «no hay
   * comisión», que en un lote de portal privado sería falso.
   */
  coste: { total: number; impuestoTransmision: number; impuestoConcepto: string; baseImponible: number; comisionCompra?: number }
  motivos: string[]
  avisos: string[]
}
interface Subasta {
  dedupeKey: string
  /** `'boe'` es la única fuente con ficha documental (adjuntos en PDF). */
  fuente?: string | null
  identificador?: string | null
  tipo: string
  provincia?: string | null
  municipio?: string | null
  direccion?: string | null
  direccionCatastro?: string | null
  lat?: number | null
  lon?: number | null
  geoPrecision?: string | null
  refCatastral?: string | null
  codigoPostal?: string | null
  anioConstruccion?: number | null
  usoCatastral?: string | null
  superficieCatastro?: number | null
  descripcion?: string | null
  url?: string | null
  fechaFin?: string | null
  valorSubasta?: number | null
  tasacion?: number | null
  /** `0` = «Sin puja mínima» declarado · `null` = no publicada (tres estados). */
  pujaMinima?: number | null
  /** Tramo entre pujas del portal (las pujas van alineadas desde la salida). */
  tramos?: number | null
  /** Deuda del procedimiento: techo probable de la puja del ejecutante. */
  cantidadReclamada?: number | null
  /** Mejor puja vista por el vigía de seguidas. `null` = no publicada. */
  mejorPuja?: number | null
  /** Valor de referencia del Catastro (base imponible del ITP si es mayor). */
  valorReferencia?: number | null
  ejecutado?: string | null
  situacionPosesoria?: string
  superficie?: number | null
  superficieOrigen?: 'catastro' | 'anuncio' | null
  tipoBien?: string | null
  dormitorios?: number | null
  banos?: number | null
  planta?: string | null
  cargas?: number | null
  cargasTexto?: string | null
  cargasConocidas?: boolean
}
interface Rendimiento { ingresoAnual: number; yieldBruto: number; aniosRecuperacion: number }
interface PuntoAnalisis { clave: string; nivel: 'verde' | 'ambar' | 'rojo'; detalle: string }
/** Todo lo que se sabe de la DOCUMENTACIÓN de una subasta (no del inmueble). */
interface Documental {
  semaforo?: string | null
  analisis?: PuntoAnalisis[] | null
  notasEdicto?: string | null
  documentos?: DocumentoAdjunto[] | null
  /**
   * Lo que el Portal del BOE deja ver sin sesión iniciada. Con muro, un
   * `documentos: []` NO significa que la subasta no adjunte nada.
   */
  documentosMuro?: 'ninguno' | 'parcial' | 'total' | null
  /** Anotaciones de embargo pasadas de plazo (art. 86 LH). `null` = ninguna. */
  caducidad?: { cuantas: number; importeSiCaducan: number | null } | null
}
/** Techo de puja calculado, con su viabilidad legal (tres estados por flag). */
interface PujaMaximaUI {
  importe: number | null
  admisible: boolean | null
  aprobacionDirecta: boolean | null
  notas: string[]
}
/** Coste simulado a un remate distinto del 100% de la salida (informativo). */
interface EscenarioUI { origen: string; pct: number; remate: number; total: number; etiqueta: string }
interface Resultado {
  subasta: Subasta; oportunidad: Oportunidad; rendimiento?: Rendimiento | null
  dormitorios?: number | null; pujaMaxima?: PujaMaximaUI | null; escenarios?: EscenarioUI[]; notasEdicto?: string | null
  tipoBien?: string | null; esPlaya?: boolean; margenFlip?: number | null
  margenFlipPct?: number | null; flipApto?: boolean; semaforo?: string | null
  analisis?: PuntoAnalisis[] | null; documentos?: DocumentoAdjunto[] | null
  documentosMuro?: 'ninguno' | 'parcial' | 'total' | null
  caducidad?: { cuantas: number; importeSiCaducan: number | null } | null
  precioM2Zona?: number | null; muestraZona?: number | null; zonaPortal?: string | null
}
interface Filtros {
  tipo: string; playa: boolean; m2min: string; m2max: string; eurM2Max: string
  sinOcupadas: boolean; margenMin: string; semaforo: string; municipio: string
}
const FILTROS_VACIOS: Filtros = {
  tipo: 'all', playa: false, m2min: '', m2max: '', eurM2Max: '',
  sinOcupadas: false, margenMin: '', semaforo: '', municipio: '',
}
const TIPO_LABEL: Record<string, string> = {
  vivienda: '🏠 Vivienda', garaje: '🅿️ Garaje', local: '🏬 Local', nave: '🏭 Nave',
  parcela: '🧱 Suelo', finca_rustica: '🌾 Rústica', trastero: '📦 Trastero',
  edificio: '🏢 Edificio', otro: 'Otro',
}
const NIVEL_EMOJI: Record<string, string> = { verde: '🟢', ambar: '🟡', rojo: '🔴' }
interface Criterios {
  activo: boolean
  provincias: string[]
  palabras_clave: string[]
  precio_min: number | null
  precio_max: number | null
  descuento_min: number
  excluir_ocupadas: boolean
  /** Coste del dinero, en % tal cual se teclean. null = se paga al contado. */
  financia_pct?: number | null
  financia_tipo_anual?: number | null
  financia_meses?: number | null
  financia_comision?: number | null
}
interface FilaRadar {
  id: string
  dedupe_key: string
  subasta: Subasta
  puntuacion: number | null
  motivos: string[]
  avisos: string[]
  coste_total: string | number | null
  visto: boolean
  fecha_fin: string | null
  /** Análisis y documentación de HOY (del corpus vivo), no del snapshot. */
  doc?: Documental | null
  /** Escenarios de coste de HOY (solo si la subasta sigue en el corpus). */
  escenarios?: EscenarioUI[]
}
interface Tesoreria {
  origen: 'seguidas' | 'radar'
  plan: {
    total: number
    pico: number
    picoDesde: string | null
    picoSubastas: string[]
    tramos: Array<{ desde: string; hasta: string; importe: number; subastas: string[] }>
    deficit: number | null
    incompletos: string[]
  }
  saldo: { total: number; cuentas: number; masAntiguo: string | null; desactualizado: boolean }
}
interface Chollo {
  comparable: {
    portal?: string
    refAnuncio: string
    titulo: string
    zona: string | null
    precio: number
    superficie: number | null
    habitaciones: number | null
    precioM2: number | null
    url: string | null
    precioInicial?: number | null
    precioAnterior?: number | null
    bajadas?: number
    vistoDesde?: string | null
    anunciante?: string | null
    esParticular?: boolean | null
    aReformar?: boolean | null
  }
  zona: string
  precioM2Zona: number
  muestra: number
  descuento: number
  sospechoso: boolean
  /** Descuento tras pagar levantar la casa (solo anuncios con pinta de obra). */
  descuentoNeto?: number | null
  fuente?: 'portal' | 'alertas'
  antiguedadDias?: number | null
  antiguedadCapada?: boolean
  velocidad?: { diasMediana: number; muestra: number } | null
  rendimiento?: Rendimiento | null
  /** 🌊 En zona preferente (Asturias/Cantabria/Islantilla). */
  preferente?: boolean
}
/** Lente 🌊: casas ≤230k de playa preferente, sin señales de obra. */
interface Preferente {
  comparable: Chollo['comparable']
  costa: string
  /** null = sin referencia €/m² de su zona todavía (no «a precio de mercado»). */
  referencia: { zona: string; precioM2Zona: number; muestra: number; descuento: number; fuente?: string } | null
  antiguedadDias?: number | null
  antiguedadCapada?: boolean
  rendimiento?: Rendimiento | null
}
/** Subasta con señal de oportunidad, en versión COMPACTA para la vista unificada. */
interface SubastaChollo {
  dedupeKey: string
  identificador: string
  municipio: string | null
  provincia: string | null
  valorSubasta: number | null
  superficie: number | null
  /** Descuento vs valor de mercado (tanto por uno). null = sin referencia. */
  descuento: number | null
  margenFlipPct: number | null
  flipApto: boolean
  tipoBien: string | null
  ocupada: boolean
  fechaFin: string | null
  url: string | null
  /** 🌊 vivienda en zona preferente. */
  preferente: boolean
}
interface Inicial {
  resultados: Resultado[]
  total: number
  criterios: Criterios
  radar: FilaRadar[]
  tesoreria: Tesoreria | null
  chollos: Chollo[]
  /** Preferentes 🌊 que NO llegan a chollo (los que sí, van en `chollos` etiquetados). */
  preferentes?: Preferente[]
  /** Subastas con señal (descuento vs mercado o flip) para la vista unificada. */
  subastasChollo?: SubastaChollo[]
  ingresoDorm: { porDormitorio: number; pisos: number } | null
  indice?: { anual: number | null; trimestral: number | null; etiqueta: string | null } | null
  calibracion?: Array<{ provincia: string; muestra: number; adjudicadas: number; desiertas: number; ratioMediano: number | null; muestraRatio: number }>
  pulso?: { anuncios: number; conBajada: number; pctConBajada: number; recorteMedio: number | null } | null
  /** Contraste de nuestra puja máxima contra el remate real. `lectura` null = sin muestra. */
  calibPuja?: { muestra: number; porEncima: number; porDebajo: number; ratioMediano: number | null; lectura: string | null } | null
}

const card: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 'var(--radius, 10px)',
  background: 'var(--surface)', padding: 14, marginBottom: 12,
}
const control: React.CSSProperties = {
  minHeight: 44, padding: '0 10px', borderRadius: 'var(--radius, 10px)',
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
}
const boton = (activo = false): React.CSSProperties => ({
  minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
  background: activo ? 'var(--primary)' : 'var(--surface)',
  color: activo ? '#fff' : 'var(--text)',
})

/** Chip homogéneo de la tarjeta de oportunidad: fuente, señales y descuento. */
type TonoChip = 'ok' | 'warn' | 'neg' | 'info' | 'neutro'
interface Chip { tono: TonoChip; texto: string }
const CHIP_TONOS: Record<TonoChip, { bg: string; fg: string }> = {
  ok:     { bg: 'var(--positive-bg)', fg: 'var(--positive)' },
  warn:   { bg: 'var(--warning-bg)',  fg: 'var(--warning)' },
  neg:    { bg: 'var(--negative-bg)', fg: 'var(--negative)' },
  info:   { bg: 'var(--info-bg)',     fg: 'var(--info)' },
  neutro: { bg: 'var(--bg)',          fg: 'var(--muted)' },
}
function ChipUI({ tono = 'neutro', children }: { tono?: TonoChip; children: React.ReactNode }) {
  const t = CHIP_TONOS[tono]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                   borderRadius: 999, fontSize: 12, fontWeight: 600, lineHeight: '16px',
                   background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}
const precioGrande: React.CSSProperties = { fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }
const tituloCard: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35, margin: '4px 0 0' }
const lineaZona: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }
const resumenTapa: React.CSSProperties = { cursor: 'pointer', fontSize: 13, color: 'var(--muted)', minHeight: 44, display: 'flex', alignItems: 'center' }

/**
 * UNA sola anatomía para chollos de portal, preferentes 🌊 y subastas — antes
 * había tres tarjetas distintas y la pestaña se veía destartalada (queja de
 * Alberto, 09/08/2026). Orden de lectura móvil: precio grande + descuento →
 * título → zona/m² → chips → evidencia €/m² (SIEMPRE visible, honestidad) →
 * «Más datos» plegado → acciones. La honestidad no se borra: se pliega.
 */
function TarjetaOportunidad(p: {
  precio: number | null
  precioNota?: string
  descuento?: { etiqueta: string; tono: TonoChip } | null
  titulo: string
  zona?: string | null
  metros?: string | null
  chips: Chip[]
  evidencia?: string | null
  detalles?: React.ReactNode
  acento?: boolean
  acciones?: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div style={{ ...card, ...(p.acento ? { borderLeft: '4px solid var(--info)' } : {}) }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={precioGrande}>
          {p.precio != null ? eur(p.precio) : 'Sin precio publicado'}
          {p.precioNota && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}> {p.precioNota}</span>}
        </span>
        {p.descuento && <ChipUI tono={p.descuento.tono}>{p.descuento.etiqueta}</ChipUI>}
      </div>
      <p style={tituloCard}>{p.titulo}</p>
      {(p.zona || p.metros) && (
        <p style={lineaZona}>{[p.zona && `📍 ${p.zona}`, p.metros].filter(Boolean).join(' · ')}</p>
      )}
      {p.chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {p.chips.map((c, i) => <ChipUI key={i} tono={c.tono}>{c.texto}</ChipUI>)}
        </div>
      )}
      {p.evidencia && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>{p.evidencia}</p>}
      {p.detalles && (
        <details style={{ marginTop: 4 }}>
          <summary style={resumenTapa}>Más datos</summary>
          {p.detalles}
        </details>
      )}
      {p.acciones && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{p.acciones}</div>}
      {p.extra}
    </div>
  )
}

/** Chips por origen: la FUENTE siempre es el primero (deja de ser texto suelto). */
function chipsDeChollo(ch: Chollo): Chip[] {
  const out: Chip[] = [{ tono: 'neutro', texto: (ch.comparable.portal ?? 'idealista') === 'fotocasa' ? 'Fotocasa' : 'Idealista' }]
  if (ch.preferente) out.push({ tono: 'info', texto: '🌊 Playa' })
  if (ch.comparable.esParticular) out.push({ tono: 'ok', texto: '👤 Particular' })
  const b = ch.comparable.bajadas ?? 0
  if (b > 0) out.push({ tono: 'ok', texto: `⬇️ ${b} bajada${b === 1 ? '' : 's'}` })
  if (ch.comparable.aReformar || ch.descuentoNeto != null) out.push({ tono: 'warn', texto: '🔨 Obra' })
  return out
}
function chipsDePreferente(p: Preferente): Chip[] {
  const out: Chip[] = [{ tono: 'neutro', texto: (p.comparable.portal ?? 'idealista') === 'fotocasa' ? 'Fotocasa' : 'Idealista' }]
  if (p.comparable.esParticular) out.push({ tono: 'ok', texto: '👤 Particular' })
  const b = p.comparable.bajadas ?? 0
  if (b > 0) out.push({ tono: 'ok', texto: `⬇️ ${b} bajada${b === 1 ? '' : 's'}` })
  return out
}
function chipsDeSubasta(s: SubastaChollo): Chip[] {
  const out: Chip[] = [{ tono: 'neutro', texto: '⚖️ Subasta' }]
  if (s.preferente) out.push({ tono: 'info', texto: '🌊 Playa' })
  if (s.ocupada) out.push({ tono: 'neg', texto: '⚠️ Ocupada' })
  const cierre = s.fechaFin ? new Date(s.fechaFin).toLocaleDateString('es-ES') : null
  if (cierre) out.push({ tono: 'warn', texto: `⏰ Cierra ${cierre}` })
  return out
}

function fecha(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES')
}

/** De dónde sale el valor con el que se compara. Nunca se oculta. */
const ORIGEN_VALOR: Record<string, string> = {
  tasacion: 'tasación publicada',
  valor_referencia: 'valor de referencia del Catastro',
  comparables: '⚠️ ESTIMADO con anuncios de la zona, no es una tasación',
}

/** Semáforo de la puntuación. `null` se pinta distinto a 0: no es lo mismo. */
function Puntuacion({ v }: { v: number | null }) {
  if (v == null) {
    return <span style={{ fontSize: 12, color: 'var(--muted)' }}>sin datos para puntuar</span>
  }
  const color = v >= 40 ? 'var(--positive, #15803d)' : v >= 20 ? 'var(--warning, #b45309)' : 'var(--muted)'
  return <span style={{ fontWeight: 700, color }}>{v}/100</span>
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })

/**
 * Dinero que hay que tener bloqueado para poder pujar. Lo que importa NO es la
 * suma de depósitos sino el máximo simultáneo: los que no se solapan reutilizan
 * el mismo dinero.
 */
function PanelTesoreria({ t }: { t: Tesoreria }) {
  const { plan, saldo } = t
  // `incompletos` = compromisos que NO se han podido calcular (el BOE aún no
  // publica depósito ni valor de subasta: 12 de las 34 vivas el 30/07/2026).
  // Con pico 0 e incompletos, ocultar el panel entero hacía leer «no tienes
  // nada comprometido» — que es lo contrario de lo que se sabe. Solo se
  // esconde cuando de verdad no hay nada que contar.
  const sinCalcular = plan.incompletos.length
  if (plan.pico <= 0 && sinCalcular === 0) return null
  const calculado = plan.pico > 0
  const falta = calculado && plan.deficit != null && plan.deficit > 0

  return (
    <div style={{ ...card, borderLeft: `4px solid ${falta ? 'var(--danger, #dc2626)' : calculado ? 'var(--success, #16a34a)' : 'var(--warning, #d97706)'}` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline' }}>
        <strong style={{ color: 'var(--text)', fontSize: 15 }}>💰 Depósitos para pujar</strong>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {t.origen === 'seguidas'
            ? 'de las subastas que sigues'
            : 'simulación: si pujaras en todo lo que ha casado con tu radar'}
        </span>
      </div>

      {calculado ? (
        <p style={{ margin: '8px 0 0', color: 'var(--text)', fontSize: 14 }}>
          Necesitas <strong>{eur(plan.pico)}</strong> bloqueados a la vez
          {plan.picoDesde && ` desde el ${fechaCorta(plan.picoDesde)}`}
          {plan.picoSubastas.length > 1 && ` (${plan.picoSubastas.length} subastas solapadas)`}.
        </p>
      ) : (
        <p style={{ margin: '8px 0 0', color: 'var(--text)', fontSize: 14 }}>
          🟠 No se puede calcular cuánto tendrías bloqueado: {sinCalcular === 1 ? 'la subasta' : `las ${sinCalcular} subastas`} en
          juego {sinCalcular === 1 ? 'no publica' : 'no publican'} todavía depósito ni valor de subasta.
          <strong> No es 0€</strong> — es un dato que el BOE aún no da.
        </p>
      )}
      {calculado && plan.total > plan.pico && (
        <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          La suma de todos los depósitos es {eur(plan.total)}, pero no coinciden todos en el tiempo.
        </p>
      )}

      {calculado && (
        <p style={{ margin: '6px 0 0', fontSize: 14, color: falta ? 'var(--danger, #dc2626)' : 'var(--text)' }}>
          {saldo.cuentas === 0
            ? '⚠️ No hay saldo de cuentas corrientes con el que contrastar.'
            : falta
              ? `🚨 Disponible ${eur(saldo.total)} → faltan ${eur(plan.deficit!)}.`
              : `✅ Disponible ${eur(saldo.total)}, suficiente.`}
        </p>
      )}
      {saldo.desactualizado && saldo.masAntiguo && (
        <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Ojo: el saldo más antiguo que se ha sumado es del {fechaCorta(saldo.masAntiguo)}.
        </p>
      )}

      {plan.tramos.length > 1 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)', minHeight: 44, display: 'flex', alignItems: 'center' }}>
            Calendario del dinero inmovilizado
          </summary>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
            {plan.tramos.map((tr) => (
              <li key={tr.desde}>
                {fechaCorta(tr.desde)} → {fechaCorta(tr.hasta)}: <strong>{eur(tr.importe)}</strong> ({tr.subastas.join(', ')})
              </li>
            ))}
          </ul>
        </details>
      )}
      {plan.incompletos.length > 0 && (
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Sin depósito ni fecha de cierre publicados: {plan.incompletos.join(', ')}.
        </p>
      )}
    </div>
  )
}

/**
 * Yield turístico estimado con los pisos PROPIOS. Siempre con el caveat: los
 * pisos de referencia son de Sevilla capital — fuera de ahí es extrapolación.
 */
function LineaRendimiento({ r, dormitorios }: { r: Rendimiento | null | undefined; dormitorios?: number | null }) {
  if (!r) return null
  return (
    <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
      🏨 Si rindiera como tus pisos de Sevilla{dormitorios ? ` (${dormitorios} dorm.)` : ''}: ~{eur(r.ingresoAnual)}/año
      netos → se paga en <strong>{r.aniosRecuperacion} años</strong> ({(r.yieldBruto * 100).toFixed(1)}% bruto).
      <em> Estimación, no proyección.</em>
    </p>
  )
}

/**
 * Subasta en la vista unificada de Oportunidades, con la anatomía común de
 * `TarjetaOportunidad`. El enlace va a su ficha completa en la pestaña
 * «Todas» — FichaSubasta es demasiado pesada para montarla en una lista
 * (regla de rendimiento).
 */
function TarjetaSubasta({ s, onVerFicha }: { s: SubastaChollo; onVerFicha: () => void }) {
  const descuento = s.descuento != null && s.descuento > 0
    ? { etiqueta: `−${Math.round(s.descuento * 100)}% vs mercado`, tono: 'ok' as TonoChip }
    : s.margenFlipPct != null
      ? { etiqueta: `🔨 flip ~${Math.round(s.margenFlipPct)}%`, tono: 'ok' as TonoChip }
      : null
  return (
    <TarjetaOportunidad
      precio={s.valorSubasta}
      precioNota="salida"
      descuento={descuento}
      titulo={s.identificador}
      zona={[s.municipio, s.provincia].filter(Boolean).join(' · ') || null}
      metros={[s.superficie != null ? `${s.superficie} m²` : null, s.tipoBien].filter(Boolean).join(' · ') || null}
      chips={chipsDeSubasta(s)}
      acento={s.preferente}
      acciones={
        <>
          <button onClick={onVerFicha} style={boton()}>Ver ficha completa →</button>
          {s.url && (
            <a href={s.url} target="_blank" rel="noreferrer"
               style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              Portal oficial
            </a>
          )}
        </>
      }
    />
  )
}

/**
 * Cómo es el inmueble: qué tipo de bien es, cuántos m² tiene y cómo está
 * distribuido. La ficha ya traía la ubicación y los datos del Catastro
 * (antigüedad, uso, CP); esto es lo que faltaba — estaba en la BD y solo se
 * usaba por dentro para calcular el €/m² y el yield.
 *
 * Los m² del Catastro y los de la escritura discrepan a menudo, así que el
 * origen va pegado a la cifra. Cuando el anuncio no publica nada se dice —
 * callar parecería un fallo de la pantalla, que es justo la duda que generó esto.
 *
 * `plantaAparte` = la dirección del Catastro ya está pintando la planta arriba;
 * repetirla sería ruido.
 */
function Caracteristicas({ s, plantaAparte }: { s: Subasta; plantaAparte?: boolean }) {
  const partes: string[] = []
  if (s.tipoBien && TIPO_LABEL[s.tipoBien]) partes.push(TIPO_LABEL[s.tipoBien])
  if (s.superficie != null && s.superficie > 0) {
    partes.push(`${s.superficie.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m²${s.superficieOrigen === 'catastro' ? ' (Catastro)' : s.superficieOrigen === 'anuncio' ? ' (escritura)' : ''}`)
  }
  if (s.dormitorios != null) partes.push(`${s.dormitorios} dorm.`)
  if (s.banos != null) partes.push(`${s.banos} baño${s.banos === 1 ? '' : 's'}`)
  if (s.planta && !plantaAparte) partes.push(`planta ${s.planta}`)

  if (partes.length === 0) {
    return (
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
        🏚️ El anuncio no publica las características del inmueble (ni m², ni distribución).
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', margin: '8px 0 0', fontSize: 13, color: 'var(--text)' }}>
      {partes.map((p, i) => <span key={i}>{p}</span>)}
    </div>
  )
}

/**
 * Resumen de CARGAS + documentación de la subasta.
 *
 * Vive dentro de `FichaSubasta` a propósito: antes el semáforo y las notas del
 * edicto solo se pintaban en la pestaña «Todas» (iban en su `extra`), así que
 * en 📡 Radar —la pestaña que Alberto mira— una ficha con cargas conocidas,
 * embargo anotado y cuatro notas del edicto salía muda. En una subasta las
 * cargas que subsisten se SUMAN al precio: es el dato que decide si se puja.
 *
 * El titular va siempre visible (una línea); el detalle en un `<details>`
 * cerrado (regla de rendimiento del repo).
 */
function ResumenDocumental({ s, d }: { s: Subasta; d?: Documental | null }) {
  const notas = (d?.notasEdicto ?? '').split('\n').map((n) => n.trim()).filter(Boolean)
  // OJO: `null` = la ficha aún no se ha revisado, `[]` = revisada y sin adjuntos.
  // Colapsarlos en `[]` es lo que hacía que una subasta con edicto y
  // certificación de cargas publicados dijera «sin documentos adjuntos».
  const docs = d?.documentos ?? null
  // Solo el BOE publica adjuntos: en los lotes de la Junta un NULL no está
  // pendiente de nada. Sin `fuente` (snapshots antiguos del radar) se asume BOE
  // porque ante la duda toca decir «sin revisar», no negar los adjuntos.
  const publicaAdjuntos = (s.fuente ?? 'boe') === 'boe'
  // 🚨 El Portal enseña el bloque «Información complementaria» —donde vive la
  // lista de documentos— solo a quien ha iniciado sesión en unas subastas y no
  // en otras. Sin esto, ese `[]` de un cron anónimo se pintaba como «Cargas no
  // publicadas: pide la certificación registral» teniendo la certificación
  // colgada de la ficha (20/08/2026, SUB-JA-2026-262097).
  const muro = d?.documentosMuro ?? 'ninguno'
  const sinRevisar = estadoDocumentacion(docs, publicaAdjuntos, muro) === 'sin_revisar'
  const puntos = d?.analisis ?? []
  const cargasTexto = (s.cargasTexto ?? '').trim()

  // Titular: qué pasa con las cargas, sin abrir nada. Cinco estados, no tres —
  // «no lo hemos leído» y «el BOE no lo publica» mandan a sitios distintos.
  const titular = titularCargas({
    cargas: s.cargas,
    cargasConocidas: s.cargasConocidas,
    documentos: docs,
    publicaAdjuntos,
    muro,
  })

  // Solo se calla cuando no hay NADA que decir: cargas leídas y sin nada que
  // subsista. Un «no se sabe» siempre se pinta (antes `cargasConocidas`
  // `undefined` caía en el 🟢 y la ficha afirmaba que no había cargas).
  if (titular.estado === 'sin_cargas' && !cargasTexto && notas.length === 0 && !docs?.length && puntos.length === 0 && muro === 'ninguno') {
    return null
  }

  const resumenDocs = resumenDocumentos(docs, publicaAdjuntos, muro)

  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
        ⚖️ {titular.emoji} {titular.texto}
        {titular.importe != null && <strong> {eur(titular.importe)}</strong>}
      </p>
      {/* El PDF que resuelve la duda, a un toque: decirle «pide la certificación
          registral» teniéndola enlazada aquí mismo es mandarlo al Registro para
          nada. Botón de 44 px (regla táctil del repo). */}
      {/* Con muro no hay PDF que enlazar —no nos lo enseñan—, pero sí la ficha:
          el trabajo de Alberto es iniciar sesión ahí, no ir al Registro. */}
      {titular.estado === 'ocultas_tras_login' && s.identificador && (
        <p style={{ margin: '4px 0 0' }}>
          <a
            href={`https://subastas.boe.es/detalleSubasta.php?idSub=${encodeURIComponent(s.identificador)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44,
              fontSize: 13, color: 'var(--primary)', textDecoration: 'underline',
            }}
          >
            🔐 Abrir la ficha del Portal e iniciar sesión
          </a>
        </p>
      )}
      {titular.estado === 'publicadas_sin_extraer' && titular.documento?.url && (
        <p style={{ margin: '4px 0 0' }}>
          <a
            href={titular.documento.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44,
              fontSize: 13, color: 'var(--primary)', textDecoration: 'underline',
            }}
          >
            📄 Abrir la certificación de cargas del BOE
          </a>
        </p>
      )}
      {/* La cifra de arriba es la CONSERVADORA. Esta línea es una hipótesis a
          confirmar, nunca un descuento: por eso va debajo y sin sustituirla. */}
      {d?.caducidad && (
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          ⏳ {d.caducidad.cuantas === 1 ? 'Una anotación de embargo lleva' : `${d.caducidad.cuantas} anotaciones de embargo llevan`}{' '}
          más de 4 años sin constancia de prórroga: {d.caducidad.cuantas === 1 ? 'podría' : 'podrían'} estar
          caducada{d.caducidad.cuantas === 1 ? '' : 's'} (art. 86 LH)
          {d.caducidad.importeSiCaducan != null && <> y heredarías <strong>{eur(d.caducidad.importeSiCaducan)}</strong></>}.
          {' '}Sin confirmar — pide nota simple actualizada.
        </p>
      )}
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text)', minHeight: 36, display: 'flex', alignItems: 'center' }}>
          📑 Cargas y documentación{d?.semaforo ? ` ${NIVEL_EMOJI[d.semaforo] ?? ''}` : ''} — {resumenDocs}
        </summary>

        {puntos.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
            {puntos.map((pt) => (
              <li key={pt.clave}>{NIVEL_EMOJI[pt.nivel]} {pt.detalle}</li>
            ))}
          </ul>
        )}

        {/* Texto literal de cargas de la ficha/certificación: es la fuente, no
            un resumen nuestro, y por eso se muestra entero. */}
        {cargasTexto && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            ⚖️ <strong>Cargas (texto oficial):</strong> {cargasTexto}
          </p>
        )}

        {notas.map((n) => (
          <p key={n} style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text)' }}>📄 {n}</p>
        ))}

        {docs && docs.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>📎 Documentación adjunta a la subasta:</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {docs.map((doc) => (
                <li key={doc.url} style={{ marginBottom: 4 }}>
                  <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>{doc.titulo}</a>
                  {doc.legible === false && <span style={{ color: 'var(--muted)' }}> · escaneado, léelo a mano</span>}
                  {doc.legible == null && <span style={{ color: 'var(--muted)' }}> · no analizado</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* El aviso se ata a que los adjuntos estén SIN REVISAR, no a que no
            haya notas: una ficha leída antes de existir la columna `documentos`
            tiene notas del edicto y la lista a NULL — y era justo ahí donde la
            ficha afirmaba en falso que la subasta no traía adjuntos. */}
        {sinRevisar && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            📎 Todavía no se han listado los adjuntos de esta ficha (se repasa a diario).
            Puede haber edicto y certificación de cargas publicados: ábrela en «Ver ficha oficial».
          </p>
        )}
      </details>
    </div>
  )
}

interface CambioNota { tipo: 'nueva' | 'desaparecida' | 'importe' | 'cancelada'; detalle: string }
interface RespuestaNota {
  cambios?: CambioNota[]
  importeSubsistente?: number | null
  fechaNota?: string | null
  ilegible?: boolean
  avisos?: string[]
  resumen?: string
  error?: string
}

const EMOJI_CAMBIO: Record<CambioNota['tipo'], string> = {
  nueva: '🆕', desaparecida: '🕳️', importe: '🔁', cancelada: '✅',
}

/**
 * «Nota simple viva»: la certificación que adjunta el juzgado es de hace años y
 * las cargas se mueven. Aquí se sube una nota simple recién pedida al registro y
 * el agente dice QUÉ HA CAMBIADO — es lo único que convierte el «podría estar
 * caducada» del art. 86 LH en un hecho.
 *
 * Va en un `<details>` con montaje perezoso: no monta ni el formulario hasta
 * que se abre.
 */
function NotaSimpleViva({ dedupeKey }: { dedupeKey: string }) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [r, setR] = useState<RespuestaNota | null>(null)
  const [texto, setTexto] = useState('')
  const [fichero, setFichero] = useState<File | null>(null)

  async function enviar() {
    if (!fichero && !texto.trim()) return
    setCargando(true)
    setR(null)
    try {
      const form = new FormData()
      form.append('dedupe_key', dedupeKey)
      if (fichero) form.append('fichero', fichero)
      if (texto.trim()) form.append('texto', texto.trim())
      const res = await fetch('/api/subastas/nota-simple', { method: 'POST', body: form })
      setR(await res.json())
    } catch (e: any) {
      setR({ error: e?.message ?? 'No se ha podido leer la nota' })
    } finally {
      setCargando(false)
    }
  }

  return (
    <details style={{ marginTop: 6 }} onToggle={(e) => setAbierto((e.currentTarget as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text)', minHeight: 36, display: 'flex', alignItems: 'center' }}>
        📄 ¿Tienes una nota simple actualizada? Comparo qué ha cambiado
      </summary>
      {abierto && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>
            La certificación de cargas del juzgado suele tener años. Sube la nota simple (PDF, incluso escaneado)
            o pega su texto: se lee con el mismo lector y se compara con lo que ya sabíamos de esta finca.
          </p>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFichero(e.target.files?.[0] ?? null)}
            style={{ ...control, width: '100%', maxWidth: '100%', padding: 8, display: 'block' }}
          />
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="…o pega aquí el texto de la nota simple"
            rows={4}
            style={{ ...control, width: '100%', maxWidth: '100%', marginTop: 8, padding: 8, fontFamily: 'inherit', fontSize: 13 }}
          />
          <button type="button" onClick={enviar} disabled={cargando || (!fichero && !texto.trim())} style={{ ...boton(true), marginTop: 8 }}>
            {cargando ? 'Leyendo la nota…' : '🔍 Comparar con la certificación'}
          </button>

          {r?.error && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--negative, #b91c1c)' }}>⚠️ {r.error}</p>}

          {r && !r.error && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
                {r.ilegible
                  ? '🟠 No se ha podido sacar ninguna carga de la nota.'
                  : r.importeSubsistente == null
                    ? '🟠 Según esta nota no se puede afirmar cuánto se hereda.'
                    : r.importeSubsistente > 0
                      ? `🔴 Según tu nota${r.fechaNota ? ` de ${r.fechaNota}` : ''}, hereda ${eur(r.importeSubsistente)}`
                      : `🟢 Según tu nota${r.fechaNota ? ` de ${r.fechaNota}` : ''}, no subsiste ninguna carga anterior`}
              </p>
              {r.cambios && r.cambios.length > 0 ? (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text)' }}>
                  {r.cambios.map((c, i) => (
                    <li key={i} style={{ marginBottom: 3 }}>{EMOJI_CAMBIO[c.tipo]} {c.detalle}</li>
                  ))}
                </ul>
              ) : (
                !r.ilegible && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                    Sin cambios respecto a lo que ya teníamos leído de la certificación.
                  </p>
                )
              )}
              {(r.avisos ?? []).map((a) => (
                <p key={a} style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>· {a}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </details>
  )
}

/**
 * Par etiqueta→valor del bloque «💶 Los números»: etiqueta pequeña arriba,
 * valor con peso debajo. La jerarquía la da la tipografía — antes todos los
 * importes eran chips/líneas del mismo peso y se confundían entre sí.
 */
function Dato({ etiqueta, sub, children }: { etiqueta: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{etiqueta}</div>
      <div style={{ fontSize: 14, color: 'var(--text)', marginTop: 2 }}>{children}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

/**
 * Umbrales de APROBACIÓN del remate. Corrige la confusión de «hay que pujar el
 * 70% de la deuda»: el 70% de la LEC es del VALOR DE SUBASTA, y la deuda entra
 * como vía alternativa (y como techo probable de la puja del banco). La deuda
 * reclamada y la puja mínima se pintan arriba, en «💶 Los números»; aquí queda
 * solo el detalle legal, plegado. Toda la lógica viene del helper puro
 * `umbralesPuja` (lo calcula `FichaSubasta` y lo comparte con ese bloque).
 */
function UmbralesPujaFicha({ u }: { u: ReturnType<typeof umbralesPuja> }) {
  if (u.umbrales.length === 0) return null
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
        ⚖️ Umbrales de aprobación del remate{u.regimen === 'judicial' ? ' (art. 670 LEC)' : ' (RGR)'}
      </summary>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text)', fontSize: 12, lineHeight: 1.5 }}>
        {u.umbrales.map((x) => <li key={x.clave}>{x.etiqueta}</li>)}
        {u.notas.map((n, i) => <li key={`n${i}`} style={{ color: 'var(--muted)' }}>{n}</li>)}
      </ul>
    </details>
  )
}

/** El `Subasta` del cliente, como lo espera la lógica pura del módulo. */
function aInmueble(s: Subasta): SubastaInmueble {
  return {
    dedupeKey: s.dedupeKey,
    fuente: (s.fuente ?? 'boe') as SubastaInmueble['fuente'],
    tipo: s.tipo as SubastaInmueble['tipo'],
    provincia: s.provincia,
    valorSubasta: s.valorSubasta,
    tasacion: s.tasacion,
    pujaMinima: s.pujaMinima,
    cantidadReclamada: s.cantidadReclamada,
    valorReferencia: s.valorReferencia,
    cargas: s.cargas,
    cargasTexto: s.cargasTexto,
    cargasConocidas: s.cargasConocidas,
    situacionPosesoria: (s.situacionPosesoria ?? 'desconocida') as SubastaInmueble['situacionPosesoria'],
    ejecutado: (s.ejecutado ?? 'desconocido') as SubastaInmueble['ejecutado'],
    tipoBien: s.tipoBien as SubastaInmueble['tipoBien'],
    superficie: s.superficie,
  }
}

/**
 * «¿Y si pujo X?»: coste puerta abierta, descuento real y banda de aprobación
 * de UNA puja concreta. Mismo motor que el resto de la ficha (`calcularCoste` +
 * `umbralesPuja` del módulo, con la financiación declarada en ⚙️ Criterios):
 * el simulador nunca puede contradecir al coste de arriba.
 */
function SimuladorPuja({ s, o, params }: { s: Subasta; o?: Oportunidad | null; params?: ParamsCoste }) {
  const [texto, setTexto] = useState('')
  if (s.valorSubasta == null || s.valorSubasta <= 0) return null

  const puja = Number(texto.replace(/\./g, '').replace(',', '.'))
  const valida = texto.trim() !== '' && Number.isFinite(puja) && puja > 0
  const sm = aInmueble(s)
  const c = valida ? calcularCoste(sm, puja, params ?? {}) : null
  const u = valida ? umbralesPuja(sm) : null
  const descuento = c && o?.valorMercado ? 1 - c.total / o.valorMercado : null
  // Banda de aprobación de ESTA puja (no del techo calculado).
  const directa = u?.umbrales.find((x) => x.clave === 'aprobacion_directa')
  const suelo = u?.umbrales.find((x) => x.clave === 'suelo_laj')
  const cubreDeuda = u?.cantidadReclamada != null && puja >= u.cantidadReclamada
  const banda = !u || !directa ? null
    : puja >= directa.importe ? '✅ Aprobación automática del remate'
    : suelo && puja >= suelo.importe ? '🟡 Decide el LAJ (≥50% del tipo)'
    : cubreDeuda ? '🟡 Cubre la deuda reclamada: aprobable aunque no llegue al 50%'
    : '🔴 Por debajo del 50% y sin cubrir la deuda: aprobación discrecional'
  const inadmisible = valida && s.pujaMinima != null && s.pujaMinima > 0 && puja < s.pujaMinima
  const desalineada = valida && s.tramos != null && s.tramos > 0 && puja > s.valorSubasta &&
    Math.abs((puja - s.valorSubasta) % s.tramos) > 0.01

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
        🧮 ¿Y si pujo…?
      </summary>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          inputMode="decimal" placeholder={`p. ej. ${Math.round(s.valorSubasta * 0.7).toLocaleString('es-ES')}`}
          value={texto} onChange={(e) => setTexto(e.target.value)}
          style={{ ...control, width: 160, minHeight: 44 }}
        />
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>€ de puja</span>
      </div>
      {valida && c && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
          <div>
            Coste puerta abierta: <strong>{eur(c.total)}</strong>
            <span style={{ color: 'var(--muted)' }}> · {c.impuestoConcepto} sobre {eur(c.baseImponible)}</span>
          </div>
          {descuento != null && o?.valorMercado != null && (
            <div>
              Descuento real sobre {eur(o.valorMercado)}:{' '}
              <strong style={{ color: descuento >= 0.25 ? 'var(--positive, #15803d)' : descuento >= 0 ? 'var(--text)' : 'var(--negative, #b91c1c)' }}>
                {(descuento * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%
              </strong>
            </div>
          )}
          {banda && <div>{banda}</div>}
          {inadmisible && (
            <div style={{ color: 'var(--negative, #b91c1c)' }}>⚠️ Por debajo de la puja mínima ({eur(s.pujaMinima!)}): no la admiten.</div>
          )}
          {desalineada && (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              El portal puja por tramos de {eur(s.tramos!)} desde la salida: esta cifra se redondearía.
            </div>
          )}
        </div>
      )}
    </details>
  )
}

function FichaSubasta({ s, o, acciones, extra, doc, escenarios, params }: { s: Subasta; o?: Oportunidad | null; acciones?: React.ReactNode; extra?: React.ReactNode; doc?: Documental | null; escenarios?: EscenarioUI[] | null; params?: ParamsCoste }) {
  const [abierto, setAbierto] = useState(false)
  const cierre = fecha(s.fechaFin)
  // Dirección oficial del Catastro troceada (planta/puerta aparte) y, con ella,
  // el enlace al PORTAL en vez de a un pin anónimo. Sin ninguna pista de
  // ubicación, el botón no sale.
  // 🚨 SOLO el `ldt` del Catastro lleva el sello 🏛️. La dirección del anuncio
  // sale de la descripción registral y a veces es prosa («Vivienda en planta
  // primera tipo F, con acceso…»): etiquetarla como dato oficial —y mandarla a
  // Google pisando unas coordenadas catastrales exactas— llevaba a otro sitio.
  const dirCat = direccionCatastro(s.direccionCatastro)
  const dirAnuncio = !dirCat && esDireccionPostal(s.direccion) ? s.direccion : null
  const mapsUrl = urlGoogleMaps({ ...s, direccion: dirCat?.postal ?? s.direccion })
  const panoUrl = urlStreetView(s.lat, s.lon)
  const catastroUrl = urlFichaCatastro(s.refCatastral)
  const exacta = s.geoPrecision === 'catastro'
  // Deuda, puja mínima y umbrales: UN solo cálculo (helper puro del módulo)
  // compartido por «💶 Los números» y el detalle legal de «⚖️ Cómo pujar».
  // Si el edicto declaró «vivienda habitual», el escenario de desierta
  // (art. 671) deja de ser genérico. La señal viene de las notas persistidas.
  const u = umbralesPuja(aInmueble(s), { viviendaHabitual: viviendaHabitualDeNotas(doc?.notasEdicto) })
  const epm = estadoPujaMinima(u.pujaMinima)

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <strong style={{ color: 'var(--text)' }}>{s.identificador ?? s.dedupeKey}</strong>
        {o && <Puntuacion v={o.puntuacion} />}
      </div>

      {/* Primero QUÉ es (tipo, m², distribución); la descripción registral
          después: es densa y a veces solo dice «ver certificación de cargas». */}
      <Caracteristicas s={s} plantaAparte={!!dirCat?.planta} />

      {s.descripcion && (
        <p style={{ margin: '8px 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>
          {s.descripcion.slice(0, 240)}
          {s.descripcion.length > 240 ? '…' : ''}
        </p>
      )}

      {/* 🏛️ Ubicación oficial del Catastro. Va ARRIBA y en el color del texto:
          es el dato que Alberto busca primero y antes no se pintaba en ningún
          sitio (solo estaba en la BD), así que la ficha parecía no tener
          dirección — «la ubicación es muy mala», 30/07/2026. */}
      {dirCat && (
        <p style={{ margin: '8px 0 0', color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
          🏛️ {dirCat.postal}
          {(dirCat.planta || dirCat.puerta) && (
            <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
              {' · '}
              {dirCat.planta && `planta ${dirCat.planta}`}
              {dirCat.planta && dirCat.puerta && ', '}
              {dirCat.puerta && `puerta ${dirCat.puerta}`}
            </span>
          )}
          {!exacta && <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · ubicación aproximada</span>}
        </p>
      )}

      {/* Sin ficha catastral, la dirección del anuncio — sin sello oficial y
          solo cuando de verdad parece una dirección postal. */}
      {dirAnuncio && (
        <p style={{ margin: '8px 0 0', color: 'var(--text)', fontSize: 14 }}>
          📮 {dirAnuncio}
          <span style={{ color: 'var(--muted)', fontSize: 12 }}> · según el anuncio</span>
        </p>
      )}

      {/* Contexto de dónde/cuándo. Los importes ya NO van aquí: viven juntos
          en «💶 Los números» — como chips grises del mismo peso se confundían. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
        {s.provincia && <span>📍 {s.municipio ? `${s.municipio} (${s.provincia})` : s.provincia}</span>}
        {cierre && <span>⏰ cierra {cierre}</span>}
        {s.situacionPosesoria === 'ocupada' && <span>⚠️ ocupada</span>}
      </div>

      {/* Resto de datos oficiales del Catastro. Los m² NO van aquí: los pinta
          `Caracteristicas` arriba, con su origen (Catastro o escritura). */}
      {(s.anioConstruccion != null || s.usoCatastral || s.codigoPostal) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
          {s.anioConstruccion != null && <span>🏗️ construido en {s.anioConstruccion}</span>}
          {s.usoCatastral && <span>🏷️ {s.usoCatastral}</span>}
          {s.codigoPostal && <span>✉️ {s.codigoPostal}</span>}
        </div>
      )}

      {/* ── 💶 LOS NÚMEROS ─────────────────────────────────────────────────
          Todas las cifras de la subasta en UN bloque de pares etiqueta→valor,
          en vez de chips grises y líneas sueltas del mismo peso (así se llegó
          a confundir el coste con el precio de mercado — Alberto, 08/08/2026).
          La distinción que debe VERSE: salida = por lo que se puja · valor de
          mercado = con qué se compara · coste (bloque siguiente) = lo que te
          costaría en total. */}
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-2, var(--bg))' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
          💶 Los números
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 14px' }}>
          <Dato etiqueta="Salida" sub={u.regimen != null ? 'por lo que se puja' : undefined}>
            {s.valorSubasta != null
              ? <strong>{eur(s.valorSubasta)}</strong>
              : <span style={{ color: 'var(--muted)' }}>no publicada</span>}
          </Dato>
          <Dato etiqueta="Tasación">
            {s.tasacion != null
              ? <strong>{eur(s.tasacion)}</strong>
              : <span style={{ color: 'var(--muted)' }}>no publicada</span>}
          </Dato>
          {/* La puja en vivo que vio el vigía de seguidas (solo BOE, cerca del
              cierre): sin dato no se pinta — su ausencia no informa de nada. */}
          {s.mejorPuja != null && (
            <Dato
              etiqueta="🔥 Mejor puja vista"
              sub={s.valorSubasta != null && s.valorSubasta > 0 ? `${Math.round((s.mejorPuja / s.valorSubasta) * 100)}% del tipo` : undefined}
            >
              <strong>{eur(s.mejorPuja)}</strong>
            </Dato>
          )}
          {/* Deuda y puja mínima solo si el procedimiento las tiene: en venta
              directa no hay puja, y pintar ahí un «no publicada» sería
              prometer un dato que nunca va a llegar. */}
          {(u.regimen != null || u.cantidadReclamada != null) && (
            <Dato etiqueta="Deuda reclamada" sub={u.cantidadReclamada != null ? 'techo probable de la puja del ejecutante' : undefined}>
              {u.cantidadReclamada != null
                ? <strong>{eur(u.cantidadReclamada)}</strong>
                : <span style={{ color: 'var(--muted)' }}>no publicada</span>}
            </Dato>
          )}
          {u.regimen != null && (
            <Dato etiqueta="Puja mínima">
              {epm === 'publicada' ? <strong>{eur(u.pujaMinima!)}</strong>
                : epm === 'sin_minimo' ? <span style={{ color: 'var(--muted)' }}>sin mínimo — cualquier postura es admisible</span>
                : <span style={{ color: 'var(--muted)' }}>no publicada</span>}
            </Dato>
          )}
          {o && (
            <Dato etiqueta="Depósito para pujar">
              {o.deposito != null
                ? <strong>{eur(o.deposito)}</strong>
                : <span style={{ color: 'var(--muted)' }}>no publicado</span>}
            </Dato>
          )}
        </div>

        {/* El origen del valor va SIEMPRE junto a la cifra: una estimación por
            comparables no puede parecer una tasación. */}
        {o?.valorMercado != null && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
            <Dato etiqueta="Valor de mercado" sub="con qué se compara">
              <strong>{eur(o.valorMercado)}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {ORIGEN_VALOR[o.origenValor ?? 'tasacion']}</span>
              {/* La cifra manda sobre el descuento, la puntuación y la puja: si está
                  construida con la mediana de una ciudad entera hay que verlo AQUÍ,
                  no enterrado en los avisos del detalle plegado. */}
              {o.valorOrientativo && (
                <span
                  title="El €/m² es la mediana de todo el municipio, donde el precio cambia mucho por barrio. Orienta, pero no sirve para decidir una puja."
                  style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'var(--warning-bg, #fef3c7)', color: 'var(--text)' }}
                >
                  ⚠️ orientativo
                </span>
              )}
            </Dato>
          </div>
        )}
      </div>

      {/* ── COSTE PUERTA ABIERTA ───────────────────────────────────────────
          Con acento propio para que no se lea como otra valoración: es la
          salida + impuestos + gastos, lo que te costaría en total. */}
      {(o || (escenarios && escenarios.length > 0)) && (
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, borderLeft: '3px solid var(--primary)', background: 'var(--card-2, var(--bg))' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            Coste — lo que te costaría en total
          </div>
          {o && o.coste.total > 0 && (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)' }}>
              {/* «Coste real estimado» a secas se leía como precio de mercado
                  (Alberto, 08/08/2026, la de 806.015,16€): el titular dice A
                  QUÉ REMATE está simulado. El depósito vive en «💶 Los números». */}
              Coste puerta abierta si rematas a la salida
              {s.valorSubasta != null && <> ({eur(s.valorSubasta)})</>}: <strong>{eur(o.coste.total)}</strong>
            </div>
          )}
          {/* Escenarios informativos: el coste de arriba (y el score) simulan el
              remate al 100% de la salida — lo conservador. Esto enseña cuánto
              costaría rematar donde de verdad se adjudican las subastas. */}
          {escenarios && escenarios.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
              {escenarios.map((e) => (
                <div key={e.origen}>{e.etiqueta}: ~<strong style={{ color: 'var(--text)' }}>{eur(e.total)}</strong> de coste real</div>
              ))}
              <div style={{ fontSize: 11 }}>El coste y la puntuación de arriba siguen calculados con remate al 100% de la salida (conservador).</div>
            </div>
          )}
          {/* Montaje perezoso: el detalle solo se renderiza al abrirlo. */}
          {o && (
            <>
              <button onClick={() => setAbierto((v) => !v)} style={{ ...boton(), marginTop: 8, minHeight: 36 }}>
                {abierto ? 'Ocultar detalle' : 'Ver detalle del coste'}
              </button>
              {abierto && (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text)' }}>
                  <div style={{ marginBottom: 6 }}>
                    {o.coste.impuestoConcepto} sobre {eur(o.coste.baseImponible)} ={' '}
                    <strong>{eur(o.coste.impuestoTransmision)}</strong>
                  </div>
                  {/* Comisión del portal: solo la cobran los privados (Surus,
                      servicers) y no se descuenta del remate, así que se pinta
                      como partida propia y no escondida en los avisos. */}
                  {!!o.coste.comisionCompra && o.coste.comisionCompra > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      Comisión del portal a tu cargo (IVA incl.) ={' '}
                      <strong>{eur(o.coste.comisionCompra)}</strong>
                    </div>
                  )}
                  {o.motivos.length > 0 && (
                    <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                      {o.motivos.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  )}
                  {o.avisos.length > 0 && (
                    <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--warning-bg, #fef3c7)' }}>
                      <strong style={{ fontSize: 12 }}>Ojo:</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
                        {o.avisos.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ⚖️ CÓMO PUJAR ──────────────────────────────────────────────────
          Umbrales legales + simulador bajo un mismo techo: «cuánto hay que
          pujar y qué pasa si pujo X» es UNA pregunta, no dos widgets sueltos.
          Sin valor de subasta no hay nada que simular ni umbral que calcular. */}
      {s.valorSubasta != null && s.valorSubasta > 0 && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            ⚖️ Cómo pujar
          </div>
          <UmbralesPujaFicha u={u} />
          {/* 🧮 ¿Y si pujo X? — todo con la lógica pura del módulo, sin red. */}
          <SimuladorPuja s={s} o={o} params={params} />
        </div>
      )}

      {/* Cargas + documentación: en TODAS las pestañas, no solo en «Todas». */}
      <ResumenDocumental s={s} d={doc} />
      <NotaSimpleViva dedupeKey={s.dedupeKey} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {s.url && (
          <a href={s.url} target="_blank" rel="noreferrer" style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            Ver ficha oficial
          </a>
        )}
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            📍 Mapa{!exacta && !dirCat && !dirAnuncio ? ' (aprox.)' : ''}
          </a>
        )}
        {/* Ver la fachada y el barrio: en subastas «sin posibilidad de visita»
            es la única inspección posible sin desplazarse. */}
        {panoUrl && exacta && (
          <a href={panoUrl} target="_blank" rel="noreferrer" style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            👁️ Ver la calle
          </a>
        )}
        {catastroUrl && (
          <a href={catastroUrl} target="_blank" rel="noreferrer" style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            🏛️ Catastro
          </a>
        )}
        {acciones}
      </div>
      {extra}
    </div>
  )
}

export default function SubastasClient({ inicial }: { inicial: Inicial | null }) {
  // 🔥 Oportunidades es la puerta de entrada (decisión de Alberto, 09/08/2026):
  // «me da igual la fuente, el objetivo es buscar chollos y sobre todo mis
  // preferencias». El radar sigue ahí para el detalle de subastas.
  const [tab, setTab] = useState<'radar' | 'oportunidades' | 'todas' | 'mapa' | 'criterios'>('oportunidades')
  const [datos, setDatos] = useState<Inicial | null>(inicial)
  const [visibles, setVisibles] = useState(PAGE)
  const [crit, setCrit] = useState<Criterios>(
    inicial?.criterios ?? {
      activo: false, provincias: [], palabras_clave: [],
      precio_min: null, precio_max: null, descuento_min: 0, excluir_ocupadas: false,
    },
  )
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  // La financiación declarada en ⚙️ Criterios, en el formato del módulo: el
  // simulador de puja debe dar EL MISMO coste que la SSR, no uno sin puente.
  // (crit guarda los % en unidades de UI; el módulo los quiere en tanto por uno.)
  const paramsCoste = useMemo<ParamsCoste>(() => {
    const pct = crit.financia_pct
    const tipo = crit.financia_tipo_anual
    if (pct == null || pct <= 0 || tipo == null || tipo <= 0) return {}
    return {
      financiacion: {
        pctFinanciado: Math.min(1, pct / 100),
        tipoAnual: tipo / 100,
        ...(crit.financia_meses != null && crit.financia_meses > 0 ? { meses: crit.financia_meses } : {}),
        ...(crit.financia_comision != null && crit.financia_comision > 0 ? { comisionApertura: crit.financia_comision / 100 } : {}),
      },
    }
  }, [crit.financia_pct, crit.financia_tipo_anual, crit.financia_meses, crit.financia_comision])
  // Filtros de la pestaña Todas: server-side contra /api/subastas. La lista
  // local arranca con el SSR y se sustituye/expande con cada búsqueda.
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [lista, setLista] = useState<Resultado[]>(inicial?.resultados ?? [])
  const [totalLista, setTotalLista] = useState(inicial?.total ?? 0)
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(false)
  // Filtros de la pestaña Oportunidades: client-side (todo viene del SSR).
  // «Por si alguien me pregunta»: la lente 🌊 es fija, pero aquí se puede
  // explorar TODO el corpus con filtros (casas, rebajados, particular, fuente).
  const [fch, setFch] = useState({ soloParticulares: false, soloCasas: false, soloRebajados: false, portal: 'all', zona: '', precioMax: '' })
  // La sección 🌊 arranca colapsada a 5 tarjetas; «Ver todas» la despliega.
  const [prefTodas, setPrefTodas] = useState(false)
  const chollosFiltrados = useMemo(() => {
    const zona = fch.zona.trim().toLowerCase()
    const precioMax = parseInt(fch.precioMax, 10)
    if (fch.portal === 'subasta') return []
    return (datos?.chollos ?? []).filter((ch) => {
      if (fch.soloParticulares && !ch.comparable.esParticular) return false
      if (fch.soloCasas && !esCasa(ch.comparable.titulo)) return false
      if (fch.soloRebajados && !((ch.comparable.bajadas ?? 0) > 0)) return false
      // Los comparables viejos de Idealista no llevan `portal`: se asume idealista.
      if (fch.portal !== 'all' && (ch.comparable.portal ?? 'idealista') !== fch.portal) return false
      if (zona && !`${ch.comparable.titulo} ${ch.comparable.zona ?? ''} ${ch.zona}`.toLowerCase().includes(zona)) return false
      if (Number.isFinite(precioMax) && ch.comparable.precio > precioMax) return false
      return true
    })
  }, [datos?.chollos, fch])
  // Subastas con señal (descuento vs mercado o margen flip), filtradas con los
  // mismos mandos. OJO honesto: una subasta no tiene «rebaja» ni «particular» —
  // con esos filtros activos quedan fuera, y el contador lo dice.
  const subastasFiltradas = useMemo(() => {
    const zona = fch.zona.trim().toLowerCase()
    const precioMax = parseInt(fch.precioMax, 10)
    if (fch.soloParticulares || fch.soloRebajados) return []
    if (fch.portal !== 'all' && fch.portal !== 'subasta') return []
    return (datos?.subastasChollo ?? []).filter((s) => {
      if (fch.soloCasas && s.tipoBien !== 'vivienda') return false
      if (zona && !`${s.identificador} ${s.municipio ?? ''} ${s.provincia ?? ''}`.toLowerCase().includes(zona)) return false
      if (Number.isFinite(precioMax) && s.valorSubasta != null && s.valorSubasta > precioMax) return false
      return true
    })
  }, [datos?.subastasChollo, fch])
  // La lista unificada: la fuente es un badge, el orden lo pone el ATRACTIVO
  // (descuento neto/margen flip, el mayor primero; sin señal, al final).
  const oportunidades = useMemo(() => {
    const items: Array<{ clave: string; atractivo: number; chollo?: Chollo; subasta?: SubastaChollo }> = []
    for (const ch of chollosFiltrados) {
      items.push({ clave: `m|${ch.comparable.portal}|${ch.comparable.refAnuncio}`, atractivo: ch.descuentoNeto ?? ch.descuento, chollo: ch })
    }
    for (const s of subastasFiltradas) {
      const atractivo = Math.max(s.descuento ?? -Infinity, s.margenFlipPct != null ? s.margenFlipPct / 100 : -Infinity)
      items.push({ clave: `s|${s.dedupeKey}`, atractivo, subasta: s })
    }
    return items.sort((a, b) => b.atractivo - a.atractivo)
  }, [chollosFiltrados, subastasFiltradas])

  async function buscarTodas(reset: boolean, f: Filtros = filtros) {
    const page = reset ? 1 : pagina + 1
    const p = new URLSearchParams({ page: String(page) })
    if (f.tipo !== 'all') p.set('tipo', f.tipo)
    if (f.playa) p.set('playa', 'true')
    if (f.m2min) p.set('m2_min', f.m2min)
    if (f.m2max) p.set('m2_max', f.m2max)
    if (f.eurM2Max) p.set('eur_m2_max', f.eurM2Max)
    if (f.sinOcupadas) p.set('sin_ocupadas', 'true')
    if (f.margenMin) p.set('margen_min', f.margenMin)
    if (f.semaforo) p.set('semaforo', f.semaforo)
    if (f.municipio.trim()) p.set('municipio', f.municipio.trim())
    setBuscando(true)
    try {
      const r = await fetch(`/api/subastas?${p.toString()}`)
      if (!r.ok) return
      const j = await r.json()
      setLista((prev) => (reset ? j.resultados : [...prev, ...j.resultados]))
      setTotalLista(j.total ?? 0)
      setPagina(page)
    } catch { /* la lista anterior se mantiene */ } finally {
      setBuscando(false)
    }
  }
  const [oferta, setOferta] = useState<{ ref: string; texto: string } | null>(null)
  const [ofertaCargando, setOfertaCargando] = useState<string | null>(null)

  async function pedirOferta(refAnuncio: string) {
    setOfertaCargando(refAnuncio)
    try {
      const r = await fetch('/api/subastas/oferta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refAnuncio }),
      })
      const j = await r.json()
      setOferta({ ref: refAnuncio, texto: r.ok ? j.texto : 'No se pudo redactar la oferta. Reintenta.' })
    } catch {
      setOferta({ ref: refAnuncio, texto: 'No se pudo redactar la oferta. Reintenta.' })
    } finally {
      setOfertaCargando(null)
    }
  }

  const recargarRadar = useCallback(async () => {
    try {
      const r = await fetch('/api/subastas/radar')
      if (!r.ok) return
      const j = await r.json()
      // Los `escenarios` y la foto VIVA de la subasta los calcula el servidor al
      // pintar la página y este endpoint no los trae: se conservan los que ya
      // teníamos por `dedupe_key` en vez de sustituir la fila entera, que dejaba
      // la tarjeta a medias en cuanto se marcaba una como vista.
      setDatos((d) => {
        if (!d) return d
        const previos = new Map((d.radar ?? []).map((x: any) => [x.dedupe_key, x]))
        return {
          ...d,
          radar: (j.anuncios ?? []).map((a: any) => {
            const p = previos.get(a.dedupe_key)
            return p ? { ...p, ...a, doc: a.doc ?? p.doc } : a
          }),
        }
      })
    } catch { /* la vista previa se mantiene */ }
  }, [])

  async function guardarCriterios() {
    setGuardando(true)
    setAviso(null)
    try {
      const r = await fetch('/api/subastas/criterios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crit),
      })
      // El coste se calcula en el servidor: hasta recargar se sigue viendo el anterior.
      setAviso(r.ok ? 'Criterios guardados. Recarga la página para ver el coste recalculado.' : 'No se pudieron guardar.')
    } catch {
      setAviso('No se pudieron guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function accionRadar(id: string, accion: 'visto' | 'descartar') {
    setDatos((d) => (d ? { ...d, radar: d.radar.filter((r) => (accion === 'descartar' ? r.id !== id : true)) } : d))
    await fetch('/api/subastas/radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion }),
    }).catch(() => {})
  }

  async function seguir(s: Subasta) {
    await fetch('/api/subastas/seguidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dedupe_key: s.dedupeKey, subasta: s }),
    }).catch(() => {})
    setAviso(`Siguiendo ${s.identificador ?? s.dedupeKey}.`)
  }

  useEffect(() => { setVisibles(PAGE) }, [tab])

  if (!datos) {
    return (
      <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ color: 'var(--text)' }}>⚖️ Subastas</h1>
        <p style={{ color: 'var(--muted)' }}>No se han podido cargar los datos. Reintenta en un momento.</p>
      </main>
    )
  }

  const toggleProvincia = (p: string) =>
    setCrit((c) => ({
      ...c,
      provincias: c.provincias.includes(p) ? c.provincias.filter((x) => x !== p) : [...c.provincias, p],
    }))

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ color: 'var(--text)', fontSize: 24, marginBottom: 4 }}>⚖️ Subastas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
        Dos caminos al mismo objetivo: inmuebles baratos por zona. <strong>Subastas</strong> del Portal
        del BOE con su coste real de adquisición, y <strong>chollos</strong> de venta directa detectados en
        tus alertas de Idealista y Fotocasa. Todo son <strong>estimaciones</strong> — no sustituyen a un
        análisis jurídico ni fiscal.
      </p>

      {(datos.indice || datos.pulso || (datos.calibracion?.length ?? 0) > 0) && (
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
          {datos.indice?.anual != null && (
            <>📈 Vivienda en Andalucía: <strong>{datos.indice.anual > 0 ? '+' : ''}{datos.indice.anual.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%</strong> interanual
            {datos.indice.trimestral != null && <>, {datos.indice.trimestral > 0 ? '+' : ''}{datos.indice.trimestral.toLocaleString('es-ES', { maximumFractionDigits: 1 })}% el último trimestre</>}
            {' '}(IPV del INE{datos.indice.etiqueta ? `, ${datos.indice.etiqueta}` : ''}).
            {datos.indice.trimestral != null && datos.indice.trimestral < 0 && (
              <strong style={{ color: 'var(--warning, #b45309)' }}> ⚠️ El precio oficial CAYÓ el último trimestre — posible giro de mercado.</strong>
            )}</>
          )}
          {datos.pulso && datos.pulso.anuncios >= 20 && (
            <span>
              {' '}✂️ De los {datos.pulso.anuncios} anuncios vigilados, el <strong>{Math.round(datos.pulso.pctConBajada * 100)}%</strong> ha bajado de precio
              {datos.pulso.recorteMedio != null && <> (recorte medio {(datos.pulso.recorteMedio * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%)</>}
              {datos.pulso.pctConBajada >= 0.25 && <strong style={{ color: 'var(--warning, #b45309)' }}> — mercado enfriándose en tus zonas</strong>}.
            </span>
          )}
          {(datos.calibracion ?? [])
            .filter((c) => c.ratioMediano != null)
            .slice(0, 3)
            .map((c) => (
              <span key={c.provincia}>
                {' '}⚖️ {c.provincia === '(todas)' ? 'Histórico' : c.provincia}: se adjudica de mediana al{' '}
                <strong>{Math.round(c.ratioMediano! * 100)}%</strong> del valor de subasta ({c.muestraRatio} concluidas
                {c.desiertas > 0 ? `, ${c.desiertas} desiertas` : ''}).
              </span>
            ))}
        </p>
      )}

      {/* ¿Nuestro techo de puja se parece a lo que paga el mercado? Solo se pinta
          cuando hay muestra suficiente (el módulo devuelve `lectura: null` si no). */}
      {datos.calibPuja?.lectura && (
        <p style={{
          ...card, marginTop: 0, marginBottom: 12, fontSize: 13, color: 'var(--text)',
          background: 'var(--warning-bg, #fef3c7)', padding: 12,
        }}>
          🎯 <strong>Nuestra puja máxima vs. el remate real:</strong> {datos.calibPuja.lectura}
          {datos.calibPuja.ratioMediano != null && (
            <span style={{ color: 'var(--muted)' }}>
              {' '}(mediana remate/puja {datos.calibPuja.ratioMediano.toLocaleString('es-ES', { maximumFractionDigits: 2 })};
              {' '}{datos.calibPuja.porEncima} por encima, {datos.calibPuja.porDebajo} por debajo)
            </span>
          )}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
        <button onClick={() => setTab('radar')} style={boton(tab === 'radar')}>
          🎯 Mi radar {datos.radar.length > 0 && `(${datos.radar.length})`}
        </button>
        <button onClick={() => setTab('oportunidades')} style={boton(tab === 'oportunidades')}>
          🔥 Oportunidades {(datos.chollos.length + (datos.subastasChollo?.length ?? 0)) > 0 && `(${datos.chollos.length + (datos.subastasChollo?.length ?? 0)})`}
        </button>
        <button onClick={() => setTab('todas')} style={boton(tab === 'todas')}>
          📋 Todas ({datos.total})
        </button>
        <button onClick={() => setTab('mapa')} style={boton(tab === 'mapa')}>🗺️ Mapa</button>
        <button onClick={() => setTab('criterios')} style={boton(tab === 'criterios')}>⚙️ Criterios</button>
      </div>

      {aviso && (
        <div style={{ ...card, background: 'var(--primary-light, #eef2ff)', fontSize: 13 }}>{aviso}</div>
      )}

      {tab === 'radar' && (
        <section>
          {datos.tesoreria && <PanelTesoreria t={datos.tesoreria} />}
          {!crit.activo && (
            <div style={{ ...card, fontSize: 13 }}>
              El radar está <strong>desactivado</strong>. Actívalo en ⚙️ Criterios para recibir avisos por Telegram.
            </div>
          )}
          {datos.radar.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              Todavía no ha casado ninguna subasta con tus criterios.
            </p>
          ) : (
            <>
              {datos.radar.slice(0, visibles).map((r) => (
                <FichaSubasta
                  key={r.id}
                  s={r.subasta}
                  doc={r.doc}
                  escenarios={r.escenarios}
                  params={paramsCoste}
                  o={{
                    puntuacion: r.puntuacion,
                    descuento: null,
                    deposito: null,
                    valorMercado: null,
                    coste: { total: Number(r.coste_total ?? 0), impuestoTransmision: 0, impuestoConcepto: '', baseImponible: 0 },
                    motivos: r.motivos ?? [],
                    avisos: r.avisos ?? [],
                  }}
                  acciones={
                    <>
                      <button onClick={() => seguir(r.subasta)} style={boton()}>👀 Seguir</button>
                      <button onClick={() => accionRadar(r.id, 'descartar')} style={boton()}>🚫 Descartar</button>
                    </>
                  }
                />
              ))}
              {datos.radar.length > visibles && (
                <button onClick={() => setVisibles((v) => v + PAGE)} style={boton()}>
                  Ver más ({datos.radar.length - visibles} restantes)
                </button>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'oportunidades' && (
        <section>
          {/* Cabecera compacta: contador REAL (reacciona a los filtros) + explicación plegada. */}
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {oportunidades.length} oportunidad{oportunidades.length === 1 ? '' : 'es'} ahora mismo
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Chollos de tus alertas y subastas con descuento — lo más atractivo primero.
            </p>
            <details>
              <summary style={resumenTapa}>¿Cómo funciona esta lista?</summary>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                Junta anuncios de tus alertas de Idealista y Fotocasa muy por debajo de la mediana
                €/m² de su zona, y subastas con descuento o margen de flip. La fuente es un chip; el
                orden lo pone el atractivo. 👤 = particular (negociación directa, sin comisión de
                agencia). Ojo: los filtros ⬇️ Rebajados y 👤 Particulares no aplican a subastas (una
                subasta no tiene rebaja ni particular) — con ellos activos las subastas quedan fuera.
                Todo son estimaciones: no sustituyen a un análisis jurídico ni fiscal.
              </p>
            </details>
          </div>
          {(datos.preferentes?.length ?? 0) > 0 && (
            <div style={{ border: '1px solid var(--info)', borderRadius: 'var(--radius, 10px)',
                          background: 'var(--info-bg)', padding: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text)' }}>🌊 Casas de playa — tu preferencia</h3>
                <ChipUI tono="info">{datos.preferentes!.length}</ChipUI>
              </div>
              <p style={{ margin: '2px 0 8px', fontSize: 13, color: 'var(--muted)' }}>
                Hasta 230.000€ (Matalascañas sin tope) — primero las rebajadas y las de particular.
              </p>
              <details style={{ marginBottom: 8 }}>
                <summary style={resumenTapa}>¿Qué entra aquí?</summary>
                <p style={{ margin: '4px 0 8px', fontSize: 13, color: 'var(--muted)' }}>
                  Casas y adosados (pisos no) sin señales de obra en playa de Asturias, Cantabria,
                  Islantilla y Matalascañas, aunque no lleguen a chollo. «Sin señales de obra» dice
                  solo que el anuncio no confiesa reforma — el estado real se comprueba en las fotos
                  y en la visita. Los chollos de estas zonas salen también en la lista de abajo con
                  el chip 🌊.
                </p>
              </details>
              {datos.preferentes!.slice(0, prefTodas ? undefined : 5).map((p) => {
                const pct = p.referencia ? Math.round(p.referencia.descuento * 100) : null
                const bajo = (p.comparable.bajadas ?? 0) > 0 && p.comparable.precioInicial != null &&
                  p.comparable.precioInicial > p.comparable.precio
                return (
                  <TarjetaOportunidad
                    key={`${p.comparable.portal}|${p.comparable.refAnuncio}`}
                    acento
                    precio={p.comparable.precio}
                    descuento={pct != null ? (pct >= 0
                      ? { etiqueta: `−${pct}% vs zona`, tono: 'ok' }
                      : { etiqueta: `+${-pct}% vs zona`, tono: 'warn' }) : null}
                    titulo={p.comparable.titulo}
                    zona={[p.comparable.zona, p.costa].filter(Boolean).join(' · ')}
                    metros={[
                      p.comparable.superficie != null ? `${p.comparable.superficie} m²` : null,
                      p.comparable.habitaciones != null ? `${p.comparable.habitaciones} hab.` : null,
                    ].filter(Boolean).join(' · ') || null}
                    chips={chipsDePreferente(p)}
                    evidencia={p.referencia
                      ? `${Math.round(p.comparable.precioM2 ?? 0)}€/m² vs ${Math.round(p.referencia.precioM2Zona)}€/m² de ${p.referencia.zona} (${p.referencia.muestra} anuncios)`
                      : 'Sin referencia €/m² de su zona todavía — compáralo tú en el portal'}
                    detalles={(bajo || p.rendimiento) ? (
                      <>
                        {bajo && (
                          <p style={{ margin: '4px 0 0', color: 'var(--positive, #15803d)', fontSize: 13 }}>
                            ⬇️ Ha bajado {p.comparable.bajadas} {p.comparable.bajadas === 1 ? 'vez' : 'veces'}: de{' '}
                            {eur(p.comparable.precioInicial!)} a {eur(p.comparable.precio)} — no se vende, margen para negociar
                          </p>
                        )}
                        <LineaRendimiento r={p.rendimiento} dormitorios={p.comparable.habitaciones} />
                      </>
                    ) : undefined}
                    acciones={p.comparable.url ? (
                      <a href={p.comparable.url} target="_blank" rel="noreferrer"
                         style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                        Ver anuncio
                      </a>
                    ) : undefined}
                  />
                )
              })}
              {datos.preferentes!.length > 5 && !prefTodas && (
                <button onClick={() => setPrefTodas(true)} style={{ ...boton(), width: '100%' }}>
                  Ver todas ({datos.preferentes!.length})
                </button>
              )}
            </div>
          )}
          {(datos.chollos.length > 0 || (datos.subastasChollo?.length ?? 0) > 0) && (
            <div style={{ ...card, padding: '10px 12px' }}>
              {/* Fila 1: chips toggle + fuente — scroll horizontal, no envuelve en 320px. */}
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
                <button
                  onClick={() => { setFch((f) => ({ ...f, soloCasas: !f.soloCasas })); setVisibles(PAGE) }}
                  style={{ ...boton(fch.soloCasas), padding: '0 12px', fontSize: 13, flex: '0 0 auto' }}>
                  🏠 Casas
                </button>
                <button
                  onClick={() => { setFch((f) => ({ ...f, soloRebajados: !f.soloRebajados })); setVisibles(PAGE) }}
                  style={{ ...boton(fch.soloRebajados), padding: '0 12px', fontSize: 13, flex: '0 0 auto' }}>
                  ⬇️ Rebajados
                </button>
                <button
                  onClick={() => { setFch((f) => ({ ...f, soloParticulares: !f.soloParticulares })); setVisibles(PAGE) }}
                  style={{ ...boton(fch.soloParticulares), padding: '0 12px', fontSize: 13, flex: '0 0 auto' }}>
                  👤 Particulares
                </button>
                <select value={fch.portal}
                        onChange={(e) => { setFch((f) => ({ ...f, portal: e.target.value })); setVisibles(PAGE) }}
                        style={{ ...control, fontSize: 13, flex: '0 0 auto', borderRadius: 999 }}>
                  <option value="all">Fuente: todas</option>
                  <option value="subasta">⚖️ Subastas</option>
                  <option value="idealista">Idealista</option>
                  <option value="fotocasa">Fotocasa</option>
                </select>
              </div>
              {/* Fila 2: los dos inputs a partes iguales (nunca desbordan). */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input value={fch.zona} placeholder="Municipio o zona"
                       onChange={(e) => { setFch((f) => ({ ...f, zona: e.target.value })); setVisibles(PAGE) }}
                       style={{ ...control, fontSize: 13, flex: 1, minWidth: 0 }} />
                <input value={fch.precioMax} placeholder="Precio máx. €" inputMode="numeric"
                       onChange={(e) => { setFch((f) => ({ ...f, precioMax: e.target.value.replace(/\D/g, '') })); setVisibles(PAGE) }}
                       style={{ ...control, fontSize: 13, flex: 1, minWidth: 0 }} />
              </div>
              {(fch.soloRebajados || fch.soloParticulares) && (datos.subastasChollo?.length ?? 0) > 0 && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Con estos filtros las subastas quedan fuera.
                </p>
              )}
            </div>
          )}
          {datos.chollos.length === 0 && (datos.subastasChollo?.length ?? 0) === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              Ninguna oportunidad destaca ahora mismo. Cuantas más búsquedas guardadas
              de vivienda tengas en Idealista, más zonas vigila esto.
            </p>
          ) : oportunidades.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              Nada pasa estos filtros. {fch.soloParticulares && 'Los particulares son pocos: prueba a quitar el resto de filtros. '}
              El corpus crece con cada pasada diaria de tus alertas.
            </p>
          ) : (
            oportunidades.slice(0, visibles).map((it) => {
              if (it.subasta) return (
                <TarjetaSubasta key={it.clave} s={it.subasta}
                  onVerFicha={() => {
                    const f = { ...FILTROS_VACIOS, municipio: it.subasta!.municipio ?? '' }
                    setFiltros(f); setTab('todas'); buscarTodas(true, f)
                  }} />
              )
              const ch = it.chollo!
              const bajo = (ch.comparable.bajadas ?? 0) > 0 && ch.comparable.precioInicial != null &&
                ch.comparable.precioInicial > ch.comparable.precio
              return (
                <TarjetaOportunidad
                  key={it.clave}
                  acento={ch.preferente}
                  precio={ch.comparable.precio}
                  descuento={{
                    etiqueta: `−${(ch.descuento * 100).toFixed(0)}% vs zona${ch.sospechoso ? ' ⚠️' : ''}`,
                    tono: ch.sospechoso ? 'warn' : 'ok',
                  }}
                  titulo={ch.comparable.titulo}
                  zona={ch.comparable.zona ?? ch.zona}
                  metros={[
                    ch.comparable.superficie != null ? `${ch.comparable.superficie} m²` : null,
                    ch.comparable.habitaciones != null ? `${ch.comparable.habitaciones} hab.` : null,
                  ].filter(Boolean).join(' · ') || null}
                  chips={chipsDeChollo(ch)}
                  evidencia={`${Math.round(ch.comparable.precioM2 ?? 0)}€/m² vs ${Math.round(ch.precioM2Zona)}€/m² de ${ch.zona} (${ch.muestra} anuncios${ch.fuente === 'portal' ? ' del buscador de Fotocasa' : ''})`}
                  detalles={
                    <>
                      {bajo && (
                        <p style={{ margin: '4px 0 0', color: 'var(--positive, #15803d)', fontSize: 13 }}>
                          ⬇️ Ha bajado {ch.comparable.bajadas} {ch.comparable.bajadas === 1 ? 'vez' : 'veces'}: de{' '}
                          {eur(ch.comparable.precioInicial!)} a {eur(ch.comparable.precio)} — no se vende, margen para negociar
                        </p>
                      )}
                      {!ch.comparable.esParticular && ch.comparable.anunciante && (
                        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                          🏢 Anuncia: {ch.comparable.anunciante}
                        </p>
                      )}
                      {ch.antiguedadDias != null ? (
                        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                          ⏳ En venta desde hace ~{ch.antiguedadDias >= 60 ? `${Math.round(ch.antiguedadDias / 30)} meses` : `${ch.antiguedadDias} días`}
                          {ch.antiguedadCapada ? ' o más' : ''} (estimado por el nº de anuncio)
                        </p>
                      ) : ch.comparable.vistoDesde ? (
                        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                          👀 Lo vemos desde el {new Date(ch.comparable.vistoDesde).toLocaleDateString('es-ES')} (la antigüedad real no la publica el portal)
                        </p>
                      ) : null}
                      {ch.velocidad && (
                        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                          ⚡ En esta zona los anuncios se venden en ~{ch.velocidad.diasMediana} días
                          (mediana de {ch.velocidad.muestra} desaparecidos)
                        </p>
                      )}
                      <LineaRendimiento r={ch.rendimiento} dormitorios={ch.comparable.habitaciones} />
                      {ch.comparable.aReformar && (
                        <p style={{ margin: '4px 0 0', color: 'var(--warning, #b45309)', fontSize: 12 }}>
                          🔨 El propio anuncio se declara «a reformar»
                        </p>
                      )}
                      {ch.descuentoNeto != null && (
                        <p style={{ margin: '4px 0 0', color: 'var(--warning, #b45309)', fontSize: 12 }}>
                          🔨 Huele a obra (descuento de derribo): aun pagando levantarla (~1.100€/m²) quedaría un{' '}
                          −{(ch.descuentoNeto * 100).toFixed(0)}% neto frente a la zona
                        </p>
                      )}
                      {ch.sospechoso && (
                        <p style={{ margin: '4px 0 0', color: 'var(--warning, #b45309)', fontSize: 12 }}>
                          Descuento anormalmente alto: verifica el estado real del inmueble en el anuncio.
                        </p>
                      )}
                    </>
                  }
                  acciones={
                    <>
                      {ch.comparable.url && (
                        <a href={ch.comparable.url} target="_blank" rel="noreferrer"
                           style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                          Ver anuncio
                        </a>
                      )}
                      <button onClick={() => pedirOferta(ch.comparable.refAnuncio)} style={boton()}
                              disabled={ofertaCargando === ch.comparable.refAnuncio}>
                        {ofertaCargando === ch.comparable.refAnuncio ? '✍️ Redactando…' : '✍️ Borrador de oferta'}
                      </button>
                    </>
                  }
                  extra={oferta?.ref === ch.comparable.refAnuncio ? (
                    <pre style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--bg)',
                                  color: 'var(--text)', fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                      {oferta.texto}
                    </pre>
                  ) : undefined}
                />
              )
            })
          )}
          {oportunidades.length > visibles && (
            <button onClick={() => setVisibles((v) => v + PAGE)} style={{ ...boton(), width: '100%' }}>Ver más</button>
          )}
        </section>
      )}

      {tab === 'todas' && (
        <section>
          {/* Filtros server-side: chips de tipo + lentes. El embudo de Alberto:
              primero rentabilidad, y lo que cuadre se mira a fondo (semáforo). */}
          <div style={{ ...card, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['all', 'vivienda', 'garaje', 'local', 'nave', 'parcela', 'finca_rustica'].map((t) => (
                <button key={t} onClick={() => setFiltros((f) => ({ ...f, tipo: t }))}
                        style={{ ...boton(filtros.tipo === t), padding: "0 10px", fontSize: 13 }}>
                  {t === 'all' ? 'Todo' : TIPO_LABEL[t]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: 'var(--text)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}>
                <input type="checkbox" checked={filtros.playa}
                       onChange={(e) => setFiltros((f) => ({ ...f, playa: e.target.checked }))} />
                🏖️ Costa (Huelva y Cádiz)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}>
                <input type="checkbox" checked={filtros.sinOcupadas}
                       onChange={(e) => setFiltros((f) => ({ ...f, sinOcupadas: e.target.checked }))} />
                Sin riesgo de ocupación
              </label>
              <select value={filtros.margenMin} style={control}
                      onChange={(e) => setFiltros((f) => ({ ...f, margenMin: e.target.value }))}>
                <option value="">🔨 Margen flip: cualquiera</option>
                <option value="15">flip ≥ 15%</option>
                <option value="25">flip ≥ 25%</option>
                <option value="40">flip ≥ 40%</option>
              </select>
              <select value={filtros.semaforo} style={control}
                      onChange={(e) => setFiltros((f) => ({ ...f, semaforo: e.target.value }))}>
                <option value="">🚦 Documentación: todas</option>
                <option value="verde">solo 🟢 clara</option>
                <option value="sin_rojo">sin 🔴 problema</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input placeholder="Municipio o zona" value={filtros.municipio} style={{ ...control, width: 170 }}
                     onChange={(e) => setFiltros((f) => ({ ...f, municipio: e.target.value }))} />
              <input placeholder="m² mín" type="number" inputMode="numeric" value={filtros.m2min}
                     style={{ ...control, width: 90 }}
                     onChange={(e) => setFiltros((f) => ({ ...f, m2min: e.target.value }))} />
              <input placeholder="m² máx" type="number" inputMode="numeric" value={filtros.m2max}
                     style={{ ...control, width: 90 }}
                     onChange={(e) => setFiltros((f) => ({ ...f, m2max: e.target.value }))} />
              <input placeholder="€/m² máx" type="number" inputMode="numeric" value={filtros.eurM2Max}
                     style={{ ...control, width: 110 }}
                     onChange={(e) => setFiltros((f) => ({ ...f, eurM2Max: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => buscarTodas(true)} disabled={buscando} style={boton(true)}>
                {buscando ? 'Buscando…' : 'Aplicar filtros'}
              </button>
              <button onClick={() => { setFiltros(FILTROS_VACIOS); buscarTodas(true, FILTROS_VACIOS) }}
                      disabled={buscando} style={boton()}>
                Limpiar
              </button>
              <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }}>{totalLista} resultados</span>
            </div>
          </div>

          {lista.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              {totalLista === 0 && pagina === 1 && filtros === FILTROS_VACIOS
                ? 'El corpus está vacío. La ingesta corre a diario desde las alertas del BOE en tu correo.'
                : 'Nada casa con esos filtros.'}
            </p>
          ) : (
            lista.map((r) => (
              <FichaSubasta
                key={r.subasta.dedupeKey}
                s={r.subasta}
                o={r.oportunidad}
                doc={{ semaforo: r.semaforo, analisis: r.analisis, notasEdicto: r.notasEdicto, documentos: r.documentos, documentosMuro: r.documentosMuro, caducidad: r.caducidad }}
                escenarios={r.escenarios}
                params={paramsCoste}
                acciones={<button onClick={() => seguir(r.subasta)} style={boton()}>👀 Seguir</button>}
                extra={
                  <>
                    {/* Etiquetas de lente: qué es y para qué sirve. */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                      {/* El tipo de bien ya sale en las características de la ficha. */}
                      {r.esPlaya && <span>🏖️ costa Huelva</span>}
                      {r.flipApto && r.margenFlipPct != null && (
                        <span style={{ color: r.margenFlipPct >= 0.25 ? 'var(--positive, #15803d)' : 'var(--muted)', fontWeight: 600 }}>
                          🔨 flip ~{Math.round(r.margenFlipPct * 100)}%{r.margenFlip != null && ` (${eur(r.margenFlip)})`}
                        </span>
                      )}
                    </div>
                    {r.precioM2Zona != null && (
                      <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                        📍 Zona{r.zonaPortal ? ` (${r.zonaPortal})` : ''}: ~{Math.round(r.precioM2Zona).toLocaleString('es-ES')}€/m² en venta
                        {r.muestraZona != null && ` (${r.muestraZona} anuncios de Fotocasa)`}
                        {r.subasta.superficie != null && r.subasta.valorSubasta != null && r.subasta.superficie > 0 && (
                          <> — este sale a <strong style={{ color: 'var(--text)' }}>
                            {Math.round(r.subasta.valorSubasta / r.subasta.superficie).toLocaleString('es-ES')}€/m²
                          </strong> al tipo</>
                        )}
                      </p>
                    )}
                    {r.pujaMaxima?.importe != null && (
                      <div style={{ margin: '6px 0 0', fontSize: 13 }}>
                        <p style={{ margin: 0, color: 'var(--text)' }}>
                          🎯 Puja máxima para ≥25% de descuento real (con impuestos y cargas dentro):{' '}
                          <strong>{eur(r.pujaMaxima.importe)}</strong>
                        </p>
                        {/* La viabilidad legal del techo, al lado del techo:
                            ⚠️ inadmisible (por debajo de la puja mínima) es
                            aviso; el resto informa sin alarmar. */}
                        {r.pujaMaxima.notas.map((n, i) => (
                          <p key={i} style={{ margin: '2px 0 0', fontSize: 12, color: r.pujaMaxima?.admisible === false ? 'var(--negative, #b91c1c)' : 'var(--muted)' }}>
                            {r.pujaMaxima?.admisible === false ? '⚠️' : 'ℹ️'} {n}
                          </p>
                        ))}
                      </div>
                    )}
                    <LineaRendimiento r={r.rendimiento} dormitorios={r.dormitorios} />
                  </>
                }
              />
            ))
          )}
          {lista.length < totalLista && (
            <button onClick={() => buscarTodas(false)} disabled={buscando} style={boton()}>
              {buscando ? 'Cargando…' : `Ver más (${totalLista - lista.length} restantes)`}
            </button>
          )}
        </section>
      )}

      {tab === 'mapa' && (
        <section>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
            Todos los inmuebles en subasta vigentes, de un vistazo sobre el mapa. Con referencia
            catastral el punto es el oficial del Catastro; sin ella se marca en hueco el centro del
            municipio — nunca se hace pasar por una dirección exacta.
          </p>
          {/* Montaje perezoso: Leaflet y los puntos solo se cargan al abrir esta pestaña. */}
          <MapaSubastas />
        </section>
      )}

      {tab === 'criterios' && (
        <section style={card}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, color: 'var(--text)' }}>
            <input type="checkbox" checked={crit.activo} onChange={(e) => setCrit({ ...crit, activo: e.target.checked })} />
            Radar activo (avisos por Telegram)
          </label>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Provincias</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PROVINCIAS.map((p) => (
                <button key={p} onClick={() => toggleProvincia(p)} style={boton(crit.provincias.includes(p))}>{p}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
              Precio máximo (€)
              <input
                type="number" inputMode="numeric" style={{ ...control, width: 160 }}
                value={crit.precio_max ?? ''}
                onChange={(e) => setCrit({ ...crit, precio_max: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
              Descuento mínimo (%)
              <input
                type="number" inputMode="numeric" min={0} max={100} style={{ ...control, width: 160 }}
                value={crit.descuento_min}
                onChange={(e) => setCrit({ ...crit, descuento_min: Number(e.target.value) || 0 })}
              />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginTop: 8, color: 'var(--text)' }}>
            <input
              type="checkbox" checked={crit.excluir_ocupadas}
              onChange={(e) => setCrit({ ...crit, excluir_ocupadas: e.target.checked })}
            />
            Excluir inmuebles ocupados
          </label>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
            Ojo: también descarta las de posesión desconocida, que son muchas.
          </p>

          {/* Coste del dinero: sin declararlo NO se computa. Un puente que no
              existe falsearía el coste tanto como ignorar el que sí existe. */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>💸 Cómo financias la compra</div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 10px' }}>
              El art. 670 LEC da <strong>40 días</strong> para consignar el resto del precio y ningún banco
              hipoteca un inmueble que aún no es tuyo: si no pones todo en efectivo necesitas un préstamo
              puente, y esos intereses se comen el margen. Déjalo vacío si pagas al contado.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
                % financiado
                <input
                  type="number" inputMode="decimal" min={0} max={100} style={{ ...control, width: 130 }}
                  value={crit.financia_pct ?? ''}
                  onChange={(e) => setCrit({ ...crit, financia_pct: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
                Interés anual (%)
                <input
                  type="number" inputMode="decimal" min={0} max={60} step="0.1" style={{ ...control, width: 130 }}
                  value={crit.financia_tipo_anual ?? ''}
                  onChange={(e) => setCrit({ ...crit, financia_tipo_anual: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
                Meses del puente
                <input
                  type="number" inputMode="numeric" min={1} max={36} placeholder="4" style={{ ...control, width: 130 }}
                  value={crit.financia_meses ?? ''}
                  onChange={(e) => setCrit({ ...crit, financia_meses: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
                Comisión apertura (%)
                <input
                  type="number" inputMode="decimal" min={0} max={10} step="0.1" style={{ ...control, width: 130 }}
                  value={crit.financia_comision ?? ''}
                  onChange={(e) => setCrit({ ...crit, financia_comision: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </label>
            </div>
          </div>

          <button onClick={guardarCriterios} disabled={guardando} style={{ ...boton(true), marginTop: 14 }}>
            {guardando ? 'Guardando…' : 'Guardar criterios'}
          </button>
        </section>
      )}
    </main>
  )
}
