'use client'
// Pantalla del radar de subastas. Sigue el patrón de `/empresas` (tokens de
// tema, 50 filas + «Ver más», controles de 44 px) y NO el de `/concursos`, que
// hardcodea colores y se vuelve ilegible en modo oscuro.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { eur } from '@/lib/dinero'
import { urlGoogleMaps } from '@central/module-subastas'
import MapaSubastas from './MapaSubastas'

const PAGE = 50
const PROVINCIAS = ['Sevilla', 'Huelva', 'Cádiz', 'Asturias']

interface Oportunidad {
  puntuacion: number | null
  descuento: number | null
  deposito: number | null
  valorMercado: number | null
  origenValor?: 'tasacion' | 'valor_referencia' | 'comparables' | null
  coste: { total: number; impuestoTransmision: number; impuestoConcepto: string; baseImponible: number }
  motivos: string[]
  avisos: string[]
}
interface Subasta {
  dedupeKey: string
  identificador?: string | null
  tipo: string
  provincia?: string | null
  municipio?: string | null
  direccion?: string | null
  lat?: number | null
  lon?: number | null
  geoPrecision?: string | null
  descripcion?: string | null
  url?: string | null
  fechaFin?: string | null
  valorSubasta?: number | null
  tasacion?: number | null
  situacionPosesoria?: string
  superficie?: number | null
  superficieOrigen?: 'catastro' | 'anuncio' | null
  anioConstruccion?: number | null
  usoCatastral?: string | null
  refCatastral?: string | null
  tipoBien?: string | null
  dormitorios?: number | null
  banos?: number | null
  planta?: string | null
}
interface Rendimiento { ingresoAnual: number; yieldBruto: number; aniosRecuperacion: number }
interface PuntoAnalisis { clave: string; nivel: 'verde' | 'ambar' | 'rojo'; detalle: string }
interface Resultado {
  subasta: Subasta; oportunidad: Oportunidad; rendimiento?: Rendimiento | null
  dormitorios?: number | null; pujaMaxima?: number | null; notasEdicto?: string | null
  tipoBien?: string | null; esPlaya?: boolean; margenFlip?: number | null
  margenFlipPct?: number | null; flipApto?: boolean; semaforo?: string | null
  analisis?: PuntoAnalisis[] | null
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
  }
  zona: string
  precioM2Zona: number
  muestra: number
  descuento: number
  sospechoso: boolean
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
  if (plan.pico <= 0) return null
  const falta = plan.deficit != null && plan.deficit > 0

  return (
    <div style={{ ...card, borderLeft: `4px solid ${falta ? 'var(--danger, #dc2626)' : 'var(--success, #16a34a)'}` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline' }}>
        <strong style={{ color: 'var(--text)', fontSize: 15 }}>💰 Depósitos para pujar</strong>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {t.origen === 'seguidas'
            ? 'de las subastas que sigues'
            : 'simulación: si pujaras en todo lo que ha casado con tu radar'}
        </span>
      </div>

      <p style={{ margin: '8px 0 0', color: 'var(--text)', fontSize: 14 }}>
        Necesitas <strong>{eur(plan.pico)}</strong> bloqueados a la vez
        {plan.picoDesde && ` desde el ${fechaCorta(plan.picoDesde)}`}
        {plan.picoSubastas.length > 1 && ` (${plan.picoSubastas.length} subastas solapadas)`}.
      </p>
      {plan.total > plan.pico && (
        <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          La suma de todos los depósitos es {eur(plan.total)}, pero no coinciden todos en el tiempo.
        </p>
      )}

      <p style={{ margin: '6px 0 0', fontSize: 14, color: falta ? 'var(--danger, #dc2626)' : 'var(--text)' }}>
        {saldo.cuentas === 0
          ? '⚠️ No hay saldo de cuentas corrientes con el que contrastar.'
          : falta
            ? `🚨 Disponible ${eur(saldo.total)} → faltan ${eur(plan.deficit!)}.`
            : `✅ Disponible ${eur(saldo.total)}, suficiente.`}
      </p>
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
 * Qué es y cómo es el inmueble: m², dormitorios, baños, planta, año y dirección.
 * Es lo primero que se mira y hasta ahora no salía en ninguna ficha, aunque el
 * dato ya estuviera en la BD (se usaba solo para calcular el €/m² y el yield).
 *
 * Las superficies del Catastro y de la escritura discrepan a menudo, así que el
 * origen va pegado a la cifra. Cuando el anuncio no publica nada se dice —
 * callar parecería un fallo de la pantalla, que es justo la duda que generó esto.
 */
function Caracteristicas({ s }: { s: Subasta }) {
  const partes: string[] = []
  if (s.tipoBien && TIPO_LABEL[s.tipoBien]) partes.push(TIPO_LABEL[s.tipoBien])
  if (s.superficie != null && s.superficie > 0) {
    partes.push(`${s.superficie.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m²${s.superficieOrigen === 'catastro' ? ' (Catastro)' : s.superficieOrigen === 'anuncio' ? ' (escritura)' : ''}`)
  }
  if (s.dormitorios != null) partes.push(`${s.dormitorios} dorm.`)
  if (s.banos != null) partes.push(`${s.banos} baño${s.banos === 1 ? '' : 's'}`)
  if (s.planta) partes.push(`planta ${s.planta}`)
  if (s.anioConstruccion != null) partes.push(`construido en ${s.anioConstruccion}`)
  if (s.usoCatastral) partes.push(`uso ${s.usoCatastral.toLowerCase()}`)

  if (partes.length === 0 && !s.direccion && !s.refCatastral) {
    return (
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
        🏚️ El anuncio no publica las características del inmueble (ni m², ni distribución).
      </p>
    )
  }

  return (
    <div style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text)' }}>
      {partes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
          {partes.map((p, i) => <span key={i}>{p}</span>)}
        </div>
      )}
      {s.direccion && (
        <div style={{ marginTop: 2, color: 'var(--muted)', fontSize: 12 }}>📌 {s.direccion}</div>
      )}
      {s.refCatastral && (
        <div style={{ marginTop: 2, color: 'var(--muted)', fontSize: 12 }}>🗂️ Ref. catastral {s.refCatastral}</div>
      )}
    </div>
  )
}

function FichaSubasta({ s, o, acciones, extra }: { s: Subasta; o?: Oportunidad | null; acciones?: React.ReactNode; extra?: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const cierre = fecha(s.fechaFin)
  // Coordenadas exactas del Catastro si las hay; si no, búsqueda por dirección
  // o municipio. Sin ninguna pista de ubicación, el botón no sale.
  const mapsUrl = urlGoogleMaps(s)

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <strong style={{ color: 'var(--text)' }}>{s.identificador ?? s.dedupeKey}</strong>
        {o && <Puntuacion v={o.puntuacion} />}
      </div>

      {/* Primero QUÉ es (m², distribución, dirección); la descripción registral
          después: es densa y a veces solo dice «ver certificación de cargas». */}
      <Caracteristicas s={s} />

      {s.descripcion && (
        <p style={{ margin: '8px 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>
          {s.descripcion.slice(0, 240)}
          {s.descripcion.length > 240 ? '…' : ''}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
        {s.provincia && <span>📍 {s.provincia}</span>}
        {cierre && <span>⏰ cierra {cierre}</span>}
        {s.valorSubasta != null && <span>salida {eur(s.valorSubasta)}</span>}
        {s.tasacion != null && <span>tasación {eur(s.tasacion)}</span>}
        {s.situacionPosesoria === 'ocupada' && <span>⚠️ ocupada</span>}
      </div>

      {/* El origen del valor va SIEMPRE junto a la cifra: una estimación por
          comparables no puede parecer una tasación. */}
      {o?.valorMercado != null && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
          Valor de mercado {eur(o.valorMercado)} · {ORIGEN_VALOR[o.origenValor ?? 'tasacion']}
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {s.url && (
          <a href={s.url} target="_blank" rel="noreferrer" style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            Ver ficha oficial
          </a>
        )}
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            📍 Google Maps{s.lat == null || s.geoPrecision === 'municipio' ? ' (aprox.)' : ''}
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
      setAviso(r.ok ? 'Criterios guardados.' : 'No se pudieron guardar.')
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
                {ch.sospechoso && (
                  <p style={{ margin: '4px 0 0', color: 'var(--warning, #b45309)', fontSize: 12 }}>
                    Descuento anormalmente alto: suele ser un error del anuncio o una reforma integral. Verifícalo.
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
                🏖️ Costa de Huelva
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
                    {r.semaforo && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text)', minHeight: 36, display: 'flex', alignItems: 'center' }}>
                          {NIVEL_EMOJI[r.semaforo]} Análisis documental{' '}
                          {r.semaforo === 'verde' ? '— sin pegas detectadas' : r.semaforo === 'rojo' ? '— problema serio' : '— hay que verificar'}
                        </summary>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
                          {(r.analisis ?? []).map((pt) => (
                            <li key={pt.clave}>{NIVEL_EMOJI[pt.nivel]} {pt.detalle}</li>
                          ))}
                        </ul>
                      </details>
                    )}
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
                    {(r.notasEdicto ?? '').split('\n').filter(Boolean).map((n) => (
                      <p key={n} style={{ margin: '6px 0 0', color: 'var(--text)', fontSize: 13 }}>📄 {n}</p>
                    ))}
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

          <button onClick={guardarCriterios} disabled={guardando} style={boton(true)}>
            {guardando ? 'Guardando…' : 'Guardar criterios'}
          </button>
        </section>
      )}
    </main>
  )
}
