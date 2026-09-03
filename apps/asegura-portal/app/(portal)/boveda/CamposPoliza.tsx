'use client'

/**
 * Los cinco campos de una póliza que declara el propio cliente, y las reglas
 * de pantalla que van con ellos. Es UN solo formulario para dos usos:
 * corregir una póliza ya guardada (`EditarPoliza`) y darla de alta a mano sin
 * documento (`AnadirPoliza`). Si viviera duplicado, el día que se añadiera un
 * campo —o cambiara un mensaje— uno de los dos se quedaría atrás sin que
 * nada fallara.
 *
 * Manda el móvil: una columna, controles de 44 px y los `<input>` a 16 px
 * (por debajo, Safari en iPhone hace zoom al enfocar). Todo eso lo dan ya
 * `.campo` y `.editor-*` de `globals.css`.
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

import { fechaMatriculacionEstimada } from '@central/module-seguros/matricula'

export type RamoOpcion = { valor: string; etiqueta: string }

export type Campo =
  | 'fechaVencimiento'
  | 'compania'
  | 'numeroPoliza'
  | 'ramo'
  | 'primaAnual'
  | 'matricula'
  | 'bastidor'
  | 'fechaMatriculacion'
export type Formulario = Record<Campo, string>
export type Errores = Partial<Record<Campo, string>>

export const FORMULARIO_VACIO: Formulario = {
  fechaVencimiento: '',
  compania: '',
  numeroPoliza: '',
  ramo: '',
  primaAnual: '',
  matricula: '',
  bastidor: '',
  fechaMatriculacion: '',
}

/**
 * Los ramos que tienen vehículo detrás, y por tanto los únicos que despliegan
 * el bloque de matrícula / bastidor.
 *
 * 🚨 Esto es lo que separa esta pantalla de una solicitud de seguro: un
 * tarificador pide TODOS sus campos siempre porque necesita calcular un precio;
 * aquí el cliente solo apunta lo que tiene, y enseñarle «matrícula» debajo de
 * su seguro de decesos es ruido que le hace dudar de si se ha equivocado.
 */
const RAMOS_CON_VEHICULO: ReadonlySet<string> = new Set(['auto', 'moto'])

export const MENSAJE_400: Record<Campo, string> = {
  fechaVencimiento: 'Esa fecha no nos vale. Compruébala en tu póliza; si no la sabes, déjala en blanco.',
  primaAnual: 'Esa prima no nos vale. Escríbela en euros al año, por ejemplo 320,50.',
  compania: 'Ese nombre de compañía no nos vale. Escríbelo tal cual aparece en tu póliza.',
  numeroPoliza: 'Ese número de póliza no nos vale. Cópialo tal cual aparece en tu póliza.',
  ramo: 'Ese tipo de seguro no nos vale. Elige uno de la lista.',
  matricula: 'Esa matrícula no nos vale. Escríbela tal cual, por ejemplo 1234 BCD.',
  bastidor: 'Ese bastidor no nos vale. Son 17 caracteres y no llevan las letras I, O ni Q.',
  fechaMatriculacion: 'Esa fecha de matriculación no nos vale. Está en tu permiso de circulación.',
}

/** Los meses, para decir «matriculado hacia marzo de 2014» y no «hacia 2014-03-11». */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** `2014-03-11` → `marzo de 2014`. Sin `Date`: aquí solo se parte un ISO. */
function mesYAno(iso: string): string {
  const [a, m] = iso.split('-')
  const i = Number(m) - 1
  return MESES[i] ? `${MESES[i]} de ${a}` : a ?? iso
}

export const MENSAJE_PRIMA_CERO = 'Una prima de 0 € no nos dice nada. Si no la sabes, déjala en blanco.'

/**
 * Un 400 se le enseña a la persona JUNTO AL CAMPO que lo ha provocado, no como
 * «error genérico»: si el backend dice qué campo falla, hay que decírselo donde
 * lo está escribiendo. El código del backend es un identificador, así que se
 * mapea por lo que nombra. Si no se reconoce, NO se adivina un campo: quien
 * llama enseña el aviso general con el código literal, que es honesto y le
 * sirve al soporte.
 */
