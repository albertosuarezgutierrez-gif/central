'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'

/**
 * Corrección a mano de una póliza que ha subido el propio cliente.
 *
 * Esta pantalla la abre gente de la calle desde su móvil, así que manda el
 * móvil: una columna, controles de 44 px y los `<input>` a 16 px (por debajo,
 * Safari en iPhone hace zoom al enfocar y descoloca la página). Todo eso lo dan
 * ya `.campo` y `.boton` de `globals.css`.
 *
 * 🚨 LA FECHA DE VENCIMIENTO **NO ES OBLIGATORIA**, Y NO SE DEBE «ARREGLAR».
 * Va la primera y destacada porque es el dato que permite avisar antes de que
 * la póliza venza — pero no lleva `required` ni bloquea el guardado, a
 * propósito: quien no la sabe se la inventaría, y una fecha inventada dispara
 * un aviso de renovación FALSO. Un hueco dice «no lo sabemos» y se puede
 * preguntar a la compañía; una fecha equivocada no se puede distinguir de una
 * buena. Es la regla de la casa «dato que NO hay ≠ dato que NO se ha mirado»:
 * mejor el hueco declarado que el dato inventado. Si alguien viene a ponerle un
 * `required`, esto es el porqué de que no lo tenga.
 */

export type RamoOpcion = { valor: string; etiqueta: string }

export type PolizaEditable = {
  id: string
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  /** `YYYY-MM-DD` o null: es lo que come `<input type="date">` y lo que espera el PATCH. */
  fechaVencimiento: string | null
  /**
   * ¿Salió de un PDF o una foto que leyó la IA? Decide el TONO del hueco: si
   * hubo documento, un campo vacío es «no lo hemos encontrado en el documento»
   * (no se ha sabido leer), no «no existe». Mismo criterio que `NO_LEIDO` en
   * `SubirPoliza.tsx`.
   */
  deDocumento: boolean
}

type Campo = 'fechaVencimiento' | 'compania' | 'numeroPoliza' | 'ramo' | 'primaAnual'
type Formulario = Record<Campo, string>
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
}

const MENSAJE_400: Record<Campo, string> = {
  fechaVencimiento: 'Esa fecha no nos vale. Compruébala en tu póliza; si no la sabes, déjala en blanco.',
  primaAnual: 'Esa prima no nos vale. Escríbela en euros al año, por ejemplo 320,50.',
  compania: 'Ese nombre de compañía no nos vale. Escríbelo tal cual aparece en tu póliza.',
  numeroPoliza: 'Ese número de póliza no nos vale. Cópialo tal cual aparece en tu póliza.',
  ramo: 'Ese tipo de seguro no nos vale. Elige uno de la lista.',
}

/**
 * Un 400 se le enseña a la persona JUNTO AL CAMPO que lo ha provocado, no como
 * «error genérico»: si el backend dice qué campo falla, hay que decírselo donde
 * lo está escribiendo. El código del backend es un identificador, así que se
 * mapea por lo que nombra. Si no se reconoce, NO se adivina un campo: se enseña
 * el aviso general con el código literal, que es honesto y le sirve al soporte.
 */
const CAMPO_POR_ERROR: ReadonlyArray<readonly [RegExp, Campo]> = [
  [/venc|fecha/i, 'fechaVencimiento'],
  [/prima/i, 'primaAnual'],
  [/compan|compañ/i, 'compania'],
  [/n(u|ú)mero/i, 'numeroPoliza'],
  [/ramo/i, 'ramo'],
]

function campoDelError(codigo: string): Campo | null {
  for (const [patron, campo] of CAMPO_POR_ERROR) if (patron.test(codigo)) return campo
  return null
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
  }
}

/**
 * `null` = el hueco, y es válido (dejar la prima en blanco es una respuesta).
 * `'invalida'` = hay algo escrito que no es un número. `'cero'` va aparte porque
 * un 0 no es basura: es un hueco con forma de número, y a quien lo escribe hay
 * que decirle que deje el campo vacío, no que «no vale» (mismo criterio que
 * `normalizarPolizaLeida` en @central/module-seguros-portal).
 */
function primaDesdeTexto(t: string): number | null | 'invalida' | 'cero' {
  const limpio = t.trim().replace(/[€\s]/g, '').replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  if (!Number.isFinite(n) || n < 0) return 'invalida'
  if (n === 0) return 'cero'
  return Math.round(n * 100) / 100
}

function calcularCambios(form: Formulario, base: Valores, prima: number | null): Cambios {
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
  return c
}

