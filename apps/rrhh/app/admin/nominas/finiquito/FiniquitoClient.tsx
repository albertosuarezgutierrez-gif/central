'use client'
import { useState } from 'react'
import type { Finiquito } from '@central/module-nominas'
import Card from '@/components/ui/Card'
import Boton from '@/components/ui/Boton'
import { eurCent } from '../formato'

export type EmpleadoFiniquito = {
  id: string; nombre: string; fecha_inicio: string | null; fecha_baja: string | null; motivo_baja: string | null; salario_base: number | null
}

// Causas = las del motor (`CausaExtincion` de @central/module-nominas), con su parámetro.
const CAUSAS = [
  { id: 'dimision', label: 'Dimisión / baja voluntaria' },
  { id: 'fin_contrato_temporal', label: 'Fin de contrato temporal (art. 49.1.c ET)' },
  { id: 'objetivo', label: 'Despido objetivo (art. 52-53 ET)' },
  { id: 'improcedente', label: 'Despido improcedente (art. 56 ET)' },
] as const

const AVISOS: Record<string, string> = {
  vacaciones_bajo_minimo_legal_30_dias: 'Las vacaciones anuales indicadas están por debajo del mínimo legal (30 días naturales).',
  vacaciones_disfrutadas_de_mas: 'Ha disfrutado más vacaciones de las devengadas: el importe de vacaciones sale negativo (descuento).',
  improcedencia_sin_conciliacion_no_exenta: 'Improcedencia reconocida por la empresa sin conciliación administrativa ni sentencia: la indemnización no queda exenta de IRPF.',
  indemnizacion_superior_a_la_obligatoria: 'La indemnización pagada supera la obligatoria: el exceso tributa.',
  limite_exencion_180000: 'Se ha aplicado el límite de exención de 180.000€ (art. 7.e LIRPF).',
}
const PENDIENTES: Record<string, string> = {
  'regla:finiquito_fraccion_mes': 'La fracción de mes se cuenta como mes completo (criterio jurisprudencial, sin verificar).',
  'regla:finiquito_exencion_fin_contrato': 'Exención en IRPF de la indemnización por fin de contrato temporal (doctrina administrativa, sin verificar).',
}

type Paga = { concepto: string; importe: string; inicioDevengo: string; finDevengo: string; pendiente: boolean }

/** Pagas extra semestrales típicas del año de la baja (verano ene-jun, navidad jul-dic). Solo PROPUESTA: el convenio manda. */
function pagasPropuestas(fechaBaja: string, importe: string): Paga[] {
  const a = /^\d{4}/.test(fechaBaja) ? fechaBaja.slice(0, 4) : String(new Date().getFullYear())
  return [
    { concepto: 'Paga de verano', importe, inicioDevengo: `${a}-01-01`, finDevengo: `${a}-06-30`, pendiente: !fechaBaja || fechaBaja <= `${a}-06-30` },
    { concepto: 'Paga de Navidad', importe, inicioDevengo: `${a}-07-01`, finDevengo: `${a}-12-31`, pendiente: true },
  ]
}

const input = 'border border-line rounded px-2 py-1 min-h-[44px]'

function Fila({ concepto, valor, fuerte }: { concepto: string; valor: string; fuerte?: boolean }) {
  return (
    <li className={`flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-sm border-b border-line py-1 ${fuerte ? 'font-bold' : ''}`}>
      <span className="min-w-0 break-words">{concepto}</span>
      <span className="ml-auto whitespace-nowrap">{valor}</span>
    </li>
  )
}