const CAMPO_POR_ERROR: ReadonlyArray<readonly [RegExp, Campo]> = [
  [/venc|fecha/i, 'fechaVencimiento'],
  [/prima/i, 'primaAnual'],
  [/compan|compañ/i, 'compania'],
  [/n(u|ú)mero/i, 'numeroPoliza'],
  [/ramo/i, 'ramo'],
  [/matricula|matrícula/i, 'matricula'],
  [/bastidor|vin/i, 'bastidor'],
]

// La de matriculación tiene que ganarle a la genérica de fecha, así que se
// resuelve aparte y primero. (Un `error: 'fecha_matriculacion_invalida'` que
// pintara el aviso bajo «vencimiento» mandaría a la persona a corregir el
// campo que NO está mal, que es peor que no decir nada.)
const CAMPO_MATRICULACION: readonly [RegExp, Campo] = [/matriculacion|matriculación/i, 'fechaMatriculacion']

export function campoDelError(codigo: string): Campo | null {
  if (CAMPO_MATRICULACION[0].test(codigo)) return CAMPO_MATRICULACION[1]
  for (const [patron, campo] of CAMPO_POR_ERROR) if (patron.test(codigo)) return campo
  return null
}

/**
 * `null` = el hueco, y es válido (dejar la prima en blanco es una respuesta).
 * `'invalida'` = hay algo escrito que no es un número. `'cero'` va aparte porque
 * un 0 no es basura: es un hueco con forma de número, y a quien lo escribe hay
 * que decirle que deje el campo vacío, no que «no vale» (mismo criterio que
 * `normalizarPolizaLeida` en @central/module-seguros-portal).
 */
export function primaDesdeTexto(t: string): number | null | 'invalida' | 'cero' {
  const limpio = t.trim().replace(/[€\s]/g, '').replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  if (!Number.isFinite(n) || n < 0) return 'invalida'
  if (n === 0) return 'cero'
  return Math.round(n * 100) / 100
}

type Props = {
  /** Prefijo de los `id` de los controles: en la bóveda hay varios formularios en la misma página. */
  idPrefix: string
  ramos: readonly RamoOpcion[]
  form: Formulario
  errores: Errores
  escribir: (campo: Campo, valor: string) => void
  disabled: boolean
  /**
   * Texto de ayuda bajo compañía / nº / ramo cuando el campo está vacío. Lo
   * usa `EditarPoliza` para decir «no lo hemos encontrado en el documento»:
   * un vacío se lee como «no hay», y eso es «no lo hemos sabido leer».
   */
  ayudaHueco?: (campo: 'compania' | 'numeroPoliza' | 'ramo' | 'primaAnual') => string | null
  /** Ayuda de la prima. Siempre hay una: el hueco de la prima se explica. */
  ayudaPrima: string
}

