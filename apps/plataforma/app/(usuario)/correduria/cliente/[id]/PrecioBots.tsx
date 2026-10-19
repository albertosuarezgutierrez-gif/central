'use client'

// «Bots (gratis)» (14/10/2026; nació en `moto-nuevo/PrecioPorBot.tsx` el 13/10/2026): bloque ÚNICO, igual para todos los ramos,
// que pide precio a los bots Playwright del tarificador RPA con los MISMOS datos del formulario del ramo. Lista las compañías
// con bot ACTIVO en ese ramo (`/api/correduria/tarificador/integraciones`) y pinta un botón por compañía; cada fila encola y
// sigue su trabajo. Una compañía nueva con bot aparece sola. Qué datos valen para cada ramo lo decide su ADAPTADOR
// (`lib/tarificador-bots-ramos.ts`); sin adaptador o sin integraciones, una línea discreta y ningún botón muerto.
// Solo PRECIO: no emite ni contrata. Sin cargo de Codeoscopic (el flujo de pago es «Avant2 — 0,50€»).
// Patrón de lista + seguimiento de `ProbarTarificacion.tsx` (mismas lecturas defensivas de `lib/tarificador-probar.ts`).
//
// Anfitrión: la carcasa `PedirPrecioEmbebido` publica un hueco (`HuecoBotsContext`) ENCIMA de la sección Avant2 y el bloque se
// pinta ahí con un portal aunque lo monte el cotizador del ramo (que es quien tiene el formulario). Sin hueco (pantalla
// completa del cotizador) se pinta en línea. Un solo bloque por pantalla.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Check, Info, X, UserRound } from 'lucide-react'
import { btnStyle, cardStyle, CardHeader } from '@/components/ui'
import {
  SONDEO_MS, SONDEO_TOPE_MS, leerIntegraciones, leerTrabajo, resumenTrabajo, rotuloCompania,
  type IntegracionVista, type TrabajoVista,
} from '@/lib/tarificador-probar'
import { leerEncoladoBot } from '@/lib/tarificador-moto-formulario'
import { adaptadorDeRamo, checklistBot, type ResultadoAdaptadorBot } from '@/lib/tarificador-bots-ramos'
import { avisoDeChecklist, resumenFilas, type ChecklistCompania, type EstadoFila } from '@/lib/tarificador-checklist'
import { describirFalloRed } from '@/lib/tarificador-asegura-reglas'
import { loteConOk, loteTerminado, ordenEncolado, resumenLote, type FilaLote } from '@/lib/tarificador-todas'
import PrepararPresupuestoBot from '../../oportunidad/[id]/PrepararPresupuestoBot'

/** Elemento donde la carcasa quiere el bloque (encima de Avant2). `null` = pintar en línea. */
export const HuecoBotsContext = createContext<HTMLElement | null>(null)

/**
 * Anfitrión de la ficha de la oportunidad (14/10/2026): el bloque «Bots (gratis)» tiene entrada PROPIA (`BotsAutoRiesgo`, con el
 * formulario sacado del riesgo, sin Avant2). Cuando el cotizador Avant2 también monta el suyo (que lee lo tecleado en su
 * formulario), este se REGISTRA como ocupado y el propio se aparta: nunca dos bloques de bots a la vez.
 */
export const AnfitrionBotsContext = createContext<{ ocupado: boolean; ocupar: (b: boolean) => void } | null>(null)

const TONO: Record<'curso' | 'ok' | 'aviso' | 'error', string> = {
  curso: 'var(--muted)', ok: 'var(--positive)', aviso: 'var(--warning)', error: 'var(--negative)',
}

async function pedirJson(url: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init })
    return { status: r.status, json: await r.json().catch(() => null) }
  } catch (e) {
    // Sin logs en el navegador (guardián del bloque): el motivo (timeout|red) viaja al mensaje de la fila.
    return { status: 502, json: { estado: 'error', motivo: describirFalloRed(e).motivo } }
  }
}

type Integraciones = { estado: 'cargando' } | { estado: 'error'; mensaje: string } | { estado: 'ok'; lista: IntegracionVista[] }
type Seguimiento = { trabajoId: string; duplicado: boolean; mensajePrevio: string | null; trabajo: TrabajoVista | null; aviso: string | null; agotado: boolean }

