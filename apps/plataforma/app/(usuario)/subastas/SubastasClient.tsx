'use client'
// Pantalla del radar de subastas. Sigue el patrón de `/empresas` (tokens de
// tema, 50 filas + «Ver más», controles de 44 px) y NO el de `/concursos`, que
// hardcodea colores y se vuelve ilegible en modo oscuro.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { eur } from '@/lib/dinero'
import { estadoDocumentacion, resumenDocumentos, type DocumentoAdjunto } from '@/lib/subastas/resumen-docs'
import { direccionCatastro, esDireccionPostal, titularCargas, urlFichaCatastro, urlGoogleMaps, urlStreetView } from '@central/module-subastas'
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
  coste: { total: number; impuestoTransmision: number; impuestoConcepto: string; baseImponible: number }
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
  /** Anotaciones de embargo pasadas de plazo (art. 86 LH). `null` = ninguna. */
  caducidad?: { cuantas: number; importeSiCaducan: number | null } | null
}
interface Resultado {
  subasta: Subasta; oportunidad: Oportunidad; rendimiento?: Rendimiento | null
  dormitorios?: number | null; pujaMaxima?: number | null; notasEdicto?: string | null
  tipoBien?: string | null; esPlaya?: boolean; margenFlip?: number | null
  margenFlipPct?: number | null; flipApto?: boolean; semaforo?: string | null
  analisis?: PuntoAnalisis[] | null; documentos?: DocumentoAdjunto[] | null
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
}
interface Inicial {
  resultados: Resultado[]
  total: number
  criterios: Criterios
  radar: FilaRadar[]
  tesoreria: Tesoreria | null
  chollos: Chollo[]
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
  const sinRevisar = estadoDocumentacion(docs, publicaAdjuntos) === 'sin_revisar'
  const puntos = d?.analisis ?? []
  const cargasTexto = (s.cargasTexto ?? '').trim()

  // Titular: qué pasa con las cargas, sin abrir nada. Cinco estados, no tres —
  // «no lo hemos leído» y «el BOE no lo publica» mandan a sitios distintos.
  const titular = titularCargas({
    cargas: s.cargas,
    cargasConocidas: s.cargasConocidas,
    documentos: docs,
    publicaAdjuntos,
  })

  // Solo se calla cuando no hay NADA que decir: cargas leídas y sin nada que
  // subsista. Un «no se sabe» siempre se pinta (antes `cargasConocidas`
  // `undefined` caía en el 🟢 y la ficha afirmaba que no había cargas).
  if (titular.estado === 'sin_cargas' && !cargasTexto && notas.length === 0 && !docs?.length && puntos.length === 0) {
    return null
  }

  const resumenDocs = resumenDocumentos(docs, publicaAdjuntos)

  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
        ⚖️ {titular.emoji} {titular.texto}
        {titular.importe != null && <strong> {eur(titular.importe)}</strong>}
      </p>
      {/* El PDF que resuelve la duda, a un toque: decirle «pide la certificación
          registral» teniéndola enlazada aquí mismo es mandarlo al Registro para
          nada. Botón de 44 px (regla táctil del repo). */}
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

function FichaSubasta({ s, o, acciones, extra, doc }: { s: Subasta; o?: Oportunidad | null; acciones?: React.ReactNode; extra?: React.ReactNode; doc?: Documental | null }) {
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
        {s.provincia && <span>📍 {s.municipio ? `${s.municipio} (${s.provincia})` : s.provincia}</span>}
        {cierre && <span>⏰ cierra {cierre}</span>}
        {s.valorSubasta != null && <span>salida {eur(s.valorSubasta)}</span>}
        {s.tasacion != null && <span>tasación {eur(s.tasacion)}</span>}
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

      {/* El origen del valor va SIEMPRE junto a la cifra: una estimación por
          comparables no puede parecer una tasación. */}
      {o?.valorMercado != null && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
          Valor de mercado {eur(o.valorMercado)} · {ORIGEN_VALOR[o.origenValor ?? 'tasacion']}
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
        </div>
      )}

