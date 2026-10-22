'use client'
// Paso OPCIONAL tras subir un documento cuyo TOMADOR es una empresa (22/10/2026).
//
// «Esta póliza está a nombre de X. ¿Es de tu empresa?» Sí / No y, si Sí, «¿Qué eres en X?».
// 🚨 Proponer no es guardar: «No» o «Ahora no» NO escriben nada (la columna `titular_tipo` sigue a
// NULL = «no consta»). Solo «Sí» guarda, por el PATCH (`leerTitularParche`), `titular_tipo='empresa'`,
// el nombre, el CIF leído (si pasa el dígito de control) y el rol (opcional).
// 🔒 Es una declaración: no da acceso a la ficha de esa empresa ni la da de alta (se dice).
import { useId, useState } from 'react'

import { ETIQUETA_ROL, ROLES_EN_EMPRESA, type RolEnEmpresa } from '@/lib/titular-propuesto'

type Props = {
  polizaId: string
  nombre: string
  cif: string | null
  onCerrar: () => void
  onGuardado: () => void
}

export function PasoTitularEmpresa({ polizaId, nombre, cif, onCerrar, onGuardado }: Props) {
  const uid = useId()
  const [fase, setFase] = useState<'pregunta' | 'rol' | 'hecho'>('pregunta')
  const [rol, setRol] = useState<RolEnEmpresa | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(conRol: RolEnEmpresa | null) {
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch(`/api/polizas/${polizaId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titularEmpresa: { nombre, cif, rol: conRol } }),
      })
      if (!r.ok) {
        setError(
          r.status === 401
            ? 'Se ha cerrado tu sesión: vuelve a entrar para guardarlo.'
            : 'No hemos podido guardarlo. Inténtalo otra vez en un momento.',
        )
        return
      }
      setFase('hecho')
      onGuardado()
    } catch {
      setError('No hemos podido guardarlo: revisa tu conexión e inténtalo otra vez.')
    } finally {
      setGuardando(false)
    }
  }

  if (fase === 'hecho') {
    return (
      <div className="pendiente" style={{ marginTop: 12, fontSize: 14 }} role="status">
        <strong>Apuntado:</strong> esta póliza es de {nombre}. Lo guardamos como una nota tuya; no damos de alta a
        la empresa ni te da acceso a sus seguros.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <p style={{ fontSize: 14, margin: 0 }}>
        <strong>
          Esta póliza está a nombre de {nombre}
          {cif ? ` (${cif})` : ''}. ¿Es de tu empresa?
        </strong>{' '}
        Es opcional.
      </p>
      {fase === 'pregunta' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="boton" onClick={() => setFase('rol')} style={{ minHeight: 44 }}>
            Sí, es de mi empresa
          </button>
          {/* «No» no escribe nada: no afirma que sea suya, solo que no es de su empresa. */}
          <button type="button" className="boton secundario" onClick={onCerrar} style={{ minHeight: 44 }}>
            No
          </button>
        </div>
      ) : (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <legend style={{ fontSize: 14, marginBottom: 4 }}>¿Qué eres en {nombre}?</legend>
          {ROLES_EN_EMPRESA.map((r) => (
            <label key={r} htmlFor={`${uid}-${r}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
              <input
                id={`${uid}-${r}`}
                type="radio"
                name={`${uid}-rol`}
                checked={rol === r}
                onChange={() => setRol(r)}
                disabled={guardando}
              />
              {ETIQUETA_ROL[r]}
            </label>
          ))}
          {error && <p className="editor-error" role="alert">{error}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="boton" onClick={() => guardar(rol)} disabled={guardando || rol === null} style={{ minHeight: 44 }}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="boton secundario" onClick={() => guardar(null)} disabled={guardando} style={{ minHeight: 44 }}>
              Prefiero no decirlo
            </button>
            <button type="button" className="boton-tenue" onClick={onCerrar} disabled={guardando} style={{ minHeight: 44 }}>
              Ahora no
            </button>
          </div>
        </fieldset>
      )}
      <p className="suave" style={{ fontSize: 13, margin: 0 }}>
        Decirlo aquí no da de alta a la empresa ni te da acceso a sus seguros.
      </p>
    </div>
  )
}