const sinBots = (texto: string, estado?: string) => (
  <div style={cardStyle}>
    <CardHeader title="Bots (gratis)" />
    <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{texto}</p>
    {estado && <p role="note" style={{ fontSize: 13, color: 'var(--warning)', margin: '8px 0 0' }}>{estado}</p>}
  </div>
)

export default function PrecioBots({ ramo, clienteId, oportunidadId, formulario, inicialesExtra, bloqueosPorCompania }: {
  ramo: string
  clienteId: string
  oportunidadId: string | null
  /** Lo que el cotizador del ramo ya sabe (lo entiende el adaptador del ramo). */
  formulario: unknown
  /** Valores iniciales de los campos extra del adaptador (p. ej. `{ cilindrada: '125' }`). */
  inicialesExtra?: Record<string, string>
  /** Compañía → aviso de por qué su bot no puede encolar con esta ficha (p. ej. Mapfre sin nombre del tomador). */
  bloqueosPorCompania?: Record<string, string>
}) {
  const hueco = useContext(HuecoBotsContext)
  const anfitrion = useContext(AnfitrionBotsContext)
  const adaptador = adaptadorDeRamo(ramo)
  const ocupar = anfitrion?.ocupar
  // Montado por el cotizador (hay hueco) dentro de una ficha con entrada propia: avisa de que ya hay un bloque pintado.
  const registrado = !!hueco && !!adaptador && !!ocupar
  useEffect(() => {
    if (!registrado || !ocupar) return
    ocupar(true)
    return () => ocupar(false)
  }, [registrado, ocupar])
  const bloque = adaptador
    ? <BloqueBots ramo={ramo} adaptador={adaptador} clienteId={clienteId} oportunidadId={oportunidadId} formulario={formulario} inicialesExtra={inicialesExtra} bloqueosPorCompania={bloqueosPorCompania} />
    : sinBots('Sin bots para este ramo todavía.')
  return hueco ? createPortal(bloque, hueco) : bloque
}