      {o && o.coste.total > 0 && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text)' }}>
          Coste real estimado: <strong>{eur(o.coste.total)}</strong>
          {o.deposito != null && <> · depósito para pujar {eur(o.deposito)}</>}
        </div>
      )}

      {/* Montaje perezoso: el detalle solo se renderiza al abrirlo. */}
      {o && (
        <>
          <button onClick={() => setAbierto((v) => !v)} style={{ ...boton(), marginTop: 10, minHeight: 36 }}>
            {abierto ? 'Ocultar detalle' : 'Ver detalle del coste'}
          </button>
          {abierto && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text)' }}>
              <div style={{ marginBottom: 6 }}>
                {o.coste.impuestoConcepto} sobre {eur(o.coste.baseImponible)} ={' '}
                <strong>{eur(o.coste.impuestoTransmision)}</strong>
              </div>
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
  const [tab, setTab] = useState<'radar' | 'chollos' | 'todas' | 'mapa' | 'criterios'>('radar')
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
  // Filtros de la pestaña Todas: server-side contra /api/subastas. La lista
  // local arranca con el SSR y se sustituye/expande con cada búsqueda.
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [lista, setLista] = useState<Resultado[]>(inicial?.resultados ?? [])
  const [totalLista, setTotalLista] = useState(inicial?.total ?? 0)
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(false)
  // Filtros de la pestaña Chollos: client-side (la lista completa ya viene del SSR).
  const [fch, setFch] = useState({ soloParticulares: false, portal: 'all', zona: '', precioMax: '' })
  const chollosFiltrados = useMemo(() => {
    const zona = fch.zona.trim().toLowerCase()
    const precioMax = parseInt(fch.precioMax, 10)
    return (datos?.chollos ?? []).filter((ch) => {
      if (fch.soloParticulares && !ch.comparable.esParticular) return false
      // Los comparables viejos de Idealista no llevan `portal`: se asume idealista.
      if (fch.portal !== 'all' && (ch.comparable.portal ?? 'idealista') !== fch.portal) return false
      if (zona && !`${ch.comparable.titulo} ${ch.comparable.zona ?? ''} ${ch.zona}`.toLowerCase().includes(zona)) return false
      if (Number.isFinite(precioMax) && ch.comparable.precio > precioMax) return false
      return true
    })
  }, [datos?.chollos, fch])

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
      setDatos((d) => (d ? { ...d, radar: j.anuncios ?? [] } : d))
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
        <button onClick={() => setTab('chollos')} style={boton(tab === 'chollos')}>
          💡 Chollos {datos.chollos.length > 0 && `(${datos.chollos.length})`}
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

      {tab === 'chollos' && (
        <section>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
            Anuncios de tus alertas de Idealista y Fotocasa muy por debajo de la mediana €/m² de su
            zona. Es la otra cara del mismo dato que valora las subastas: aquí no se puja, se llama.
            Los de particular se marcan 👤 — negociación directa.
          </p>
          {datos.chollos.length > 0 && (
            <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => { setFch((f) => ({ ...f, soloParticulares: !f.soloParticulares })); setVisibles(PAGE) }}
                style={{ ...boton(fch.soloParticulares), padding: '0 10px', fontSize: 13 }}>
                👤 Solo particulares
              </button>
              <select value={fch.portal}
                      onChange={(e) => { setFch((f) => ({ ...f, portal: e.target.value })); setVisibles(PAGE) }}
                      style={{ ...control, fontSize: 13 }}>
                <option value="all">Ambos portales</option>
                <option value="idealista">Idealista</option>
                <option value="fotocasa">Fotocasa</option>
              </select>
              <input value={fch.zona} placeholder="Municipio o zona"
                     onChange={(e) => { setFch((f) => ({ ...f, zona: e.target.value })); setVisibles(PAGE) }}
                     style={{ ...control, fontSize: 13, width: 160 }} />
              <input value={fch.precioMax} placeholder="Precio máx. €" inputMode="numeric"
                     onChange={(e) => { setFch((f) => ({ ...f, precioMax: e.target.value.replace(/\D/g, '') })); setVisibles(PAGE) }}
                     style={{ ...control, fontSize: 13, width: 110 }} />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                {chollosFiltrados.length === datos.chollos.length
                  ? `${datos.chollos.length} chollos`
                  : `${chollosFiltrados.length} de ${datos.chollos.length}`}
              </span>
            </div>
          )}
          {datos.chollos.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              Ningún anuncio destaca sobre su zona ahora mismo. Cuantas más búsquedas guardadas
              de vivienda tengas en Idealista, más zonas vigila esto.
            </p>
          ) : chollosFiltrados.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              Ningún chollo pasa estos filtros. {fch.soloParticulares && 'Los particulares son pocos: prueba a quitar el resto de filtros. '}
              El corpus crece con cada pasada diaria de tus alertas.
            </p>
          ) : (
            chollosFiltrados.slice(0, visibles).map((ch) => (
              <div key={ch.comparable.refAnuncio} style={{ ...card, borderLeft: '4px solid var(--positive, #16a34a)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <strong style={{ color: 'var(--text)', fontSize: 15 }}>{ch.comparable.titulo}</strong>
                  <span style={{ fontWeight: 700, color: ch.sospechoso ? 'var(--warning, #b45309)' : 'var(--positive, #15803d)' }}>
                    −{(ch.descuento * 100).toFixed(0)}%{ch.sospechoso && ' ⚠️'}
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', color: 'var(--text)', fontSize: 14 }}>
                  {eur(ch.comparable.precio)}
                  {ch.comparable.superficie != null && ` · ${ch.comparable.superficie} m²`}
                  {ch.comparable.habitaciones != null && ` · ${ch.comparable.habitaciones} hab.`}
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                  {Math.round(ch.comparable.precioM2 ?? 0)}€/m² frente a {Math.round(ch.precioM2Zona)}€/m² de{' '}
                  {ch.zona} (mediana de {ch.muestra} anuncios{ch.fuente === 'portal' ? ' del buscador de Fotocasa' : ', sin contar este'})
                  {ch.comparable.portal === 'fotocasa' && ' · Fotocasa'}
                </p>
                {ch.comparable.esParticular ? (
                  <p style={{ margin: '4px 0 0', color: 'var(--positive, #15803d)', fontSize: 13, fontWeight: 600 }}>
                    👤 Anuncio de PARTICULAR — negociación directa, sin comisión de agencia
                  </p>
                ) : ch.comparable.anunciante ? (
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                    🏢 Anuncia: {ch.comparable.anunciante}
                  </p>
                ) : null}
                {(ch.comparable.bajadas ?? 0) > 0 && ch.comparable.precioInicial != null &&
                  ch.comparable.precioInicial > ch.comparable.precio && (
                  <p style={{ margin: '4px 0 0', color: 'var(--positive, #15803d)', fontSize: 13 }}>
                    ⬇️ Ha bajado {ch.comparable.bajadas} {ch.comparable.bajadas === 1 ? 'vez' : 'veces'}: de{' '}
                    {eur(ch.comparable.precioInicial)} a {eur(ch.comparable.precio)} — vendedor negociable
                  </p>
                )}
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                  {ch.antiguedadDias != null
                    ? `⏳ En venta desde hace ~${ch.antiguedadDias >= 60 ? `${Math.round(ch.antiguedadDias / 30)} meses` : `${ch.antiguedadDias} días`}${ch.antiguedadCapada ? ' o más' : ''} (estimado por el nº de anuncio)`
                    : ch.comparable.vistoDesde
                      ? `👀 Lo vemos desde el ${new Date(ch.comparable.vistoDesde).toLocaleDateString('es-ES')} (la antigüedad real no la publica el portal)`
                      : null}
                </p>
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
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
                </div>
                {oferta?.ref === ch.comparable.refAnuncio && (
                  <pre style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--bg)',
                                color: 'var(--text)', fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                    {oferta.texto}
                  </pre>
                )}
              </div>
            ))
          )}
          {chollosFiltrados.length > visibles && (
            <button onClick={() => setVisibles((v) => v + PAGE)} style={boton()}>Ver más</button>
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
                doc={{ semaforo: r.semaforo, analisis: r.analisis, notasEdicto: r.notasEdicto, documentos: r.documentos, caducidad: r.caducidad }}
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
                    {r.pujaMaxima != null && (
                      <p style={{ margin: '6px 0 0', color: 'var(--text)', fontSize: 13 }}>
                        🎯 Puja máxima para ≥25% de descuento real (con impuestos y cargas dentro):{' '}
                        <strong>{eur(r.pujaMaxima)}</strong>
                      </p>
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
