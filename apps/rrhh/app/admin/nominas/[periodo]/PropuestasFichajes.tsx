'use client'
import { useCallback, useEffect, useState } from 'react'

type Propuesta = {
  clave: string; tipo: 'horas_extra' | 'horas_extra_compensada' | 'ausencia' | 'retraso'; subtipo?: string; fecha: string
  horas?: number; dias?: number; minutos?: number; fichajeIds: string[]; concepto: string; incidencia: unknown | null; superaTope: boolean
}
type Datos = {
  empleadoId: string; periodo: string; nominaEstado: string; aplicadas: string[]
  resultado: {
    propuestas: Propuesta[]; avisos: string[]; horasExtraPagoMes: number; horasExtraCompensadasMes: number
    horasExtraAnio: number | null; topeAnual: number; superaTope: boolean | null; fichajesSinAprobar: number; fichajesAbiertos: number
  }
}

const ETIQUETA: Record<Propuesta['tipo'], string> = { horas_extra: 'Hora extra', horas_extra_compensada: 'Compensada con descanso', ausencia: 'Ausencia', retraso: 'Retraso (informativo)' }
const dd = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

export default function PropuestasFichajes({ nominaId, onCambio }: { nominaId: string; onCambio: () => void | Promise<void> }) {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [ocupado, setOcupado] = useState(false)
  const base = `/api/admin/nominas/${nominaId}`

  const cargar = useCallback(async () => {
    setError('')
    const r = await fetch(`${base}/propuestas-fichajes`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setD(null); setError(j.error ?? 'No se pudieron cargar las propuestas'); return }
    setD(j); setSel(new Set())
  }, [base])
  useEffect(() => { cargar() }, [cargar])

  async function aprobarFichajes() {
    setOcupado(true)
    const r = await fetch(`${base}/aprobar-fichajes`, { method: 'POST' })
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? 'Error')
    await cargar(); setOcupado(false)
  }
  async function anadir() {
    setOcupado(true); setError('')
    const r = await fetch(`${base}/propuestas-fichajes`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claves: [...sel] }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setError(j.error ?? 'Error')
    else if (j.rechazadas?.length) setError(j.rechazadas.map((x: { motivo: string }) => x.motivo).join(' · '))
    await onCambio(); await cargar(); setOcupado(false)
  }

  if (error && !d) return <p className="mt-3 text-sm text-ink-3">Fichajes: {error}</p>
  if (!d) return <p className="mt-3 text-sm text-ink-3">Cargando propuestas desde fichajes…</p>

  const r = d.resultado
  const enlace = `/admin/fichajes?mes=${d.periodo}&empleado_id=${d.empleadoId}`
  const editable = d.nominaEstado === 'borrador'

  return (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="text-sm font-medium">Propuestas desde fichajes <span className="font-normal text-ink-3">(nada entra en la nómina hasta que lo apruebes)</span></h3>
      <p className="mt-1 text-xs text-ink-3">
        Horas extra a pago del mes: {r.horasExtraPagoMes} h
        {r.horasExtraCompensadasMes > 0 ? ` · compensadas con descanso: ${r.horasExtraCompensadasMes} h` : ''}
        {' · '}acumulado anual: {r.horasExtraAnio === null ? 'sin comprobar' : `${r.horasExtraAnio} h`} de {r.topeAnual} h (art. 35.2 ET)
        {' · '}<a className="underline" href={enlace}>Ver fichajes de origen</a>
      </p>
      {r.superaTope && <p className="mt-2 text-sm text-alert">Se supera el tope anual de {r.topeAnual} h extra: lo que exceda no se puede aprobar desde aquí.</p>}
      {r.avisos.map((a, i) => <p key={i} className="mt-1 text-xs text-ink-3">⚠ {a}</p>)}
      {error && <p className="mt-1 text-sm text-alert">{error}</p>}

      {r.fichajesSinAprobar > 0 && editable && (
        <button className="mt-2 text-sm" onClick={aprobarFichajes} disabled={ocupado}>
          Aprobar los {r.fichajesSinAprobar} fichaje(s) cerrados del mes
        </button>
      )}

      {r.propuestas.length === 0 ? <p className="mt-2 text-sm text-ink-3">Sin propuestas para este mes.</p> : (
        <ul className="mt-2 list-none p-0 grid gap-1" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {r.propuestas.map(p => {
            const aplicada = d.aplicadas.includes(p.clave)
            const aprobable = editable && !aplicada && p.incidencia !== null && !p.superaTope
            return (
              <li key={p.clave} className="flex flex-wrap items-center gap-2 text-sm py-1">
                {aprobable
                  ? <input type="checkbox" className="h-5 w-5" aria-label={`Aprobar ${p.concepto}`} checked={sel.has(p.clave)}
                      onChange={e => setSel(prev => { const n = new Set(prev); if (e.target.checked) n.add(p.clave); else n.delete(p.clave); return n })} />
                  : <span className="w-5" aria-hidden />}
                <span className="min-w-0 flex-1">
                  {dd(p.fecha)} · {ETIQUETA[p.tipo]}{p.subtipo ? ` ${p.subtipo}` : ''}
                  {p.horas != null ? ` · ${p.horas} h` : ''}{p.dias != null ? ` · ${p.dias} día` : ''}{p.tipo === 'retraso' ? ` · ${p.minutos} min` : ''}
                  {p.fichajeIds.length > 0 && <> · <a className="underline" href={`${enlace}#${p.fichajeIds[0]}`}>{p.fichajeIds.length} fichaje(s)</a></>}
                </span>
                {aplicada && <span className="text-ok text-xs">✔ ya añadida</span>}
                {p.superaTope && <span className="text-alert text-xs">supera el tope</span>}
              </li>
            )
          })}
        </ul>
      )}
      {editable && sel.size > 0 && <button className="mt-2 text-sm" onClick={anadir} disabled={ocupado}>Añadir {sel.size} seleccionada(s) a la nómina</button>}
    </div>
  )
}