function BloqueBots({ ramo, adaptador, clienteId, oportunidadId, formulario, inicialesExtra, bloqueosPorCompania }: {
  ramo: string
  adaptador: NonNullable<ReturnType<typeof adaptadorDeRamo>>
  clienteId: string
  oportunidadId: string | null
  formulario: unknown
  inicialesExtra?: Record<string, string>
  bloqueosPorCompania?: Record<string, string>
}) {
  const [integ, setInteg] = useState<Integraciones>({ estado: 'cargando' })
  const [extra, setExtra] = useState<Record<string, string>>(() => ({ ...inicialesExtra }))

  // Solo la última petición escribe: una respuesta tardía de otro ramo no pisa la lista.
  const peticion = useRef(0)
  const cargar = useCallback(async () => {
    const yo = ++peticion.current
    setInteg({ estado: 'cargando' })
    const r = await pedirJson('/api/correduria/tarificador/integraciones')
    const l = leerIntegraciones(r.status, r.json)
    if (yo !== peticion.current) return
    setInteg(l.ok ? { estado: 'ok', lista: l.integraciones.filter((i) => i.ramo === ramo) } : { estado: 'error', mensaje: l.mensaje })
  }, [ramo])
  useEffect(() => { void cargar() }, [cargar])

  const lista = integ.estado === 'ok' ? integ.lista : []
  // Revisado y sin ninguna compañía: línea discreta, ni campos ni botones.
  if (integ.estado === 'ok' && lista.length === 0) return sinBots(adaptador.sinIntegraciones ?? 'Sin bots para este ramo todavía.', adaptador.estado)

  const resultado = adaptador.construir(formulario, extra)
  return (
    <div style={cardStyle}>
      <CardHeader title="Bots (gratis)" sub="Pide precio al portal de la compañía con los datos de este formulario. No cuesta 0,50€, tarda un par de minutos y solo da precio: no emite." />
      {adaptador.estado && <p role="note" style={{ fontSize: 13, color: 'var(--warning)', margin: '8px 0 0', overflowWrap: 'anywhere' }}>{adaptador.estado}</p>}
      {adaptador.campos.map((c) => (
        <label key={c.clave} style={{ display: 'grid', gap: 4, fontSize: 13, maxWidth: 260, marginTop: 8 }}>
          <span>{c.etiqueta}{c.ayuda && <span style={{ color: 'var(--muted)' }}> — {c.ayuda}</span>}</span>
          {c.opciones ? (
            <select value={extra[c.clave] ?? c.porDefecto ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [c.clave]: e.target.value }))}
              style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
              {c.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select>
          ) : (
            <input inputMode={c.texto ? 'text' : 'numeric'} maxLength={c.maxLength} autoComplete="off" value={extra[c.clave] ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [c.clave]: e.target.value }))} placeholder={c.placeholder}
              style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%' }} />
          )}
        </label>
      ))}
      {!resultado.ok && (
        <div role="status" style={{ fontSize: 13, color: 'var(--warning)', marginTop: 10 }}>
          <strong>Para pedir precio por bot falta:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{resultado.faltan.map((f) => <li key={f} style={{ overflowWrap: 'anywhere' }}>{f}</li>)}</ul>
        </div>
      )}
      {integ.estado === 'cargando' && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>Cargando las compañías con bot…</p>}
      {integ.estado === 'error' && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--negative)', margin: '10px 0 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {integ.mensaje}
          <button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Reintentar</button>
        </p>
      )}
      {lista.length > 0 && (
        <PedirATodas ramo={ramo} clienteId={clienteId} oportunidadId={oportunidadId} formulario={resultado}
          companias={lista.map((i) => {
            const check = checklistBot(adaptador, formulario, extra, i.compania)
            return { compania: i.compania, bloqueo: bloqueosPorCompania?.[i.compania] ?? (resultado.ok ? avisoDeChecklist(check) : null) }
          })} />
      )}
      <div style={{ display: 'grid', gap: 12, marginTop: lista.length ? 12 : 0 }}>
        {lista.map((i) => {
          // Aviso fijo de la ficha (bloqueosPorCompania) o, si no hay, lo que falta SOLO para esa compañía según su checklist de
          // datos obligatorios (`faltanParaTarificar`); sin declaración = no disponible. En todos los casos el botón no encola.
          const check = checklistBot(adaptador, formulario, extra, i.compania)
          const bloqueo = bloqueosPorCompania?.[i.compania] ?? (resultado.ok ? avisoDeChecklist(check) : null)
          return (
            <FilaBot key={i.clave} integracion={i} ramo={ramo} clienteId={clienteId} oportunidadId={oportunidadId}
              formulario={bloqueo && resultado.ok ? { ok: false, faltan: [bloqueo] } : resultado} aviso={bloqueo} checklist={check} />
          )
        })}
      </div>
    </div>
  )
}

/**
 * «Pedir precio a todas» (19/10/2026): UN botón que encola el bot de cada compañía con integración activa del ramo, con el
 * mismo riesgo del formulario y el MISMO endpoint que los botones por compañía (que siguen debajo, como secundarios). Las de
 * origen del vehículo (Allianz/Mapfre) van antes; Generali se encadena sola en asegura (`esperaVehiculo`). Estado por compañía,
 * nunca tragado. Al terminar todos se OFRECE «Preparar presupuesto» (solo borrador: no se envía nada al cliente).
 */