export function CamposPoliza({ idPrefix, ramos, form, errores, escribir, disabled, ayudaHueco, ayudaPrima }: Props) {
  const hueco = (campo: 'compania' | 'numeroPoliza' | 'ramo') => ayudaHueco?.(campo) ?? null
  return (
    <>
      {/* La fecha, la PRIMERA y destacada: es la que decide si podemos
          avisar. Destacada ≠ obligatoria (ver la cabecera del fichero). */}
      <div className="editor-campo editor-destacado">
        <label htmlFor={`venc-${idPrefix}`}>Fecha de vencimiento</label>
        <p className="editor-ayuda" id={`venc-ayuda-${idPrefix}`}>
          Es lo que nos permite avisarte antes de que la póliza venza y no se te renueve sin querer.
          <strong> Si no la sabes, déjala en blanco</strong> y lo comprobamos con tu compañía: una fecha
          inventada nos haría avisarte el día que no es.
        </p>
        <input
          id={`venc-${idPrefix}`}
          className="campo"
          type="date"
          value={form.fechaVencimiento}
          onChange={(e) => escribir('fechaVencimiento', e.target.value)}
          aria-describedby={`venc-ayuda-${idPrefix}`}
          aria-invalid={errores.fechaVencimiento ? true : undefined}
          disabled={disabled}
        />
        {errores.fechaVencimiento && <p className="editor-error">{errores.fechaVencimiento}</p>}
      </div>

      <div className="editor-campo">
        <label htmlFor={`comp-${idPrefix}`}>Compañía</label>
        {hueco('compania') && <p className="editor-ayuda">{hueco('compania')}</p>}
        <input
          id={`comp-${idPrefix}`}
          className="campo"
          type="text"
          value={form.compania}
          onChange={(e) => escribir('compania', e.target.value)}
          placeholder="Mapfre, Allianz…"
          autoComplete="off"
          aria-invalid={errores.compania ? true : undefined}
          disabled={disabled}
        />
        {errores.compania && <p className="editor-error">{errores.compania}</p>}
      </div>

      <div className="editor-campo">
        <label htmlFor={`num-${idPrefix}`}>Nº de póliza</label>
        {hueco('numeroPoliza') && <p className="editor-ayuda">{hueco('numeroPoliza')}</p>}
        <input
          id={`num-${idPrefix}`}
          className="campo"
          type="text"
          value={form.numeroPoliza}
          onChange={(e) => escribir('numeroPoliza', e.target.value)}
          autoComplete="off"
          aria-invalid={errores.numeroPoliza ? true : undefined}
          disabled={disabled}
        />
        {errores.numeroPoliza && <p className="editor-error">{errores.numeroPoliza}</p>}
      </div>

      <div className="editor-campo">
        <label htmlFor={`ramo-${idPrefix}`}>Tipo de seguro</label>
        {hueco('ramo') && <p className="editor-ayuda">{hueco('ramo')}</p>}
        <select
          id={`ramo-${idPrefix}`}
          className="campo"
          value={form.ramo}
          onChange={(e) => escribir('ramo', e.target.value)}
          aria-invalid={errores.ramo ? true : undefined}
          disabled={disabled}
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

      {RAMOS_CON_VEHICULO.has(form.ramo) && (
        <CamposVehiculo idPrefix={idPrefix} form={form} errores={errores} escribir={escribir} disabled={disabled} />
      )}

      <div className="editor-campo">
        <label htmlFor={`prima-${idPrefix}`}>Prima anual (€)</label>
        <p className="editor-ayuda" id={`prima-ayuda-${idPrefix}`}>
          {ayudaHueco?.('primaAnual') ?? ayudaPrima}
        </p>
        <input
          id={`prima-${idPrefix}`}
          className="campo"
          type="text"
          inputMode="decimal"
          value={form.primaAnual}
          onChange={(e) => escribir('primaAnual', e.target.value)}
          placeholder="320,50"
          autoComplete="off"
          aria-describedby={`prima-ayuda-${idPrefix}`}
          aria-invalid={errores.primaAnual ? true : undefined}
          disabled={disabled}
        />
        {errores.primaAnual && <p className="editor-error">{errores.primaAnual}</p>}
      </div>
    </>
  )
}

/**
 * El bloque del VEHÍCULO: se despliega solo cuando el tipo de seguro lo tiene
 * detrás (`RAMOS_CON_VEHICULO`).
 *
 * Ninguno de los tres es obligatorio, por la misma razón que el vencimiento: el
 * cliente está apuntando su seguro, no pidiendo precio. Quien no sepa su
 * bastidor lo deja en blanco y la póliza se guarda igual.
 *
 * 🚨 LA FECHA ESTIMADA NO SE GUARDA SOLA, Y ESO ES EL DISEÑO, NO UN OLVIDO.
 * De la matrícula sale una fecha CALCULADA (la serie nacional es secuencial, así
 * que la matrícula lleva dentro su propia fecha ±unas semanas). Escribirla en el
 * campo por su cuenta la convertiría, aguas abajo, en indistinguible de la que
 * viene del permiso de circulación: mismo `fecha_matriculacion`, misma pinta, y
 * nadie podría volver a saber cuál era una lectura y cuál una cuenta nuestra.
 * Así que se ENSEÑA, y solo entra en el campo si la persona pulsa «Usar esta
 * fecha» — ahí ya es su declaración, no nuestra suposición. Es la regla de la
 * casa: un dato calculado nunca se sirve como un dato confirmado.
 *
 * Y el aviso del importado no es un detalle legal: en un vehículo traído de
 * fuera la matriculación ESPAÑOLA no es la primera del vehículo, y para el
 * precio del seguro manda la primera. La estimación no puede saberlo.
 */
