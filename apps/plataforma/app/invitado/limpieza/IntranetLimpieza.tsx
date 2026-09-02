'use client'
// Pantalla de la limpieza (móvil primero, ≥320px): calendario mensual con las limpiezas de cada
// piso por colores (vista «Mes», por defecto) o tira de 30 días × 4 pisos (vista «Lista»), más el
// resumen del día con limpiezas, tareas y notas. Sin nombres de huéspedes ni importes.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { PROPS_CALENDARIO as PROPS } from '@/lib/sivra/constantes'
import { entradaMismoDia, nocheOcupada, type ReservaIntranet, type Novedad } from '@/lib/sivra/limpieza-intranet'

const DIAS = 30
// Navegación de la ventana (idea del calendario de Smoobu que usaba Si que Brilla): se puede mirar
// hacia atrás (repasar limpiezas pasadas) y hacia delante (planificar), con tope para no
// pasear por años vacíos.
const VENTANA_ATRAS_DIAS = 90
const VENTANA_ADELANTE_DIAS = 180
const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
// Semana del calendario mensual, lunes primero (convención española).
const DOW_MES = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DOWL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

type Limpieza = {
  id: string; propertyId: string; fecha: string
  salida: string | null; entrada: string | null
  nota: string | null; indicaciones: string | null
  tipo: string | null; hecha: boolean
}
type Tarea = { id: string; fecha: string; propertyId: string | null; texto: string; hecha: boolean }
// Reserva confirmada en Booking que Smoobu AÚN no tiene (la detectó el vigía de correo): se
// pinta ⚠️ en su día de entrada para que Si que Brilla no se quede sin verla. Solo se sabe la entrada.
type PendienteSmoobu = { propertyId: string; checkIn: string; ref: string | null }
// Parte de incidencia que Si que Brilla deja en una limpieza (nota y/o foto); avisa a Alberto por Telegram.
type Parte = { id: number; propertyId: string; fecha: string; texto: string | null; tieneFoto: boolean }

