'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'

import type { DatosAceptados } from './BuscarInmueble'
import {
  CamposPoliza,
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
 * Corrección a mano de una póliza que ha subido el propio cliente.
 *
 * Los cinco campos, sus textos y sus reglas de pantalla (móvil primero, la
 * fecha destacada pero NO obligatoria, la prima a 0 que es un hueco) viven en
 * `CamposPoliza.tsx`, compartidos con el alta a mano (`AnadirPoliza.tsx`). Aquí
 * queda lo que es propio de CORREGIR: qué cambia respecto a lo guardado, y el
 * tono del hueco cuando la póliza vino de un documento.
 */

export type { RamoOpcion }

export type PolizaEditable = {
  id: string
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  /** `YYYY-MM-DD` o null: es lo que come `<input type="date">` y lo que espera el PATCH. */
  fechaVencimiento: string | null
  /**
   * Los tres del VEHÍCULO. Solo se pintan si el ramo los tiene detrás (lo
   * decide `CamposPoliza`), pero viajan siempre en el tipo: si dependieran del
   * ramo también aquí, cambiar «auto» por «hogar» y volver perdería lo tecleado.
   */
  matricula: string | null
  bastidor: string | null
  fechaMatriculacion: string | null
  /**
   * Los campos propios del RAMO, tal cual están guardados en la columna
   * `datos_ramo` (jsonb). `null` = no se ha declarado ninguno — que NO es lo
   * mismo que `{}`, y por eso la columna nunca guarda un objeto vacío.
   */
  datosRamo: Record<string, string | number | boolean> | null
  /**
   * La referencia catastral del INMUEBLE (20 caracteres). Es COLUMNA y no una
   * clave de `datos_ramo` porque identifica el BIEN y se consulta; la de 14 es
   * la de la FINCA y el servidor la rechaza aparte.
   */
  referenciaCatastral: string | null
  /**
   * De dónde salió CADA campo de `datos_ramo`: `catastro` | `documento` |
   * `declarado`. 76 m² que ha dicho el Catastro y 76 m² estimados a ojo no
   * valen lo mismo, y sin esto no se distinguen.
   */
  datosRamoOrigen: Record<string, string> | null
  /**
   * ¿Salió de un PDF o una foto que leyó la IA? Decide el TONO del hueco: si
   * hubo documento, un campo vacío es «no lo hemos encontrado en el documento»
   * (no se ha sabido leer), no «no existe». Mismo criterio que `NO_LEIDO` en
   * `SubirPoliza.tsx`.
   */
  deDocumento: boolean
}

type Valores = Omit<PolizaEditable, 'id' | 'deDocumento'>
type Estado = 'reposo' | 'guardando' | 'guardado' | 'error'

/**
 * Solo las claves que CAMBIAN. El contrato del PATCH es explícito: una clave
 * ausente no se toca y una clave con `null` BORRA el dato. Mandar los cinco
 * campos siempre convertiría «no he tocado esto» en «bórralo».
 */
type Cambios = {
  compania?: string | null
  numeroPoliza?: string | null
  ramo?: string | null
  primaAnual?: number | null
  fechaVencimiento?: string | null
  matricula?: string | null
  bastidor?: string | null
  fechaMatriculacion?: string | null
  /**
   * `datos_ramo` es UNA columna, así que no admite parche por claves: o se manda
   * el objeto entero o no se manda. Ausente = no se toca; `null` = vaciar la
   * columna. Los valores viajan como TEXTO tal cual se teclearon: quien decide
   * qué es un número, un booleano o basura es `normalizarDatosRamo()` en el
   * servidor, contra el catálogo del ramo — la misma regla que aplica la IA al
   * leer un PDF. Convertirlos aquí sería una segunda opinión sobre lo mismo.
   */
  datosRamo?: Record<string, string> | null
  referenciaCatastral?: string | null
  /**
   * Viajan SIEMPRE pegados a `datosRamo` y nunca solos: el servidor rechaza
   * unos orígenes sin los datos a los que se refieren (`origen_sin_datos`),
   * porque afirmar «esto lo dijo el Catastro» sobre un valor que no viene en
   * el parche es una afirmación que nadie puede comprobar.
   */
  datosRamoOrigen?: Record<string, string> | null
}

function aFormulario(v: Valores): Formulario {
  return {
    fechaVencimiento: v.fechaVencimiento ?? '',
    compania: v.compania ?? '',
    numeroPoliza: v.numeroPoliza ?? '',
    ramo: v.ramo ?? '',
    // En el input se teclea un número plano (320.5); el formato español
    // `320,50€` es para MOSTRAR, no para escribir.
    primaAnual: v.primaAnual == null ? '' : String(v.primaAnual),
    matricula: v.matricula ?? '',
    bastidor: v.bastidor ?? '',
    fechaMatriculacion: v.fechaMatriculacion ?? '',
  }
}

/**
 * Lo guardado en `datos_ramo` → lo que se teclea en la pantalla. Todo a texto
 * porque los `<input>` solo saben de texto; los booleanos vuelven a su
 * vocabulario de tri-estado (`si`/`no`), y una clave AUSENTE se queda ausente:
 * no se rellena con `''`, que en esta pantalla significaría «lo he borrado».
 */
function aFormularioRamo(datos: Valores['datosRamo']): Record<string, string> {
  if (!datos) return {}
  const salida: Record<string, string> = {}
  for (const [k, v] of Object.entries(datos)) {
    salida[k] = typeof v === 'boolean' ? (v ? 'si' : 'no') : String(v)
  }
  return salida
}

/** Lo tecleado, sin los vacíos: un campo en blanco es «no lo sé», y no viaja. */
function ramoDelFormulario(datos: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(datos).filter(([, v]) => v.trim() !== ''))
}

