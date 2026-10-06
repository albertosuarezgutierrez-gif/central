'use client'

// «Precio Allianz (bot)» (06/10/2026): pide al bot de ePAC un PRECIO de comunidad de propietarios y lo
// enseña (estado, prima total anual, desglose, PDF). 🚨 Solo cotiza: aquí no hay nada de emitir ni de
// contratar. Habla con `/api/correduria/tarificador/*` (sesión de plataforma); el secreto no llega aquí.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Bot, Download, X } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  OPCIONES_LISTA_PROPIETARIOS, OPCIONES_TIPO_VIVIENDA, OPCIONES_USO, SONDEO_MAX_MS, SONDEO_MS,
  fechaCorta, formularioConUltimoRiesgo, formularioInicial, leerTrabajoBot, leerUltimoRiesgoBot, mensajeEncolar, riesgoDesdeFormulario, sigueEnCurso, vistaTrabajo,
  type FormularioRiesgo, type TrabajoBot,
} from '@/lib/tarificador-asegura-reglas'

type Contacto = { codigoPostal: string | null; ciudad: string | null; provincia: string | null; direccion: string | null }

const CAMPO: CSSProperties = { display: 'grid', gap: 4, minWidth: 0, fontSize: 12, color: 'var(--muted)' }
const INPUT: CSSProperties = { minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, width: '100%', boxSizing: 'border-box', minWidth: 0 }
const GRID: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }

