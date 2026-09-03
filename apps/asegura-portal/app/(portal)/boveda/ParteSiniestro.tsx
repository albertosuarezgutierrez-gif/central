'use client'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import {
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  DIAS_COMUNICACION_LCS,
  LUGAR_MAX,
} from '@central/module-seguros-portal'
// Del módulo puro, que no importa `node:*` ni red: se puede cargar desde un
// componente de cliente. La revisión del fichero es LA MISMA que hace el
// servidor — dos listas distintas acabarían aceptando aquí lo que allí se
// rechaza, y el usuario lo descubriría después de subir 10 MB desde el móvil.
import { MAX_ADJUNTOS_POR_PARTE, revisarDocumento } from '@central/module-seguros'

import { fechaEs } from '@/lib/fechas'

/**
 * «Dar parte de un siniestro» — el formulario que abre el CLIENTE desde su móvil,
 * normalmente con el coche todavía en la cuneta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LO QUE ESTA PANTALLA NO PUEDE DECIR: que el siniestro está comunicado a la
 * compañía.
 *
 * Una correduría es mediadora del CLIENTE, no del asegurador: que el parte nos
 * llegue a nosotros NO es, jurídicamente, comunicárselo a la entidad. Entre el
 * «enviar» y que Alberto lo abra en la compañía pasan horas o días, y en ese
 * hueco el cliente cree que ya está hecho — y deja de llamar, y deja de guardar
 * el presupuesto del taller, y no atiende al perito porque «ya lo mandé».
 *
 * Por eso:
 *   1. La confirmación dice el HECHO («lo hemos recibido nosotros») y la
 *      consecuencia («te avisamos en cuanto esté abierto en tu compañía»).
 *      Nunca «tu siniestro está comunicado» ni «hemos abierto el parte con tu
 *      aseguradora».
 *   2. El estado de un parte de la lista sale del campo `comunicado` que trae la
 *      capa de datos (y que sale de `comunicadoACompania()` del módulo puro),
 *      **jamás de un `estado !== 'enviado'`**: `recibido` significa «lo hemos
 *      leído nosotros», que es exactamente el estado que se confunde con estar
 *      comunicado. Si alguien sustituye `p.comunicado` por una comparación de
 *      estados, esta pantalla empieza a mentir sin que falle nada.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🚨 Y EL SEGUNDO NÚCLEO: «¿hay heridos?» y «¿hay terceros?» son TRI-ESTADO, no
 * checkboxes. Un checkbox desmarcado le diría a Alberto «no hay heridos» de una
 * pregunta que nadie ha contestado, y un parte con heridos se tramita en horas
 * mientras uno de chapa espera al lunes. Por defecto va «No lo sé», que manda
 * `null` — el «no lo sé» del módulo puro (`normalizarTriestado`), no `false`.
 *
 * Móvil primero (≥320 px): una columna, controles de 44 px y `font-size: 16px`
 * en los campos — por debajo, Safari en iPhone hace zoom al enfocar. Todo eso lo
 * dan ya `.campo`, `.boton` y `.opcion` de `globals.css`.
 */

/** Una póliza elegible en el desplegable. El `valor` lo compone `page.tsx`. */
export type PolizaOpcionParte = {
  /** `cartera:<uuid>` o `declarada:<uuid>`. Se parte por el primer `:`. */
  valor: string
  etiqueta: string
}

/**
 * Un parte YA enviado, tal y como lo pinta la lista.
 *
 * `comunicado` es obligatorio a propósito: es el único dato que autoriza a
 * decirle a alguien que su compañía ya lo sabe. `estado` es opcional porque solo
 * MATIZA la frase de los que aún no están en la compañía; si un día no viniera,
 * la pantalla cae al texto conservador y sigue siendo cierta.
 */
export type ParteEnviado = {
  id: string
  /** `YYYY-MM-DD`: una columna `date` no tiene hora ni zona. */
  fechaHecho: string
  descripcion: string
  /** 🚨 La ÚNICA fuente de «tu compañía ya lo sabe». Ver la cabecera. */
  comunicado: boolean
  estado?: string
  plazo: Plazo
  /**
   * Los ficheros que mandó con este parte.
   *
   * 🚨 CUATRO estados, y los tres primeros se dicen distinto:
   *   - `undefined` → esta pantalla no ha recibido el dato (la página no lo
   *     pasa). No se pinta nada: callar es lo único cierto.
   *   - `null`      → **se intentó consultar y falló**. Se dice, porque un
   *     silencio aquí se lee como «no mandé nada».
   *   - `[]`        → se miró y no adjuntó ninguno.
   *   - con datos   → los que hay, con su enlace de descarga.
   */
  adjuntos?: AdjuntoEnviado[] | null
}

/**
 * Un fichero ya guardado. Se declara aquí, y no se importa de
 * `lib/adjuntos-parte`, a propósito: ese módulo usa `node:crypto` y arrastrarlo
 * a un componente de cliente rompe el build de producción sin que el typecheck
 * ni los tests digan nada.
 */
