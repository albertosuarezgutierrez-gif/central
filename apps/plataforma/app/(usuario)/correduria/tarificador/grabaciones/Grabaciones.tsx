'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, RefreshCw, Upload, Wand2, ArrowUp, ArrowDown, X, Trash2 } from 'lucide-react'
import type { PantallaMapa } from '@central/module-tarificacion'
import { Badge, CardHeader, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  MAX_FICHEROS,
  avisoSinPendientes,
  comprobarFicheros,
  estadoGrabacion,
  mensajeError,
  mover,
  ordenInicial,
  prepararEnvios,
  tamano,
  textoConfirmarBorrado,
  type DetalleGrabacion,
  type ResultadoAnalisis,
  type ResumenGrabacion,
} from '@/lib/tarificador-grabaciones'

const API = '/api/correduria/tarificador/grabaciones'
const PASO = 50

const campo: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
}
const fila: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gap: 6, minWidth: 0 }
const aviso = (tono: 'warning' | 'negative' | 'positive'): React.CSSProperties => ({
  margin: 0, padding: 12, borderRadius: 10, border: `1px solid var(--${tono})`, color: `var(--${tono})`, background: `var(--${tono}-bg)`, overflowWrap: 'anywhere',
})
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }) : '—')

async function pedir(url: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: null }
  }
}

