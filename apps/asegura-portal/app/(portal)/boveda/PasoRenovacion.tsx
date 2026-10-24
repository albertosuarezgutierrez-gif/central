'use client'
// Paso OPCIONAL tras subir un documento DESFASADO (`lib/documento-desfasado.ts`): vencimiento leído
// ya pasado o prima sin leer (22/10/2026).
//
// 🚨 NO se pregunta «¿sigue vigente?» (Alberto, 22/10/2026: si la sube es porque la tiene). Se
// piden solo los dos datos que faltan para avisarle bien: prima de la última renovación y fecha en
// que renueva. Va por el PATCH de siempre (`confirmadaPorUsuario=true`, lo leído queda en
// `extraccionBruta`). NO se escribe `vigenteDeclarada`: suponerlo no es que el cliente lo diga.
// Se puede saltar sin consecuencias. «O sube el último recibo» reutiliza `EscanerDocumento`
// (archiva el recibo contra ESTA póliza declarada: `polizaFija=d:<id>`); NO el selector del alta, que crearía una póliza duplicada.
import { useId, useState } from 'react'

import type { MotivoDesfase } from '@/lib/documento-desfasado'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'
import { importeEs } from '@/lib/importe-es'

import { EscanerDocumento } from './EscanerDocumento'

type Props = {
  polizaId: string
  motivos: readonly MotivoDesfase[]
  onCerrar: () => void
  onGuardado: () => void
}

const ERROR_TEXTO: Record<string, string> = {
  prima_invalida: 'Esa cantidad no nos vale. Escríbela en euros, por ejemplo 320,50.',
  prima_negativa: 'La cantidad no puede ser negativa.',
}

export function PasoRenovacion({ polizaId, motivos, onCerrar, onGuardado }: Props) {
  const uid = useId()
  const [primaTxt, setPrimaTxt] = useState('')
  const [fecha, setFecha] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ prima: number | null; fecha: string | null } | null>(null)
  const [conRecibo, setConRecibo] = useState(false)

  const prima = importeEs(primaTxt)
  const primaMal = prima !== null && Number.isNaN(prima)
  const algoQueGuardar = (prima !== null && !primaMal) || fecha !== ''

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!algoQueGuardar || primaMal) return
    setGuardando(true)
    setError(null)
    // Solo viaja lo que ha escrito: un campo vacío es «no lo ha puesto», no un borrado.
    const cuerpo: Record<string, unknown> = {}
    if (prima !== null) cuerpo.primaAnual = prima
    if (fecha !== '') cuerpo.fechaVencimiento = fecha
    try {
      const r = await fetch(`/api/polizas/${polizaId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null
        setError(
          r.status === 401
            ? 'Se ha cerrado tu sesión: vuelve a entrar para guardarlo.'
            : (ERROR_TEXTO[j?.error ?? ''] ?? 'No hemos podido guardarlo. Revisa los datos e inténtalo otra vez.'),
        )
        return
      }
      const j = (await r.json()) as { primaAnual: number | null; fechaVencimiento: string | null }
      setHecho({ prima: j.primaAnual, fecha: j.fechaVencimiento })
      onGuardado()
    } catch {
      setError('No hemos podido guardarlo: revisa tu conexión e inténtalo otra vez.')
    } finally {
      setGuardando(false)
    }
  }

  if (hecho) {
    return (
      <div className="pendiente" style={{ marginTop: 12, fontSize: 14 }} role="status">
        <strong>Apuntado.</strong>{' '}
        {hecho.prima !== null && <>Última renovación: {eur(hecho.prima)}. </>}
        {hecho.fecha !== null && <>Renueva el {fechaEs(new Date(`${hecho.fecha}T00:00:00Z`))}.</>}
      </div>
    )
  }

  const vencida = motivos.includes('vencida')
  return (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
        <p style={{ fontSize: 14, margin: 0 }}>
          <strong>{vencida ? 'Este documento parece de una renovación anterior.' : 'En este documento no viene lo que pagas.'}</strong>{' '}
          Si nos dices estos dos datos, te avisamos a tiempo de la próxima renovación. Es opcional.
        </p>
        <div>
          <label htmlFor={`${uid}-prima`}>¿Cuánto pagaste en la última renovación?</label>
          <input
            id={`${uid}-prima`}
            className="campo"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej.: 320,50 €"
            value={primaTxt}
            onChange={(e) => setPrimaTxt(e.target.value)}
            aria-invalid={primaMal || undefined}
            disabled={guardando}
            style={{ minHeight: 44, width: '100%' }}
          />
          <p className="editor-ayuda">El total del año, aunque lo pagues a plazos.</p>
          {primaMal && <p className="editor-error" role="alert">{ERROR_TEXTO.prima_invalida}</p>}
        </div>
        <div>
          <label htmlFor={`${uid}-fecha`}>¿Cuándo renueva?</label>
          <input
            id={`${uid}-fecha`}
            className="campo"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={guardando}
            style={{ minHeight: 44, width: '100%' }}
          />
        </div>
        {error && <p className="editor-error" role="alert">{error}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" className="boton" disabled={guardando || !algoQueGuardar || primaMal} style={{ minHeight: 44 }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="boton secundario" onClick={onCerrar} disabled={guardando} style={{ minHeight: 44 }}>
            Ahora no
          </button>
        </div>
      </form>
      {/* Fuera del <form>: el escáner tiene sus propios botones y no debe enviar este. */}
      {conRecibo ? (
        <EscanerDocumento polizaFija={`d:${polizaId}`} />
      ) : (
        <p className="suave" style={{ fontSize: 14, margin: 0 }}>
          o{' '}
          <button
            type="button"
            className="boton-tenue"
            onClick={() => setConRecibo(true)}
            style={{ minHeight: 44 }}
          >
            sube el último recibo
          </button>
        </p>
      )}
    </div>
  )
}