export type AdjuntoEnviado = {
  id: string
  nombre: string | null
  bytes: number | null
}

export type Plazo = {
  diasTranscurridos: number
  /** Días que quedan de los 7. Negativo cuando ya pasaron. */
  diasRestantes: number
  /** `true` = pasaron más de 7 días. **NO** = «has perdido la cobertura». */
  fueraDePlazo: boolean
}

type Campo = 'descripcion' | 'fechaHecho' | 'horaAproximada' | 'lugar' | 'poliza'
type Triestado = 'si' | 'no' | 'nolose'
type Estado = 'reposo' | 'enviando' | 'enviado' | 'error'

type Formulario = {
  descripcion: string
  fechaHecho: string
  horaAproximada: string
  lugar: string
  poliza: string
  hayHeridos: Triestado
  hayTerceros: Triestado
}

const VACIO: Formulario = {
  descripcion: '',
  fechaHecho: '',
  horaAproximada: '',
  lugar: '',
  // «No lo sé» de salida, en los tres. Ninguna respuesta viene puesta de casa:
  // un valor por defecto que parezca contestado es una respuesta inventada.
  poliza: '',
  hayHeridos: 'nolose',
  hayTerceros: 'nolose',
}

/**
 * El backend devuelve `400 { error:'datos_invalidos', errores: {campo: codigo} }`
 * con códigos que son IDENTIFICADORES, no frases. Aquí se traducen a lo que la
 * persona tiene que HACER, y se pintan junto a SU campo (mismo criterio que
 * `EditarPoliza.tsx`): un «error» genérico arriba obliga a adivinar cuál de los
 * seis campos falla, con el accidente todavía delante.
 *
 * Un código que no esté en esta tabla NO se adivina: se enseña el aviso general
 * con el código literal, que es honesto y le sirve al soporte.
 */
const MENSAJE: Record<Campo, Record<string, string>> = {
  descripcion: {
    falta: 'Cuéntanos qué ha pasado: es lo único que no podemos poner nosotros.',
    corta: `Con tan poco no podemos abrir nada. Escribe al menos ${DESCRIPCION_MIN} caracteres: qué pasó, a qué o a quién.`,
    larga: `Te has pasado de largo (máximo ${DESCRIPCION_MAX} caracteres). Resume lo esencial; el detalle lo hablamos por teléfono.`,
  },
  fechaHecho: {
    falta: 'Dinos qué día pasó: sin la fecha no podemos contar el plazo para comunicarlo.',
    formato: 'Esa fecha no nos vale. Elígela en el calendario (día, mes y año).',
    futura: 'Esa fecha todavía no ha llegado. Pon el día en que pasó de verdad.',
    antigua: 'Es de hace demasiado tiempo para abrirlo por aquí. Llámanos y lo vemos contigo.',
  },
  horaAproximada: {
    formato: 'Esa hora no nos vale (formato de 24 h, por ejemplo 18:30). Si no la recuerdas, déjala en blanco.',
  },
  lugar: {
    larga: `El sitio es demasiado largo (máximo ${LUGAR_MAX} caracteres). Con la calle y la localidad nos vale.`,
  },
  poliza: {
    ambigua:
      'No hemos podido saber a qué póliza te refieres. Vuelve a elegirla en la lista, o déjala en «No lo sé»: la buscamos nosotros.',
  },
}

function mensaje(campo: Campo, codigo: string): string {
  return (
    MENSAJE[campo][codigo] ??
    `Ese dato no nos vale${codigo ? ` (${codigo})` : ''}. Revísalo y vuelve a enviarlo.`
  )
}

/** `YYYY-MM-DD` → `dd/mm/aaaa` en UTC (una fecha `date` no tiene hora ni zona). */
function textoFecha(iso: string): string {
  return fechaEs(new Date(`${iso}T00:00:00Z`)) ?? iso
}

/** La primera línea de la descripción, para la lista. Ni se reescribe ni se resume. */
function primeraLinea(t: string): string {
  const l = t.split('\n')[0]!.trim()
  return l.length > 120 ? `${l.slice(0, 119)}…` : l
}

/**
 * 🚨 EL texto del plazo, y el motivo por el que esta función existe en vez de un
 * ternario en el JSX.
 *
 * `fueraDePlazo` NO significa que el cliente haya perdido la cobertura, y decirlo
 * sería mentirle: el art. 16 LCS solo permite a la compañía **reclamar los daños
 * que le cause el retraso**, y la pérdida del derecho a la indemnización exige
 * dolo o culpa grave. Un portal que le suelte «ya no te cubren» a quien avisa
 * tarde consigue lo único que de verdad hace daño: que la próxima vez no avise.
 *
 * Así que fuera de plazo se dice el HECHO (han pasado más de 7 días) y la ACCIÓN
 * útil (por eso conviene contarlo cuanto antes), nunca la sentencia.
 */