export default function Grabaciones({ bookmarklet, bookmarkletManual }: { bookmarklet: string; bookmarkletManual: string }) {
  const [lista, setLista] = useState<ResumenGrabacion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const r = await pedir(API)
    const e = mensajeError(r.status, r.json, 'Leer las grabaciones')
    const g = (r.json as { grabaciones?: ResumenGrabacion[] } | null)?.grabaciones
    if (e || !Array.isArray(g)) setError(e ?? 'La respuesta de asegura no tiene la forma esperada.')
    else { setLista(g); setError(null) }
    setCargando(false)
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <Instrucciones bookmarklet={bookmarklet} bookmarkletManual={bookmarkletManual} />
      <NuevaGrabacion onCreada={(id) => { setAbierta(id); void cargar() }} />
      <section style={cardStyle}>
        <CardHeader
          title="Grabaciones"
          sub="Abre una para subir sus pantallas, analizarlas y validar el mapa."
          action={
            <button type="button" onClick={() => void cargar()} disabled={cargando} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
              <RefreshCw size={15} strokeWidth={1.75} aria-hidden /> {cargando ? 'Cargando…' : 'Actualizar'}
            </button>
          }
        />
        {error && <p role="alert" style={aviso('warning')}>{error}</p>}
        {!lista && !error && <p className="muted" style={{ margin: 0 }}>Cargando…</p>}
        {lista && lista.length === 0 && <p className="muted" style={{ margin: 0 }}>Aún no hay grabaciones.</p>}
        {lista && lista.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {lista.map((g) => {
              const est = estadoGrabacion(g)
              const abiertaEsta = abierta === g.id
              return (
                <li key={g.id} style={fila}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{g.compania} · {g.ramo}{g.producto ? ` · ${g.producto}` : ''}</strong>
                    <Badge tono={est.tono}>{est.texto}</Badge>
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {g.pantallas} pantalla{g.pantallas === 1 ? '' : 's'} · IA: {g.llamadasIA} llamada{g.llamadasIA === 1 ? '' : 's'}
                    {g.costeEstimado > 0 ? ` (≈${eur(g.costeEstimado)})` : ''} · creada el {fecha(g.creadoEn)}
                  </span>
                  {g.nota && <span style={{ fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{g.nota}</span>}
                  <button type="button" onClick={() => setAbierta(abiertaEsta ? null : g.id)} style={{ ...btnStyle(abiertaEsta ? 'sutil' : 'secundario', 'sm'), minHeight: 44, justifySelf: 'start' }}>
                    {abiertaEsta ? 'Cerrar' : 'Abrir'}
                  </button>
                  {abiertaEsta && <Detalle id={g.id} onCambio={() => void cargar()} onBorrada={() => { setAbierta(null); void cargar() }} />}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Instrucciones({ bookmarklet, bookmarkletManual }: { bookmarklet: string; bookmarkletManual: string }) {
  const enlace = useRef<HTMLAnchorElement>(null)
  // React 19 bloquea `href="javascript:…"` en JSX: el marcador se pone a mano en el DOM.
  useEffect(() => { enlace.current?.setAttribute('href', bookmarklet) }, [bookmarklet])
  const [copiado, setCopiado] = useState(false)
  const [copiadoManual, setCopiadoManual] = useState(false)
  return (
    <section style={cardStyle}>
      <CardHeader title="Cómo grabar" sub="Una vez por compañía/ramo nuevo. El marcador no manda nada a ningún sitio: solo descarga un fichero." />
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6, fontSize: 14 }}>
        <li>
          Arrastra este botón a la barra de marcadores del navegador:{' '}
          <a
            ref={enlace}
            href="#"
            onClick={(e) => e.preventDefault()}
            draggable
            style={{ ...btnStyle('primario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'grab', textDecoration: 'none' }}
            title="Arrástralo a la barra de marcadores (aquí no hace nada)"
          >
            <Bookmark size={15} strokeWidth={1.75} aria-hidden /> Grabar pantalla ASegura
          </a>
          {' '}
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(bookmarklet).then(() => setCopiado(true)).catch(() => setCopiado(false)) }}
            style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}
          >
            {copiado ? 'Copiado' : 'Copiar el código'}
          </button>
          <span className="muted" style={{ display: 'block', fontSize: 12 }}>
            Si tu navegador no deja arrastrar: crea un marcador nuevo, llámalo «Grabar pantalla ASegura» y pega el código como dirección.
          </span>
          <span className="muted" style={{ display: 'block', fontSize: 12 }}>
            ¿Prefieres una pantalla por pulsación (modo manual de siempre)?{' '}
            <button
              type="button"
              onClick={() => { void navigator.clipboard?.writeText(bookmarkletManual).then(() => setCopiadoManual(true)).catch(() => setCopiadoManual(false)) }}
              style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}
            >
              {copiadoManual ? 'Copiado' : 'Copiar el código manual'}
            </button>
          </span>
        </li>
        <li>Crea abajo una grabación (compañía, ramo, producto) y entra en el portal de la compañía: haz un presupuesto <strong>ficticio</strong> a mano (datos inventados). No pulses nunca emitir/contratar.</li>
        <li>Pulsa el marcador UNA vez: queda «grabando» (cuadro azul abajo a la derecha) y guarda sola cada pantalla nueva. «Guardar pantalla ahora» fuerza una; «Terminar y descargar» baja UN fichero <code>grabacion-…html</code> con todas.</li>
        <li>Si la página se recarga entera se pierde lo grabado: termina y descarga antes, o vuelve a pulsar el marcador después (se juntan por nombre y fecha). Sube aquí el fichero (o varios) y pulsa «Analizar».</li>
      </ol>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
        El marcador lee la página y sus marcos del mismo portal, tapa contraseñas, campos ocultos, DNI, IBAN, correos y teléfonos,
        no toca cookies y no pulsa nada. Asegura lo vuelve a tapar al guardarlo.
      </p>
    </section>
  )
}

function NuevaGrabacion({ onCreada }: { onCreada: (id: string) => void }) {
  const [f, setF] = useState({ compania: '', ramo: '', producto: '', nota: '' })
  const [estado, setEstado] = useState<{ enviando: boolean; error: string | null }>({ enviando: false, error: null })
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const crear = async (e: React.FormEvent) => {
    e.preventDefault()
    setEstado({ enviando: true, error: null })
    const r = await pedir(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) })
    const err = mensajeError(r.status, r.json, 'Crear la grabación')
    const id = (r.json as { id?: string } | null)?.id
    if (err || !id) return setEstado({ enviando: false, error: err ?? 'Respuesta sin id.' })
    setF({ compania: '', ramo: '', producto: '', nota: '' })
    setEstado({ enviando: false, error: null })
    onCreada(id)
  }
  return (
    <section style={cardStyle}>
      <CardHeader title="Nueva grabación" />
      <form onSubmit={(e) => void crear(e)} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Compañía *<input value={f.compania} onChange={(e) => set('compania', e.target.value)} maxLength={80} required style={campo} placeholder="Mapfre" /></label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Ramo *<input value={f.ramo} onChange={(e) => set('ramo', e.target.value)} maxLength={80} required style={campo} placeholder="Hogar" /></label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Producto<input value={f.producto} onChange={(e) => set('producto', e.target.value)} maxLength={120} style={campo} /></label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13, gridColumn: '1 / -1' }}>Nota
          <textarea value={f.nota} onChange={(e) => set('nota', e.target.value)} maxLength={2000} rows={2} style={{ ...campo, resize: 'vertical' }} placeholder="Qué riesgo ficticio se ha usado, rarezas del portal…" />
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="submit" disabled={estado.enviando} style={{ ...btnStyle('primario'), minHeight: 44 }}>{estado.enviando ? 'Creando…' : 'Crear grabación'}</button>
          {estado.error && <span role="alert" style={{ color: 'var(--warning)', fontSize: 13 }}>{estado.error}</span>}
        </div>
      </form>
    </section>
  )
}

function Detalle({ id, onCambio, onBorrada }: { id: string; onCambio: () => void; onBorrada: () => void }) {
  const [g, setG] = useState<DetalleGrabacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [nota, setNota] = useState<{ texto: string; tono: 'positive' | 'warning' } | null>(null)

  const cargar = useCallback(async () => {
    const r = await pedir(`${API}/${id}`)
    const e = mensajeError(r.status, r.json, 'Leer la grabación')
    const d = (r.json as { grabacion?: DetalleGrabacion } | null)?.grabacion
    if (e || !d) setError(e ?? 'Respuesta sin grabación.')
    else { setG(d); setError(null) }
  }, [id])
  useEffect(() => { void cargar() }, [cargar])

  const analizar = async (modo: 'pendientes' | 'reintentar' | 'todas') => {
    if (modo === 'todas' && !window.confirm('Se borra el mapa y se vuelven a analizar TODAS las pantallas (gasta IA). ¿Seguir?')) return
    setNota(null)
    if (modo === 'pendientes' && g) {
      const aviso = avisoSinPendientes(g.pantallasLista)
      if (aviso) { setNota({ texto: aviso, tono: g.conError > 0 ? 'warning' : 'positive' }); return }
    }
    let ronda = 0
    let ultimo: ResultadoAnalisis | null = null
    let m: typeof modo = modo
    // Lotes de pocas pantallas: se repite mientras queden y no se llegue al tope.
    while (ronda < 20) {
      ronda++
      setOcupado(`Analizando… (lote ${ronda})`)
      const r = await pedir(`${API}/${id}/analizar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modo: m }) })
      const e = mensajeError(r.status, r.json, 'Analizar')
      if (e) { setNota({ texto: e, tono: 'warning' }); break }
      ultimo = r.json as ResultadoAnalisis
      m = 'pendientes'
      await cargar()
      if (ultimo.pendientes === 0 || ultimo.tope || ultimo.procesadas === 0) break
    }
    if (ultimo) {
      const partes = [
        ultimo.pendientes === 0 ? 'Análisis terminado.' : `Quedan ${ultimo.pendientes} pantallas por analizar.`,
        ultimo.tope ? `Se ha llegado al tope de ${ultimo.maxLlamadas} llamadas a la IA de esta grabación.` : '',
        ultimo.botonesForzados ? `${ultimo.botonesForzados} botón(es) que la IA daba por seguros se han marcado PROHIBIDOS por la regla.` : '',
      ].filter(Boolean)
      setNota({ texto: partes.join(' '), tono: ultimo.tope || ultimo.mal ? 'warning' : 'positive' })
    }
    setOcupado(null)
    onCambio()
  }

  const validar = async (validado: boolean) => {
    setOcupado(validado ? 'Validando…' : 'Quitando la validación…')
    const r = await pedir(`${API}/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ validado }) })
    const e = mensajeError(r.status, r.json, 'Validar')
    setNota(e ? { texto: e, tono: 'warning' } : null)
    await cargar()
    setOcupado(null)
    onCambio()
  }

  const borrar = async () => {
    if (!g || !window.confirm(textoConfirmarBorrado(g))) return
    setNota(null)
    setOcupado('Borrando la grabación…')
    const r = await pedir(`${API}/${id}`, { method: 'DELETE' })
    const e = mensajeError(r.status, r.json, 'Borrar')
    if (e) { setNota({ texto: e, tono: 'warning' }); setOcupado(null); return }
    onBorrada() // la lista se recarga sin desmontar; esta fila desaparece al no estar ya en ella
  }

  if (error) return <p role="alert" style={aviso('warning')}>{error}</p>
  if (!g) return <p className="muted" style={{ margin: 0 }}>Cargando la grabación…</p>
  const completo = g.pantallas > 0 && g.analizadas === g.pantallas && !!g.mapa
  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <Pantallas g={g} ocupado={ocupado} setOcupado={setOcupado} onSubidas={async () => { await cargar(); onCambio() }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={!!ocupado || g.pantallas === 0} onClick={() => void analizar('pendientes')} style={{ ...btnStyle('primario'), minHeight: 44 }}>
          <Wand2 size={15} strokeWidth={1.75} aria-hidden /> Analizar
        </button>
        {g.conError > 0 && (
          <button type="button" disabled={!!ocupado} onClick={() => void analizar('reintentar')} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Reintentar las que fallaron ({g.conError})</button>
        )}
        {g.analizadas > 0 && (
          <button type="button" disabled={!!ocupado} onClick={() => void analizar('todas')} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Reanalizar todo</button>
        )}
        <span className="muted" style={{ fontSize: 12 }}>IA: {g.llamadasIA}/{g.maxLlamadas} llamadas{g.costeEstimado > 0 ? ` · ≈${eur(g.costeEstimado)}` : ''}</span>
      </div>
      {ocupado && <p className="muted" style={{ margin: 0 }} aria-live="polite">{ocupado}</p>}
      {nota && <p role="status" style={aviso(nota.tono)}>{nota.texto}</p>}
      {g.mapa && g.mapa.pantallas.length > 0 && (
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Mapa</h3>
          {g.mapa.pantallas.map((p) => <MapaPantalla key={p.pantalla} p={p} />)}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {g.mapaValidado ? (
              <>
                <Badge tono="positivo">Validado {g.validadoEn ? `el ${fecha(g.validadoEn)}` : ''}</Badge>
                <button type="button" disabled={!!ocupado} onClick={() => void validar(false)} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Quitar la validación</button>
              </>
            ) : (
              <button type="button" disabled={!!ocupado || !completo} onClick={() => void validar(true)} style={{ ...btnStyle('primario'), minHeight: 44 }}
                title={completo ? '' : 'Analiza todas las pantallas antes de validar'}>
                He revisado el mapa: marcar como validado
              </button>
            )}
          </div>
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button type="button" disabled={!!ocupado} onClick={() => void borrar()} style={{ ...btnStyle('sutil'), minHeight: 44, color: 'var(--negative)', maxWidth: '100%' }}>
          <Trash2 size={15} strokeWidth={1.75} aria-hidden /> Borrar grabación
        </button>
      </div>
    </div>
  )
}

type Elegido = { file: File; name: string; size: number }

function Pantallas({ g, ocupado, setOcupado, onSubidas }: { g: DetalleGrabacion; ocupado: string | null; setOcupado: (s: string | null) => void; onSubidas: () => Promise<void> }) {
  const [elegidos, setElegidos] = useState<Elegido[]>([])
  const [errores, setErrores] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)

  const elegir = (fl: FileList | null) => {
    const lista = ordenInicial(Array.from(fl ?? []).map((file) => ({ file, name: file.name, size: file.size })))
    setElegidos(lista)
    setErrores(lista.length ? comprobarFicheros(lista, g.pantallas) : [])
  }

  const subir = async () => {
    const errs = comprobarFicheros(elegidos, g.pantallas)
    if (errs.length) return setErrores(errs)
    const fallos: string[] = []
    let subidos = 0
    let yaSubidas = g.pantallas
    for (const [i, f] of elegidos.entries()) {
      const { envios, error } = prepararEnvios(f.name, await f.file.text(), yaSubidas)
      // Al primer fallo se para: si no, el orden de las pantallas quedaría con huecos.
      if (error) { fallos.push(error); break }
      let bien = true
      for (const [j, e] of envios.entries()) {
        setOcupado(`Subiendo ${i + 1} de ${elegidos.length}: ${f.name}${envios.length > 1 ? ` (parte ${j + 1}/${envios.length})` : ''}`)
        const r = await pedir(`${API}/${g.id}/pantallas?${new URLSearchParams({ nombre: e.nombre })}`, { method: 'POST', headers: { 'content-type': 'text/html; charset=utf-8' }, body: e.html })
        const err = mensajeError(r.status, r.json, e.nombre)
        if (err) { fallos.push(err); bien = false; break }
        yaSubidas += (r.json as { pantallas?: number } | null)?.pantallas ?? 1
      }
      if (!bien) break
      subidos++
    }
    setElegidos((l) => l.slice(subidos))
    setErrores(fallos)
    if (input.current && fallos.length === 0) input.current.value = ''
    setOcupado(null)
    await onSubidas()
  }

  const [ver, setVer] = useState(PASO)
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>Pantallas ({g.pantallas}/{MAX_FICHEROS})</h3>
      {g.pantallasLista.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Aún no hay pantallas.</p>}
      {g.pantallasLista.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4, fontSize: 13 }}>
          {g.pantallasLista.slice(0, ver).map((p) => (
            <li key={p.orden} style={{ overflowWrap: 'anywhere' }}>
              {p.nombre} <span className="muted">({tamano(p.bytes)})</span>{' '}
              <Badge tono={p.estado === 'ok' ? 'positivo' : p.estado === 'error' ? 'aviso' : 'neutral'}>{p.estado === 'ok' ? 'analizada' : p.estado === 'error' ? 'error' : 'sin analizar'}</Badge>
              {p.error && <span style={{ display: 'block', color: 'var(--warning)', fontSize: 12 }}>{p.error}</span>}
            </li>
          ))}
        </ol>
      )}
      {g.pantallasLista.length > ver && (
        <button type="button" onClick={() => setVer((v) => v + PASO)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, justifySelf: 'start' }}>Ver más</button>
      )}
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Añadir pantallas (.html del marcador, en orden; máx. 4 MB cada una)
        <input ref={input} type="file" accept=".html,.htm,text/html" multiple onChange={(e) => elegir(e.target.files)} style={{ ...campo, padding: 8 }} disabled={!!ocupado} />
      </label>
      {elegidos.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4, fontSize: 13 }}>
          {elegidos.map((f, i) => (
            <li key={`${f.name}-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ overflowWrap: 'anywhere', minWidth: 0, flex: '1 1 160px' }}>{f.name} <span className="muted">({tamano(f.size)})</span></span>
              <button type="button" aria-label="Subir en el orden" disabled={i === 0} onClick={() => setElegidos((l) => mover(l, i, -1))} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, minWidth: 44 }}><ArrowUp size={14} aria-hidden /></button>
              <button type="button" aria-label="Bajar en el orden" disabled={i === elegidos.length - 1} onClick={() => setElegidos((l) => mover(l, i, 1))} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, minWidth: 44 }}><ArrowDown size={14} aria-hidden /></button>
              <button type="button" aria-label="Quitar de la lista" onClick={() => setElegidos((l) => l.filter((_, j) => j !== i))} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, minWidth: 44 }}><X size={14} aria-hidden /></button>
            </li>
          ))}
        </ol>
      )}
      {errores.length > 0 && <div role="alert" style={aviso('warning')}>{errores.map((e) => <div key={e}>{e}</div>)}</div>}
      {elegidos.length > 0 && (
        <button type="button" disabled={!!ocupado} onClick={() => void subir()} style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start' }}>
          <Upload size={15} strokeWidth={1.75} aria-hidden /> Subir {elegidos.length} pantalla{elegidos.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  )
}

function MapaPantalla({ p }: { p: PantallaMapa }) {
  const prohibidos = p.botones.filter((b) => b.clase === 'prohibido').length
  return (
    <details style={fila}>
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>{p.pantalla}. {p.titulo}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{p.campos.length} campos · {p.botones.length} botones · {p.primas.length} primas</span>
        {prohibidos > 0 && <Badge tono="negativo">{prohibidos} PROHIBIDO{prohibidos === 1 ? '' : 'S'}</Badge>}
      </summary>
      <div style={{ display: 'grid', gap: 10, minWidth: 0, marginTop: 8 }}>
        {p.notas && <p style={{ margin: 0, fontSize: 13 }}>{p.notas}</p>}
        <Bloque titulo="Campos">
          {p.campos.map((c, i) => (
            <li key={i} style={{ overflowWrap: 'anywhere' }}>
              <strong>{c.etiqueta}</strong>{c.obligatorio ? ' *' : ''} <span className="muted">· {c.tipo}</span>
              <code style={{ display: 'block', fontSize: 12 }}>{c.marco ? `[${c.marco}] ` : ''}{c.selector}</code>
              {c.opciones && c.opciones.length > 0 && <span className="muted" style={{ display: 'block', fontSize: 12 }}>Opciones: {c.opciones.slice(0, 30).join(' · ')}{c.opciones.length > 30 ? ` … (+${c.opciones.length - 30})` : ''}</span>}
            </li>
          ))}
        </Bloque>
        <Bloque titulo="Botones">
          {p.botones.map((b, i) => (
            <li key={i} style={{ overflowWrap: 'anywhere' }}>
              <Badge tono={b.clase === 'prohibido' ? 'negativo' : 'positivo'}>{b.clase === 'prohibido' ? 'PROHIBIDO' : 'seguro'}</Badge>{' '}
              <strong>{b.texto}</strong>{b.funcion ? <span className="muted"> · {b.funcion}</span> : null}
              {b.forzado && <span style={{ display: 'block', color: 'var(--negative)', fontSize: 12 }}>La IA lo daba por seguro; la regla de emisión lo bloquea.</span>}
              <code style={{ display: 'block', fontSize: 12 }}>{b.marco ? `[${b.marco}] ` : ''}{b.selector}</code>
            </li>
          ))}
        </Bloque>
        <Bloque titulo="Dónde sale la prima">
          {p.primas.map((x, i) => (
            <li key={i} style={{ overflowWrap: 'anywhere' }}>
              <strong>{x.etiqueta}</strong>
              {x.selector && <code style={{ display: 'block', fontSize: 12 }}>{x.marco ? `[${x.marco}] ` : ''}{x.selector}</code>}
            </li>
          ))}
        </Bloque>
      </div>
    </details>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode[] }) {
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <h4 style={{ margin: 0, fontSize: 13 }}>{titulo} <span className="muted">({children.length})</span></h4>
      {children.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Ninguno.</p> : <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }}>{children}</ul>}
    </div>
  )
}
