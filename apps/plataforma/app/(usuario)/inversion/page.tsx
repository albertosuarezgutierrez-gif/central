'use client'
// ────────────────────────────────────────────────────────────────────────────
// 🏘️ Analizar compra — la pantalla del motor de underwriting.
//
// NO calcula nada: todo sale de `lib/inversion/underwriting.ts` a través de
// `/api/inversion/underwrite`. Aquí solo se recogen los datos y se pinta lo que
// el motor devuelve, incluidos sus HUECOS: «pendiente de verificar» y «no hay»
// se dicen distinto, porque son cosas distintas.
// ────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { eur } from '@/lib/dinero'
import type { Underwriting } from '@/lib/inversion/tipos'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

type FilaMes = { adrEntero: string; ocupEntero: string; adrUnidad: string; ocupUnidad: string }
const FILA_VACIA: FilaMes = { adrEntero: '', ocupEntero: '', adrUnidad: '', ocupUnidad: '' }

const num = (s: string): number | null => {
  const v = parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) ? v : null
}
const pct = (n: number | null | undefined) => (n == null ? '—' : `${(n * 100).toFixed(2)}%`)

const COLOR_DECISION: Record<string, string> = {
  si: 'var(--positive)',
  condicional: 'var(--warning)',
  no: 'var(--negative)',
  no_calculable: 'var(--muted)',
}
const TITULO_DECISION: Record<string, string> = {
  si: '🟢 Sí — bate el listón con el año medido',
  condicional: '🟠 Condicional — lo medido ya bate el listón, falta completar la medición',
  no: '🔴 No',
  no_calculable: '⚪ No se puede decidir todavía',
}

