'use client'
import { useMemo, useState } from 'react'
import { explicarNomina } from '@/lib/nomina-explicacion'
import type { NominaDesglose } from '@central/module-nominas'

/** Cómo se ha calculado la nómina: cada línea es desplegable con su explicación. ≥44 px de alto, usable a 320 px. */
export default function NominaExplicada({ datos }: { datos: unknown }) {
  const [abierto, setAbierto] = useState(false)
  const e = useMemo(() => (abierto ? explicarNomina(datos as Partial<NominaDesglose> | null) : null), [abierto, datos])
  return (
    <div className="mt-2">
      <button type="button" className="min-h-[44px] text-sm" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}>
        {abierto ? 'Ocultar cálculo' : 'Cómo se ha calculado'}
      </button>
      {e && (
        <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {e.avisos.map((a, i) => <p key={i} className="rounded border border-line p-2 text-sm text-alert">{a}</p>)}
          {e.lineas.map(l => (
            <details key={l.id} className="rounded border border-line bg-card">
              <summary className="flex min-h-[44px] cursor-pointer flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-sm">
                <span className="min-w-0 break-words">{l.titulo}{l.avisos.length > 0 && <span className="text-alert"> ⚠</span>}</span>
                <strong>{l.importe}</strong>
              </summary>
              <div className="border-t border-line px-3 py-2 text-sm">
                <p className="m-0 break-words">{l.explicacion}</p>
                {l.avisos.map((a, i) => <p key={i} className="mt-1 mb-0 break-words text-alert">{a}</p>)}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