export default function PrecioAllianzBot({ clienteId, contacto }: { clienteId: string; contacto: Contacto }) {
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState<FormularioRiesgo>(() => formularioInicial(contacto))
  const [errores, setErrores] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [trabajoId, setTrabajoId] = useState<string | null>(null)
  const [trabajo, setTrabajo] = useState<TrabajoBot | null>(null)
  const [agotado, setAgotado] = useState(false)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  // Pre-relleno con el último riesgo del cliente: 'cargando' · 'sin' (sin datos previos o lectura fallida) · fecha.
  const [previo, setPrevio] = useState<'cargando' | 'sin' | { fecha: string | null }>('cargando')
  const previoPedido = useRef(false)
  const tocado = useRef(false)
  const set = <K extends keyof FormularioRiesgo>(k: K, v: FormularioRiesgo[K]) => { tocado.current = true; setF((x) => ({ ...x, [k]: v })) }
  const cierre = useRef<HTMLButtonElement>(null)

  const cerrar = useCallback(() => setAbierto(false), [])
  useEffect(() => {
    if (!abierto) return
    cierre.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, cerrar])

  // Al abrir (una vez): pide el último riesgo de este cliente. Si falla, formulario vacío como siempre y sin error.
  useEffect(() => {
    if (!abierto || previoPedido.current) return
    previoPedido.current = true
    ;(async () => {
      try {
        const r = await fetch(`/api/correduria/tarificador/ultimo-riesgo?cliente_id=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
        const u = r.ok ? leerUltimoRiesgoBot(await r.json().catch(() => null)) : null
        // Si Alberto ya ha empezado a teclear, no se le pisa nada.
        if (!u || tocado.current) { setPrevio('sin'); return }
        setF((x) => formularioConUltimoRiesgo(x, u.riesgo))
        setPrevio({ fecha: fechaCorta(u.creadoEn) })
      } catch {
        setPrevio('sin')
      }
    })()
  }, [abierto, clienteId])

  // Sondeo cada 5 s, máx. ~6 min. El modal puede cerrarse: el sondeo sigue mientras el componente viva.
  useEffect(() => {
    if (!trabajoId || (trabajo && !sigueEnCurso(trabajo.estado)) || agotado) return
    const inicio = Date.now()
    let vivo = true
    let t: ReturnType<typeof setTimeout>
    const leer = async () => {
      try {
        const r = await fetch(`/api/correduria/tarificador/trabajo/${trabajoId}`, { cache: 'no-store' })
        const j = await r.json().catch(() => null)
        if (!vivo) return
        const leido = r.ok ? leerTrabajoBot(j) : null
        if (leido) { setTrabajo(leido); setErrorLectura(null) } else setErrorLectura(`No se ha podido leer el estado (${r.status}).`)
        if (leido && !sigueEnCurso(leido.estado)) return
      } catch {
        if (vivo) setErrorLectura('No se ha podido leer el estado (red).')
      }
      if (!vivo) return
      if (Date.now() - inicio >= SONDEO_MAX_MS) { setAgotado(true); return }
      t = setTimeout(leer, SONDEO_MS)
    }
    t = setTimeout(leer, 1_500)
    return () => { vivo = false; clearTimeout(t) }
  // `trabajo` solo decide si arrancar: no debe reiniciar el sondeo en cada lectura.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajoId, agotado])

  async function pedir(e: React.FormEvent) {
    e.preventDefault()
    setFallo(null)
    const r = riesgoDesdeFormulario(f)
    if (!r.ok) { setErrores(r.errores); return }
    setErrores([])
    setEnviando(true)
    try {
      const res = await fetch('/api/correduria/tarificador/encolar', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, oportunidadId: null, riesgo: r.riesgo }),
      })
      const j = await res.json().catch(() => null)
      const m = mensajeEncolar(res.status, j)
      if (!m.ok) { setFallo(m.mensaje); return }
      setTrabajo(null); setAgotado(false); setErrorLectura(null); setTrabajoId(m.trabajoId)
    } catch {
      setFallo('No se ha podido contactar con plataforma: vuelve a intentarlo.')
    } finally {
      setEnviando(false)
    }
  }

  const vista = trabajo ? vistaTrabajo(trabajo) : null
  const enCurso = trabajoId !== null && (!trabajo || sigueEnCurso(trabajo.estado))

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} style={btnStyle('secundario')}
        title="Pide a un bot el precio de una comunidad en Allianz. Solo cotiza: no emite ni contrata.">
        <Bot size={16} aria-hidden /> Precio Allianz (bot)
        {enCurso && <span aria-label="en curso" style={{ fontSize: 11, color: 'var(--muted)' }}>· en curso</span>}
      </button>
      {abierto && (
        <div role="dialog" aria-modal="true" aria-label="Precio Allianz (bot)"
          onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5vh 2.5vw' }}>
          <div style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(95vw, 720px)', maxHeight: '95vh', overflow: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Precio Allianz (bot) · comunidad de propietarios</div>
              <button ref={cierre} type="button" onClick={cerrar} aria-label="Cerrar" style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, minWidth: 44 }}><X size={18} /></button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
              Un bot entra en el portal de Allianz y saca el precio. Solo es una cotización: no se emite ni se contrata nada.
            </p>

            {!trabajoId && (
              <form onSubmit={pedir} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
                {previo === 'cargando' && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Buscando datos de la última petición…</p>}
                {typeof previo === 'object' && (
                  <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                    Datos de la última petición{previo.fecha ? ` (${previo.fecha})` : ''} — revísalos
                  </p>
                )}
                <datalist id="bot-tipo-vivienda">{OPCIONES_TIPO_VIVIENDA.map((o) => <option key={o} value={o} />)}</datalist>
                <datalist id="bot-uso">{OPCIONES_USO.map((o) => <option key={o} value={o} />)}</datalist>
                <datalist id="bot-lista">{OPCIONES_LISTA_PROPIETARIOS.map((o) => <option key={o} value={o} />)}</datalist>
                <div style={GRID}>
                  <label style={CAMPO}>Fecha de efecto *<input type="date" required value={f.fechaEfecto} onChange={(e) => set('fechaEfecto', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Fecha de término *<input type="date" required value={f.fechaTermino} onChange={(e) => set('fechaTermino', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Código postal *<input inputMode="numeric" maxLength={5} required value={f.codigoPostal} onChange={(e) => set('codigoPostal', e.target.value)} style={INPUT} /></label>
                </div>
                <div style={GRID}>
                  <label style={CAMPO}>Metros cuadrados *<input inputMode="numeric" required value={f.m2Construidos} onChange={(e) => set('m2Construidos', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Año de construcción *<input inputMode="numeric" maxLength={4} required value={f.anioConstruccion} onChange={(e) => set('anioConstruccion', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Plantas sobre la calle *<input inputMode="numeric" required value={f.plantas} onChange={(e) => set('plantas', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Nº de edificios *<input inputMode="numeric" required value={f.numEdificios} onChange={(e) => set('numEdificios', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Nº viviendas y locales *<input inputMode="numeric" required value={f.numViviendasYLocales} onChange={(e) => set('numViviendasYLocales', e.target.value)} style={INPUT} /></label>
                </div>
                <div style={GRID}>
                  <label style={CAMPO}>Tipo de vivienda *<input list="bot-tipo-vivienda" required value={f.tipoVivienda} onChange={(e) => set('tipoVivienda', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Uso *<input list="bot-uso" required value={f.uso} onChange={(e) => set('uso', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Lista de propietarios *<input list="bot-lista" required value={f.listaPropietarios} onChange={(e) => set('listaPropietarios', e.target.value)} style={INPUT} /></label>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                  Tipo, uso y lista tienen que coincidir con la etiqueta exacta del desplegable de Allianz (se sugieren las ya vistas; si el portal no la admite el bot avisa con un error de datos).
                </p>
                <div style={GRID}>
                  <label style={CAMPO}>Calle<input value={f.via} onChange={(e) => set('via', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Número<input value={f.numero} onChange={(e) => set('numero', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Municipio<input value={f.municipio} onChange={(e) => set('municipio', e.target.value)} style={INPUT} /></label>
                  <label style={CAMPO}>Provincia<input value={f.provincia} onChange={(e) => set('provincia', e.target.value)} style={INPUT} /></label>
                </div>
                <div style={GRID}>
                  <label style={CAMPO}>Ascensor
                    <select value={f.ascensor} onChange={(e) => set('ascensor', e.target.value as FormularioRiesgo['ascensor'])} style={INPUT}>
                      <option value="">No consta</option><option value="si">Sí</option><option value="no">No</option>
                    </select></label>
                  <label style={CAMPO}>Piscina
                    <select value={f.piscina} onChange={(e) => set('piscina', e.target.value as FormularioRiesgo['piscina'])} style={INPUT}>
                      <option value="">No consta</option><option value="si">Sí</option><option value="no">No</option>
                    </select></label>
                  <label style={CAMPO}>Calidad de construcción
                    <select value={f.calidadConstruccion} onChange={(e) => set('calidadConstruccion', e.target.value as FormularioRiesgo['calidadConstruccion'])} style={INPUT}>
                      <option value="">No consta</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="lujo">Lujo</option>
                    </select></label>
                </div>
                {errores.length > 0 && (
                  <ul role="alert" style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--negative)' }}>{errores.map((x) => <li key={x}>{x}</li>)}</ul>
                )}
                {fallo && <div role="alert" style={{ fontSize: 13, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{fallo}</div>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="submit" disabled={enviando} style={{ ...btnStyle('primario'), opacity: enviando ? 0.6 : 1 }}>
                    {enviando ? 'Enviando…' : 'Pedir precio a Allianz'}
                  </button>
                  <button type="button" onClick={cerrar} style={btnStyle('secundario')}>Cancelar</button>
                </div>
              </form>
            )}

            {trabajoId && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }} aria-live="polite">
                <div style={{ fontSize: 14, fontWeight: 700, color: vista?.tono === 'error' ? 'var(--negative)' : 'var(--text)' }}>
                  {vista?.titulo ?? 'Enviado al bot…'}
                </div>
                {vista?.detalle && <div style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{vista.detalle}</div>}
                {errorLectura && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{errorLectura}</div>}
                {agotado && enCurso && (
                  <div role="status" style={{ fontSize: 13, display: 'grid', gap: 8 }}>
                    Sigue en curso y he dejado de preguntar. El resultado se guarda en asegura, pero si recargas la página esta ventana lo pierde de vista.
                    <button type="button" onClick={() => setAgotado(false)} style={{ ...btnStyle('secundario'), justifySelf: 'start' }}>Seguir esperando</button>
                  </div>
                )}
                {trabajo?.estado === 'ok' && trabajo.ofertas.map((o, i) => (
                  <div key={`${o.producto}-${i}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                    <div style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{o.compania ? `${o.compania.charAt(0).toUpperCase()}${o.compania.slice(1)} · ` : ''}{o.producto}</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{eur(o.primaTotalAnual)} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>/ año</span></div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Prima neta: {o.primaNeta === null ? 'no la da el portal' : eur(o.primaNeta)} · Impuestos: {o.impuestos === null ? 'no los da el portal' : eur(o.impuestos)}
                    </div>
                    {o.pdfIndice !== null && (
                      <a href={`/api/correduria/tarificador/trabajo/${trabajoId}/pdf/${o.pdfIndice}`} style={{ ...btnStyle('secundario'), textDecoration: 'none', justifySelf: 'start' }}>
                        <Download size={16} aria-hidden /> Descargar PDF
                      </a>
                    )}
                  </div>
                ))}
                {trabajo && !sigueEnCurso(trabajo.estado) && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => { setTrabajoId(null); setTrabajo(null); setAgotado(false) }} style={btnStyle('secundario')}>Pedir otro precio</button>
                    <button type="button" onClick={cerrar} style={btnStyle('sutil')}>Cerrar</button>
                  </div>
                )}
                {trabajo && sigueEnCurso(trabajo.estado) && <button type="button" onClick={cerrar} style={{ ...btnStyle('sutil'), justifySelf: 'start' }}>Cerrar (sigue en segundo plano)</button>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