function aplicar(base: Valores, c: Cambios): Valores {
  return {
    compania: c.compania !== undefined ? c.compania : base.compania,
    numeroPoliza: c.numeroPoliza !== undefined ? c.numeroPoliza : base.numeroPoliza,
    ramo: c.ramo !== undefined ? c.ramo : base.ramo,
    primaAnual: c.primaAnual !== undefined ? c.primaAnual : base.primaAnual,
    fechaVencimiento: c.fechaVencimiento !== undefined ? c.fechaVencimiento : base.fechaVencimiento,
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
  }))
  const [form, setForm] = useState<Formulario>(() => aFormulario(guardado))
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState<Estado>('reposo')
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  function abrir() {
    // El formulario se monta SOLO al abrirlo: en la bóveda hay hasta 50
    // tarjetas y montar 50 formularios de golpe es la regla de rendimiento de
    // UI del monorepo hecha añicos.
    setForm(aFormulario(guardado))
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
            ? 'Una prima de 0 € no nos dice nada. Si no la sabes, déjala en blanco.'
            : MENSAJE_400.primaAnual,
      })
      return
    }

    const cambios = calcularCambios(form, guardado, prima)
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
  function ayudaHueco(campo: Exclude<Campo, 'fechaVencimiento'>): string | null {
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
          {/* La fecha, la PRIMERA y destacada: es la que decide si podemos
              avisar. Destacada ≠ obligatoria (ver la cabecera del fichero). */}
          <div className="editor-campo editor-destacado">
            <label htmlFor={`venc-${poliza.id}`}>Fecha de vencimiento</label>
            <p className="editor-ayuda" id={`venc-ayuda-${poliza.id}`}>
              Es lo que nos permite avisarte antes de que la póliza venza y no se te renueve sin querer.
              <strong> Si no la sabes, déjala en blanco</strong> y lo comprobamos con tu compañía: una fecha
              inventada nos haría avisarte el día que no es.
            </p>
            <input
              id={`venc-${poliza.id}`}
              className="campo"
              type="date"
              value={form.fechaVencimiento}
              onChange={(e) => escribir('fechaVencimiento', e.target.value)}
              aria-describedby={`venc-ayuda-${poliza.id}`}
              aria-invalid={errores.fechaVencimiento ? true : undefined}
              disabled={guardando}
            />
            {errores.fechaVencimiento && <p className="editor-error">{errores.fechaVencimiento}</p>}
          </div>

          <div className="editor-campo">
            <label htmlFor={`comp-${poliza.id}`}>Compañía</label>
            {ayudaHueco('compania') && <p className="editor-ayuda">{ayudaHueco('compania')}</p>}
            <input
              id={`comp-${poliza.id}`}
              className="campo"
              type="text"
              value={form.compania}
              onChange={(e) => escribir('compania', e.target.value)}
              placeholder="Mapfre, Allianz…"
              autoComplete="off"
              aria-invalid={errores.compania ? true : undefined}
              disabled={guardando}
            />
            {errores.compania && <p className="editor-error">{errores.compania}</p>}
          </div>

          <div className="editor-campo">
            <label htmlFor={`num-${poliza.id}`}>Nº de póliza</label>
            {ayudaHueco('numeroPoliza') && <p className="editor-ayuda">{ayudaHueco('numeroPoliza')}</p>}
            <input
              id={`num-${poliza.id}`}
              className="campo"
              type="text"
              value={form.numeroPoliza}
              onChange={(e) => escribir('numeroPoliza', e.target.value)}
              autoComplete="off"
              aria-invalid={errores.numeroPoliza ? true : undefined}
              disabled={guardando}
            />
            {errores.numeroPoliza && <p className="editor-error">{errores.numeroPoliza}</p>}
          </div>

          <div className="editor-campo">
            <label htmlFor={`ramo-${poliza.id}`}>Tipo de seguro</label>
            {ayudaHueco('ramo') && <p className="editor-ayuda">{ayudaHueco('ramo')}</p>}
            <select
              id={`ramo-${poliza.id}`}
              className="campo"
              value={form.ramo}
              onChange={(e) => escribir('ramo', e.target.value)}
              aria-invalid={errores.ramo ? true : undefined}
              disabled={guardando}
            >
              {/* «No lo sé» es una respuesta válida y explícita, no un hueco a
                  rellenar con el primero de la lista. */}
              <option value="">No lo sé</option>
              {ramos.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
            {errores.ramo && <p className="editor-error">{errores.ramo}</p>}
          </div>

          <div className="editor-campo">
            <label htmlFor={`prima-${poliza.id}`}>Prima anual (€)</label>
            <p className="editor-ayuda" id={`prima-ayuda-${poliza.id}`}>
              {ayudaHueco('primaAnual') ??
                (guardado.primaAnual == null
                  ? 'Lo que pagas al año. Si no lo sabes, déjalo en blanco.'
                  : `Ahora tienes anotado ${eur(guardado.primaAnual)}.`)}
            </p>
            <input
              id={`prima-${poliza.id}`}
              className="campo"
              type="text"
              inputMode="decimal"
              value={form.primaAnual}
              onChange={(e) => escribir('primaAnual', e.target.value)}
              placeholder="320,50"
              autoComplete="off"
              aria-describedby={`prima-ayuda-${poliza.id}`}
              aria-invalid={errores.primaAnual ? true : undefined}
              disabled={guardando}
            />
            {errores.primaAnual && <p className="editor-error">{errores.primaAnual}</p>}
          </div>

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
