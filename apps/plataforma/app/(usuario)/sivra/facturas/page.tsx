'use client'

// /sivra/facturas — libro de FACTURAS A HUÉSPEDES (emitidas por plataforma: única fuente de numeración de la serie).
// Periodo (mes / trimestre / año / temporada personalizada) por FECHA DE EXPEDICIÓN y piso; totales base/IVA/total;
// CSV; borradores pendientes; alta manual (reserva → enlace para el huésped, o datos rellenados por Alberto).
// Emitir NO se hace aquí: es el ✅ de Telegram (un solo sitio que numera).
import { useCallback, useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { eur } from '@/lib/dinero'
import { Badge, PageHeader, Pagina, Stat, TablaScroll, btnStyle, cardStyle } from '@/components/ui'
import AltaManual from './AltaManual'
import PanelCiclo, { type Aviso, type DatosPanel, type Filtro, type FilaCiclo } from './PanelCiclo'

type Fila = {
  id: string; numeroCompleto: string | null; fechaExpedicion: string | null; estado: string; piso: string; reservationId: string
  receptorNombre: string; receptorNif: string; base: number | null; tipoIva: number | null; cuota: number | null; total: number
  envioError: string | null; tienePdf: boolean
}
type Respuesta = DatosPanel & {
  emitidas: Fila[]; totales: { base: number; cuota: number; total: number; n: number }
  pisos: Array<{ id: string; nombre: string }>
  serie: { ok: true; prefijo: string; anio: number; siguiente: number; tipoIva: number } | { ok: false; motivo: string }
}
const PASO = 50
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const control: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', minWidth: 0 }
const fecha = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—')
const importe = (n: number | null) => (n === null ? '—' : eur(n))

function Estado({ f }: { f: Fila }) {
  if (f.estado === 'enviada') return <Badge tono="positivo">Enviada</Badge>
  if (f.estado === 'emitida') return <Badge tono="aviso" title={f.envioError ?? undefined}>Emitida · sin enviar</Badge>
  if (f.estado === 'rectificada') return <Badge tono="info">Rectificada</Badge>
  return <Badge>Borrador</Badge>
}

export default function FacturasHuespedesPage() {
  const hoy = new Date()
  const [periodo, setPeriodo] = useState<'mes' | 'trimestre' | 'anio' | 'personalizado'>('mes')
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [trimestre, setTrimestre] = useState(Math.floor(hoy.getMonth() / 3) + 1)
  const [desde, setDesde] = useState(`${hoy.getFullYear()}-06-01`)
  const [hasta, setHasta] = useState(`${hoy.getFullYear()}-09-30`)
  const [piso, setPiso] = useState('')
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [visibles, setVisibles] = useState(PASO)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [filtro, setFiltro] = useState<Filtro | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const query = useCallback(() => {
    const p = new URLSearchParams({ periodo, anio: String(anio) })
    if (periodo === 'mes') p.set('mes', String(mes))
    if (periodo === 'trimestre') p.set('trimestre', String(trimestre))
    if (periodo === 'personalizado') { p.set('desde', desde); p.set('hasta', hasta) }
    if (piso) p.set('piso', piso)
    return p
  }, [periodo, anio, mes, trimestre, desde, hasta, piso])

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try {
      const r = await fetch(`/api/sivra/facturas?${query()}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
      setDatos(j); setVisibles(PASO)
    } catch (e) {
      // Un fallo de lectura NO es «no hay facturas»: se dice y se conserva lo que había.
      setError(e instanceof Error ? e.message : 'No se ha podido leer el libro')
    } finally {
      setCargando(false)
    }
  }, [query])
  useEffect(() => { void cargar() }, [cargar])

  const dar = (ok: boolean, texto: string) => setAviso({ ok, texto })

  async function accion(id: string, a: 'proponer' | 'reenviar', forzar = false): Promise<void> {
    setAviso(null); setOcupado(id)
    try {
      const r = await fetch(`/api/sivra/facturas/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: a, ...(forzar ? { forzar: true } : {}) }) })
      const j = await r.json().catch(() => ({}))
      // Envío DUDOSO: pudo salir ya (se cortó sin registrar éxito ni error). Reenviar es decisión de Alberto, avisado.
      if (a === 'reenviar' && !forzar && j.resultado?.estado === 'dudoso') {
        if (window.confirm('No sé si el correo de esta factura llegó a salir (el envío anterior se cortó sin registrar éxito ni error). Mira primero el buzón de enviados. ¿Reenviar igualmente? El huésped podría recibirla dos veces.')) return await accion(id, a, true)
        dar(false, 'No se ha reenviado: el envío anterior es dudoso. Comprueba el buzón de enviados.')
        return
      }
      if (a === 'proponer') {
        if (j.propuesta === 'enviada') dar(true, 'Te he mandado el borrador por Telegram.')
        else if (j.propuesta === 'silenciada') dar(false, 'El aviso «Factura de huésped para aprobar» está silenciado en /telegram: no te he mandado nada.')
        else dar(false, j.error || 'No se ha podido mandar el borrador a Telegram.')
      } else if (j.ok) dar(true, 'Correo enviado.')
      else if (j.resultado?.estado === 'en_curso') dar(false, 'El envío está en curso: espera unos minutos.')
      else dar(false, `No se ha enviado: ${j.resultado?.motivo ?? j.error ?? 'error'}`)
    } catch (e) {
      dar(false, `No se ha podido completar la acción: ${e instanceof Error ? e.message : 'sin conexión'}`)
    } finally {
      setOcupado(null)
      void cargar()
    }
  }

  async function reenviarConfirmado(id: string) {
    if (window.confirm('¿Reintentar el envío de esta factura por correo al huésped?')) await accion(id, 'reenviar')
  }

  async function preparar(solicitudId: string) {
    setAviso(null); setOcupado(solicitudId)
    try {
      const r = await fetch('/api/sivra/facturas/solicitud/preparar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ solicitudId }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) dar(false, `No se ha podido preparar el borrador: ${j.error || `error ${r.status}`}`)
      else if (j.propuesta === 'enviada') dar(true, 'Te he mandado el borrador por Telegram. Apruébalo allí con ✅ o aquí en «Borradores esperando aprobación».')
      else if (j.propuesta === 'silenciada') dar(false, 'Borrador preparado, pero NO te lo he mandado: el aviso «Factura de huésped para aprobar» está silenciado en /telegram.')
      else dar(false, 'Borrador preparado, pero el aviso a Telegram ha fallado: búscalo en «Borradores esperando aprobación» y usa «Reenviar a Telegram».')
    } catch (e) {
      dar(false, `No se ha podido preparar el borrador: ${e instanceof Error ? e.message : 'sin conexión'}`)
    } finally {
      setOcupado(null)
      void cargar()
    }
  }

  // ✅ Aprobar y enviar: el diálogo de PanelCiclo ya ha confirmado. La ruta exige `confirmado: true` + sesión y reutiliza emitirFactura/enviarFactura.
  async function aprobar(f: FilaCiclo): Promise<void> {
    setAviso(null)
    try {
      const r = await fetch(`/api/sivra/facturas/${f.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'aprobar', confirmado: true, visto: f.telegramMessageId }) })
      const j = await r.json().catch(() => ({}))
      const n = j.numero ?? j.emision?.numeroCompleto ?? ''
      const e = j.envio
      if (e?.estado === 'enviada') dar(true, `Factura ${n} emitida y enviada a ${e.email}${e.cc?.length ? ` (CC ${e.cc.join(', ')})` : ''}.`)
      else if (e?.estado === 'ya_enviada') dar(true, 'Esa factura ya estaba emitida y enviada. No se ha hecho nada más.')
      else if (e?.estado === 'fallida') dar(false, `Factura ${n} EMITIDA, pero el correo NO ha salido: ${e.motivo}. Queda en «Emitidas sin enviar» para reintentar.`)
      else if (e?.estado === 'en_curso' || e?.estado === 'dudoso') dar(false, `Factura ${n} emitida; el envío está ${e.estado === 'dudoso' ? 'en duda' : 'en curso'}: mira «Emitidas sin enviar» antes de repetir.`)
      else dar(false, j.error || `No se ha emitido (error ${r.status}).`)
    } catch (err) {
      dar(false, `No se ha podido completar la aprobación: ${err instanceof Error ? err.message : 'sin conexión'}. Comprueba el estado antes de repetir.`)
    } finally {
      void cargar()
    }
  }

  async function copiar(enlace: string) {
    try { await navigator.clipboard.writeText(enlace); dar(true, 'Enlace del formulario copiado: mándaselo al huésped.') }
    catch { window.prompt('Copia el enlace del formulario:', enlace) }
  }

  const emitidas = datos?.emitidas ?? []
    return (
    <Pagina ancho="tabla">
      <PageHeader titulo="Facturas a huéspedes" icono={<FileText size={20} />}
        sub="Plataforma numera la serie. Aprobar = ✅ en Telegram o «Aprobar y enviar» aquí."
        acciones={<a href={`/api/sivra/facturas?${query()}&formato=csv`} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Exportar CSV</a>} />

      {datos && !datos.serie.ok && (
        <div role="alert" style={{ ...cardStyle, marginBottom: 16, borderLeft: '4px solid var(--warning)' }}>
          ⛔ {datos.serie.motivo}. Se preparan borradores, pero el ✅ no emite hasta configurar la serie (prefijo, año, número inicial y tipo de IVA) en <code>sivra_factura_series</code>.
        </div>
      )}

      <section style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Periodo
          <select style={control} value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)}>
            <option value="mes">Mes</option><option value="trimestre">Trimestre</option><option value="anio">Año</option><option value="personalizado">Temporada (fechas)</option>
          </select>
        </label>
        {periodo !== 'personalizado' && (
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Año
            <input style={control} type="number" min={2024} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
          </label>
        )}
        {periodo === 'mes' && (
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Mes
            <select style={control} value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </label>
        )}
        {periodo === 'trimestre' && (
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Trimestre
            <select style={control} value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))}>{[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}T</option>)}</select>
          </label>
        )}
        {periodo === 'personalizado' && (<>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Desde<input style={control} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Hasta<input style={control} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        </>)}
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Piso
          <select style={control} value={piso} onChange={(e) => setPiso(e.target.value)}>
            <option value="">Todos</option>
            {(datos?.pisos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
      </section>

      {error && <div role="alert" style={{ ...cardStyle, marginBottom: 16, color: 'var(--negative)' }}>No se ha podido leer el libro: {error}</div>}

      <PanelCiclo datos={datos} aviso={aviso} filtro={filtro} setFiltro={setFiltro} ocupado={ocupado}
        onPreparar={(id) => void preparar(id)} onProponer={(id) => void accion(id, 'proponer')} onReenviar={(id) => void reenviarConfirmado(id)}
        onAprobar={aprobar} onCopiar={(e) => void copiar(e)} />

      <section style={{ ...cardStyle, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Stat label="Facturas emitidas" value={datos ? datos.totales.n : '—'} />
        <Stat label="Base imponible" value={datos ? eur(datos.totales.base) : '—'} />
        <Stat label="IVA" value={datos ? eur(datos.totales.cuota) : '—'} />
        <Stat label="Total" value={datos ? eur(datos.totales.total) : '—'} />
      </section>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Libro del periodo {cargando && <span style={{ fontSize: 12, color: 'var(--muted)' }}>· cargando…</span>}</h2>
        {datos && emitidas.length === 0 && !error && <p style={{ color: 'var(--muted)' }}>No hay facturas emitidas en este periodo.</p>}
        {emitidas.length > 0 && (
          <TablaScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 760 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: 8 }}>Número</th><th style={{ padding: 8 }}>Fecha</th><th style={{ padding: 8 }}>Piso</th><th style={{ padding: 8 }}>Destinatario</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Base</th><th style={{ padding: 8, textAlign: 'right' }}>IVA</th><th style={{ padding: 8, textAlign: 'right' }}>Total</th><th style={{ padding: 8 }}>Estado</th><th style={{ padding: 8 }} />
              </tr></thead>
              <tbody>
                {emitidas.slice(0, visibles).map((f) => (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>{f.numeroCompleto}</td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{fecha(f.fechaExpedicion)}</td>
                    <td style={{ padding: 8 }}>{f.piso}</td>
                    <td style={{ padding: 8, overflowWrap: 'anywhere' }}>{f.receptorNombre}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.receptorNif}</div></td>
                    <td style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>{importe(f.base)}</td>
                    <td style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>{importe(f.cuota)}</td>
                    <td style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{eur(f.total)}</td>
                    <td style={{ padding: 8 }}><Estado f={f} /></td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                      {f.tienePdf && <a href={`/api/sivra/facturas/${f.id}/pdf`} target="_blank" rel="noreferrer" style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>PDF</a>}
                      {f.estado === 'emitida' && <button type="button" onClick={() => void reenviarConfirmado(f.id)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Reintentar envío</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
        )}
        {emitidas.length > visibles && (
          <button type="button" onClick={() => setVisibles((v) => v + PASO)} style={{ ...btnStyle('secundario'), marginTop: 12, minHeight: 44, width: '100%' }}>
            Ver más ({emitidas.length - visibles} restantes)
          </button>
        )}
      </section>

      <AltaManual onHecho={() => void cargar()} />
    </Pagina>
  )
}