function iso(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDM(isoFecha: string | null) {
  if (!isoFecha) return null
  const [, m, d] = isoFecha.split('-')
  return `${d}/${m}`
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function hoyDate() { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
function propDe(id: string) { return PROPS.find(p => p.id === id) }

export default function IntranetLimpieza() {
  const hoy = useMemo(() => hoyDate(), [])
  const [inicio, setInicio] = useState(() => iso(hoyDate()))
  const inicioDate = useMemo(() => new Date(inicio + 'T12:00:00'), [inicio])
  const dias = useMemo(() => Array.from({ length: DIAS }, (_, i) => addDays(inicioDate, i)), [inicioDate])
  const finVentana = iso(addDays(inicioDate, DIAS - 1))
  const [reservas, setReservas] = useState<ReservaIntranet[]>([])
  const [limpiezas, setLimpiezas] = useState<Limpieza[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [pendientesSmoobu, setPendientesSmoobu] = useState<PendienteSmoobu[]>([])
  const [partes, setPartes] = useState<Parte[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [sel, setSel] = useState(iso(hoy))
  // Filtro por piso (como los «Filtros» del calendario de Smoobu): null = los 4.
  const [filtro, setFiltro] = useState<string | null>(null)
  // Vista «mes» (prueba pedida por Alberto, 30/08): calendario mensual clásico con las limpiezas
  // como puntos del color de cada piso. La tira de 30 días sigue disponible en «Lista».
  const [vista, setVista] = useState<'mes' | 'lista'>('mes')
  // «🔔 Últimos avisos» plegado por defecto (no es información del día a día).
  const [avisosAbiertos, setAvisosAbiertos] = useState(false)
  const [mesAncla, setMesAncla] = useState(() => iso(hoyDate()).slice(0, 7)) // 'AAAA-MM'

  // Rejilla del mes: semanas completas de lunes a domingo (los días de los meses vecinos se
  // pintan atenuados, como en cualquier calendario de pared).
  const mesGrid = useMemo(() => {
    const primero = new Date(mesAncla + '-01T12:00:00')
    const offset = (primero.getDay() + 6) % 7 // lunes = 0
    const arranque = addDays(primero, -offset)
    const diasMes = new Date(primero.getFullYear(), primero.getMonth() + 1, 0).getDate()
    const semanas = Math.ceil((offset + diasMes) / 7)
    return {
      dias: Array.from({ length: semanas * 7 }, (_, i) => addDays(arranque, i)),
      mes: primero.getMonth(),
      titulo: primero.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    }
  }, [mesAncla])

  // Rango de datos a pedir según la vista activa.
  const rangoFrom = vista === 'mes' ? iso(mesGrid.dias[0]) : inicio
  const rangoTo = vista === 'mes' ? iso(mesGrid.dias[mesGrid.dias.length - 1]) : finVentana

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/sivra/limpieza-intranet/datos?from=${rangoFrom}&to=${rangoTo}`)
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      setReservas(d.reservas ?? [])
      setLimpiezas(d.limpiezas ?? [])
      setTareas(d.tareas ?? [])
      setNovedades(d.novedades ?? [])
      setPendientesSmoobu(d.pendientesSmoobu ?? [])
      setPartes(d.partes ?? [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      setCargando(false)
    }
  }, [rangoFrom, rangoTo])

  useEffect(() => { cargar() }, [cargar])

  async function toggleTarea(t: Tarea) {
    // Optimista; si el PATCH falla, recarga y la tarea vuelve a su estado real.
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, hecha: !t.hecha } : x))
    const r = await fetch('/api/sivra/limpieza-intranet/tareas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, hecha: !t.hecha }),
    }).catch(() => null)
    if (!r || !r.ok) cargar()
  }

  const selDate = useMemo(() => new Date(sel + 'T12:00:00'), [sel])
  // Limpiezas del día = las SALIDAS de reserva (toda salida se limpia) + fichas sueltas del cron
  // sin reserva casada (p.ej. creadas a mano). La ficha, cuando existe, aporta hora/notas/hecha.
  const enFiltro = (propertyId: string | null) => !filtro || propertyId === filtro
  // paxSalida = huéspedes de la reserva que SALE ese día (NULL = no publicado, no se pinta 0).
  const limpiezasDia: Array<{ propertyId: string; limp: Limpieza | null; paxSalida: number | null }> = [
    ...reservas.filter(r => r.checkOut === sel).map(r => ({
      propertyId: r.propertyId,
      limp: limpiezas.find(l => l.propertyId === r.propertyId && l.fecha === sel) ?? null,
      paxSalida: r.pax ?? null,
    })),
    ...limpiezas
      .filter(l => l.fecha === sel && !reservas.some(r => r.propertyId === l.propertyId && r.checkOut === sel))
      .map(l => ({ propertyId: l.propertyId, limp: l, paxSalida: null })),
  ].filter(x => enFiltro(x.propertyId))
  // Las tareas sin piso (property_id NULL) se enseñan SIEMPRE: son generales, no de un piso.
  const tareasDia = tareas.filter(t => t.fecha === sel && (t.propertyId == null || enFiltro(t.propertyId)))
  const novedadesVisibles = novedades.filter(n => enFiltro(n.propertyId))

  function fmtSel() {
    if (sel === iso(hoy)) return `Hoy · ${DOWL[selDate.getDay()].toLowerCase()} ${selDate.getDate()}`
    if (sel === iso(addDays(hoy, 1))) return `Mañana · ${DOWL[selDate.getDay()].toLowerCase()} ${selDate.getDate()}`
    return `${DOWL[selDate.getDay()]} ${selDate.getDate()} ${selDate.toLocaleDateString('es-ES', { month: 'long' })}`
  }
  function mover(n: number) {
    const d = addDays(selDate, n)
    if (iso(d) < rangoFrom || iso(d) > rangoTo) return
    setSel(iso(d))
  }
  // Mueve la ventana del calendario n días (±2 semanas por toque), acotada a
  // [hoy−90, hoy+180]. Si el día seleccionado se queda fuera, se lleva al inicio visible.
  function moverVentana(n: number) {
    const min = iso(addDays(hoy, -VENTANA_ATRAS_DIAS))
    const max = iso(addDays(hoy, VENTANA_ADELANTE_DIAS))
    let nuevo = iso(addDays(inicioDate, n))
    if (nuevo < min) nuevo = min
    if (nuevo > max) nuevo = max
    if (nuevo === inicio) return
    setInicio(nuevo)
    const nuevoFin = iso(addDays(new Date(nuevo + 'T12:00:00'), DIAS - 1))
    if (sel < nuevo || sel > nuevoFin) setSel(iso(hoy) >= nuevo && iso(hoy) <= nuevoFin ? iso(hoy) : nuevo)
  }
  // Mueve el mes ±1, acotado a los meses que caen dentro de [hoy−90, hoy+180] (misma ventana
  // de datos que la vista lista). Si el día seleccionado se sale del mes visible, va al día 1.
  function moverMes(n: number) {
    const [a, m] = mesAncla.split('-').map(Number)
    const destino = new Date(a, m - 1 + n, 1, 12)
    const clave = iso(destino).slice(0, 7)
    const min = iso(addDays(hoy, -VENTANA_ATRAS_DIAS)).slice(0, 7)
    const max = iso(addDays(hoy, VENTANA_ADELANTE_DIAS)).slice(0, 7)
    if (clave < min || clave > max || clave === mesAncla) return
    setMesAncla(clave)
    if (sel.slice(0, 7) !== clave) setSel(iso(hoy).slice(0, 7) === clave ? iso(hoy) : clave + '-01')
  }
  function volverAHoy() {
    setInicio(iso(hoy))
    setMesAncla(iso(hoy).slice(0, 7))
    setSel(iso(hoy))
  }
  const rangoVentana = `${inicioDate.getDate()} ${inicioDate.toLocaleDateString('es-ES', { month: 'short' })} – ${new Date(finVentana + 'T12:00:00').getDate()} ${new Date(finVentana + 'T12:00:00').toLocaleDateString('es-ES', { month: 'short' })}`
  const pisosVisibles = filtro ? PROPS.filter(p => p.id === filtro) : PROPS

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 12px 40px', color: 'var(--text)' }}>
      <style>{`
        .li-cal-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px}
        .li-cal{display:grid;grid-template-columns:86px repeat(${DIAS},34px);min-width:max-content}
        .li-cal .prop, .li-cal .corner{position:sticky;left:0;z-index:2;background:var(--surface)}
        .li-dia{font-size:10px;color:var(--muted);text-align:center;padding:4px 0 6px;font-weight:600;cursor:pointer;border:none;background:transparent;font-family:inherit}
        .li-dia .dow{display:block;font-weight:400;font-size:9px;text-transform:uppercase}
        .li-cell{border-top:1px solid var(--border);height:40px;position:relative;cursor:pointer}
        @media (max-width:380px){ .li-cal{grid-template-columns:74px repeat(${DIAS},32px)} }
        .li-mes{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;padding:0 10px 10px}
        .li-mes-dow{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:center;padding:4px 0 2px}
        .li-mes-dia{min-height:52px;border:1px solid var(--border);border-radius:8px;background:transparent;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;align-items:center;gap:4px;padding:5px 1px 4px;color:var(--text)}
      `}</style>

      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, padding: '16px 2px 12px' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--primary)' }}>Limpiezas · pisos de Alberto</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 800 }}>Hola, Si que Brilla 👋</h1>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', paddingBottom: 4 }}>
          {DOWL[hoy.getDay()]}, {hoy.getDate()} {hoy.toLocaleDateString('es-ES', { month: 'short' })}
        </div>
      </header>

      {error && (
        <div style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-bg)', color: 'var(--negative)', fontSize: 13, borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          No se han podido cargar los datos. Revisa la conexión y recarga la página.
        </div>
      )}

      {/* Calendario */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '12px 14px 2px' }}>
          <ChipFiltro activo={vista === 'mes'} onClick={() => setVista('mes')} label="Mes" />
          <ChipFiltro activo={vista === 'lista'} onClick={() => setVista('lista')} label="Lista" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 6px' }}>
          {vista === 'mes' ? (
            <>
              <button onClick={() => moverMes(-1)} aria-label="Mes anterior" style={btnNav}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 14, textTransform: 'capitalize' }}>{mesGrid.titulo}</div>
              <button onClick={() => moverMes(1)} aria-label="Mes siguiente" style={btnNav}>›</button>
              {mesAncla !== iso(hoy).slice(0, 7) && (
                <button onClick={volverAHoy} style={{ ...btnNav, minWidth: 0, padding: '0 12px', fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Hoy</button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => moverVentana(-14)} aria-label="Dos semanas antes" style={btnNav}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{rangoVentana}</div>
              <button onClick={() => moverVentana(14)} aria-label="Dos semanas después" style={btnNav}>›</button>
              {inicio !== iso(hoy) && (
                <button onClick={volverAHoy} style={{ ...btnNav, minWidth: 0, padding: '0 12px', fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Hoy</button>
              )}
            </>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 14px 8px' }}>
          <ChipFiltro activo={filtro === null} onClick={() => setFiltro(null)} label="Todos" />
          {PROPS.map(p => (
            <ChipFiltro key={p.id} activo={filtro === p.id} onClick={() => setFiltro(filtro === p.id ? null : p.id)}
              label={p.label} color={p.color} />
          ))}
        </div>
        {cargando ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Cargando…</div>
        ) : vista === 'mes' ? (
          <div className="li-mes">
            {DOW_MES.map((d, i) => <div key={i} className="li-mes-dow">{d}</div>)}
            {mesGrid.dias.map(d => {
              const k = iso(d)
              const fueraMes = d.getMonth() !== mesGrid.mes
              const esHoy = k === iso(hoy)
              const pendiente = pendientesSmoobu.some(pe => pe.checkIn === k && enFiltro(pe.propertyId))
              return (
                <button key={k} className="li-mes-dia" onClick={() => setSel(k)}
                  style={{
                    ...(k === sel ? { background: 'var(--primary-light, rgba(79,70,229,.1))', borderColor: 'var(--primary)' } : {}),
                    ...(fueraMes ? { opacity: .35 } : k < iso(hoy) ? { opacity: .55 } : {}),
                  }}>
                  <span style={{ fontSize: 12, fontWeight: esHoy ? 800 : 600, color: esHoy ? 'var(--primary)' : undefined }}>
                    {d.getDate()}{pendiente ? ' ⚠️' : ''}
                  </span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', maxWidth: '100%' }}>
                    {pisosVisibles.map(p => {
                      // Mismo criterio que la vista lista: toda SALIDA de reserva es una limpieza,
                      // y las fichas sueltas del cron también cuentan.
                      const limpia = reservas.some(r => r.propertyId === p.id && r.checkOut === k)
                        || limpiezas.some(l => l.propertyId === p.id && l.fecha === k)
                      const entra = reservas.some(r => r.propertyId === p.id && r.checkIn === k)
                      if (!limpia && !entra) return null
                      return (
                        <span key={p.id} style={{ display: 'contents' }}>
                          {limpia && <span title={`Limpieza · ${p.label}`} style={{ width: 9, height: 9, borderRadius: '50%', background: p.color }} />}
                          {entra && <span title={`Entrada · ${p.label}`} style={{ width: 9, height: 9, borderRadius: '50%', border: `2px solid ${p.color}`, boxSizing: 'border-box' }} />}
                        </span>
                      )
                    })}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="li-cal-scroll">
            <div className="li-cal">
              <div className="corner" />
              {dias.map(d => {
                const k = iso(d)
                return (
                  <button key={k} className="li-dia" onClick={() => setSel(k)}
                    style={k === sel ? { background: 'var(--primary-light, rgba(79,70,229,.1))', color: 'var(--primary)', borderRadius: '8px 8px 0 0' }
                      : k === iso(hoy) ? { color: 'var(--primary)' }
                        : k < iso(hoy) ? { opacity: .55 } : undefined}>
                    <span className="dow">{DOW[d.getDay()]}</span>{d.getDate()}
                  </button>
                )
              })}
              {pisosVisibles.map(p => (
                <FilaPiso key={p.id} piso={p} dias={dias} sel={sel} hoy={iso(hoy)}
                  reservas={reservas} limpiezas={limpiezas} pendientes={pendientesSmoobu} onSel={setSel} />
              ))}
            </div>
          </div>
        )}
        {vista === 'mes' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px 14px 12px', fontSize: 11, color: 'var(--muted)' }}>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: 'var(--muted)', verticalAlign: 'middle', marginRight: 4 }} />limpieza (color del piso)</span>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', border: '2px solid var(--muted)', boxSizing: 'border-box', verticalAlign: 'middle', marginRight: 4 }} />entrada</span>
            <span>⚠️ reserva pendiente</span>
            <span>Toca un día para ver su detalle</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px 14px 12px', fontSize: 11, color: 'var(--muted)' }}>
            <span><span style={{ display: 'inline-block', width: 18, height: 10, borderRadius: 4, background: '#3E6AA8', verticalAlign: 'middle', marginRight: 4 }} />ocupado</span>
            <span><b>→</b> entrada (nº huéspedes)</span>
            <span>🧽 limpieza</span>
            <span><span style={{ color: 'var(--warning)' }}>🧽</span> entra huésped el mismo día</span>
          </div>
        )}
      </section>

      {/* Resumen del día */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}>
          <button onClick={() => mover(-1)} aria-label="Día anterior" style={btnNav}>‹</button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{fmtSel()}</div>
          <button onClick={() => mover(1)} aria-label="Día siguiente" style={btnNav}>›</button>
          <button onClick={() => setSel(iso(hoy))} style={{ ...btnNav, minWidth: 0, padding: '0 12px', fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Hoy</button>
        </div>

        <div style={{ padding: '4px 14px 12px' }}>
          <h3 style={tituloBloque}>Limpiezas del día</h3>
          {limpiezasDia.length === 0 && <div style={vacio}>No hay limpiezas este día. 🙌</div>}
          {limpiezasDia.map(({ propertyId, limp, paxSalida }, i) => {
            const p = propDe(propertyId)
            const entra = entradaMismoDia(reservas, propertyId, sel)
            return (
              <div key={limp?.id ?? `${propertyId}-${i}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: p?.color }}>{p?.label ?? propertyId}</span>
                  {limp?.hecha && <span style={{ ...chip, background: 'var(--positive-bg)', color: 'var(--positive)' }}>✓ Hecha</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ ...chip, background: 'var(--primary-light, rgba(79,70,229,.08))', color: 'var(--primary)' }}>Salida {limp?.salida ?? '11:00'}</span>
                  {paxSalida != null && (
                    <span style={chip}>👥 Sale{paxSalida === 1 ? ' 1 huésped' : `n ${paxSalida} huéspedes`}</span>
                  )}
                  {entra
                    ? <span style={{ ...chip, background: 'var(--warning-bg)', color: 'var(--warning)' }}>⚠️ Entra{entra.pax != null ? `n ${entra.pax}` : ' huésped'} a las {limp?.entrada ?? '15:00'}</span>
                    : <span style={{ ...chip, background: 'var(--positive-bg)', color: 'var(--positive)' }}>Sin entrada hoy</span>}
                  {limp?.tipo && limp.tipo !== 'estandar' && <span style={chip}>{limp.tipo === 'profunda' ? '🫧 Profunda' : '⚠️ Gran suciedad'}</span>}
                </div>
                {limp?.nota && <div style={nota}>📌 <b>Alberto:</b> {limp.nota}</div>}
                {limp?.indicaciones && <div style={nota}>📝 {limp.indicaciones}</div>}
                {partes.filter(pa => pa.propertyId === propertyId && pa.fecha === sel).map(pa => (
                  <div key={pa.id} style={{ ...nota, background: 'var(--primary-light, rgba(79,70,229,.06))', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    🧾 <b>Tu aviso:</b> {pa.texto ?? '(foto)'}
                    {pa.tieneFoto && (
                      <a href={`/api/sivra/limpieza-intranet/partes/foto?id=${pa.id}`} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/sivra/limpieza-intranet/partes/foto?id=${pa.id}`} alt="Foto del aviso" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 8 }} />
                      </a>
                    )}
                  </div>
                ))}
                <FormParte propertyId={propertyId} fecha={sel} onEnviado={cargar} />
              </div>
            )
          })}

          <h3 style={tituloBloque}>Entradas del día</h3>
          {pendientesSmoobu.filter(pe => pe.checkIn === sel && enFiltro(pe.propertyId)).map((pe, i) => {
            const p = propDe(pe.propertyId)
            return (
              <div key={`pend-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #fde68a', background: 'var(--warning-bg)', borderRadius: 12, padding: '10px 12px', marginBottom: 8, fontSize: 14, color: 'var(--warning)' }}>
                <span>⚠️</span>
                <span><b style={{ color: p?.color }}>{p?.label ?? pe.propertyId}</b> — entra un huésped de Booking que aún no aparece en el calendario oficial. Alberto lo está arreglando; cuenta con la limpieza.</span>
              </div>
            )
          })}
          {(() => {
            const entradas = reservas.filter(r => r.checkIn === sel && enFiltro(r.propertyId))
            if (!entradas.length) return <div style={vacio}>Nadie entra este día.</div>
            return entradas.map((r, i) => {
              const p = propDe(r.propertyId)
              const limp = limpiezasDia.find(l => l.propertyId === r.propertyId)?.limp
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginBottom: 8, fontSize: 14 }}>
                  <span>🔑</span>
                  <span style={{ fontWeight: 800, color: p?.color }}>{p?.label ?? r.propertyId}</span>
                  <span style={{ color: 'var(--muted)' }}>
                    {r.pax != null ? `entran ${r.pax} huéspedes` : 'entra huésped'}
                    {limp?.entrada ? ` · sobre las ${limp.entrada}` : ''}
                    {` · hasta el ${fmtDM(r.checkOut)}`}
                  </span>
                </div>
              )
            })
          })()}

          <h3 style={tituloBloque}>Tareas de Alberto</h3>
          {tareasDia.length === 0 && <div style={vacio}>Sin tareas apuntadas para este día.</div>}
          {tareasDia.map(t => {
            const p = t.propertyId ? propDe(t.propertyId) : null
            return (
              <button key={t.id} onClick={() => toggleTarea(t)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginBottom: 8, background: 'transparent', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }}>
                <span style={{ width: 24, height: 24, minWidth: 24, borderRadius: 8, border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, background: t.hecha ? 'var(--positive)' : 'transparent', borderColor: t.hecha ? 'var(--positive)' : 'var(--border)' }}>{t.hecha ? '✓' : ''}</span>
                <span style={{ flex: 1, color: t.hecha ? 'var(--muted)' : 'var(--text)', textDecoration: t.hecha ? 'line-through' : 'none' }}>
                  {p && <span style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: p.color }}>{p.label}</span>}
                  {t.texto}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Novedades: lo que ha cambiado respecto a lo que ya tenía planificado. PLEGADO por
          defecto (petición de Alberto, 30/08) con montaje perezoso: la lista solo se crea al abrir. */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', marginTop: 14 }}>
        <button onClick={() => setAvisosAbiertos(a => !a)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', color: 'var(--text)' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            🔔 Últimos avisos{!cargando && novedadesVisibles.length > 0 ? ` (${novedadesVisibles.length})` : ''}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{avisosAbiertos ? '▲' : '▼'}</span>
        </button>
        {avisosAbiertos && (
          <>
        <div style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 8px' }}>
          Las últimas reservas nuevas y cancelaciones, por si ya tenías el mes planificado.
        </div>
        {!cargando && novedadesVisibles.length === 0 && <div style={vacio}>Sin avisos nuevos: todo sigue como estaba. 👍</div>}
        {novedadesVisibles.map((n, i) => {
          const p = propDe(n.propertyId)
          const rango = n.checkIn || n.checkOut
            ? `${fmtDM(n.checkIn) ?? '¿?'} → ${fmtDM(n.checkOut) ?? '¿?'}`
            : 'fechas no publicadas'
          const det = new Date(n.detectada)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderTop: i > 0 ? '1px solid var(--border)' : 'none', padding: '8px 0', fontSize: 13.5 }}>
              <span>{n.tipo === 'nueva' ? '🆕' : '🚫'}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700 }}>{n.tipo === 'nueva' ? 'Reserva nueva' : 'Cancelada'}</span>
                {' · '}<span style={{ fontWeight: 700, color: p?.color }}>{p?.label ?? n.propertyId}</span>
                {' · '}{rango}
                {n.tipo === 'nueva' && n.pax != null && ` · ${n.pax} huéspedes`}
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  detectada el {det.getDate()}/{String(det.getMonth() + 1).padStart(2, '0')} a las {String(det.getHours()).padStart(2, '0')}:{String(det.getMinutes()).padStart(2, '0')}
                </div>
              </div>
            </div>
          )
        })}
          </>
        )}
      </section>

      <footer style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '14px 20px 0', lineHeight: 1.6 }}>
        Acceso con tu enlace personal — sin contraseña.<br />Cualquier duda, escribe a Alberto por WhatsApp.
      </footer>
    </div>
  )
}

