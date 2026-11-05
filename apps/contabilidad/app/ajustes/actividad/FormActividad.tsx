'use client'
import { useState } from 'react'
import { sugerenciaPorCnae } from '@central/module-contabilidad'

type Plantilla = { sector: string; nombre: string; descripcion: string }
type Actividad = { cnae: string; nombre: string; sector: string }

const MOTIVO: Record<string, string> = {
  cnae_conocido: 'Para esta actividad sugerimos la plantilla',
  cnae_sin_plantilla: 'Esta actividad no tiene plantilla propia; sugerimos la',
  cnae_invalido: 'Ese CNAE no es válido (son 4 dígitos). Sugerimos la',
  sin_cnae: 'Sin CNAE, la plantilla es la',
}

/** Actividad de la empresa: la app SUGIERE la plantilla por el CNAE; tú la confirmas o eliges otra. Cambiarla afecta solo a lo que se asiente después. */
export function FormActividad({ cnaeInicial, sectorInicial, plantillas, actividades, puedeEditar }: { cnaeInicial: string | null; sectorInicial: string; plantillas: Plantilla[]; actividades: Actividad[]; puedeEditar: boolean }) {
  const [cnae, setCnae] = useState(cnaeInicial ?? '')
  const [sector, setSector] = useState(sectorInicial)
  const [otra, setOtra] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const nombre = (s: string) => plantillas.find((p) => p.sector === s)?.nombre ?? s
  const sug = sugerenciaPorCnae(cnae)
  const difiere = sug.sector !== sector

  async function enviar(cuerpo: Record<string, unknown>, exito: (j: { anadidas?: string[] }) => string) {
    setEnviando(true); setMsg(null)
    const r = await fetch('/api/actividad', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const j = (await r.json().catch(() => ({}))) as { errores?: string[]; error?: string; anadidas?: string[] }
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: (j.errores ?? [j.error ?? 'No se pudo guardar']).join(' · ') }); return }
    setMsg({ ok: true, texto: exito(j) })
    setTimeout(() => window.location.reload(), 900)
  }

  return (
    <div className="formulario">
      <fieldset>
        <legend>Actividad principal</legend>
        <datalist id="cnaes">{actividades.map((a) => <option key={a.cnae} value={a.cnae}>{a.nombre}</option>)}</datalist>
        <label className="campo">CNAE principal (4 dígitos)
          <input list="cnaes" inputMode="numeric" value={cnae} onChange={(e) => setCnae(e.target.value)} placeholder="p. ej. 4520" disabled={!puedeEditar} maxLength={8} />
        </label>
        <p className="tenue" role="status">
          {MOTIVO[sug.motivo]} <strong>{nombre(sug.sector)}</strong>{sug.actividad ? ` (${sug.actividad})` : ''}.
        </p>
        <label className="campo">Plantilla de cuentas y reglas
          <select value={sector} onChange={(e) => setSector(e.target.value)} disabled={!puedeEditar}>
            {plantillas.map((p) => <option key={p.sector} value={p.sector}>{p.nombre}{p.sector === sug.sector ? ' (sugerida)' : ''}</option>)}
          </select>
        </label>
        <p className="tenue">{plantillas.find((p) => p.sector === sector)?.descripcion}</p>
        {difiere && <p className="tenue">Has elegido una plantilla distinta de la sugerida: es válido, la decisión es tuya.</p>}
        {puedeEditar
          ? <p><button type="button" className="btn" disabled={enviando} onClick={() => void enviar({ accion: 'guardar', cnae, sector }, () => 'Actividad guardada. La plantilla se aplica a lo que se asiente a partir de ahora; los asientos ya hechos no cambian.')}>Confirmar actividad y plantilla</button></p>
          : <p className="tenue">Solo el dueño o el gestor de la empresa pueden cambiarla.</p>}
      </fieldset>
      <fieldset>
        <legend>Añadir cuentas de otra plantilla</legend>
        <p className="tenue">Si además haces otra actividad (p. ej. un taller que también alquila material), añade las cuentas propias de esa plantilla. Solo se añaden las que faltan; no se quita ni se cambia ninguna cuenta ni regla.</p>
        <label className="campo">Plantilla
          <select value={otra} onChange={(e) => setOtra(e.target.value)} disabled={!puedeEditar}>
            <option value="">— elige —</option>
            {plantillas.filter((p) => p.sector !== sector).map((p) => <option key={p.sector} value={p.sector}>{p.nombre}</option>)}
          </select>
        </label>
        {puedeEditar && <p><button type="button" className="btn btn-sec" disabled={enviando || !otra} onClick={() => void enviar({ accion: 'anadir_cuentas', sector: otra }, (j) => (j.anadidas?.length ? `Se añadieron ${j.anadidas.length} cuentas: ${j.anadidas.join(', ')}.` : 'Tu plan ya tenía todas esas cuentas.'))}>Añadir cuentas</button></p>}
      </fieldset>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.texto}</p>}
    </div>
  )
}
