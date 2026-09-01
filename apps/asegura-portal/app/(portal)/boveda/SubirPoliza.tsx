'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'

type DatosLeidos = {
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  fechaVencimiento: string | null
}
type Resultado = { datos: DatosLeidos; fuente: 'texto' | 'vision' | 'none' }

export function SubirPoliza() {
  const router = useRouter()
  const [estado, setEstado] = useState<'reposo' | 'subiendo' | 'listo' | 'error'>('reposo')
  const [resultado, setResultado] = useState<Resultado | null>(null)

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo fichero tras un error
    if (!f) return
    setEstado('subiendo')
    setResultado(null)
    const body = new FormData()
    body.append('documento', f)
    try {
      const r = await fetch('/api/polizas', { method: 'POST', body })
      if (!r.ok) return setEstado('error')
      setResultado((await r.json()) as Resultado)
      setEstado('listo')
      // Refresca la lista de arriba SIN desmontarla ni tapar la pantalla con un
      // loader (regla de rendimiento de UI del monorepo).
      router.refresh()
    } catch {
      setEstado('error')
    }
  }

  return (
    <section
      style={{
        border: '1px solid var(--borde)',
        borderRadius: 8,
        padding: 16,
        marginTop: 16,
      }}
    >
      <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>Añade una póliza</h2>
      <p style={{ color: '#4b5563', fontSize: 14 }}>
        Sube el PDF o una foto. Da igual que no sea nuestra: la leemos y te avisamos antes de que venza.
      </p>

      <label className="boton-subir" aria-disabled={estado === 'subiendo'}>
        {estado === 'subiendo' ? 'Leyendo el documento…' : 'Elegir PDF o foto'}
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={subir}
          disabled={estado === 'subiendo'}
        />
      </label>

      {estado === 'error' && (
        <p style={{ color: '#b91c1c', marginTop: 12 }}>No hemos podido subirla. Inténtalo otra vez.</p>
      )}

      {estado === 'listo' && resultado && (
        <div style={{ marginTop: 12 }}>
          {resultado.fuente === 'none' ? (
            // NO decimos «no tiene esos datos»: decimos que no hemos podido
            // leerlos. Es la diferencia entre un dato ausente y uno no mirado.
            <p style={{ fontSize: 14 }}>
              <strong>No hemos podido leer el documento.</strong> La póliza está guardada; complétala a mano
              cuando quieras.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 14 }}>
                Guardada. <strong>Estos datos los hemos leído nosotros del documento</strong> — revísalos y
                confírmalos.
              </p>
              {/* Nada de volcar el JSON crudo: la prima se pinta con `eur()`
                  (formato español, regla global) y un campo que la IA no supo
                  leer dice «no lo hemos encontrado», no un hueco ni un 0. */}
              <dl className="datos-leidos">
                <dt>Compañía</dt>
                <dd>{resultado.datos.compania ?? NO_LEIDO}</dd>
                <dt>Nº de póliza</dt>
                <dd>{resultado.datos.numeroPoliza ?? NO_LEIDO}</dd>
                <dt>Ramo</dt>
                <dd>{resultado.datos.ramo ?? NO_LEIDO}</dd>
                <dt>Prima anual</dt>
                <dd>{resultado.datos.primaAnual == null ? NO_LEIDO : eur(resultado.datos.primaAnual)}</dd>
                <dt>Vencimiento</dt>
                <dd>{resultado.datos.fechaVencimiento ?? NO_LEIDO}</dd>
              </dl>
            </>
          )}
        </div>
      )}
    </section>
  )
}

const NO_LEIDO = <span style={{ color: '#6b7280' }}>No lo hemos encontrado en el documento</span>
