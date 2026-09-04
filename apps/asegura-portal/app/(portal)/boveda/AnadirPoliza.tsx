'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  CamposPoliza,
  FORMULARIO_VACIO,
  MENSAJE_400,
  MENSAJE_PRIMA_CERO,
  campoDelError,
  primaDesdeTexto,
  type Campo,
  type Errores,
  type Formulario,
  type RamoOpcion,
} from './CamposPoliza'

/**
 * Alta A MANO de una póliza, sin documento: para quien la tiene en papel o no
 * tiene el PDF a mano (lo pidió Alberto probándolo en el móvil, 03/09/2026).
 * Los campos y sus reglas son los de `CamposPoliza`, los mismos que al corregir.
 *
 * Manda al `POST /api/polizas` un JSON con los cinco campos; el backend exige
 * al menos compañía o número, y aquí se comprueba ANTES de mandar nada, con la
 * misma frase, para que la persona no espere una ida y vuelta para enterarse.
 */

export type PolizaGuardada = {
  id: string
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  fechaVencimiento: string | null
}

const SIN_IDENTIFICACION =
  'Necesitamos al menos la compañía o el número de póliza para saber de qué seguro hablas.'

export function AnadirPoliza({
  ramos,
  onCancelar,
  onGuardada,
}: {
  ramos: readonly RamoOpcion[]
  onCancelar: () => void
  onGuardada: (poliza: PolizaGuardada) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<Formulario>(FORMULARIO_VACIO)
  // Los campos del ramo se guardan aunque se cambie de tipo de seguro y luego
  // se vuelva: lo que sobra lo descarta `normalizarDatosRamo` en el servidor
  // contra el catálogo del ramo final. Borrarlos aquí al cambiar el select
  // castigaría al que se equivoca de opción y rectifica.
  const [datosRamo, setDatosRamo] = useState<Record<string, string>>({})
  const [erroresRamo, setErroresRamo] = useState<Record<string, string | undefined>>({})
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  function escribir(campo: Campo, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
    setErrores((e) => ({ ...e, [campo]: undefined }))
    setErrorGeneral(null)
  }

  function escribirRamo(id: string, valor: string) {
    setDatosRamo((d) => ({ ...d, [id]: valor }))
    setErroresRamo((e) => ({ ...e, [id]: undefined }))
    setErrorGeneral(null)
  }

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrores({})
    setErrorGeneral(null)

    const prima = primaDesdeTexto(form.primaAnual)
    if (prima === 'invalida' || prima === 'cero') {
      setErrores({ primaAnual: prima === 'cero' ? MENSAJE_PRIMA_CERO : MENSAJE_400.primaAnual })
      return
    }

    const compania = form.compania.trim() || null
    const numeroPoliza = form.numeroPoliza.trim() || null
    if (compania === null && numeroPoliza === null) {
      setErrorGeneral(SIN_IDENTIFICACION)
      return
    }

    setGuardando(true)
    try {
      const r = await fetch('/api/polizas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          compania,
          numeroPoliza,
          ramo: form.ramo || null,
          primaAnual: prima,
          fechaVencimiento: form.fechaVencimiento || null,
          // Los tres del vehículo se mandan SIEMPRE, aunque el bloque no esté
          // desplegado: si el ramo elegido no los pinta van vacíos y viajan como
          // `null`, que es exactamente lo que hay que guardar. Mandarlos solo
          // cuando el bloque está visible haría que el cuerpo dependiera de un
          // estado de pantalla, y ese es el tipo de acoplamiento que luego
          // pierde datos al cambiar de ramo y volver.
          matricula: form.matricula.trim() || null,
          bastidor: form.bastidor.trim() || null,
          fechaMatriculacion: form.fechaMatriculacion || null,
          // Los del ramo van tal cual se teclearon: quien decide qué es un dato
          // es el catálogo, en el servidor, y no esta pantalla. Aquí solo se
          // quitan los vacíos, que son «no lo sé» y no tienen que viajar.
          datosRamo: Object.fromEntries(Object.entries(datosRamo).filter(([, v]) => v.trim() !== '')),
        }),
      })

      if (r.ok) {
        const cuerpo = (await r.json()) as { id: string; datos: Omit<PolizaGuardada, 'id'> }
        onGuardada({ id: cuerpo.id, ...cuerpo.datos })
        // Refresca la lista de arriba SIN desmontarla ni tapar la pantalla con
        // un loader (regla de rendimiento de UI del monorepo).
        router.refresh()
        return
      }

      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown } | null
      const codigo = typeof cuerpo?.error === 'string' ? cuerpo.error : ''
      setGuardando(false)

      if (r.status === 400) {
        if (codigo === 'sin_identificacion') return setErrorGeneral(SIN_IDENTIFICACION)
        const campo = campoDelError(codigo)
        if (campo) setErrores((e) => ({ ...e, [campo]: MENSAJE_400[campo] }))
        else
          setErrorGeneral(
            `No hemos podido guardarla: hay un dato que no nos vale${codigo ? ` (${codigo})` : ''}. Revísalo y vuelve a intentarlo.`,
          )
        return
      }
      if (r.status === 401) {
        return setErrorGeneral('Se ha cerrado tu sesión. Vuelve a entrar con tu email y la guardamos.')
      }
      setErrorGeneral('No hemos podido guardarla. Inténtalo otra vez dentro de un momento.')
    } catch {
      setGuardando(false)
      setErrorGeneral('No hemos podido guardarla: comprueba tu conexión e inténtalo otra vez.')
    }
  }

  return (
    <form className="editor-form" onSubmit={guardar} noValidate aria-label="Añadir una póliza a mano">
      <CamposPoliza
        idPrefix="alta"
        ramos={ramos}
        form={form}
        errores={errores}
        escribir={escribir}
        disabled={guardando}
        ayudaPrima="Lo que pagas al año. Si no lo sabes, déjalo en blanco."
        datosRamo={datosRamo}
        escribirRamo={escribirRamo}
        erroresRamo={erroresRamo}
      />

      {errorGeneral && (
        <p className="editor-error" role="alert">
          {errorGeneral}
        </p>
      )}

      <div className="editor-acciones">
        <button type="submit" className="boton" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar la póliza'}
        </button>
        <button type="button" className="boton secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