function textoPlazo(p: Plazo): string {
  if (p.fueraDePlazo) {
    return `Han pasado ${p.diasTranscurridos} días desde que ocurrió, más de los ${DIAS_COMUNICACION_LCS} que marca la ley (art. 16 LCS). Por eso conviene contarlo cuanto antes, así que has hecho bien en mandarlo: nos ponemos con ello.`
  }
  if (p.diasTranscurridos === 0) {
    return `Nos lo cuentas el mismo día. Del plazo de ${DIAS_COMUNICACION_LCS} días para comunicarlo quedan ${p.diasRestantes}.`
  }
  const dias = p.diasTranscurridos === 1 ? 'un día' : `${p.diasTranscurridos} días`
  if (p.diasRestantes === 0) {
    return `Han pasado ${dias} desde que ocurrió: hoy es el último de los ${DIAS_COMUNICACION_LCS} del plazo para comunicarlo.`
  }
  const quedan = p.diasRestantes === 1 ? 'queda 1 día' : `quedan ${p.diasRestantes} días`
  return `Han pasado ${dias} desde que ocurrió: del plazo de ${DIAS_COMUNICACION_LCS} días para comunicarlo ${quedan}.`
}

/**
 * El estado de un parte, en el idioma del cliente.
 *
 * 🚨 La primera pregunta es SIEMPRE `comunicado`, no el estado. `enviado` y
 * `recibido` son dos cosas distintas para nosotros y **la misma** para el
 * cliente: su compañía todavía no lo sabe. El estado solo elige el matiz.
 */
function textoEstado(p: ParteEnviado): { texto: string; enCompania: boolean } {
  if (p.comunicado) return { texto: 'Abierto en tu compañía', enCompania: true }
  if (p.estado === 'descartado') {
    // El motivo del descarte es nota de gestión y no baja hasta aquí, así que el
    // cliente se quedaría sin saber por qué ni qué hacer. Dejarlo en «no seguimos
    // adelante» a secas es cerrarle la puerta con una frase: si discrepa —y a
    // veces tendrá razón— tiene que poder decirlo.
    return {
      texto: 'Revisado: no seguimos adelante con este parte · si crees que es un error, escríbenos',
      enCompania: false,
    }
  }
  if (p.estado === 'recibido') {
    return { texto: 'Lo estamos revisando · aún no está en tu compañía', enCompania: false }
  }
  // Cualquier otro estado (incluido uno que no conozcamos) cae aquí: el texto
  // conservador es el único que no puede ser falso.
  return { texto: 'Lo hemos recibido · aún no está en tu compañía', enCompania: false }
}

/** `si|no|nolose` → `true|false|null`. `nolose` es `null`, JAMÁS `false`. */
function aTriestado(v: Triestado): boolean | null {
  if (v === 'si') return true
  if (v === 'no') return false
  return null
}

/**
 * Un fichero elegido y en qué punto está.
 *
 * `estado` es por FICHERO y no del envío entero, y esa es la decisión de diseño
 * de todo este bloque: si la cuarta foto falla, las tres primeras ya están
 * dentro y la pantalla tiene que poder decir CUÁL falta. Un todo-o-nada
 * perdería las tres buenas por culpa de la cuarta, y esas fotos no se pueden
 * repetir con el coche ya retirado.
 */
type EstadoFichero = 'espera' | 'subiendo' | 'ok' | 'error'
type Elegido = {
  /** Clave estable para React: el nombre se repite (todos los móviles hacen `IMG_0001.jpg`). */
  clave: string
  fichero: File
  estado: EstadoFichero
  /** Por qué no ha entrado. Texto para leer, no un código. */
  motivo: string | null
}

let contadorClaves = 0

/** ¿Merece la pena reintentarlo? Solo si el fichero en sí vale: lo que falló fue el viaje. */
function reintentable(e: Elegido): boolean {
  return revisarDocumento({ type: e.fichero.type, size: e.fichero.size, name: e.fichero.name }) === null
}