function PedirATodas({ ramo, clienteId, oportunidadId, formulario, companias }: {
  ramo: string; clienteId: string; oportunidadId: string | null
  formulario: ResultadoAdaptadorBot
  companias: { compania: string; bloqueo: string | null }[]
}) {
  const [ocupado, setOcupado] = useState(false)
  const [filas, setFilas] = useState<FilaLote[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const enVuelo = useRef(false)
  const generacion = useRef(0)
  const filasRef = useRef<FilaLote[]>([]) // lo último publicado: el sondeo lo lee sin depender del render
  const publicar = useCallback((f: FilaLote[]) => { filasRef.current = f; setFilas(f) }, [])
  const montado = useRef(true)
  useEffect(() => { montado.current = true; return () => { montado.current = false; generacion.current += 1 } }, [])

  const sondear = useCallback(async (mia: number) => {
    const inicio = Date.now()
    while (mia === generacion.current && Date.now() - inicio < SONDEO_TOPE_MS) {
      await new Promise((r) => setTimeout(r, SONDEO_MS))
      if (mia !== generacion.current) return
      let vivos = 0
      const nuevos = new Map<string, { final: boolean; ok: boolean }>()
      for (const f of filasRef.current) {
        if (f.estado !== 'encolada' || f.final) continue
        const r = await pedirJson(`/api/correduria/tarificador/trabajo/${encodeURIComponent(f.trabajoId)}`)
        const l = leerTrabajo(r.status, r.json)
        if (l.ok && resumenTrabajo(l.trabajo).final) nuevos.set(f.trabajoId, { final: true, ok: l.trabajo.estado === 'ok' && l.trabajo.ofertas.length > 0 })
        else vivos++
      }
      if (mia !== generacion.current) return
      if (nuevos.size) publicar(filasRef.current.map((f) => (f.estado === 'encolada' && nuevos.has(f.trabajoId) ? { ...f, ...nuevos.get(f.trabajoId)! } : f)))
      if (vivos === 0) return
    }
    if (mia === generacion.current && montado.current && filasRef.current.some((f) => f.estado === 'encolada' && !f.final)) {
      setAviso('Siguen en marcha; míralo en Presupuestos o recarga.')
    }
  }, [publicar])

  async function pedirTodas() {
    if (!formulario.ok || enVuelo.current) return
    enVuelo.current = true
    generacion.current += 1
    const mia = generacion.current
    setOcupado(true); setAviso(null); publicar([])
    const acumulado: FilaLote[] = []
    try {
      const bloqueos = new Map(companias.map((c) => [c.compania.toLowerCase(), c.bloqueo]))
      // Secuencial: las de origen del vehículo se encolan antes que Generali.
      for (const compania of ordenEncolado(companias.map((c) => c.compania))) {
        if (mia !== generacion.current) break
        const bloqueo = bloqueos.get(compania)
        let fila: FilaLote
        if (bloqueo) fila = { compania, estado: 'omitida', mensaje: bloqueo }
        else {
          const r = await pedirJson('/api/correduria/tarificador/encolar', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              clienteId, oportunidadId, ramo, compania, riesgo: formulario.riesgo,
              ...(formulario.completarDesdeFicha.length ? { completarDesdeFicha: formulario.completarDesdeFicha } : {}),
            }),
          })
          const e = leerEncoladoBot(r.status, r.json)
          fila = e.ok ? { compania, estado: 'encolada', trabajoId: e.trabajoId, duplicado: e.duplicado, final: false, ok: false } : { compania, estado: 'rechazada', mensaje: e.mensaje }
        }
        if (mia !== generacion.current) break
        acumulado.push(fila)
        publicar([...acumulado])
      }
      if (mia !== generacion.current) return
      if (acumulado.some((f) => f.estado === 'encolada')) void sondear(mia)
      else setAviso('No se ha encolado ninguna compañía: mira el motivo de cada una.')
    } finally {
      enVuelo.current = false
      if (montado.current) setOcupado(false)
    }
  }

  const terminado = loteTerminado(filas)
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 12, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <button type="button" onClick={() => void pedirTodas()} disabled={!formulario.ok || ocupado} aria-busy={ocupado}
        title="Encola el bot de todas las compañías con integración activa en este ramo (solo precio: no emite)."
        style={{ ...btnStyle('primario'), minHeight: 44, width: '100%', maxWidth: 420, whiteSpace: 'normal', opacity: !formulario.ok || ocupado ? 0.6 : 1 }}>
        <Bot size={16} aria-hidden /> {ocupado ? 'Encolando…' : 'Pedir precio a todas'}
      </button>
      <div aria-live="polite" style={{ display: 'grid', gap: 4, fontSize: 13, minWidth: 0 }}>
        {filas.length > 0 && (<>
          <strong>{resumenLote(filas)}</strong>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            {filas.map((f) => (
              <li key={f.compania} style={{ overflowWrap: 'anywhere', color: f.estado === 'encolada' ? 'var(--text)' : 'var(--warning)' }}>
                <strong>{rotuloCompania(f.compania)}:</strong>{' '}
                {f.estado === 'encolada'
                  ? `${f.duplicado ? 'ya había un trabajo en marcha' : 'encolado'} — ${f.final ? (f.ok ? 'con precio' : 'terminó sin precio') : 'en marcha'}`
                  : f.mensaje}
              </li>
            ))}
          </ul>
          <span style={{ color: 'var(--muted)' }}>El detalle de cada precio sale al pulsar su botón de abajo o en «Presupuestos».</span>
        </>)}
      </div>
      {aviso && <span role="alert" style={{ fontSize: 13, color: 'var(--negative)' }}>{aviso}</span>}
      {terminado && oportunidadId && loteConOk(filas) && (
        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Los bots han terminado. Puedes preparar el borrador del presupuesto (no se envía nada al cliente).</span>
          <PrepararPresupuestoBot oportunidadId={oportunidadId} />
        </div>
      )}
    </div>
  )
}

