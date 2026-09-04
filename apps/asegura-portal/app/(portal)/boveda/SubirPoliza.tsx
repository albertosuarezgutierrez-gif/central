'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'

import { AnadirPoliza, type PolizaGuardada } from './AnadirPoliza'
import type { RamoOpcion } from './CamposPoliza'

type DatosLeidos = {
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  fechaVencimiento: string | null
}
type Resultado = { datos: DatosLeidos; fuente: 'texto' | 'vision' | 'none' }

/**
 * La entrada a la bóveda de aportadas: dos caminos para la misma fila.
 *
 *  - Subir el PDF o una foto: lo lee la IA y lo que salga se enseña como
 *    «leído por nosotros», para que la persona lo revise.
 *  - Añadirla A MANO (`AnadirPoliza`): para quien la tiene en papel o no
 *    tiene el documento. Lo que teclea es lo que se guarda.
 *
 * Lo que NO hace ninguno de los dos, y el texto no debe insinuar: meter la
 * póliza en la cartera de la correduría, ni verificarla nadie. Es el apunte de
 * la persona; con la fecha de vencimiento se le puede avisar antes de que venza.
 */
export function SubirPoliza({ ramos }: { ramos: readonly RamoOpcion[] }) {
  const router = useRouter()
  const [estado, setEstado] = useState<'reposo' | 'subiendo' | 'listo' | 'error'>('reposo')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [manual, setManual] = useState(false)
  const [guardadaAMano, setGuardadaAMano] = useState<PolizaGuardada | null>(null)

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo fichero tras un error
    if (!f) return
    setEstado('subiendo')
    setResultado(null)
    setGuardadaAMano(null)
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

  function abrirManual() {
    // El formulario se monta SOLO al pedirlo: en reposo la sección son dos botones.
    setResultado(null)
    setEstado('reposo')
    setGuardadaAMano(null)
    setManual(true)
  }

  function guardadaManual(p: PolizaGuardada) {
    setGuardadaAMano(p)
    setManual(false)
  }

  const subiendo = estado === 'subiendo'
  const etiquetaRamo = (valor: string | null) =>
    valor === null ? null : (ramos.find((r) => r.valor === valor)?.etiqueta ?? valor)

  return (
    <section className="seccion" aria-labelledby="alta-titulo">
      <h2 id="alta-titulo">Añade una póliza</h2>
      <p className="suave" style={{ fontSize: 14, marginTop: 0 }}>
        Sube el PDF o una foto, o añádela a mano si no tienes el documento. Da igual que no sea nuestra:
        la guardamos en tu bóveda y, si nos dices cuándo vence, podemos avisarte antes. Es tu apunte: no la
        contratamos ni la gestionamos por ti.
      </p>

      {!manual && (
        <div className="alta-acciones">
          <label className="boton-subir" aria-disabled={subiendo}>
            {subiendo ? 'Leyendo el documento…' : 'Elegir PDF o foto'}
            <input type="file" accept="application/pdf,image/*" onChange={subir} disabled={subiendo} />
          </label>
          <button type="button" className="boton secundario" onClick={abrirManual} disabled={subiendo}>
            Añadirla a mano
          </button>
        </div>
      )}

      {manual && <AnadirPoliza ramos={ramos} onCancelar={() => setManual(false)} onGuardada={guardadaManual} />}

      {estado === 'error' && (
        <p className="editor-error" role="alert" style={{ marginTop: 12 }}>
          No hemos podido subirla. Inténtalo otra vez, o añádela a mano.
        </p>
      )}

      {guardadaAMano && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14 }}>
            <strong>Guardada.</strong> Ya está en tu lista de arriba; puedes corregirla cuando quieras.
          </p>
          {/* Lo que acaba de escribir la persona, tal cual se ha guardado: un
              hueco es «no lo has puesto», no un 0 ni un cajón. */}
          <dl className="datos-leidos">
            <dt>Compañía</dt>
            <dd>{guardadaAMano.compania ?? NO_PUESTO}</dd>
            <dt>Nº de póliza</dt>
            <dd>{guardadaAMano.numeroPoliza ?? NO_PUESTO}</dd>
            <dt>Ramo</dt>
            <dd>{etiquetaRamo(guardadaAMano.ramo) ?? NO_PUESTO}</dd>
            <dt>Prima anual</dt>
            <dd>{guardadaAMano.primaAnual == null ? NO_PUESTO : eur(guardadaAMano.primaAnual)}</dd>
            <dt>Vencimiento</dt>
            <dd>
              {guardadaAMano.fechaVencimiento
                ? fechaEs(new Date(`${guardadaAMano.fechaVencimiento}T00:00:00Z`))
                : NO_PUESTO}
            </dd>
          </dl>
        </div>
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
                <dd>{etiquetaRamo(resultado.datos.ramo) ?? NO_LEIDO}</dd>
                <dt>Prima anual</dt>
                <dd>{resultado.datos.primaAnual == null ? NO_LEIDO : eur(resultado.datos.primaAnual)}</dd>
                <dt>Vencimiento</dt>
                <dd>
                  {resultado.datos.fechaVencimiento
                    ? fechaEs(new Date(`${resultado.datos.fechaVencimiento}T00:00:00Z`))
                    : NO_LEIDO}
                </dd>
              </dl>
            </>
          )}
        </div>
      )}
    </section>
  )
}

const NO_LEIDO = <span className="tenue">No lo hemos encontrado en el documento</span>
const NO_PUESTO = <span className="tenue">No lo has puesto</span>