function CamposVehiculo({
  idPrefix,
  form,
  errores,
  escribir,
  disabled,
}: {
  idPrefix: string
  form: Formulario
  errores: Errores
  escribir: (campo: Campo, valor: string) => void
  disabled: boolean
}) {
  const estimada = fechaMatriculacionEstimada(form.matricula)
  // Solo se ofrece cuando el campo está VACÍO: si ya hay una fecha (leída del
  // documento o escrita por la persona), una estimación nuestra no tiene nada
  // que corregirle, y ofrecer pisarla sería invitar a empeorar el dato.
  const ofrecerEstimada = estimada !== null && form.fechaMatriculacion.trim() === ''

  return (
    <>
      <div className="editor-campo">
        <label htmlFor={`mat-${idPrefix}`}>Matrícula</label>
        <input
          id={`mat-${idPrefix}`}
          className="campo"
          type="text"
          value={form.matricula}
          onChange={(e) => escribir('matricula', e.target.value)}
          placeholder="1234 BCD"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby={ofrecerEstimada ? `mat-est-${idPrefix}` : undefined}
          aria-invalid={errores.matricula ? true : undefined}
          disabled={disabled}
        />
        {errores.matricula && <p className="editor-error">{errores.matricula}</p>}
        {ofrecerEstimada && (
          <div className="editor-ayuda" id={`mat-est-${idPrefix}`}>
            <p>
              Por la matrícula, este coche es de <strong>{mesYAno(estimada.estimada)}</strong> aproximadamente.
              Lo calculamos nosotros a partir del número, <strong>no es un dato oficial</strong>, y no acierta si
              el coche vino de fuera de España.
            </p>
            <button
              type="button"
              className="boton-secundario"
              onClick={() => escribir('fechaMatriculacion', estimada.estimada)}
              disabled={disabled}
            >
              Usar esta fecha
            </button>
          </div>
        )}
      </div>

      <div className="editor-campo">
        <label htmlFor={`matfec-${idPrefix}`}>Fecha de matriculación</label>
        <p className="editor-ayuda" id={`matfec-ayuda-${idPrefix}`}>
          La que viene en tu permiso de circulación. Si no la tienes a mano, déjala en blanco.
        </p>
        <input
          id={`matfec-${idPrefix}`}
          className="campo"
          type="date"
          value={form.fechaMatriculacion}
          onChange={(e) => escribir('fechaMatriculacion', e.target.value)}
          aria-describedby={`matfec-ayuda-${idPrefix}`}
          aria-invalid={errores.fechaMatriculacion ? true : undefined}
          disabled={disabled}
        />
        {errores.fechaMatriculacion && <p className="editor-error">{errores.fechaMatriculacion}</p>}
      </div>

      <div className="editor-campo">
        <label htmlFor={`bast-${idPrefix}`}>Bastidor</label>
        <p className="editor-ayuda" id={`bast-ayuda-${idPrefix}`}>
          Los 17 caracteres de tu ficha técnica. Es lo que identifica la versión exacta de tu coche, así que
          nos ahorra preguntártela — pero <strong>si no lo tienes, déjalo en blanco</strong>.
        </p>
        <input
          id={`bast-${idPrefix}`}
          className="campo"
          type="text"
          value={form.bastidor}
          onChange={(e) => escribir('bastidor', e.target.value)}
          placeholder="VF1RFB00X66123456"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={17}
          aria-describedby={`bast-ayuda-${idPrefix}`}
          aria-invalid={errores.bastidor ? true : undefined}
          disabled={disabled}
        />
        {errores.bastidor && <p className="editor-error">{errores.bastidor}</p>}
      </div>
    </>
  )
}