function FilaBot({ integracion, clienteId, oportunidadId, formulario, ramo, aviso, checklist }: {
  integracion: IntegracionVista
  /** Por qué ESTA compañía no puede encolar con la ficha actual (se pinta bajo su botón). */
  aviso?: string | null
  /** Datos que pide el bot de esta compañía: ✓ están, ✗ faltan, «de la ficha» no bloquea. */
  checklist?: ChecklistCompania
  clienteId: string
  oportunidadId: string | null
  formulario: ResultadoAdaptadorBot
  ramo: string
}) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seg, setSeg] = useState<Seguimiento | null>(null)
  const enVuelo = useRef(false) // guarda SÍNCRONA contra el doble clic (el estado de React llega tarde)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generacion = useRef(0)

  const parar = useCallback(() => {
    generacion.current += 1
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
  }, [])
  useEffect(() => parar, [parar])

  const sondear = useCallback((trabajoId: string, duplicado: boolean, mensajePrevio: string | null) => {
    parar()
    const mia = generacion.current
    const inicio = Date.now()
    setSeg({ trabajoId, duplicado, mensajePrevio, trabajo: null, aviso: null, agotado: false })
    const vuelta = async () => {
      const r = await pedirJson(`/api/correduria/tarificador/trabajo/${encodeURIComponent(trabajoId)}`)
      if (mia !== generacion.current) return
      const l = leerTrabajo(r.status, r.json)
      if (l.ok) {
        setSeg((s) => (s && s.trabajoId === trabajoId ? { ...s, trabajo: l.trabajo, aviso: null } : s))
        if (resumenTrabajo(l.trabajo).final) return
      } else {
        // «No se pudo comprobar» ≠ vacío: se conserva lo último visto y se sigue intentando.
        setSeg((s) => (s && s.trabajoId === trabajoId ? { ...s, aviso: l.mensaje } : s))
      }
      if (Date.now() - inicio > SONDEO_TOPE_MS) {
        setSeg((s) => (s && s.trabajoId === trabajoId ? { ...s, agotado: true } : s))
        return
      }
      temporizador.current = setTimeout(() => void vuelta(), SONDEO_MS)
    }
    void vuelta()
  }, [parar])

  async function pedir() {
    if (!formulario.ok || enVuelo.current) return
    enVuelo.current = true
    setOcupado(true); setError(null); parar(); setSeg(null)
    try {
      const r = await pedirJson('/api/correduria/tarificador/encolar', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clienteId, oportunidadId, ramo, compania: integracion.compania, riesgo: formulario.riesgo,
          ...(formulario.completarDesdeFicha.length ? { completarDesdeFicha: formulario.completarDesdeFicha } : {}),
        }),
      })
      const e = leerEncoladoBot(r.status, r.json)
      if (!e.ok) { setError(e.mensaje); return }
      // `mensaje` (asegura): estado real del trabajo previo. Vacío o ausente → texto de respaldo.
      const mensaje = (r.json as { mensaje?: unknown } | null)?.mensaje
      const m = typeof mensaje === 'string' ? mensaje.trim() : ''
      sondear(e.trabajoId, e.duplicado, m || null)
    } finally {
      enVuelo.current = false
      setOcupado(false)
    }
  }

  const res = seg?.trabajo ? resumenTrabajo(seg.trabajo) : null
  const nombre = rotuloCompania(integracion.compania)
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <button type="button" onClick={() => void pedir()} disabled={!formulario.ok || ocupado}
        title={formulario.ok ? `Encola una tarificación de ${ramo} en el bot de ${nombre} (solo precio: no emite).` : aviso ?? 'Faltan datos: míralos arriba.'}
        style={{ ...btnStyle('secundario'), minHeight: 44, width: '100%', maxWidth: 420, opacity: !formulario.ok || ocupado ? 0.6 : 1 }}>
        <Bot size={16} aria-hidden /> {ocupado ? 'Encolando…' : `Precio ${nombre} (bot) — gratis`}
      </button>
      {aviso && <span role="status" style={{ fontSize: 13, color: 'var(--warning)', overflowWrap: 'anywhere' }}>{aviso}</span>}
      {checklist?.estado === 'evaluado' && <ChecklistDatos check={checklist} nombre={nombre} />}
      {error && <span role="alert" style={{ fontSize: 13, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{error}</span>}
      {seg && (
        <div aria-live="polite" style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          {seg.duplicado && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{seg.mensajePrevio ?? 'Ya había un trabajo en marcha con estos datos: se muestra ese.'}</span>}
          {!res && !seg.aviso && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Comprobando el estado…</span>}
          {res && <strong style={{ fontSize: 14, color: TONO[res.tono] }}>{nombre}: {res.titulo}</strong>}
          {res?.motivo && <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{res.motivo}</span>}
          {res && res.ofertas.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
              {res.ofertas.map((o, n) => <li key={n} style={{ overflowWrap: 'anywhere' }}>{o}</li>)}
            </ul>
          )}
          {/* Lo que el bot SUPUSO para dar ese precio (uso, garaje, 2º conductor…): junto al precio, nunca escondido. */}
          {res && res.ofertas.length > 0 && res.supuestos.map((s) => (
            <span key={s} role="note" style={{ fontSize: 13, color: 'var(--warning)', overflowWrap: 'anywhere' }}>{s} Confírmalo con el cliente.</span>
          ))}
          {seg.trabajo && seg.trabajo.ofertas.some((o) => o.pdfIndice !== null) && (
            <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              {seg.trabajo.ofertas.filter((o) => o.pdfIndice !== null).map((o) => (
                <a key={o.pdfIndice} href={`/api/correduria/tarificador/trabajo/${encodeURIComponent(seg.trabajoId)}/pdf/${o.pdfIndice}`}
                  target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('secundario'), textDecoration: 'none', minHeight: 44 }}>PDF de la oferta</a>
              ))}
            </span>
          )}
          {res?.pideVersion && <span style={{ fontSize: 13, color: 'var(--warning)' }}>El bot necesita que elijas la versión del vehículo: hazlo en la bandeja «Necesita tu atención» del <a href="/correduria/tarificador" style={{ color: 'inherit', textDecoration: 'underline', display: 'inline-block', minHeight: 24 }}>tarificador</a>.</span>}
          {seg.aviso && <span role="alert" style={{ fontSize: 12, color: 'var(--warning)' }}>{seg.aviso} Sigo intentándolo…</span>}
          {seg.agotado && !res?.final && (
            <span role="alert" style={{ fontSize: 12, color: 'var(--warning)' }}>
              Sigue sin terminar tras varios minutos: el bot puede estar ocupado. Revisa la bandeja del tarificador más tarde.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const MARCA: Record<EstadoFila, { color: string; icono: typeof Check; texto: string }> = {
  ok: { color: 'var(--positive)', icono: Check, texto: 'listo' },
  ficha: { color: 'var(--muted)', icono: UserRound, texto: 'se toma de la ficha' },
  falta: { color: 'var(--negative)', icono: X, texto: 'falta' },
  supuesto: { color: 'var(--warning)', icono: Info, texto: 'supuesto favorable (se declara en el precio)' },
}

/** Desplegable con los datos que pide el bot de la compañía (≤ ~16 filas): ✓ listo · ✗ falta · «se toma de la ficha». */
function ChecklistDatos({ check, nombre }: { check: Extract<ChecklistCompania, { estado: 'evaluado' }>; nombre: string }) {
  return (
    <details style={{ fontSize: 13, minWidth: 0 }}>
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, color: check.bloquea ? 'var(--negative)' : 'var(--muted)' }}>
        Datos que pide {nombre}: {resumenFilas(check)}
      </summary>
      <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'grid', gap: 4 }}>
        {check.filas.map((f) => {
          const m = MARCA[f.estado]
          const Icono = m.icono
          return (
            <li key={f.clave} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', overflowWrap: 'anywhere', color: m.color }}>
              <Icono size={14} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
              <span><span style={{ color: 'var(--text)' }}>{f.etiqueta}</span> <span style={{ fontSize: 12 }}>({m.texto})</span></span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