const dias = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} días`

export default function FiniquitoClient({ empleados }: { empleados: EmpleadoFiniquito[] }) {
  const [empleadoId, setEmpleadoId] = useState('')
  const [fechaAntiguedad, setFechaAntiguedad] = useState('')
  const [fechaBaja, setFechaBaja] = useState('')
  const [causa, setCausa] = useState('')
  const [modalidad, setModalidad] = useState('ordinaria')
  const [causa52c, setCausa52c] = useState(false)
  const [via, setVia] = useState('')
  const [salario, setSalario] = useState('')
  const [pagas, setPagas] = useState('14')
  const [salarioAnual, setSalarioAnual] = useState('')
  const [prorrata, setProrrata] = useState(false)
  const [listaPagas, setListaPagas] = useState<Paga[]>(() => pagasPropuestas('', ''))
  const [vacAnuales, setVacAnuales] = useState('30')
  const [disfrutados, setDisfrutados] = useState('0')
  const [pagada, setPagada] = useState('')
  const [calculando, setCalculando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<Finiquito | null>(null)
  const [supuestos, setSupuestos] = useState<string[]>([])

  function elegir(id: string) {
    setEmpleadoId(id)
    const e = empleados.find(x => x.id === id)
    if (!e) return
    const baja = e.fecha_baja?.slice(0, 10) ?? ''
    const sal = e.salario_base != null ? String(e.salario_base) : ''
    setFechaAntiguedad(e.fecha_inicio?.slice(0, 10) ?? '')
    setFechaBaja(baja)
    setSalario(sal)
    setListaPagas(pagasPropuestas(baja, sal))
    setResultado(null)
  }

  function cambiarPaga(i: number, cambio: Partial<Paga>) {
    setListaPagas(l => l.map((p, j) => (j === i ? { ...p, ...cambio } : p)))
  }

  async function calcular(ev: React.FormEvent) {
    ev.preventDefault(); setCalculando(true); setError(''); setResultado(null)
    const extras = pagas === '14' && !prorrata
      ? listaPagas.filter(p => p.pendiente).map(({ concepto, importe, inicioDevengo, finDevengo }) => ({ concepto, importe: importe || salario, inicioDevengo, finDevengo }))
      : []
    const r = await fetch('/api/admin/nominas/finiquito', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fechaAntiguedad, fechaBaja, causa, modalidad, causa52c, via,
        salarioMensual: salario, salarioAnual, pagas: Number(pagas), pagasExtra: extras,
        diasVacacionesAnuales: Number(vacAnuales), diasVacacionesDisfrutados: Number(disfrutados || 0),
        indemnizacionPagada: pagada,
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setResultado(j.resultado as Finiquito); setSupuestos(Array.isArray(j.supuestos) ? j.supuestos : []) }
    else setError(j.error ?? 'No se pudo calcular')
    setCalculando(false)
  }

  const d = resultado
  const ind = d?.indemnizacion

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Card>
        <form onSubmit={calcular} className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Empleado (opcional, para rellenar)
            <select value={empleadoId} onChange={e => elegir(e.target.value)} className={input}>
              <option value="">— Escribir los datos a mano —</option>
              {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Fecha de antigüedad
              <input type="date" required value={fechaAntiguedad} onChange={e => setFechaAntiguedad(e.target.value)} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Último día trabajado
              <input type="date" required min={fechaAntiguedad || undefined} value={fechaBaja} onChange={e => setFechaBaja(e.target.value)} className={input} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Causa
            <select required value={causa} onChange={e => setCausa(e.target.value)} className={input}>
              <option value="">— Elige la causa —</option>
              {CAUSAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          {causa === 'fin_contrato_temporal' && (
            <label className="flex flex-col gap-1 text-sm">
              Modalidad del contrato
              <select value={modalidad} onChange={e => setModalidad(e.target.value)} className={input}>
                <option value="ordinaria">Temporal ordinario (12 días por año)</option>
                <option value="sustitucion">Sustitución (sin indemnización)</option>
                <option value="formativo">Formativo (sin indemnización)</option>
              </select>
            </label>
          )}
          {causa === 'objetivo' && (
            <label className="inline-flex min-h-[44px] items-center gap-2 text-sm">
              <input type="checkbox" checked={causa52c} onChange={e => setCausa52c(e.target.checked)} />
              Por causas económicas, técnicas, organizativas o de producción (art. 52.c ET)
            </label>
          )}
          {causa === 'improcedente' && (
            <label className="flex flex-col gap-1 text-sm">
              Cómo se reconoce la improcedencia
              <select required value={via} onChange={e => setVia(e.target.value)} className={input}>
                <option value="">— Elige —</option>
                <option value="sentencia">Sentencia</option>
                <option value="conciliacion_administrativa">Conciliación ante el servicio administrativo (SMAC/CMAC)</option>
                <option value="reconocimiento_empresa">Reconocida por la empresa (sin conciliación)</option>
              </select>
            </label>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              Salario mensual (€)
              <input required type="number" min="0.01" step="0.01" value={salario} onChange={e => setSalario(e.target.value)} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Pagas
              <select value={pagas} onChange={e => setPagas(e.target.value)} className={input}>
                <option value="12">12</option>
                <option value="14">14</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Salario anual (€)
              <input type="number" min="0.01" step="0.01" value={salarioAnual} onChange={e => setSalarioAnual(e.target.value)} placeholder="Vacío: mensual × pagas" className={input} />
            </label>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              Vacaciones al año (días naturales)
              <input required type="number" min="1" step="1" value={vacAnuales} onChange={e => setVacAnuales(e.target.value)} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Vacaciones disfrutadas este año (días)
              <input type="number" min="0" step="1" value={disfrutados} onChange={e => setDisfrutados(e.target.value)} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Indemnización pactada (€, opcional)
              <input type="number" min="0" step="0.01" value={pagada} onChange={e => setPagada(e.target.value)} placeholder="Vacío: la obligatoria" className={input} />
            </label>
          </div>
          {pagas === '14' && (
            <label className="inline-flex min-h-[44px] items-center gap-2 text-sm">
              <input type="checkbox" checked={prorrata} onChange={e => setProrrata(e.target.checked)} />
              Las pagas extra ya se cobraban prorrateadas
            </label>
          )}
          {pagas === '14' && !prorrata && (
            <fieldset className="grid grid-cols-[minmax(0,1fr)] gap-2 border border-line rounded p-2">
              <legend className="text-sm px-1">Pagas extra pendientes de cobro (periodos según convenio: revísalos)</legend>
              {listaPagas.map((p, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-4 items-end">
                  <label className="inline-flex min-h-[44px] items-center gap-2 text-sm sm:col-span-4">
                    <input type="checkbox" checked={p.pendiente} onChange={e => cambiarPaga(i, { pendiente: e.target.checked })} />
                    {p.concepto} pendiente
                  </label>
                  {p.pendiente && (<>
                    <label className="flex flex-col gap-1 text-sm">
                      Importe paga (€)
                      <input type="number" min="0" step="0.01" value={p.importe} placeholder={salario || 'Salario mensual'} onChange={e => cambiarPaga(i, { importe: e.target.value })} className={input} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Devengo desde
                      <input type="date" required value={p.inicioDevengo} onChange={e => cambiarPaga(i, { inicioDevengo: e.target.value })} className={input} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Devengo hasta
                      <input type="date" required value={p.finDevengo} onChange={e => cambiarPaga(i, { finDevengo: e.target.value })} className={input} />
                    </label>
                  </>)}
                </div>
              ))}
            </fieldset>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Boton type="submit" disabled={calculando}>{calculando ? 'Calculando…' : 'Calcular finiquito'}</Boton>
            {error && <span className="text-alert text-sm">{error}</span>}
          </div>
        </form>
      </Card>

      {d && ind && (
        <Card as="section">
          <h2 className="text-lg mb-2">Desglose</h2>
          <ul className="list-none p-0 grid gap-0">
            <Fila concepto={`Vacaciones no disfrutadas (${dias(d.vacaciones.diasPendientes)} de ${dias(d.vacaciones.diasDevengados)} devengados)`} valor={eurCent(d.vacaciones.importe)} />
            {d.pagasExtra.map(p => (
              <Fila key={p.concepto} concepto={`${p.concepto} (${p.diasDevengados} de ${p.diasPeriodo} días devengados)`} valor={eurCent(p.importe)} />
            ))}
            <Fila concepto="Total conceptos salariales (cotizan y tributan)" valor={eurCent(d.totalSalarial)} fuerte />
            <Fila concepto={`Indemnización obligatoria (${dias(ind.dias)} de salario${ind.topeAplicado ? ', con tope legal' : ''})`} valor={eurCent(ind.obligatoria)} />
            {ind.pagada !== ind.obligatoria && <Fila concepto="Indemnización pagada" valor={eurCent(ind.pagada)} />}
            <Fila concepto="· exenta de IRPF (art. 7.e LIRPF)" valor={eurCent(ind.exenta)} />
            <Fila concepto="· sujeta a IRPF" valor={eurCent(ind.sujeta)} />
            <Fila concepto="Total finiquito (bruto)" valor={eurCent(d.total)} fuerte />
          </ul>
          {(d.avisos.length > 0 || d.cifrasPendientes.length > 0 || supuestos.length > 0) && (
            <ul className="mt-3 list-disc pl-5 text-sm text-alert grid gap-1">
              {supuestos.map(s => <li key={s}>{s}</li>)}
              {d.avisos.map(a => <li key={a}>{AVISOS[a] ?? a}</li>)}
              {d.cifrasPendientes.map(c => <li key={c}>Regla sin verificar: {PENDIENTES[c] ?? c}</li>)}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