/**
 * ¿Ha cambiado ALGO de los campos del ramo? Se compara por claves ordenadas
 * para que reordenar el objeto no cuente como cambio; sin esto, cada guardado
 * mandaría un parche que no cambia nada.
 */
function mismoRamo(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k])
}

function calcularCambios(
  form: Formulario,
  base: Valores,
  prima: number | null,
  datosRamo: Record<string, string>,
  origenes: Record<string, string>,
  referenciaCatastral: string | null,
): Cambios {
  const c: Cambios = {}
  const compania = form.compania.trim() || null
  if (compania !== base.compania) c.compania = compania
  const numeroPoliza = form.numeroPoliza.trim() || null
  if (numeroPoliza !== base.numeroPoliza) c.numeroPoliza = numeroPoliza
  const ramo = form.ramo || null
  if (ramo !== base.ramo) c.ramo = ramo
  if (prima !== base.primaAnual) c.primaAnual = prima
  const fechaVencimiento = form.fechaVencimiento || null
  if (fechaVencimiento !== base.fechaVencimiento) c.fechaVencimiento = fechaVencimiento
  // Matrícula y bastidor se mandan en MAYÚSCULAS y sin espacios porque así es
  // como los normaliza el servidor: comparar el texto crudo contra lo guardado
  // marcaría como «cambio» un `1234 bcd` que ya está guardado como `1234BCD`,
  // y cada guardado mandaría un parche que no cambia nada.
  const matricula = form.matricula.trim().toUpperCase().replace(/[\s-]/g, '') || null
  if (matricula !== base.matricula) c.matricula = matricula
  const bastidor = form.bastidor.trim().toUpperCase().replace(/[\s-]/g, '') || null
  if (bastidor !== base.bastidor) c.bastidor = bastidor
  const fechaMatriculacion = form.fechaMatriculacion || null
  if (fechaMatriculacion !== base.fechaMatriculacion) c.fechaMatriculacion = fechaMatriculacion

  // Los del ramo: el objeto entero, y solo si difiere de lo guardado. Si al
  // quitar los vacíos no queda ninguna clave, se manda `null` (vaciar la
  // columna) y NO `{}`: un objeto vacío guardado sería un «no lo sé» disfrazado
  // de dato, que es justo lo que la columna tiene prohibido.
  const ramoNuevo = ramoDelFormulario(datosRamo)
  const ramoBase = aFormularioRamo(base.datosRamo)
  if (!mismoRamo(ramoNuevo, ramoBase)) {
    c.datosRamo = Object.keys(ramoNuevo).length === 0 ? null : ramoNuevo
    // Los orígenes se recortan a las claves que de verdad viajan: un origen
    // huérfano —«los metros vienen del Catastro» cuando no hay metros— es lo
    // que luego pinta un sello de «verificado» sobre un hueco. Si no queda
    // ninguno, `null`, nunca `{}`.
    const vivos = Object.fromEntries(Object.keys(ramoNuevo).map((k) => [k, origenes[k] ?? 'declarado']))
    c.datosRamoOrigen = c.datosRamo === null || Object.keys(vivos).length === 0 ? null : vivos
  }

  if (referenciaCatastral !== base.referenciaCatastral) c.referenciaCatastral = referenciaCatastral
  return c
}