// Reduce la foto a ≤1600px JPEG antes de subirla (las de móvil pasan de 4,5 MB, el límite de
// Vercel). Si el navegador no sabe decodificarla (HEIC en algunos Android), va el archivo tal cual.
async function comprimirFoto(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f)
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * escala), h = Math.round(bmp.height * escala)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.82))
    return blob ?? f
  } catch {
    return f
  }
}

// Aviso rápido de Si que Brilla sobre ESTA limpieza: nota y/o foto («se ha roto una mesa», «no sale la
// luz»). Se guarda en la limpieza y avisa a Alberto por Telegram. Sin campos que rellenar: un
// texto libre y una foto opcional.
function FormParte({ propertyId, fecha, onEnviado }: {
  propertyId: string; fecha: string; onEnviado: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    if (!texto.trim() && !foto) { setError('Escribe algo o adjunta una foto.'); return }
    setEnviando(true); setError(null)
    try {
      const form = new FormData()
      form.set('propertyId', propertyId)
      form.set('fecha', fecha)
      form.set('texto', texto.trim())
      if (foto) form.set('foto', await comprimirFoto(foto), 'foto.jpg')
      const r = await fetch('/api/sivra/limpieza-intranet/partes', { method: 'POST', body: form })
      if (!r.ok) throw new Error(String(r.status))
      setAbierto(false); setTexto(''); setFoto(null)
      onEnviado()
    } catch {
      setError('No se pudo enviar. Prueba otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)}
        style={{ marginTop: 8, minHeight: 44, width: '100%', border: '1px dashed var(--border)', borderRadius: 10, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
        📸 Avisar a Alberto de algo (nota o foto)
      </button>
    )
  }
  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
        placeholder="p. ej. se ha roto una mesa, no sale la luz…"
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 14, background: 'transparent', color: 'var(--text)', resize: 'vertical' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <label style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
          📷 {foto ? 'Foto lista ✓' : 'Añadir foto'}
          <input type="file" accept="image/*" hidden
            onChange={e => setFoto(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={enviar} disabled={enviando}
          style={{ minHeight: 44, flex: 1, border: 'none', borderRadius: 10, background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, opacity: enviando ? .6 : 1 }}>
          {enviando ? 'Enviando…' : 'Enviar a Alberto'}
        </button>
        <button onClick={() => { setAbierto(false); setError(null) }} disabled={enviando}
          style={{ minHeight: 44, border: '1px solid var(--border)', borderRadius: 10, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit', fontSize: 13, padding: '0 12px' }}>
          Cancelar
        </button>
      </div>
      {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginTop: 6 }}>{error}</div>}
    </div>
  )
}

function ChipFiltro({ activo, onClick, label, color }: {
  activo: boolean; onClick: () => void; label: string; color?: string
}) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
      fontFamily: 'inherit', minHeight: 32,
      border: `1px solid ${activo ? (color ?? 'var(--primary)') : 'var(--border)'}`,
      background: activo ? (color ?? 'var(--primary)') : 'transparent',
      color: activo ? '#fff' : (color ?? 'var(--muted)'),
    }}>{label}</button>
  )
}