export default function AnalizarCompraPage() {
  // Ficha
  const [referencia, setReferencia] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [precio, setPrecio] = useState('')
  const [m2, setM2] = useState('')
  const [plazasTotales, setPlazasTotales] = useState('')
  const [nUnidades, setNUnidades] = useState('')
  const [plazasUnidad, setPlazasUnidad] = useState('')
  const [reforma, setReforma] = useState('')
  const [gastosCompraPct, setGastosCompraPct] = useState('10')

  // Puerta legal
  const [licenciaVUT, setLicenciaVUT] = useState<'confirmada' | 'no_tiene' | 'sin_verificar'>('sin_verificar')
  const [registroUnico, setRegistroUnico] = useState<'confirmada' | 'no_tiene' | 'sin_verificar'>('sin_verificar')
  const [edificioCompleto, setEdificioCompleto] = useState<'si' | 'no' | 'no_consta'>('no_consta')

  // Mercado
  const [filas, setFilas] = useState<FilaMes[]>(() => MESES.map(() => ({ ...FILA_VACIA })))

  // Costes
  const [comisionCanal, setComisionCanal] = useState('19.72')
  const [gestionPct, setGestionPct] = useState('20')
  const [limpiezaPorEstancia, setLimpiezaPorEstancia] = useState('60')
  const [nochesPorEstancia, setNochesPorEstancia] = useState('4')
  const [ibiAnual, setIbiAnual] = useState('600')
  const [seguroAnual, setSeguroAnual] = useState('400')
  const [suministrosAnual, setSuministrosAnual] = useState('1800')
  const [comunidadAnual, setComunidadAnual] = useState('0')
  const [mantenimientoPct, setMantenimientoPct] = useState('5')

  // Financiación y supuestos
  const [conFinanciacion, setConFinanciacion] = useState(false)
  const [finPorcentaje, setFinPorcentaje] = useState('60')
  const [finTipo, setFinTipo] = useState('3')
  const [finAnios, setFinAnios] = useState('25')
  const [ocupacionPorDefecto, setOcupacionPorDefecto] = useState('')
  const [rampaAnio1, setRampaAnio1] = useState('20')
  const [aniosHorizonte, setAniosHorizonte] = useState('10')
  const [alternativaLiquida, setAlternativaLiquida] = useState('7')
  const [largaDuracionMensual, setLargaDuracionMensual] = useState('')
  const [revalorizacionAnual, setRevalorizacionAnual] = useState('0')
  const [comisionRecuperableAnual, setComisionRecuperableAnual] = useState('')

  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<Underwriting | null>(null)
  const [guardado, setGuardado] = useState<{ ok: boolean; motivo: string | null } | null>(null)

  const aforoEntero = num(plazasTotales)
  const aforoUnidad = num(plazasUnidad)

  const mesesMedidos = useMemo(
    () => filas.filter(f => num(f.adrEntero) != null || num(f.adrUnidad) != null).length,
    [filas],
  )

  function setFila(i: number, campo: keyof FilaMes, valor: string) {
    setFilas(prev => prev.map((f, j) => (i === j ? { ...f, [campo]: valor } : f)))
  }

  function curvaDe(campoAdr: keyof FilaMes, campoOcup: keyof FilaMes) {
    return filas.map((f, i) => {
      const adr = num(f[campoAdr])
      return {
        mes: i + 1,
        adrGuest: adr,
        comparables: adr == null ? 0 : 1,
        ocupacionProxy: num(f[campoOcup]) != null ? num(f[campoOcup])! / 100 : null,
      }
    })
  }

  async function analizar() {
    setCargando(true)
    setError(null)
    setRes(null)
    setGuardado(null)

    const unidades = (() => {
      const n = num(nUnidades)
      const p = num(plazasUnidad)
      if (n == null || p == null || n < 2) return []
      return Array.from({ length: Math.round(n) }, (_, i) => ({ nombre: `Unidad ${i + 1}`, plazas: Math.round(p) }))
    })()

    const mercado: { aforo: number; curva: ReturnType<typeof curvaDe> }[] = []
    if (aforoEntero != null) mercado.push({ aforo: Math.round(aforoEntero), curva: curvaDe('adrEntero', 'ocupEntero') })
    if (aforoUnidad != null && aforoUnidad !== aforoEntero) {
      mercado.push({ aforo: Math.round(aforoUnidad), curva: curvaDe('adrUnidad', 'ocupUnidad') })
    }

    const cuerpo = {
      ficha: {
        referencia: referencia || 'sin-referencia',
        municipio: municipio || 'sin-municipio',
        precio: num(precio),
        m2: num(m2),
        plazasTotales: aforoEntero != null ? Math.round(aforoEntero) : null,
        unidades,
        reforma: num(reforma),
        gastosCompraPct: (num(gastosCompraPct) ?? 0) / 100,
      },
      legal: {
        licenciaVUT,
        registroUnico,
        edificioCompleto: edificioCompleto === 'no_consta' ? null : edificioCompleto === 'si',
        notas: [],
      },
      mercado,
      costes: {
        comisionCanal: (num(comisionCanal) ?? 0) / 100,
        gestionPct: (num(gestionPct) ?? 0) / 100,
        limpiezaPorEstancia: num(limpiezaPorEstancia) ?? 0,
        nochesPorEstancia: num(nochesPorEstancia) ?? 1,
        ibiAnual: num(ibiAnual) ?? 0,
        seguroAnual: num(seguroAnual) ?? 0,
        suministrosAnual: num(suministrosAnual) ?? 0,
        comunidadAnual: num(comunidadAnual) ?? 0,
        mantenimientoPct: (num(mantenimientoPct) ?? 0) / 100,
      },
      financiacion: conFinanciacion
        ? {
            porcentaje: (num(finPorcentaje) ?? 0) / 100,
            tipoInteres: (num(finTipo) ?? 0) / 100,
            anios: Math.round(num(finAnios) ?? 25),
          }
        : null,
      supuestos: {
        ocupacionPorDefecto: num(ocupacionPorDefecto) != null ? num(ocupacionPorDefecto)! / 100 : null,
        rampaAnio1: (num(rampaAnio1) ?? 0) / 100,
        aniosHorizonte: Math.round(num(aniosHorizonte) ?? 10),
        alternativaLiquida: (num(alternativaLiquida) ?? 0) / 100,
        largaDuracionMensual: num(largaDuracionMensual),
        revalorizacionAnual: (num(revalorizacionAnual) ?? 0) / 100,
        comisionRecuperableAnual: num(comisionRecuperableAnual),
      },
    }

    try {
      const r = await fetch('/api/inversion/underwrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data?.error ?? `Error ${r.status}`)
        return
      }
      setRes(data.resultado)
      setGuardado({ ok: data.guardado, motivo: data.motivoNoGuardado ?? null })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1rem' }}>
      <h1 style={{ margin: '0 0 .25rem' }}>🏘️ Analizar compra</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        ¿Renta comprar este inmueble para explotarlo como VUT? Calcula los dos escenarios —entero y
        segregado— y dice <strong>NO por defecto</strong>.
      </p>

      <Bloque titulo="1 · La ficha">
        <Grid>
          <Campo label="Referencia (URL del anuncio)" valor={referencia} set={setReferencia} ancho />
          <Campo label="Municipio" valor={municipio} set={setMunicipio} />
          <Campo label="Precio pedido (€)" valor={precio} set={setPrecio} />
          <Campo label="m² construidos" valor={m2} set={setM2} />
          <Campo label="Plazas explotado entero" valor={plazasTotales} set={setPlazasTotales} />
          <Campo label="Nº de unidades si se segrega" valor={nUnidades} set={setNUnidades} />
          <Campo label="Plazas por unidad" valor={plazasUnidad} set={setPlazasUnidad} />
          <Campo label="Reforma (€)" valor={reforma} set={setReforma} />
          <Campo label="Gastos de compra (% ITP+notaría)" valor={gastosCompraPct} set={setGastosCompraPct} />
        </Grid>
      </Bloque>

      <Bloque titulo="2 · La puerta legal">
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: '.9rem' }}>
          Sin licencia y número de Registro Único no se calcula nada: un yield sobre una explotación que no
          se puede publicar no es optimista, es falso.
        </p>
        <Grid>
          <Selector label="Licencia turística (VUT)" valor={licenciaVUT} set={setLicenciaVUT} opciones={[
            ['sin_verificar', 'Sin verificar'], ['confirmada', 'Confirmada'], ['no_tiene', 'No tiene'],
          ]} />
          <Selector label="Nº de Registro Único" valor={registroUnico} set={setRegistroUnico} opciones={[
            ['sin_verificar', 'Sin verificar'], ['confirmada', 'Confirmado'], ['no_tiene', 'No tiene'],
          ]} />
          <Selector label="¿Se compra el edificio completo?" valor={edificioCompleto} set={setEdificioCompleto} opciones={[
            ['no_consta', 'No consta'], ['si', 'Sí'], ['no', 'No, hay comunidad'],
          ]} />
        </Grid>
      </Bloque>

      <Bloque titulo={`3 · El mercado por mes (${mesesMedidos}/12 con dato)`}>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: '.9rem' }}>
          ADR = lo que paga el huésped por noche. La ocupación de Booking es un <strong>proxy</strong> por
          saturación de comparables, no un dato de ocupación: déjala vacía si no la has medido.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: '.9rem' }}>
            <thead>
              <tr>
                <th style={th}>Mes</th>
                <th style={th}>ADR entero{aforoEntero ? ` (${aforoEntero}p)` : ''}</th>
                <th style={th}>Ocup. %</th>
                <th style={th}>ADR unidad{aforoUnidad ? ` (${aforoUnidad}p)` : ''}</th>
                <th style={th}>Ocup. %</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td style={td}>{MESES[i]}</td>
                  <td style={td}><input style={inputMini} value={f.adrEntero} onChange={e => setFila(i, 'adrEntero', e.target.value)} inputMode="decimal" /></td>
                  <td style={td}><input style={inputMini} value={f.ocupEntero} onChange={e => setFila(i, 'ocupEntero', e.target.value)} inputMode="decimal" /></td>
                  <td style={td}><input style={inputMini} value={f.adrUnidad} onChange={e => setFila(i, 'adrUnidad', e.target.value)} inputMode="decimal" /></td>
                  <td style={td}><input style={inputMini} value={f.ocupUnidad} onChange={e => setFila(i, 'ocupUnidad', e.target.value)} inputMode="decimal" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>

      <details style={{ ...bloque, padding: '.75rem 1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>4 · Costes, financiación y supuestos</summary>
        <div style={{ marginTop: '1rem' }}>
          <Grid>
            <Campo label="Comisión del canal (%)" valor={comisionCanal} set={setComisionCanal} />
            <Campo label="Gestión externa (%)" valor={gestionPct} set={setGestionPct} />
            <Campo label="Limpieza por estancia (€)" valor={limpiezaPorEstancia} set={setLimpiezaPorEstancia} />
            <Campo label="Noches por estancia" valor={nochesPorEstancia} set={setNochesPorEstancia} />
            <Campo label="IBI anual (€)" valor={ibiAnual} set={setIbiAnual} />
            <Campo label="Seguro anual (€)" valor={seguroAnual} set={setSeguroAnual} />
            <Campo label="Suministros anuales (€)" valor={suministrosAnual} set={setSuministrosAnual} />
            <Campo label="Comunidad anual (€)" valor={comunidadAnual} set={setComunidadAnual} />
            <Campo label="Mantenimiento (% del ingreso)" valor={mantenimientoPct} set={setMantenimientoPct} />
          </Grid>

          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: '1rem 0', minHeight: 44 }}>
            <input type="checkbox" checked={conFinanciacion} onChange={e => setConFinanciacion(e.target.checked)} />
            Con hipoteca
          </label>
          {conFinanciacion && (
            <Grid>
              <Campo label="% financiado" valor={finPorcentaje} set={setFinPorcentaje} />
              <Campo label="Tipo de interés (%)" valor={finTipo} set={setFinTipo} />
              <Campo label="Años" valor={finAnios} set={setFinAnios} />
            </Grid>
          )}

          <Grid>
            <Campo label="Ocupación supuesta para meses sin medir (%)" valor={ocupacionPorDefecto} set={setOcupacionPorDefecto} ancho />
            <Campo label="Rampa de reseñas año 1 (%)" valor={rampaAnio1} set={setRampaAnio1} />
            <Campo label="Horizonte (años)" valor={aniosHorizonte} set={setAniosHorizonte} />
            <Campo label="Alternativa líquida / bolsa (%)" valor={alternativaLiquida} set={setAlternativaLiquida} />
            <Campo label="Larga duración (€/mes)" valor={largaDuracionMensual} set={setLargaDuracionMensual} />
            <Campo label="Revalorización anual (%)" valor={revalorizacionAnual} set={setRevalorizacionAnual} />
            <Campo label="Comisión de Booking recuperable (€/año)" valor={comisionRecuperableAnual} set={setComisionRecuperableAnual} ancho />
          </Grid>
        </div>
      </details>

      <button onClick={analizar} disabled={cargando} style={boton}>
        {cargando ? 'Analizando…' : 'Analizar'}
      </button>

      {error && (
        <div style={{ ...bloque, borderColor: 'var(--negative)', color: 'var(--negative)' }}>⚠️ {error}</div>
      )}

      {res && <Informe res={res} guardado={guardado} />}
    </div>
  )
}

