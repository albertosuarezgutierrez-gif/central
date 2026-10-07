'use client'

// «Presupuestos de compañías» (07/10/2026). Decisión de Alberto: la cotización por bots se pide desde la
// OPORTUNIDAD, como siempre en el CRM: UN formulario de riesgo común → se eligen las compañías que tienen
// bot para el ramo → «Pedir presupuestos» encola un trabajo por compañía ligado a esta oportunidad → aquí
// se ven los resultados de cada una. Los campos que solo pide una compañía son sus «extras» (registro de
// capacidades de `@central/module-tarificacion`): un bot nuevo no cambia este formulario.
// 🚨 Solo cotiza: nada de aquí contrata. Habla con `/api/correduria/tarificador/*` (sesión de plataforma).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Bot, Download } from 'lucide-react'
import { btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  SONDEO_MAX_MS, SONDEO_MS, estimarInfraseguro, fechaCorta, sigueEnCurso, vistaPrecio, vistaTrabajo,
} from '@/lib/tarificador-asegura-reglas'
import {
  comunConRiesgo, companiasDisponibles, extrasConGuardado, extrasIniciales, formularioComunInicial, leerPresupuestos,
  mensajePedido, prepararPedido, sembrarDesdeRiesgoLibre, ultimoPorCompania,
  type ExtrasFormulario, type FormularioComun, type LecturaPresupuestos, type ResultadoPedido, type RiesgoLibreParaBots, type TrabajoCompania,
} from '@/lib/presupuestos-companias'

const CAMPO: CSSProperties = { display: 'grid', gap: 4, minWidth: 0, fontSize: 12, color: 'var(--muted)' }
const INPUT: CSSProperties = { minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, width: '100%', boxSizing: 'border-box', minWidth: 0 }
const GRID: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }
const COLUMNA: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }
/** Trabajos anteriores que se enseñan de golpe (el resto con «Ver más»). */
const LOTE_ANTERIORES = 10

type Lectura = { estado: 'cargando' } | { estado: 'ok'; datos: LecturaPresupuestos } | { estado: 'error'; texto: string }