function FilaPiso({ piso, dias, sel, hoy, reservas, limpiezas, pendientes, onSel }: {
  piso: (typeof PROPS)[number]; dias: Date[]; sel: string; hoy: string
  reservas: ReservaIntranet[]; limpiezas: Limpieza[]; pendientes: PendienteSmoobu[]
  onSel: (k: string) => void
}) {
  return (
    <>
      <div className="prop" style={{ fontSize: 12, fontWeight: 700, padding: '6px 8px 6px 14px', display: 'flex', alignItems: 'center', borderTop: '1px solid var(--border)', lineHeight: 1.2, color: piso.color }}>
        {piso.label}
      </div>
      {dias.map(d => {
        const k = iso(d)
        // La barra azul cubre la reserva ENTERA, del día de entrada al día de salida:
        // media celda al entrar, celdas completas las noches intermedias, media celda al salir.
        // Con cambio de huésped el mismo día se ven las dos medias barras (sale una, entra otra).
        const res = nocheOcupada(reservas, piso.id, k)
        const empieza = res?.checkIn === k
        const saliente = reservas.find(r => r.propertyId === piso.id && r.checkOut === k)
        // El 🧽 sale de la RESERVA (toda salida = limpieza), no de cleaning_sessions: el cron solo
        // crea la ficha a 14 días vista y sin esto las salidas lejanas parecían «sin limpieza».
        const limp = limpiezas.find(l => l.propertyId === piso.id && l.fecha === k)
        const hayLimpieza = Boolean(saliente) || Boolean(limp)
        const entra = hayLimpieza ? entradaMismoDia(reservas, piso.id, k) : null
        const barra = (estilo: React.CSSProperties, contenido?: React.ReactNode) => (
          <div style={{ position: 'absolute', top: 8, bottom: 8, background: '#3E6AA8', zIndex: 1, ...estilo }}>{contenido}</div>
        )
        return (
          <div key={k} className="li-cell" onClick={() => onSel(k)} role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') onSel(k) }}
            style={k === sel ? { background: 'var(--primary-light, rgba(79,70,229,.08))' } : undefined}>
            {k === hoy && <div style={{ position: 'absolute', inset: 0, borderLeft: '2px solid var(--primary)', opacity: .4, pointerEvents: 'none' }} />}
            {saliente && barra({ left: 0, right: '55%', borderTopRightRadius: 20, borderBottomRightRadius: 20 })}
            {res && barra(
              {
                left: empieza ? '45%' : 0, right: 0,
                borderTopLeftRadius: empieza ? 20 : 0, borderBottomLeftRadius: empieza ? 20 : 0,
              },
              empieza ? (
                <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: '#fff', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
                  →{res.pax != null ? `${res.pax}👤` : ''}
                </span>
              ) : undefined,
            )}
            {hayLimpieza && (
              <span title="Limpieza" style={{ position: 'absolute', zIndex: 2, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 20, height: 20, borderRadius: '50%', background: entra ? 'var(--warning)' : 'var(--positive)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🧽</span>
            )}
            {pendientes.some(pe => pe.propertyId === piso.id && pe.checkIn === k) && (
              <span title="Reserva de Booking pendiente de Smoobu" style={{ position: 'absolute', zIndex: 2, left: '50%', top: 2, transform: 'translateX(-50%)', fontSize: 11 }}>⚠️</span>
            )}
          </div>
        )
      })}
    </>
  )
}

const btnNav: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 10, minWidth: 44, minHeight: 40, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
}
const tituloBloque: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
  color: 'var(--muted)', margin: '14px 0 8px',
}
const vacio: React.CSSProperties = { color: 'var(--muted)', fontSize: 13, padding: '2px 0 6px' }
const chip: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
  background: 'var(--border)', color: 'var(--muted)',
}
const nota: React.CSSProperties = {
  background: 'var(--warning-bg)', border: '1px solid #fde68a', color: 'var(--warning)',
  borderRadius: 10, padding: '7px 10px', fontSize: 13, marginTop: 8,
}