function Informe({ res, guardado }: { res: Underwriting; guardado: { ok: boolean; motivo: string | null } | null }) {
  const v = res.veredicto
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ ...bloque, borderLeft: `4px solid ${COLOR_DECISION[v.decision]}` }}>
        <h2 style={{ margin: '0 0 .5rem', color: COLOR_DECISION[v.decision] }}>{TITULO_DECISION[v.decision]}</h2>
        {v.faltan.length > 0 && (
          <p style={{ margin: '.25rem 0' }}>
            <strong>Falta por saber:</strong> {v.faltan.join(' · ')}
          </p>
        )}
        <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
          {v.motivos.map((m, i) => <li key={i} style={{ marginBottom: '.25rem' }}>{m}</li>)}
        </ul>
        {v.listonAnual != null && (
          <p style={{ marginBottom: 0, color: 'var(--muted)' }}>
            Listón a batir: <strong>{pct(v.listonAnual)}</strong> anual.
          </p>
        )}
      </div>

      <div style={bloque}>
        <Dato label="Inversión total" valor={res.inversionTotal != null ? eur(res.inversionTotal) : 'sin precio'} />
        <Dato label="Capital aportado" valor={res.capitalAportado != null ? eur(res.capitalAportado) : 'sin precio'} />
        <Dato label="€/m²" valor={res.precioPorM2 != null ? eur(res.precioPorM2) : 'sin m² — no se sabe'} />
      </div>

      {res.escenarios == null ? (
        <div style={{ ...bloque, color: 'var(--muted)' }}>
          Los escenarios no se calculan hasta que la puerta legal esté resuelta.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr>
                <th style={th}>Escenario</th>
                {res.escenarios.map(e => (
                  <th key={e.nombre} style={th}>
                    {e.nombre === 'entero' ? '🏠 Entero' : '🏘️ Segregado'} · {e.plazas} plazas
                    {res.recomendado === e.nombre && ' ⭐'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Fila etiqueta="Ingreso bruto anual" ers={res.escenarios} pinta={e => eur(e.ingresoBrutoAnual)} />
              <Fila etiqueta="Comisión del canal" ers={res.escenarios} pinta={e => `−${eur(e.costes.comisionCanal)}`} />
              <Fila etiqueta="Gestión" ers={res.escenarios} pinta={e => `−${eur(e.costes.gestion)}`} />
              <Fila etiqueta="Limpieza" ers={res.escenarios} pinta={e => `−${eur(e.costes.limpieza)}`} />
              <Fila etiqueta="Fijos (IBI+seguro+sumin.+com.)" ers={res.escenarios} pinta={e => `−${eur(e.costes.ibi + e.costes.seguro + e.costes.suministros + e.costes.comunidad)}`} />
              <Fila etiqueta="Mantenimiento" ers={res.escenarios} pinta={e => `−${eur(e.costes.mantenimiento)}`} />
              <Fila etiqueta="NOI" ers={res.escenarios} pinta={e => eur(e.noi)} fuerte />
              <Fila etiqueta="Yield bruto" ers={res.escenarios} pinta={e => pct(e.yieldBruto)} />
              <Fila etiqueta="Yield neto" ers={res.escenarios} pinta={e => pct(e.yieldNeto)} fuerte />
              <Fila etiqueta="Cash-on-cash" ers={res.escenarios} pinta={e => (e.cashOnCash == null ? 'sin hipoteca' : pct(e.cashOnCash))} />
              <Fila etiqueta="Payback" ers={res.escenarios} pinta={e => (e.paybackAnios == null ? 'nunca con este flujo' : `${e.paybackAnios.toFixed(1)} años`)} />
              <Fila etiqueta="TIR" ers={res.escenarios} pinta={e => (e.tir == null ? 'no converge' : pct(e.tir))} />
              <Fila etiqueta="Noches vendidas" ers={res.escenarios} pinta={e => e.nochesVendidas.toFixed(0)} />
              <Fila etiqueta="Año medido" ers={res.escenarios} pinta={e => `${Math.round(e.cobertura * 12)}/12${e.esSuelo ? ' (es un suelo)' : ''}`} />
            </tbody>
          </table>
        </div>
      )}

      {res.escenarios?.some(e => e.mesesSinMedir.length || e.mesesSinOcupacion.length || e.mesesConOcupacionSupuesta.length) && (
        <div style={{ ...bloque, background: 'var(--warning-bg)' }}>
          <strong>Huecos declarados</strong>
          <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
            {res.escenarios.map(e => (
              <li key={e.nombre}>
                {e.nombre}: {e.mesesSinMedir.length ? `${e.mesesSinMedir.length} meses sin ADR medido` : 'ADR completo'}
                {e.mesesSinOcupacion.length ? ` · ${e.mesesSinOcupacion.length} sin ocupación` : ''}
                {e.mesesConOcupacionSupuesta.length ? ` · ${e.mesesConOcupacionSupuesta.length} con ocupación supuesta` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={bloque}>
        <strong>¿Comparado con qué?</strong>
        <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
          {res.veredicto.alternativas.map(a => (
            <li key={a.nombre} style={{ marginBottom: '.35rem' }}>
              <strong>{a.nombre}:</strong> {a.rentabilidad == null ? 'sin comparar' : pct(a.rentabilidad)} — <span style={{ color: 'var(--muted)' }}>{a.nota}</span>
            </li>
          ))}
        </ul>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
        Motor {res.motorVersion}.{' '}
        {guardado == null ? '' : guardado.ok ? 'Análisis guardado en el histórico.' : `⚠️ No se pudo guardar: ${guardado.motivo}`}
      </p>
    </div>
  )
}

// ── Piezas de UI ────────────────────────────────────────────────────────────

const bloque: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '1rem',
  marginBottom: '1rem',
}
const th: React.CSSProperties = { textAlign: 'left', padding: '.5rem', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600 }
const td: React.CSSProperties = { padding: '.35rem .5rem', borderBottom: '1px solid var(--border)' }
const inputMini: React.CSSProperties = { width: '100%', minWidth: 70, minHeight: 36, padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }
const boton: React.CSSProperties = { minHeight: 44, padding: '0 1.5rem', background: 'var(--primary)', color: '#fff', border: 0, borderRadius: 'var(--radius)', fontWeight: 600, cursor: 'pointer', width: '100%', maxWidth: 260 }

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={bloque}>
      <h2 style={{ margin: '0 0 .75rem', fontSize: '1.05rem' }}>{titulo}</h2>
      {children}
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem' }}>{children}</div>
}

function Campo({ label, valor, set, ancho }: { label: string; valor: string; set: (v: string) => void; ancho?: boolean }) {
  return (
    <label style={{ display: 'block', gridColumn: ancho ? '1 / -1' : undefined }}>
      <span style={{ display: 'block', fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.2rem' }}>{label}</span>
      <input
        value={valor}
        onChange={e => set(e.target.value)}
        style={{ width: '100%', minHeight: 44, padding: '.4rem .6rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}
      />
    </label>
  )
}

function Selector<T extends string>({ label, valor, set, opciones }: { label: string; valor: T; set: (v: T) => void; opciones: [T, string][] }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.2rem' }}>{label}</span>
      <select
        value={valor}
        onChange={e => set(e.target.value as T)}
        style={{ width: '100%', minHeight: 44, padding: '.4rem .6rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}
      >
        {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'inline-block', marginRight: '2rem', marginBottom: '.5rem' }}>
      <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{valor}</div>
    </div>
  )
}

function Fila({
  etiqueta,
  ers,
  pinta,
  fuerte,
}: {
  etiqueta: string
  ers: Underwriting['escenarios']
  pinta: (e: NonNullable<Underwriting['escenarios']>[number]) => string
  fuerte?: boolean
}) {
  if (!ers) return null
  return (
    <tr>
      <td style={{ ...td, fontWeight: fuerte ? 700 : 400 }}>{etiqueta}</td>
      {ers.map(e => (
        <td key={e.nombre} style={{ ...td, fontWeight: fuerte ? 700 : 400 }}>{pinta(e)}</td>
      ))}
    </tr>
  )
}