function aplicar(base: Valores, c: Cambios): Valores {
  return {
    compania: c.compania !== undefined ? c.compania : base.compania,
    numeroPoliza: c.numeroPoliza !== undefined ? c.numeroPoliza : base.numeroPoliza,
    ramo: c.ramo !== undefined ? c.ramo : base.ramo,
    primaAnual: c.primaAnual !== undefined ? c.primaAnual : base.primaAnual,
    fechaVencimiento: c.fechaVencimiento !== undefined ? c.fechaVencimiento : base.fechaVencimiento,
    matricula: c.matricula !== undefined ? c.matricula : base.matricula,
    bastidor: c.bastidor !== undefined ? c.bastidor : base.bastidor,
    fechaMatriculacion:
      c.fechaMatriculacion !== undefined ? c.fechaMatriculacion : base.fechaMatriculacion,
    datosRamo: c.datosRamo !== undefined ? c.datosRamo : base.datosRamo,
    datosRamoOrigen: c.datosRamoOrigen !== undefined ? c.datosRamoOrigen : base.datosRamoOrigen,
    referenciaCatastral:
      c.referenciaCatastral !== undefined ? c.referenciaCatastral : base.referenciaCatastral,
  }
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`, en UTC (una fecha `date` no tiene hora ni zona). */
function textoFecha(iso: string): string | null {
  return fechaEs(new Date(`${iso}T00:00:00Z`))
}

export function EditarPoliza({ poliza, ramos }: { poliza: PolizaEditable; ramos: readonly RamoOpcion[] }) {
  const router = useRouter()
  // Lo ÚLTIMO que se ha guardado de verdad. Se inicializa con lo que trae el
  // servidor y se actualiza con lo que el PATCH acaba de aceptar, así la
  // tarjeta refleja el cambio al instante sin esperar al `router.refresh()`
  // (que también llega, pero no remonta este componente).
  const [guardado, setGuardado] = useState<Valores>(() => ({
    compania: poliza.compania,
    numeroPoliza: poliza.numeroPoliza,
    ramo: poliza.ramo,
    primaAnual: poliza.primaAnual,
    fechaVencimiento: poliza.fechaVencimiento,
    matricula: poliza.matricula,
    bastidor: poliza.bastidor,
    fechaMatriculacion: poliza.fechaMatriculacion,
    datosRamo: poliza.datosRamo,
    datosRamoOrigen: poliza.datosRamoOrigen,
    referenciaCatastral: poliza.referenciaCatastral,
  }))
  const [form, setForm] = useState<Formulario>(() => aFormulario(guardado))
  const [datosRamo, setDatosRamo] = useState<Record<string, string>>(() =>
    aFormularioRamo(guardado.datosRamo),
  )
  const [origenes, setOrigenes] = useState<Record<string, string>>(() => guardado.datosRamoOrigen ?? {})
  const [referenciaCatastral, setReferenciaCatastral] = useState<string | null>(
    () => guardado.referenciaCatastral,
  )
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState<Estado>('reposo')
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  function abrir() {
    // El formulario se monta SOLO al abrirlo: en la bóveda hay hasta 50
    // tarjetas y montar 50 formularios de golpe es la regla de rendimiento de
    // UI del monorepo hecha añicos.
    setForm(aFormulario(guardado))
    // Se re-siembra desde lo GUARDADO, igual que el resto: abrir el editor
    // enseña lo que hay en la BD, no lo que se dejó a medias la vez anterior.
    setDatosRamo(aFormularioRamo(guardado.datosRamo))
    setOrigenes(guardado.datosRamoOrigen ?? {})
    setReferenciaCatastral(guardado.referenciaCatastral)
    setErrores({})
    setErrorGeneral(null)
    setEstado('reposo')
    setAbierto(true)
  }

  function cerrar() {
    setAbierto(false)
    setErrores({})
    setErrorGeneral(null)
  }

  function escribirRamo(id: string, valor: string) {
    setDatosRamo((d) => ({ ...d, [id]: valor }))
    // Tecleado a mano es `declarado`, y pisa a un `catastro` anterior: si
    // alguien corrige los metros que dio el Catastro, el dato ya no es del
    // Catastro. Dejar el origen viejo sería el sello sobre un valor que nadie
    // ha verificado.
    setOrigenes((o) => ({ ...o, [id]: 'declarado' }))
    setErrorGeneral(null)
  }

  /**
   * Lo que la persona ACEPTA del Catastro. No entra nada por su cuenta: esto
   * solo corre cuando ha pulsado «Usar estos datos» habiendo visto la
   * dirección, el uso y la localidad del inmueble.
   */
  function aceptarCatastro(d: DatosAceptados) {
    setDatosRamo((v) => ({ ...v, ...d.valores }))
    setOrigenes((o) => {
      const nuevo = { ...o }
      for (const k of Object.keys(d.valores)) nuevo[k] = 'catastro'
      return nuevo
    })
    setReferenciaCatastral(d.referencia)
    setErrorGeneral(null)
  }

  function escribir(campo: Campo, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
    setErrores((e) => ({ ...e, [campo]: undefined }))
  }

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrores({})
    setErrorGeneral(null)

    const prima = primaDesdeTexto(form.primaAnual)
    if (prima === 'invalida' || prima === 'cero') {
      setErrores({
        primaAnual:
          prima === 'cero'
            ? MENSAJE_PRIMA_CERO
            : MENSAJE_400.primaAnual,
      })
      return
    }

    const cambios = calcularCambios(form, guardado, prima, datosRamo, origenes, referenciaCatastral)
    if (Object.keys(cambios).length === 0) {
      setErrorGeneral('No has cambiado nada, así que no hay nada que guardar.')
      return
    }

    setEstado('guardando')
    try {
      const r = await fetch(`/api/polizas/${encodeURIComponent(poliza.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cambios),
      })

      if (r.ok) {
        setGuardado(aplicar(guardado, cambios))
        setEstado('guardado')
        setAbierto(false)
        // Refresca la lista SIN loader a pantalla completa: la tarjeta no se
        // desmonta ni se pierde el sitio donde estaba la persona.
        router.refresh()
        return
      }

      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown } | null
      const codigo = typeof cuerpo?.error === 'string' ? cuerpo.error : ''
      setEstado('error')

      if (r.status === 400) {
        const campo = campoDelError(codigo)
        if (campo) setErrores((e) => ({ ...e, [campo]: MENSAJE_400[campo] }))
        else
          setErrorGeneral(
            `No hemos podido guardarlo: hay un dato que no nos vale${codigo ? ` (${codigo})` : ''}. Revísalo y vuelve a intentarlo.`,
          )
        return
      }
      if (r.status === 401) {
        setErrorGeneral('Se ha cerrado tu sesión. Vuelve a entrar con tu email y lo guardamos.')
        return
      }
      if (r.status === 404) {
        setErrorGeneral('Esta póliza ya no está en tu bóveda. Recarga la página.')
        return
      }
      setErrorGeneral('No hemos podido guardarlo. Inténtalo otra vez dentro de un momento.')
    } catch {
      setEstado('error')
      setErrorGeneral('No hemos podido guardarlo: comprueba tu conexión e inténtalo otra vez.')
    }
  }

  /**
   * El hueco de un campo que venía de un documento NO se pinta como un vacío a
   * secas: se dice que no se ha encontrado en el papel. Un vacío se lee como
   * «no hay»; esto es «no lo hemos sabido leer», que es otra cosa.
   */
  function ayudaHueco(campo: 'compania' | 'numeroPoliza' | 'ramo' | 'primaAnual'): string | null {
    if (!poliza.deDocumento || guardado[campo] !== null) return null
    return 'No lo hemos encontrado en el documento'
  }

  const vence = guardado.fechaVencimiento
  const guardando = estado === 'guardando'

  return (
    <div className="editor">
      {vence ? (
        // «Podemos avisarte», no «te avisaremos»: el envío lo hace el cron del
        // panel del corredor y desde aquí no se puede comprobar si está vivo.
        // Prometer un aviso que quizá no salga es la misma mentira que
        // inventarse la fecha, solo que al revés.
        <div className="linea">
          <strong>Vence el {textoFecha(vence)}</strong> · Con esta fecha podemos avisarte antes.
        </div>
      ) : (
        // Ni se inventa la fecha ni se esconde el hueco: se dice en voz alta
        // qué NO podemos hacer sin ella, y se pone la acción al lado.
        <div className="aviso-linea">
          <strong>No sabemos cuándo vence</strong>, así que no podemos avisarte. Dínoslo tú o lo comprobamos
          con tu compañía.
          {!abierto && (
            <button type="button" className="boton" onClick={abrir}>
              Dinos cuándo vence
            </button>
          )}
        </div>
      )}

      {/* Una sola acción, siempre: si falta la fecha el botón vive DENTRO del
          aviso de arriba (la acción, al lado del problema); si la fecha ya
          está, va aquí. Los dos abren el mismo formulario. */}
      {!abierto && (
        <>
          {vence && (
            <button type="button" className="boton secundario" onClick={abrir}>
              Corregir estos datos
            </button>
          )}
          {estado === 'guardado' && (
            <p className="chips" style={{ marginBottom: 0 }}>
              <span className="chip ok">Guardado</span>
            </p>
          )}
          {estado === 'error' && errorGeneral && (
            <p className="editor-error" role="alert">
              {errorGeneral}
            </p>
          )}
        </>
      )}

      {abierto && (
        <form className="editor-form" onSubmit={guardar} noValidate>
          <CamposPoliza
            idPrefix={poliza.id}
            ramos={ramos}
            form={form}
            errores={errores}
            escribir={escribir}
            disabled={guardando}
            ayudaHueco={ayudaHueco}
            ayudaPrima={
              guardado.primaAnual == null
                ? 'Lo que pagas al año. Si no lo sabes, déjalo en blanco.'
                : `Ahora tienes anotado ${eur(guardado.primaAnual)}.`
            }
            datosRamo={datosRamo}
            escribirRamo={escribirRamo}
            referenciaCatastral={referenciaCatastral ?? undefined}
            aceptarCatastro={aceptarCatastro}
          />

          {errorGeneral && (
            <p className="editor-error" role="alert">
              {errorGeneral}
            </p>
          )}

          <div className="editor-acciones">
            <button type="submit" className="boton" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button type="button" className="boton secundario" onClick={cerrar} disabled={guardando}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
