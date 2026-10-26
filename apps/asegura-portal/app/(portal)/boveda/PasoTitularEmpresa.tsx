'use client'
// Paso OPCIONAL tras subir un documento cuyo TOMADOR es una empresa (22/10/2026).
//
// «Esta póliza está a nombre de X. ¿De quién es?» Tres opciones: «Es mía» (PATCH `titularTipo:'propio'`),
// «Es de una empresa que gestiono» (→ «¿Qué eres en X?» y PATCH `titularEmpresa`) y «No lo sé».
// 🚨 Proponer no es guardar: «No lo sé» o «Ahora no» NO escriben nada (la columna `titular_tipo` sigue a
// NULL = «no consta»). La opción llega PRESELECCIONADA (`preseleccionTitular`: empresa leída → empresa),
// pero hay que confirmarla con el botón. «Empresa» guarda `titular_tipo='empresa'`, el nombre, el CIF
// leído (si pasa el dígito de control) y el rol (opcional).
// 🔒 Es una declaración: no da acceso a la ficha de esa empresa ni la da de alta (se dice).
import { useId, useState } from 'react'

import { ETIQUETA_ROL, ROLES_EN_EMPRESA, type RespuestaTitular, type RolEnEmpresa } from '@/lib/titular-propuesto'

type Props = {
  polizaId: string
  nombre: string
  cif: string | null
  /** Opción marcada de entrada (`preseleccionTitular`); `null` = el cliente elige. */
  preseleccion?: RespuestaTitular | null
  onCerrar: () => void
  onGuardado: () => void
}

const OPCIONES: readonly { valor: RespuestaTitular; texto: string }[] = [
  { valor: 'propio', texto: 'Es mía' },
  { valor: 'empresa', texto: 'Es de una empresa que gestiono' },
  { valor: 'no_se', texto: 'No lo sé' },
]

export function PasoTitularEmpresa({ polizaId, nombre, cif, preseleccion = null, onCerrar, onGuardado }: Props) {
  const uid = useId()
  const [fase, setFase] = useState<'pregunta' | 'rol' | 'hecho'>('pregunta')
  const [eleccion, setEleccion] = useState<RespuestaTitular | null>(preseleccion)
  const [dijoPropio, setDijoPropio] = useState(false)
  const [rol, setRol] = useState<RolEnEmpresa | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(conRol: RolEnEmpresa | null, propio = false) {
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch(`/api/polizas/${polizaId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(propio ? { titularTipo: 'propio' } : { titularEmpresa: { nombre, cif, rol: conRol } }),
      })
      if (!r.ok) {
        setError(
          r.status === 401
            ? 'Se ha cerrado tu sesión: vuelve a entrar para guardarlo.'
            : 'No hemos podido guardarlo. Inténtalo otra vez en un momento.',
        )
        return
      }
      setDijoPropio(propio)
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
        {dijoPropio ? (
          <>
            <strong>Apuntado:</strong> esta póliza es tuya.
          </>
        ) : (
          <>
            <strong>Apuntado:</strong> esta póliza es de {nombre}. Lo guardamos como una nota tuya; no damos de alta a
            la empresa ni te da acceso a sus seguros.
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <p style={{ fontSize: 14, margin: 0 }}>
        <strong>
          Esta póliza está a nombre de {nombre}
          {cif ? ` (${cif})` : ''}. ¿De quién es?
        </strong>{' '}
        Es opcional.
      </p>
      {fase === 'pregunta' ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 8 }}>
          <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            ¿De quién es esta póliza?
          </legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {OPCIONES.map((o) => (
              <label key={o.valor} className="de-quien-casilla">
                <input
                  type="radio"
                  name={`${uid}-titular`}
                  checked={eleccion === o.valor}
                  onChange={() => setEleccion(o.valor)}
                  disabled={guardando}
                />
                {o.texto}
              </label>
            ))}
          </div>
          {error && <p className="editor-error" role="alert">{error}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {/* «No lo sé» y «Ahora no» no escriben nada: la columna sigue a NULL. */}
            <button
              type="button"
              className="boton"
              disabled={guardando || eleccion === null}
              style={{ minHeight: 44 }}
              onClick={() => (eleccion === 'empresa' ? setFase('rol') : eleccion === 'propio' ? guardar(null, true) : onCerrar())}
            >
              {guardando ? 'Guardando…' : 'Continuar'}
            </button>
            <button type="button" className="boton-tenue" onClick={onCerrar} disabled={guardando} style={{ minHeight: 44 }}>
              Ahora no
            </button>
          </div>
        </fieldset>
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
          <div className="acciones">
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