export default function PresupuestosCompanias({ oportunidadId, ramo, riesgoLibre = null }: {
  oportunidadId: string
  ramo: string
  /** Capital y dirección del bloque «Datos del riesgo» de la oportunidad: siembran los campos vacíos del formulario. */
  riesgoLibre?: RiesgoLibreParaBots | null
}) {
  const disponibles = useMemo(() => companiasDisponibles(ramo), [ramo])
  const nombres = useMemo(() => Object.fromEntries(disponibles.map((c) => [c.compania, c.nombre])), [disponibles])

  const [lectura, setLectura] = useState<Lectura>({ estado: 'cargando' })
  const [f, setF] = useState<FormularioComun>(() => formularioComunInicial(null))
  const [extras, setExtras] = useState<ExtrasFormulario>(() => extrasIniciales(disponibles))
  const [elegidas, setElegidas] = useState<string[]>(() => disponibles.map((c) => c.compania))
  const [origen, setOrigen] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [fallo, setFallo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoPedido[] | null>(null)
  const [sondeoDesde, setSondeoDesde] = useState<number | null>(null)
  const [agotado, setAgotado] = useState(false)
  const [verAnteriores, setVerAnteriores] = useState(0)
  const tocado = useRef(false)
  const precargado = useRef(false)
  // Lo del riesgo se lee UNA vez, en la primera lectura: reeditar «Datos del riesgo» no pisa lo que se esté tecleando aquí.
  const libreRef = useRef(riesgoLibre)
  libreRef.current = riesgoLibre

  const set = <K extends keyof FormularioComun>(k: K, v: FormularioComun[K]) => { tocado.current = true; setF((x) => ({ ...x, [k]: v })) }
  const setExtra = (compania: string, clave: string, v: string) => {
    tocado.current = true
    setExtras((x) => ({ ...x, [compania]: { ...(x[compania] ?? {}), [clave]: v } }))
  }

  const leer = useCallback(async (): Promise<LecturaPresupuestos | null> => {
    try {
      const r = await fetch(`/api/correduria/tarificador/oportunidad?id=${encodeURIComponent(oportunidadId)}`, { cache: 'no-store' })
      const j = await r.json().catch(() => null)
      const datos = r.ok ? leerPresupuestos(j) : null
      if (datos) { setLectura({ estado: 'ok', datos }); return datos }
      setLectura({ estado: 'error', texto: `No se han podido leer los presupuestos pedidos (${r.status}). No es que no haya: no se han podido mirar.` })
    } catch {
      setLectura({ estado: 'error', texto: 'No se han podido leer los presupuestos pedidos (red). No es que no haya: no se han podido mirar.' })
    }
    return null
  }, [oportunidadId])

  // Primera lectura: pre-rellena con lo guardado en la oportunidad o, si no hay, con el último riesgo del cliente.
  useEffect(() => {
    if (disponibles.length === 0) return
    void (async () => {
      const d = await leer()
      if (precargado.current) return
      precargado.current = true
      if (!d) {
        setAbierto(true)
        // Aunque no se hayan podido leer los trabajos, el riesgo de arriba ya está en pantalla: siembra igual.
        if (!tocado.current) {
          const s = sembrarDesdeRiesgoLibre(formularioComunInicial(null), libreRef.current)
          setF(s.formulario)
          if (s.sembrados.length > 0) setOrigen(`${s.sembrados.join(', ')} de «Datos del riesgo» — revísalos`)
        }
        return
      }
      if (d.trabajos.length === 0) setAbierto(true)
      if (d.trabajos.some((t) => sigueEnCurso(t.estado))) setSondeoDesde(Date.now())
      if (tocado.current) return
      const base = formularioComunInicial(null)
      let f0 = base
      let origen0: string | null = null
      if (d.guardado) {
        f0 = comunConRiesgo(base, d.guardado.formulario)
        setExtras((x) => extrasConGuardado(x, disponibles, d.guardado!.extras, null))
        const guardadas = d.guardado.companias.filter((c) => disponibles.some((x) => x.compania === c))
        if (guardadas.length) setElegidas(guardadas)
        origen0 = `Formulario guardado en esta oportunidad${d.guardado.actualizadoEn ? ` (${fechaCorta(d.guardado.actualizadoEn)})` : ''} — revísalo`
      } else if (d.previo) {
        f0 = comunConRiesgo(base, d.previo.riesgo)
        setExtras((x) => extrasConGuardado(x, disponibles, null, d.previo!.riesgo))
        origen0 = `Datos de la última petición del cliente${d.previo.creadoEn ? ` (${fechaCorta(d.previo.creadoEn)})` : ''} — revísalos`
      }
      // Lo que falte se completa con el capital y la dirección de «Datos del riesgo» (nunca pisa lo anterior).
      const sembrado = sembrarDesdeRiesgoLibre(f0, libreRef.current)
      setF(sembrado.formulario)
      if (sembrado.sembrados.length > 0) {
        const delRiesgo = `${sembrado.sembrados.join(', ')} de «Datos del riesgo» — revísalos`
        origen0 = origen0 ? `${origen0}; ${delRiesgo}` : delRiesgo
      }
      setOrigen(origen0)
    })()
  }, [disponibles, leer])

  // Sondeo cada 5 s mientras algún trabajo siga en curso; tope ~6 min (luego «Seguir esperando»).
  useEffect(() => {
    if (sondeoDesde === null || agotado) return
    let vivo = true
    let t: ReturnType<typeof setTimeout>
    const paso = async () => {
      const d = await leer()
      if (!vivo) return
      if (d && !d.trabajos.some((x) => sigueEnCurso(x.estado))) { setSondeoDesde(null); return }
      if (Date.now() - sondeoDesde >= SONDEO_MAX_MS) { setAgotado(true); return }
      t = setTimeout(paso, SONDEO_MS)
    }
    t = setTimeout(paso, SONDEO_MS)
    return () => { vivo = false; clearTimeout(t) }
  }, [sondeoDesde, agotado, leer])

  if (disponibles.length === 0) return null

  async function pedir(e: React.FormEvent) {
    e.preventDefault()
    setFallo(null); setResultados(null)
    const p = prepararPedido(f, extras, elegidas, disponibles)
    if (!p.ok) { setErrores(p.errores); return }
    setErrores([])
    setEnviando(true)
    try {
      const res = await fetch('/api/correduria/tarificador/oportunidad', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ oportunidadId, ramo, formulario: p.formulario, extras: p.extras, companias: p.companias }),
      })
      const j = await res.json().catch(() => null)
      const m = mensajePedido(res.status, j, nombres)
      if (!m.ok) { setFallo(m.mensaje); return }
      setResultados(m.resultados)
      setAbierto(false)
      setAgotado(false)
      await leer()
      if (m.resultados.some((r) => r.ok)) setSondeoDesde(Date.now())
    } catch {
      setFallo('No se ha podido contactar con plataforma: vuelve a intentarlo.')
    } finally {
      setEnviando(false)
    }
  }

  // Aviso de infraseguro (orientativo, no bloquea): m² × €/m² por calidad frente al capital de edificación.
  const infra = estimarInfraseguro(f)
  const trabajos = lectura.estado === 'ok' ? lectura.datos.trabajos : null
  const { ultimos, anteriores } = ultimoPorCompania(trabajos ?? [])
  const enCurso = (trabajos ?? []).some((t) => sigueEnCurso(t.estado))
  const seleccion = disponibles.filter((c) => elegidas.includes(c.compania))

  return (
    <section id="presupuestos" aria-labelledby="presupuestos-titulo" style={{ ...cardStyle, ...COLUMNA, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div id="presupuestos-titulo" style={{ fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Bot size={16} aria-hidden /> Presupuestos de compañías
        </div>
        {!abierto && (
          <button type="button" onClick={() => setAbierto(true)} style={btnStyle('secundario', 'sm')}>
            {ultimos.length ? 'Pedir otra vez' : 'Rellenar el riesgo'}
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
        Un formulario del riesgo sirve para todas las compañías con bot. Cada bot entra en el portal de su compañía y saca el precio: es solo una cotización.
      </p>

      {lectura.estado === 'cargando' && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Leyendo los presupuestos pedidos…</p>}
      {lectura.estado === 'error' && <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)', overflowWrap: 'anywhere' }}>{lectura.texto}</p>}

      {resultados && (
        <ul role="status" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {resultados.map((r) => <li key={r.compania} style={{ color: r.ok ? 'var(--text)' : 'var(--negative)', overflowWrap: 'anywhere' }}>{r.texto}</li>)}
        </ul>
      )}

      {abierto && (
        <form onSubmit={pedir} style={COLUMNA}>
          {origen && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{origen}</p>}
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
            <label style={CAMPO}>Capital de edificación (valor de reposición, €) *<input inputMode="decimal" required placeholder="1.500.000" value={f.capitalContinente} onChange={(e) => set('capitalContinente', e.target.value)} style={INPUT} /></label>
            <label style={CAMPO}>Capital de contenido (€)<input inputMode="decimal" placeholder="opcional" value={f.capitalContenido} onChange={(e) => set('capitalContenido', e.target.value)} style={INPUT} /></label>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
            Sin el valor de reposición de la edificación las compañías no calculan. Importes en euros, p. ej. 1.500.000.
          </p>
          {infra?.infraseguro && (
            <div role="status" style={{ fontSize: 12, lineHeight: 1.4, padding: '8px 10px', borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning)', overflowWrap: 'anywhere' }}>
              Posible infraseguro: estimado {eur(infra.estimado)} ({infra.m2.toLocaleString('es-ES', { useGrouping: 'always' })} m² × {eur(infra.eurM2)}/m², calidad {infra.calidad}{infra.calidadSupuesta ? ' supuesta' : ''}).
              El capital puesto es el {Math.round(infra.ratio * 100)} % de esa cifra. Es una estimación orientativa: puedes pedir el precio igualmente.
            </div>
          )}
          <div style={GRID}>
            <label style={CAMPO}>Calle<input value={f.via} onChange={(e) => set('via', e.target.value)} style={INPUT} /></label>
            <label style={CAMPO}>Número<input value={f.numero} onChange={(e) => set('numero', e.target.value)} style={INPUT} /></label>
            <label style={CAMPO}>Municipio<input value={f.municipio} onChange={(e) => set('municipio', e.target.value)} style={INPUT} /></label>
            <label style={CAMPO}>Provincia<input value={f.provincia} onChange={(e) => set('provincia', e.target.value)} style={INPUT} /></label>
          </div>
          <div style={GRID}>
            <label style={CAMPO}>Ascensor
              <select value={f.ascensor} onChange={(e) => set('ascensor', e.target.value as FormularioComun['ascensor'])} style={INPUT}>
                <option value="">No consta</option><option value="si">Sí</option><option value="no">No</option>
              </select></label>
            <label style={CAMPO}>Piscina
              <select value={f.piscina} onChange={(e) => set('piscina', e.target.value as FormularioComun['piscina'])} style={INPUT}>
                <option value="">No consta</option><option value="si">Sí</option><option value="no">No</option>
              </select></label>
            <label style={CAMPO}>Calidad de construcción
              <select value={f.calidadConstruccion} onChange={(e) => set('calidadConstruccion', e.target.value as FormularioComun['calidadConstruccion'])} style={INPUT}>
                <option value="">No consta</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="lujo">Lujo</option>
              </select></label>
          </div>

          <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, margin: 0, minWidth: 0, display: 'grid', gap: 8 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 4px' }}>Compañías</legend>
            {disponibles.map((c) => (
              <label key={c.compania} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={elegidas.includes(c.compania)} style={{ width: 20, height: 20 }}
                  onChange={(e) => setElegidas((x) => (e.target.checked ? [...x, c.compania] : x.filter((y) => y !== c.compania)))} />
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c.nombre} <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {c.producto}</span></span>
              </label>
            ))}
          </fieldset>

          {seleccion.filter((c) => c.extras.length > 0).map((c) => (
            <fieldset key={c.compania} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, margin: 0, minWidth: 0, display: 'grid', gap: 8 }}>
              <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 4px' }}>Lo que pide {c.nombre}</legend>
              <div style={GRID}>
                {c.extras.map((x) => {
                  const valor = extras[c.compania]?.[x.clave] ?? ''
                  const id = `extra-${c.compania}-${x.clave}`
                  return (
                    <label key={x.clave} style={CAMPO} title={x.ayuda}>
                      {x.etiqueta}{x.obligatorio ? ' *' : ''}
                      {x.tipo === 'opcion' || x.tipo === 'booleano' ? (
                        <select value={valor} onChange={(e) => setExtra(c.compania, x.clave, e.target.value)} style={INPUT}>
                          <option value="">{x.obligatorio ? 'Elige…' : 'No consta'}</option>
                          {(x.tipo === 'booleano' ? [{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }] : x.opciones ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                        </select>
                      ) : (
                        <>
                          <input list={x.sugerencias?.length ? `${id}-lista` : undefined} inputMode={x.tipo === 'entero' ? 'numeric' : undefined}
                            value={valor} onChange={(e) => setExtra(c.compania, x.clave, e.target.value)} style={INPUT} />
                          {x.sugerencias?.length ? <datalist id={`${id}-lista`}>{x.sugerencias.map((o) => <option key={o} value={o} />)}</datalist> : null}
                        </>
                      )}
                    </label>
                  )
                })}
              </div>
              {c.extras.some((x) => x.ayuda) && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                  Los textos tienen que coincidir con la etiqueta del desplegable de {c.nombre} (se sugieren las ya vistas; si el portal no la admite, el bot avisa con un error de datos).
                </p>
              )}
            </fieldset>
          ))}

          {errores.length > 0 && (
            <ul role="alert" style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--negative)' }}>{errores.map((x) => <li key={x} style={{ overflowWrap: 'anywhere' }}>{x}</li>)}</ul>
          )}
          {fallo && <div role="alert" style={{ fontSize: 13, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{fallo}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" disabled={enviando} style={{ ...btnStyle('primario'), opacity: enviando ? 0.6 : 1 }}>
              {enviando ? 'Enviando…' : `Pedir presupuestos${seleccion.length ? ` (${seleccion.length})` : ''}`}
            </button>
            {ultimos.length > 0 && <button type="button" onClick={() => setAbierto(false)} style={btnStyle('secundario')}>Cancelar</button>}
          </div>
        </form>
      )}

      {trabajos !== null && trabajos.length === 0 && !abierto && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Aún no se ha pedido ningún presupuesto desde esta oportunidad.</p>
      )}

      {ultimos.length > 0 && (
        <div aria-live="polite" style={COLUMNA}>
          {ultimos.map((t) => <TarjetaTrabajo key={t.id} t={t} nombre={nombres[t.compania] ?? t.compania} />)}
        </div>
      )}
      {agotado && enCurso && (
        <div role="status" style={{ fontSize: 13, display: 'grid', gap: 8 }}>
          Sigue en curso y he dejado de preguntar. El resultado se guarda igualmente; vuelve más tarde o sigue esperando.
          <button type="button" onClick={() => { setAgotado(false); setSondeoDesde(Date.now()) }} style={{ ...btnStyle('secundario'), justifySelf: 'start' }}>Seguir esperando</button>
        </div>
      )}
      {anteriores.length > 0 && (
        <div style={COLUMNA}>
          {verAnteriores === 0 ? (
            <button type="button" onClick={() => setVerAnteriores(LOTE_ANTERIORES)} style={{ ...btnStyle('sutil', 'sm'), justifySelf: 'start', minHeight: 44 }}>
              Ver peticiones anteriores ({anteriores.length})
            </button>
          ) : (
            <>
              {anteriores.slice(0, verAnteriores).map((t) => <TarjetaTrabajo key={t.id} t={t} nombre={nombres[t.compania] ?? t.compania} anterior />)}
              {anteriores.length > verAnteriores && (
                <button type="button" onClick={() => setVerAnteriores((n) => n + LOTE_ANTERIORES)} style={{ ...btnStyle('sutil', 'sm'), justifySelf: 'start', minHeight: 44 }}>Ver más</button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function TarjetaTrabajo({ t, nombre, anterior = false }: { t: TrabajoCompania; nombre: string; anterior?: boolean }) {
  const v = vistaTrabajo(t, nombre)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, opacity: anterior ? 0.8 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
        <strong>{nombre}</strong>
        <span style={{ color: 'var(--muted)' }}>{anterior ? 'Anterior · ' : ''}pedido el {fechaCorta(t.creadoEn) ?? '—'}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: v.tono === 'error' ? 'var(--negative)' : 'var(--text)' }}>{v.titulo}</div>
      {v.detalle && <div style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{v.detalle}</div>}
      {t.estado === 'ok' && t.ofertas.map((o, i) => {
        const p = vistaPrecio(o, o.fechaTerminoPortal)
        return (
          <div key={`${o.producto}-${i}`} style={{ display: 'grid', gap: 4, paddingTop: 6, borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{o.producto || 'Oferta'}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{eur(p.total)} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>/ año</span></div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Prima neta: {p.neta === null ? 'no la da el portal' : eur(p.neta)} · Impuestos: {p.impuestos === null ? 'no los da el portal' : eur(p.impuestos)}
            </div>
            {p.primerRecibo && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Primer recibo: {eur(p.primerRecibo.total)}{p.primerRecibo.hasta ? ` (prorrata hasta el ${p.primerRecibo.hasta})` : ' (prorrata)'}
              </div>
            )}
            {o.pdfIndice !== null && (
              <a href={`/api/correduria/tarificador/trabajo/${t.id}/pdf/${o.pdfIndice}`} style={{ ...btnStyle('secundario'), textDecoration: 'none', justifySelf: 'start' }}>
                <Download size={16} aria-hidden /> Descargar proyecto de {nombre} (PDF)
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
