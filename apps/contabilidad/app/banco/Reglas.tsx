'use client'
import { useState } from 'react'

type Regla = { id: string; patron: string; cuenta: string; sentido: 'cargo' | 'abono' | 'ambos' }

/** Reglas por concepto: «si el concepto contiene X, propón la cuenta Y». Solo proponen; la persona confirma cada movimiento. */
export function ReglasConciliacion({ reglas, cuentas }: { reglas: Regla[]; cuentas: { codigo: string; nombre: string }[] }) {
  const [patron, setPatron] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [sentido, setSentido] = useState('cargo')
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  async function enviar(cuerpo: Record<string, unknown>) {
    setMsg(null)
    const r = await fetch('/api/banco/reglas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const j = (await r.json().catch(() => ({}))) as { errores?: string[]; error?: string }
    if (!r.ok) { setMsg({ ok: false, texto: (j.errores ?? [j.error ?? 'No se pudo guardar']).join(' · ') }); return }
    window.location.reload()
  }

  return (
    <div>
      {reglas.length === 0 ? <p className="tenue">Sin reglas todavía.</p> : (
        <ul className="lista-simple">
          {reglas.map((r) => (
            <li key={r.id}>
              <span>«{r.patron}» → {r.cuenta} <span className="tenue">({r.sentido === 'cargo' ? 'cargos' : r.sentido === 'abono' ? 'abonos' : 'cargos y abonos'})</span></span>
              <button type="button" className="btn btn-sec" onClick={() => void enviar({ accion: 'desactivar', id: r.id })}>Desactivar</button>
            </li>
          ))}
        </ul>
      )}
      <datalist id="cuentas-regla">{cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</datalist>
      <form className="fila" onSubmit={(e) => { e.preventDefault(); void enviar({ accion: 'crear', patron, cuenta, sentido }) }}>
        <input aria-label="Texto a buscar en el concepto" placeholder="Texto del concepto (p. ej. comisión)" value={patron} onChange={(e) => setPatron(e.target.value)} maxLength={80} />
        <input aria-label="Cuenta" list="cuentas-regla" inputMode="numeric" placeholder="Cuenta (p. ej. 626)" value={cuenta} onChange={(e) => setCuenta(e.target.value)} />
        <select aria-label="Sentido" value={sentido} onChange={(e) => setSentido(e.target.value)}>
          <option value="cargo">Cargos</option><option value="abono">Abonos</option><option value="ambos">Ambos</option>
        </select>
        <button type="submit" className="btn">Añadir regla</button>
      </form>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.texto}</p>}
    </div>
  )
}