/** Tamaño legible. `null` = la fila no guardó el tamaño; no se inventa un 0 KB. */
function pesoLegible(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ParteSiniestro({
  polizas,
  partes,
}: {
  polizas: readonly PolizaOpcionParte[]
  partes: readonly ParteEnviado[]
}) {
  const router = useRouter()
  // Prefijo único para los `id`/`name`: puede haber más de un grupo de radios en
  // la página y dos grupos con el mismo `name` se pisan (marcar «Sí» en heridos
  // desmarcaría el de terceros).
  const uid = useId()
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<Formulario>(VACIO)
  const [estado, setEstado] = useState<Estado>('reposo')
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [recibido, setRecibido] = useState<Plazo | null>(null)
  const [ficheros, setFicheros] = useState<Elegido[]>([])
  /**
   * El parte YA creado. Se guarda porque los adjuntos cuelgan de él: si alguno
   * falla, «Reintentar» tiene que poder volver a subirlo SIN crear otro parte.
   * Dos partes del mismo accidente son dos expedientes que alguien tiene que
   * cerrar a mano.
   */
  const [parteId, setParteId] = useState<string | null>(null)

  const enviando = estado === 'enviando'
  const subidos = ficheros.filter((f) => f.estado === 'ok')
  const fallidos = ficheros.filter((f) => f.estado === 'error')
  /** Los que fallaron por el camino (no por ser un fichero que no admitimos). */
  const recuperables = fallidos.filter(reintentable)

  function abrir() {
    // El formulario se monta SOLO al abrirlo (regla de rendimiento de UI del
    // monorepo): la bóveda ya trae hasta 50 tarjetas con su propio editor.
    setForm(VACIO)
    setErrores({})
    setErrorGeneral(null)
    setFicheros([])
    setParteId(null)
    setEstado('reposo')
    setAbierto(true)
  }

  function cerrar() {
    setAbierto(false)
    setErrores({})
    setErrorGeneral(null)
  }

  /** Un campo con error: al tocarlo se le quita el mensaje, que ya no describe
   *  lo que hay escrito. */
  function escribir(campo: Campo, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
    setErrores((e) => ({ ...e, [campo]: undefined }))
  }

  /** Los tri-estado no tienen error propio: cualquiera de las tres respuestas
   *  —«No lo sé» incluida— es válida y el backend nunca las rechaza. */
  function responder(campo: 'hayHeridos' | 'hayTerceros', valor: Triestado) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  /**
   * Añade ficheros a la lista. Se ACUMULAN: en el móvil, «hacer una foto» y
   * «elegir de la galería» son dos viajes distintos al mismo input, y sustituir
   * la lista en cada uno borraría lo anterior sin avisar.
   *
   * La revisión se hace aquí, con la MISMA función que usa el servidor: un
   * fichero que no vale se queda en la lista **marcado y con su motivo** en vez
   * de desaparecer. Desaparecer se lee como «ya está subido».
   */
  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const nuevos = Array.from(e.target.files ?? [])
    e.target.value = '' // permite volver a elegir el mismo fichero
    if (nuevos.length === 0) return

    setFicheros((previos) => {
      const hueco = MAX_ADJUNTOS_POR_PARTE - previos.length
      const entran = nuevos.slice(0, Math.max(0, hueco))
      const añadidos: Elegido[] = entran.map((f) => {
        const reparo = revisarDocumento({ type: f.type, size: f.size, name: f.name })
        // Un fichero rechazado nace en `error` CON su motivo, no se descarta:
        // desaparecer de la lista se lee como «ya está subido».
        return { clave: `f${contadorClaves++}`, fichero: f, estado: reparo ? 'error' : 'espera', motivo: reparo }
      })
      if (entran.length < nuevos.length) {
        setErrorGeneral(
          `Solo caben ${MAX_ADJUNTOS_POR_PARTE} ficheros por parte, así que no hemos cogido ` +
            `${nuevos.length - entran.length} de los que has elegido. Si falta algo importante, dínoslo.`,
        )
      }
      return [...previos, ...añadidos]
    })
  }

  /** Quitar uno de la lista ANTES de enviar. Después ya no: lo enviado es una comunicación. */
  function quitar(clave: string) {
    setFicheros((f) => f.filter((x) => x.clave !== clave))
  }

  /**
   * Sube los ficheros de uno en uno contra un parte que YA existe.
   *
   * En serie y no en paralelo a propósito: son hasta 10 MB cada uno desde un
   * móvil con mala cobertura, y cuatro subidas a la vez se estorban entre
   * ellas. El resultado de cada una se pinta en cuanto se sabe.
   */
  async function subirTodos(idParte: string, cuales: readonly Elegido[]) {
    for (const elegido of cuales) {
      setFicheros((f) => f.map((x) => (x.clave === elegido.clave ? { ...x, estado: 'subiendo', motivo: null } : x)))
      try {
        const body = new FormData()
        body.append('documento', elegido.fichero)
        const r = await fetch(`/api/siniestros/${idParte}/adjuntos`, { method: 'POST', body })
        if (r.status === 201) {
          setFicheros((f) => f.map((x) => (x.clave === elegido.clave ? { ...x, estado: 'ok', motivo: null } : x)))
          continue
        }
        // El motivo lo redacta el servidor (es el mismo texto del módulo puro).
        // Si no llega ninguno, se dice lo que se sabe y nada más.
        const cuerpo = (await r.json().catch(() => null)) as { motivo?: unknown } | null
        const motivo =
          typeof cuerpo?.motivo === 'string' && cuerpo.motivo.trim() !== ''
            ? cuerpo.motivo
            : r.status === 401
              ? 'Se ha cerrado tu sesión, así que este fichero no ha entrado.'
              : 'No hemos podido guardarlo.'
        setFicheros((f) => f.map((x) => (x.clave === elegido.clave ? { ...x, estado: 'error', motivo } : x)))
      } catch {
        setFicheros((f) =>
          f.map((x) =>
            x.clave === elegido.clave
              ? { ...x, estado: 'error', motivo: 'No hemos podido subirlo: comprueba tu conexión.' }
              : x,
          ),
        )
      }
    }
    // La lista de partes se refresca al final, una sola vez, y sin loader a
    // pantalla completa: nada se desmonta debajo de la persona.
    router.refresh()
  }

  /**
   * Reintenta SOLO los que fallaron por el camino, contra el MISMO parte.
   *
   * Nunca crea otro parte: dos partes del mismo accidente son dos expedientes
   * que alguien tiene que cerrar a mano. Y no reintenta los que rechazó la
   * revisión local (un vídeo, un fichero de 30 MB): reintentar eso es gastarle
   * los datos del móvil para volver al mismo sitio.
   */
  async function reintentar() {
    if (parteId === null) return
    const pendientes = ficheros.filter((f) => f.estado === 'error' && reintentable(f))
    if (pendientes.length === 0) return
    await subirTodos(parteId, pendientes)
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrores({})
    setErrorGeneral(null)

    // Comprobación previa de lo mínimo, para no gastar un viaje al servidor con
    // el móvil en mitad de un accidente. La VALIDACIÓN de verdad es la del
    // backend (`normalizarParte`): esto solo se le adelanta con los mismos
    // umbrales del módulo puro, nunca con otros.
    const descripcion = form.descripcion.trim()
    const previos: Partial<Record<Campo, string>> = {}
    if (descripcion === '') previos.descripcion = mensaje('descripcion', 'falta')
    else if (descripcion.length < DESCRIPCION_MIN) previos.descripcion = mensaje('descripcion', 'corta')
    if (form.fechaHecho === '') previos.fechaHecho = mensaje('fechaHecho', 'falta')
    if (Object.keys(previos).length > 0) {
      setErrores(previos)
      return
    }

    // `cartera:<id>` o `declarada:<id>`. Las dos claves NUNCA van a la vez: el
    // backend lo rechaza con `poliza: 'ambigua'` porque un parte colgado de dos
    // pólizas no se puede tramitar. Y sin elegir nada tampoco pasa nada: «no sé
    // cuál me cubre esto» es justo el motivo por el que se llama al corredor.
    const corte = form.poliza.indexOf(':')
    const tipo = corte === -1 ? '' : form.poliza.slice(0, corte)
    const id = corte === -1 ? '' : form.poliza.slice(corte + 1)

    setEstado('enviando')
    try {
      const r = await fetch('/api/siniestros', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          descripcion,
          fechaHecho: form.fechaHecho,
          horaAproximada: form.horaAproximada || null,
          lugar: form.lugar.trim() || null,
          polizaId: tipo === 'cartera' ? id : null,
          polizaDeclaradaId: tipo === 'declarada' ? id : null,
          // 🚨 `null` cuando no lo ha contestado. No se colapsa a `false`.
          hayHeridos: aTriestado(form.hayHeridos),
          hayTerceros: aTriestado(form.hayTerceros),
        }),
      })

      if (r.status === 201) {
        const cuerpo = (await r.json().catch(() => null)) as { plazo?: Plazo; id?: unknown } | null
        setRecibido(cuerpo?.plazo ?? null)
        setEstado('enviado')
        setAbierto(false)
        setForm(VACIO)

        // 🚨 Los adjuntos van DESPUÉS y cuelgan de este parte. Nunca al revés:
        // un fichero subido antes que su parte es un fichero huérfano que no ve
        // nadie. Y el parte ya está dentro pase lo que pase con las fotos —
        // contar el siniestro es lo urgente; la foto se puede reintentar.
        const idParte = typeof cuerpo?.id === 'string' ? cuerpo.id : null
        const porSubir = ficheros.filter((f) => f.estado === 'espera')
        if (idParte !== null && porSubir.length > 0) {
          setParteId(idParte)
          await subirTodos(idParte, porSubir)
          return
        }
        setParteId(idParte)
        // Refresca la lista SIN loader a pantalla completa: la lista de partes
        // no se desmonta ni se pierde el sitio donde estaba la persona.
        router.refresh()
        return
      }

      const cuerpo = (await r.json().catch(() => null)) as
        | { error?: unknown; errores?: unknown }
        | null
      setEstado('error')
      setAbierto(true)

      if (r.status === 400) {
        const porCampo = cuerpo?.errores
        if (porCampo && typeof porCampo === 'object') {
          const mapeados: Partial<Record<Campo, string>> = {}
          for (const [campo, codigo] of Object.entries(porCampo as Record<string, unknown>)) {
            if (campo in MENSAJE && typeof codigo === 'string') {
              mapeados[campo as Campo] = mensaje(campo as Campo, codigo)
            }
          }
          if (Object.keys(mapeados).length > 0) {
            setErrores(mapeados)
            // Si además llegó un campo que no conocemos, se dice: callarlo
            // dejaría a la persona reenviando lo mismo sin saber qué falla.
            const desconocidos = Object.keys(porCampo as object).filter((c) => !(c in MENSAJE))
            if (desconocidos.length > 0) {
              setErrorGeneral(`Además hay un dato que no nos vale (${desconocidos.join(', ')}).`)
            }
            return
          }
        }
        setErrorGeneral('Hay algún dato que no nos vale. Revísalo y vuelve a enviarlo.')
        return
      }
      if (r.status === 401) {
        setErrorGeneral('Se ha cerrado tu sesión. Vuelve a entrar con tu email y lo mandamos.')
        return
      }
      if (r.status === 403) {
        setErrores({
          poliza:
            'Esa póliza no es tuya, así que no podemos colgarle el parte. Elige otra o déjalo en «No lo sé».',
        })
        return
      }
      setErrorGeneral('No hemos podido enviarlo. Inténtalo otra vez dentro de un momento.')
    } catch {
      setEstado('error')
      setAbierto(true)
      setErrorGeneral('No hemos podido enviarlo: comprueba tu conexión e inténtalo otra vez.')
    }
  }

  const restantes = DESCRIPCION_MIN - form.descripcion.trim().length

  return (
    <section className="seccion" aria-labelledby={`${uid}-titulo`}>
      <h2 id={`${uid}-titulo`}>Un siniestro</h2>

      {/* La confirmación vive FUERA del formulario, así sigue en pantalla cuando
          el formulario ya se ha cerrado. */}
      {estado === 'enviado' && (
        <div className="recibido" role="status">
          {/* 🚨 EL texto de esta pantalla. Ni «comunicado a tu compañía» ni
              «hemos abierto el parte con tu aseguradora»: eso todavía no ha
              pasado, y creerlo cambia lo que esta persona hace las próximas
              horas. Ver la cabecera del fichero antes de suavizar una coma. */}
          <strong>Lo hemos recibido nosotros.</strong>
          <p className="recibido-clave">
            Todavía no está comunicado a tu compañía: lo abrimos nosotros con ella y{' '}
            <strong>te avisamos en cuanto esté abierto</strong>. Si es urgente, llámanos.
          </p>
          {recibido && (
            <p className={recibido.fueraDePlazo ? 'recibido-plazo ojo' : 'recibido-plazo'}>
              {textoPlazo(recibido)}
            </p>
          )}

          {/* 🚨 Qué fichero entró y cuál no, uno por uno. Un «enviado» a secas
              deja a la persona creyendo que las cuatro fotos están dentro
              cuando solo hay tres — y la que falta es siempre la del otro
              coche. */}
          {ficheros.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p className="recibido-plazo" style={{ margin: '0 0 6px' }}>
                {subidos.length === ficheros.length
                  ? subidos.length === 1
                    ? 'Nos ha llegado el fichero que adjuntaste.'
                    : `Nos han llegado los ${subidos.length} ficheros que adjuntaste.`
                  : `Han entrado ${subidos.length} de ${ficheros.length} ficheros.`}
              </p>
              <ListaFicheros ficheros={ficheros} onQuitar={null} />
              {recuperables.length > 0 && (
                <button type="button" className="boton secundario" onClick={reintentar} style={{ marginTop: 8 }}>
                  Reintentar {recuperables.length === 1 ? 'el que falta' : `los ${recuperables.length} que faltan`}
                </button>
              )}
              {fallidos.length > 0 && (
                // Ni una promesa de que lo arreglamos nosotros: el fichero no
                // ha salido de su móvil y aquí no hay nada que recuperar.
                <p className="editor-ayuda" style={{ marginTop: 6 }}>
                  Lo que no haya entrado no lo tenemos. Si es importante, vuelve a intentarlo o dínoslo al llamarnos.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!abierto && (
        <>
          <p className="editor-ayuda" style={{ marginBottom: 10 }}>
            Cuéntanoslo aquí y lo tramitamos con tu compañía. No hace falta que sepas qué póliza lo cubre.
          </p>
          <button type="button" className="boton" onClick={abrir}>
            Dar parte de un siniestro
          </button>
        </>
      )}

      {abierto && (
        <form className="editor-form" onSubmit={enviar} noValidate>
          {/* El campo principal y el primero: es lo único que no podemos poner
              nosotros, así que se lleva el sitio. */}
          <div className="editor-campo editor-destacado">
            <label htmlFor={`${uid}-desc`}>Qué ha pasado</label>
            <p className="editor-ayuda" id={`${uid}-desc-ayuda`}>
              Con tus palabras: qué ha pasado, a qué o a quién, y cómo de grave lo ves. No hace falta que
              sepas los términos del seguro.
            </p>
            <textarea
              id={`${uid}-desc`}
              className="campo campo-area"
              value={form.descripcion}
              onChange={(e) => escribir('descripcion', e.target.value)}
              rows={5}
              maxLength={DESCRIPCION_MAX}
              placeholder="Por ejemplo: se ha roto una tubería debajo del fregadero y ha calado al vecino de abajo."
              aria-describedby={`${uid}-desc-ayuda`}
              aria-invalid={errores.descripcion ? true : undefined}
              disabled={enviando}
              required
            />
            {restantes > 0 && form.descripcion.length > 0 && (
              <p className="editor-ayuda">
                Escribe {restantes} {restantes === 1 ? 'carácter' : 'caracteres'} más.
              </p>
            )}
            {errores.descripcion && <p className="editor-error">{errores.descripcion}</p>}
          </div>

          {/* La fecha SÍ es obligatoria aquí, y es la única que lo es. Ojo al
              contraste con `EditarPoliza.tsx`, donde el vencimiento se destaca
              pero NO se exige: allí el dato lo tiene la compañía y se puede
              preguntar; aquí solo lo tiene quien lo vivió, y sin él no hay
              plazo del art. 16 LCS que contar ni forma de saber si corre prisa. */}
          <div className="editor-campo">
            <label htmlFor={`${uid}-fecha`}>
              Cuándo pasó <span className="obligatorio">(obligatorio)</span>
            </label>
            <p className="editor-ayuda" id={`${uid}-fecha-ayuda`}>
              Es lo que nos permite contar el plazo: hay <strong>{DIAS_COMUNICACION_LCS} días</strong> para
              comunicarlo a la compañía (art. 16 LCS) y sin la fecha no sabemos si corre prisa.
            </p>
            <input
              id={`${uid}-fecha`}
              className="campo"
              type="date"
              value={form.fechaHecho}
              onChange={(e) => escribir('fechaHecho', e.target.value)}
              aria-describedby={`${uid}-fecha-ayuda`}
              aria-invalid={errores.fechaHecho ? true : undefined}
              disabled={enviando}
              required
            />
            {errores.fechaHecho && <p className="editor-error">{errores.fechaHecho}</p>}
          </div>

          <div className="editor-campo">
            <label htmlFor={`${uid}-hora`}>Hora aproximada</label>
            <p className="editor-ayuda" id={`${uid}-hora-ayuda`}>
              Si no la recuerdas, <strong>déjala en blanco</strong>: es mejor que inventarla. Una hora
              equivocada en el parte no se distingue de una buena, y luego hay que rectificarla ante la
              compañía.
            </p>
            <input
              id={`${uid}-hora`}
              className="campo"
              type="time"
              value={form.horaAproximada}
              onChange={(e) => escribir('horaAproximada', e.target.value)}
              aria-describedby={`${uid}-hora-ayuda`}
              aria-invalid={errores.horaAproximada ? true : undefined}
              disabled={enviando}
            />
            {errores.horaAproximada && <p className="editor-error">{errores.horaAproximada}</p>}
          </div>

          <div className="editor-campo">
            <label htmlFor={`${uid}-lugar`}>Dónde</label>
            <p className="editor-ayuda">
              La calle y la localidad, o «en casa». Si no procede, déjalo en blanco.
            </p>
            <input
              id={`${uid}-lugar`}
              className="campo"
              type="text"
              value={form.lugar}
              onChange={(e) => escribir('lugar', e.target.value)}
              maxLength={LUGAR_MAX}
              placeholder="Avenida de la Constitución, Sevilla"
              autoComplete="off"
              aria-invalid={errores.lugar ? true : undefined}
              disabled={enviando}
            />
            {errores.lugar && <p className="editor-error">{errores.lugar}</p>}
          </div>

          {/* 🚨 TRES opciones, no un checkbox. Ver la cabecera del fichero: un
              checkbox desmarcado afirma «no hay heridos» de una pregunta que
              nadie contestó, y de esa respuesta depende que el parte se tramite
              hoy o el lunes. */}
          <Triple
            uid={uid}
            nombre="heridos"
            etiqueta="¿Hay heridos?"
            ayuda="Cuenta cualquier persona atendida, aunque parezca leve y aunque no sea culpa de nadie. Si no lo sabes, dilo: lo comprobamos."
            valor={form.hayHeridos}
            deshabilitado={enviando}
            onCambio={(v) => responder('hayHeridos', v)}
          />

          <Triple
            uid={uid}
            nombre="terceros"
            etiqueta="¿Hay terceros implicados?"
            ayuda="Otro coche, un vecino, un local… cualquiera que no seas tú. Si no lo sabes, dilo."
            valor={form.hayTerceros}
            deshabilitado={enviando}
            onCambio={(v) => responder('hayTerceros', v)}
          />

          <Adjuntar
            uid={uid}
            ficheros={ficheros}
            deshabilitado={enviando}
            onElegir={elegir}
            onQuitar={quitar}
          />

          <div className="editor-campo">
            <label htmlFor={`${uid}-poliza`}>A qué póliza</label>
            <p className="editor-ayuda" id={`${uid}-poliza-ayuda`}>
              Si no lo sabes, <strong>déjalo en «No lo sé»</strong> y lo miramos nosotros: saber qué póliza
              cubre qué es nuestro trabajo, no el tuyo.
            </p>
            <select
              id={`${uid}-poliza`}
              className="campo"
              value={form.poliza}
              onChange={(e) => escribir('poliza', e.target.value)}
              aria-describedby={`${uid}-poliza-ayuda`}
              aria-invalid={errores.poliza ? true : undefined}
              disabled={enviando}
            >
              {/* La opción por defecto, y es una respuesta VÁLIDA, no un hueco a
                  rellenar con la primera de la lista. */}
              <option value="">No lo sé / no estoy seguro</option>
              {polizas.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.etiqueta}
                </option>
              ))}
            </select>
            {errores.poliza && <p className="editor-error">{errores.poliza}</p>}
          </div>

          {errorGeneral && (
            <p className="editor-error" role="alert">
              {errorGeneral}
            </p>
          )}

          <div className="editor-acciones">
            <button type="submit" className="boton" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar el parte'}
            </button>
            <button type="button" className="boton secundario" onClick={cerrar} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <ListaPartes partes={partes} />
    </section>
  )
}

/**
 * Un tri-estado pintado como tres radios.
 *
 * Radios y no un `<select>`: las tres respuestas tienen que verse a la vez para
 * que «No lo sé» sea visiblemente la que está marcada de salida. Y no un
 * checkbox, nunca — ver la cabecera del fichero.
 */
function Triple({
  uid,
  nombre,
  etiqueta,
  ayuda,
  valor,
  deshabilitado,
  onCambio,
}: {
  uid: string
  nombre: string
  etiqueta: string
  ayuda: string
  valor: Triestado
  deshabilitado: boolean
  onCambio: (v: Triestado) => void
}) {
  const grupo = `${uid}-${nombre}`
  const opciones: ReadonlyArray<readonly [Triestado, string]> = [
    ['si', 'Sí'],
    ['no', 'No'],
    // El texto de la tercera dice lo que significa: no es «prefiero no decirlo»,
    // es «todavía no se sabe», y así llega a la ficha de Alberto como `null`.
    ['nolose', 'No lo sé'],
  ]

  return (
    <fieldset className="editor-campo grupo" aria-describedby={`${grupo}-ayuda`}>
      <legend>{etiqueta}</legend>
      <p className="editor-ayuda" id={`${grupo}-ayuda`}>
        {ayuda}
      </p>
      <div className="opciones">
        {opciones.map(([v, texto]) => (
          <label key={v} className="opcion">
            <input
              type="radio"
              name={grupo}
              value={v}
              checked={valor === v}
              onChange={() => onCambio(v)}
              disabled={deshabilitado}
            />
            {texto}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Los partes que ya ha mandado esta persona. */
function ListaPartes({ partes }: { partes: readonly ParteEnviado[] }) {
  if (partes.length === 0) {
    // «Todavía no has dado ningún parte» — no «no tienes siniestros»: de los que
    // trae la compañía se encarga la tarjeta de cada póliza, esto es lo que
    // cuenta la persona.
    return (
      <p className="suave" style={{ margin: '14px 0 0', fontSize: 14 }}>
        Todavía no nos has dado ningún parte.
      </p>
    )
  }

  return (
    <>
      <h3 className="lista-titulo">Partes que nos has dado</h3>
      <ul className="cartera">
        {partes.map((p) => {
          const { texto, enCompania } = textoEstado(p)
          return (
            <li key={p.id} className="cartera-card">
              <h3>{textoFecha(p.fechaHecho)}</h3>
              <div className="linea">{primeraLinea(p.descripcion)}</div>

              {/* Mientras no esté en la compañía, el plazo del art. 16 sigue
                  corriendo de verdad: la comunicación legal es a la entidad y
                  todavía no ha ocurrido. En cuanto está abierto, el reloj ha
                  parado y recordarlo solo asusta, así que no se pinta. */}
              {!enCompania &&
                (p.plazo.fueraDePlazo ? (
                  <div className="linea dicho ojo">{textoPlazo(p.plazo)}</div>
                ) : (
                  <div className="linea dicho">{textoPlazo(p.plazo)}</div>
                ))}

              <div className="chips">
                {/* 🚨 El chip verde SOLO cuando `comunicado` es `true`. No se
                    deduce de `estado !== 'enviado'`: ver la cabecera. */}
                <span className={enCompania ? 'chip ok' : 'chip aviso'}>{texto}</span>
              </div>
              {/* Sin tramitador, sin perito y sin referencia interna: eso es
                  gestión del corredor y no va en la vista del cliente (regla de
                  visibilidad, `CLAUDE.md` de la app). No están «vacíos»: no se
                  piden. */}
            </li>
          )
        })}
      </ul>
    </>
  )
}
