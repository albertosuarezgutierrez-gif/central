'use client'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'

import { DIAS_VIGENCIA } from '@central/module-seguros-portal'

/**
 * «Quién puede ver mis seguros» — la parte viva de la pantalla.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LO QUE ESTA PANTALLA NO PUEDE HACER: tranquilizar.
 *
 * Una autorización sirve para demostrar el consentimiento (art. 7.1 RGPD), y un
 * consentimiento que se pinta bonito no demuestra nada. De ahí las tres reglas
 * de copy que sostienen el fichero:
 *
 *   1. **El estado se dice con su CONSECUENCIA.** «Pendiente» a secas no dice
 *      nada; «pendiente de que lo acepte — todavía no ve nada» sí. El otorgante
 *      tiene que poder saber, de un vistazo, si la persona está viendo sus
 *      seguros ahora mismo o no.
 *   2. **`usos: []` es «no ha entrado todavía», y `usos` ausente es «no lo
 *      sabemos».** Son dos cosas distintas y la diferencia es toda la pantalla:
 *      un «sin actividad» (o peor, un check verde) sobre un registro que no nos
 *      ha llegado convierte un «no lo sé» en una afirmación falsa — la regla del
 *      `CLAUDE.md` de la raíz, aplicada al dato que más se mira aquí.
 *   3. **Aceptar dice lo que aceptas.** La segunda mitad de la doble aceptación
 *      no es un trámite: es lo que hace responsable a quien mira. Si el botón no
 *      dice que queda registrado, la autorización no vale para lo que existe.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No lee la BD ni conoce ninguna ficha: todo sale de `/api/autorizaciones`, que
 * es quien resuelve el vínculo de esta identidad. Los ids que se mandan de
 * vuelta al conceder son SIEMPRE los que vinieron en `candidatos`; esta pantalla
 * no compone ninguno.
 *
 * Móvil primero (≥320 px): una columna, tarjetas apiladas, nada de tablas, todo
 * lo pulsable por encima de 44 px y campos a 16 px (por debajo, Safari en
 * iPhone hace zoom al enfocar). Lo dan `.cartera`, `.boton`, `.campo` y
 * `.opcion` de `globals.css`.
 */

export type Alcance = 'ver' | 'ver_economico' | 'partes' | 'documentos'
export type EstadoAutorizacion = 'pendiente' | 'vigente' | 'caducada' | 'revocada'
/**
 * Qué es quien cede. Parte la pantalla en dos, y no por estética: de una PERSONA
 * solo se delega mirar (el RGPD protege a las personas físicas), mientras que una
 * SOCIEDAD no tiene datos personales y lo que delega es su gestión — su CIF y su
 * IBAN son datos de la empresa, y quien la representa los necesita para trabajar.
 * `null` en una fila ya concedida = **no lo sabemos** (su ficha no se pudo leer),
 * y entonces esta pantalla no afirma qué ve el autorizado.
 */
export type TipoOtorgante = 'fisica' | 'juridica'
/** Con qué título se representa a una sociedad. Se guarda cuál, y se dice cuál. */
export type TituloRepresentacion = 'administrador' | 'apoderado' | 'empleado_autorizado'

/**
 * Un día con visitas.
 *
 * `dia` llega por JSON, así que es la cadena que produce `Date.toJSON()` de la
 * ruta (ISO completo, medianoche UTC) — y **se formatea en UTC**, como el resto
 * de columnas `date` del portal (`lib/fechas.ts`): en cuanto se pinta en la zona
 * del navegador, «entró el 3» puede salir «el 2» para media Europa.
 */
type Uso = { dia: string; visitas: number }

type AutorizacionVista = {
  id: string
  alcance: Alcance
  estado: EstadoAutorizacion
  otorganteClienteId: string
  otorganteNombre: string | null
  /**
   * A quién se autorizó, cuando ES cliente de la correduría. `null` = no lo es,
   * y entonces lo que hay relleno es `autorizadoIdentidadId`: exactamente uno de
   * los dos, y lo obliga la BD.
   */
  autorizadoClienteId: string | null
  /**
   * Su identidad del portal, cuando NO es cliente. Se usa solo para SABER que
   * hay alguien detrás sin ficha; **nunca se pinta** —es un uuid— ni se pinta su
   * correo, que el portal ni siquiera guarda en claro.
   */
  autorizadoIdentidadId: string | null
  /**
   * `null` = no sabemos su nombre. Desde el 04/09/2026 eso pasa por DOS motivos
   * distintos y solo uno se puede decir con palabras: si viene
   * `autorizadoIdentidadId`, no hay ficha de la que sacarlo porque esa persona
   * no es cliente — eso sí lo sabemos, y se dice («una persona invitada»).
   */
  autorizadoNombre: string | null
  /**
   * La ÚNICA póliza que abre esta autorización. `null` = **todas las del
   * otorgante, también las que contrate mañana**, y la pantalla lo tiene que
   * decir con esas palabras: no es lo mismo prestar la del coche que la cartera
   * entera para siempre.
   */
  polizaId: string | null
  /**
   * Cómo se llama esa póliza. `null` cuando `polizaId` es `null` (no hay una) o
   * cuando ya no se puede leer — y entonces se dice «una póliza concreta», sin
   * inventarse cuál ni pintar el uuid.
   */
  polizaEtiqueta: string | null
  /** `null` = no consta (lo normal en una autorización de persona: ahí no se representa a nadie). */
  tituloRepresentacion: string | null
  /** `null` = no se ha podido leer la ficha de quien cede: no se afirma qué ve el autorizado. */
  tipoOtorgante: TipoOtorgante | null
  otorgadoEn: string
  aceptadoEn: string | null
  caducaEn: string
  revocadoEn: string | null
  /**
   * 🚨 `null` y `[]` NO son lo mismo, y el contrato lo dice explícitamente:
   * `null` = **no lo sabemos** (en las RECIBIDAS viene siempre así: el registro
   * de accesos de otro no te toca verlo); `[]` = **lo hemos mirado y no ha
   * entrado**. Colapsar los dos convertiría un «no lo sé» en la afirmación de
   * que nadie entró — que es justo el dato sobre el que se decide revocar.
   */
  usos: Uso[] | null
  /**
   * Si esta fila la puede revocar QUIEN MIRA. Viene del backend en las dos
   * listas y no se deduce aquí: en las recibidas, renunciar es un acto del
   * autorizado y solo el servidor sabe si lo admite. Sin este campo habría que
   * adivinarlo y pintar un botón que devuelve `no_te_toca`.
   */
  puedoRevocar: boolean
}

type Candidato = {
  otorganteClienteId: string
  otorganteNombre: string | null
  autorizadoClienteId: string
  autorizadoNombre: string | null
  tipoRelacion: string
  /** Los que ya ocupan sitio para esta pareja (pendientes o vigentes). */
  yaConcedidos: { alcance: Alcance; polizaId: string | null }[]
  /** Qué es la ficha DESDE la que se concede. Lo dice el backend; aquí no se adivina por el nombre. */
  tipoOtorgante: TipoOtorgante
  /**
   * Los alcances que ESTA ficha puede conceder, ya resueltos por el módulo puro.
   * La pantalla pinta esta lista: mantener aquí una copia del vocabulario es
   * cómo acaban discrepando el formulario y lo que el backend acepta.
   */
  alcancesPosibles: Alcance[]
  /**
   * Las pólizas VIVAS de la ficha que cede, para poder compartir UNA sola. Los
   * ids son los que el backend mandó y los mismos que vuelven en el POST: esta
   * pantalla no compone ninguno.
   *
   * Vacía = esa ficha no tiene hoy ninguna póliza viva, y entonces **no se
   * ofrece el desplegable**: un selector sin nada dentro se lee como «se ha
   * roto», y lo único que cabe conceder ahí es «todas».
   */
  polizas: { id: string; etiqueta: string }[]
}

/**
 * ¿Ese alcance sobre ESA póliza ya ocupa sitio para esta pareja? La póliza
 * forma parte de la pregunta: la clave del índice único de la BD es
 * (otorgante, autorizado, póliza, alcance), y una lista que ignorara la póliza
 * mentiría en las dos direcciones — desactivaría compartir la del coche porque
 * ya se compartió la de la casa, y daría por libre lo que no lo está.
 *
 * `''` en la pantalla es `null` en la BD: «toda la ficha». La traducción se
 * hace aquí y en un solo sitio, que es como no se desincroniza.
 */
function yaOcupado(candidato: Candidato, alcance: Alcance, polizaId: string): boolean {
  const cual = polizaId === '' ? null : polizaId
  return candidato.yaConcedidos.some((y) => y.alcance === alcance && y.polizaId === cual)
}

type Respuesta = {
  puedeAutorizar: boolean
  otorgadas: AutorizacionVista[]
  recibidas: AutorizacionVista[]
  candidatos: Candidato[]
}

type Carga = 'cargando' | 'listo' | 'error'

/** Los que se pueden conceder desde una ficha de PERSONA. De ahí solo se delega mirar. */
const CONCEDIBLES_FISICA: readonly Alcance[] = ['ver', 'ver_economico']

/** Los dos que son ACTUAR en nombre de otro. Solo salen desde una ficha de sociedad. */
const APODERAMIENTO: readonly Alcance[] = ['partes', 'documentos']

function esApoderamiento(a: Alcance): boolean {
  return APODERAMIENTO.includes(a)
}

/** Los tres títulos, en el orden en que se ofrecen (de más a menos poder). */
const TITULOS: readonly TituloRepresentacion[] = ['administrador', 'apoderado', 'empleado_autorizado']

/**
 * Cómo se dice cada título en pantalla. En femenino y masculino a la vez porque
 * la ficha no dice el género de nadie y suponerlo es inventarse un dato de una
 * persona real — el caso que motivó todo esto es «Pilar, administradora».
 */
const TITULO_TEXTO: Record<string, string> = {
  administrador: 'administrador/a',
  apoderado: 'apoderado/a',
  empleado_autorizado: 'empleado/a autorizado/a',
}

/** «como administrador/a», o `null` si no consta título (lo normal entre personas). */
function comoTitulo(t: string | null): string | null {
  if (t === null || t.trim() === '') return null
  return `como ${TITULO_TEXTO[t] ?? t}`
}

/**
 * Qué ve cada alcance, en el idioma de quien lo concede. No es la etiqueta del
 * enum: es la frase que le permite a José decidir. «ver_economico» dice que
 * incluye lo anterior porque en el módulo `completo` es un superconjunto de
 * `tarjeta`, y sin decirlo la gente marca las dos casillas «por si acaso».
 */
const QUE_VE: Record<Alcance, string> = {
  ver: 'los datos de la póliza, sin lo que pagas',
  ver_economico: 'los datos de la póliza y, además, la prima y los recibos',
  // Los dos de abajo no se conceden desde una ficha de PERSONA (son
  // apoderamiento, no lectura), pero pueden llegar en una fila antigua o del
  // CRM: se describen para no pintar el identificador crudo.
  partes: 'los datos de la póliza y dar partes',
  documentos: 'los datos de la póliza y sus documentos',
}

/**
 * 🚨 Lo mismo, cuando quien cede es una SOCIEDAD, y no es una variante de estilo:
 * las frases de arriba callan el IBAN y el CIF porque de una persona NUNCA se
 * enseñan, y de una empresa SÍ. Reutilizar aquel texto aquí sería prometer una
 * protección que no existe, que es exactamente lo que esta pantalla no puede hacer.
 */
const QUE_VE_SOCIEDAD: Record<Alcance, string> = {
  ver: 'los datos de las pólizas de la sociedad, sin lo que paga',
  ver_economico:
    'los datos de las pólizas y, además, lo que paga la sociedad: primas, recibos, su CIF y la cuenta bancaria de los cobros',
  partes: 'los datos de las pólizas y puede DAR PARTES en nombre de la sociedad',
  documentos: 'los datos de las pólizas y sus documentos, y puede subir documentación por la sociedad',
}

/** `tipo` desconocido → la versión de persona: describe el alcance sin prometer nada de más. */
function queVe(alcance: Alcance, tipo: TipoOtorgante | null): string {
  const tabla = tipo === 'juridica' ? QUE_VE_SOCIEDAD : QUE_VE
  return tabla[alcance] ?? alcance
}

/**
 * Las opciones del formulario, y son EXCLUYENTES a propósito: `ver_economico`
 * ya incluye todo lo de `ver` (el módulo lo deriva de `completo ⊃ tarjeta`), así
 * que ofrecerlas como dos casillas independientes proponía una combinación
 * redundante — y, peor, obligaba a dos POST, con la posibilidad de que el
 * segundo fallara y dejase el permiso concedido a medias sin que nadie lo dijera.
 * Un solo alcance por concesión, un solo POST.
 *
 * `partes` y `documentos` NO son otro grado de lo mismo: son actuar por la
 * sociedad, y por eso se describen con lo que le pasa a la empresa, no con lo
 * que se ve.
 */
const ETIQUETA_OPCION: Record<Alcance, string> = {
  ver: 'Solo ver sus seguros — la compañía, el número de póliza y las coberturas',
  ver_economico: 'Ver también lo que paga — la prima y los recibos',
  partes: 'Dar partes de siniestro en su nombre',
  documentos: 'Subir y ver su documentación',
}

const AYUDA_OPCION: Record<Alcance, string> = {
  ver: 'No ve nada de lo que se paga.',
  ver_economico: 'Incluye todo lo de la opción de arriba.',
  partes:
    'Lo que declare OBLIGA a la sociedad frente a la compañía: si el parte va mal, la que responde es la empresa.',
  documentos: 'Podrá ver y subir documentos de la sociedad. No incluye dar partes.',
}

/** Errores de `POST /api/autorizaciones`. Códigos → lo que la persona puede HACER. */
const ERROR_CONCEDER: Record<string, string> = {
  sin_sesion: 'Se ha cerrado tu sesión. Vuelve a entrar con tu email y lo intentamos otra vez.',
  datos_invalidos: 'Falta algún dato: elige a la persona y marca al menos qué puede ver.',
  alcance_no_disponible:
    'Ese permiso no se puede dar desde esa ficha. Desde una ficha de persona solo se puede dejar MIRAR: dar partes o manejar documentos en tu nombre es actuar por ti, y eso solo lo delega una sociedad en quien la representa.',
  titulo_requerido:
    'Falta decir con qué título representa a la sociedad: administrador, apoderado o empleado autorizado. Sin eso no se puede anotar, porque lo que esa persona declare obliga a la empresa.',
  ficha_no_tuya: 'Esa ficha no es tuya, así que no podemos dar acceso a sus seguros desde tu cuenta.',
  nivel_insuficiente:
    'Sobre esa ficha no eres tú quien puede dar acceso: solo su titular puede ceder sus datos.',
  sin_relacion:
    'No nos consta la relación entre vosotros, así que no podemos darle acceso. Escríbenos y lo damos de alta.',
  ya_concedida: 'Ese acceso ya estaba concedido. Lo verás en la lista de arriba.',
  poliza_no_es_tuya:
    'Esa póliza ya no está en la ficha desde la que querías compartirla. Vuelve a cargar la pantalla y elige de la lista otra vez.',
}

/** Errores de `POST /api/autorizaciones/[id]`. */
const ERROR_ACCION: Record<string, string> = {
  sin_sesion: 'Se ha cerrado tu sesión. Vuelve a entrar con tu email y lo intentamos otra vez.',
  datos_invalidos: 'No hemos entendido la petición. Vuelve a cargar la pantalla e inténtalo otra vez.',
  no_encontrada: 'Esa autorización ya no existe. Vuelve a cargar la pantalla.',
  no_te_toca: 'Esa autorización no es tuya, así que no podemos tocarla desde tu cuenta.',
  ya_revocada: 'Ya estaba revocada: esa persona no ve nada.',
  no_pendiente: 'Esa autorización ya no está pendiente. Vuelve a cargar la pantalla para verla como está.',
}

function textoError(tabla: Record<string, string>, codigo: unknown, mensaje: unknown): string {
  if (typeof codigo === 'string' && tabla[codigo]) return tabla[codigo]
  // Un código que no conocemos NO se adivina: se dice literal, que es honesto y
  // le sirve al soporte. Si el backend mandó una frase, esa manda.
  if (typeof mensaje === 'string' && mensaje.trim() !== '') return mensaje
  const c = typeof codigo === 'string' ? ` (${codigo})` : ''
  return `No hemos podido hacerlo${c}. Inténtalo otra vez dentro de un momento.`
}

const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Fecha en español legible («3 de septiembre de 2026»), nunca en ISO.
 *
 * Un `YYYY-MM-DD` es un DÍA, sin hora ni zona: se fuerza medianoche UTC y se
 * formatea en UTC para que el 3 no salga como el 2. Una marca de tiempo
 * completa sí se pinta en la zona de quien mira, que es la que le dice cuándo
 * pasó de verdad.
 */
function fechaLarga(v: string | null | undefined): string | null {
  if (!v) return null
  const dia = SOLO_DIA.test(v)
  const d = new Date(dia ? `${v}T00:00:00Z` : v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(dia ? { timeZone: 'UTC' } : {}),
  })
}

/**
 * Un día de acceso → `Date`. Acepta las dos formas en que puede venir el mismo
 * dato: `YYYY-MM-DD` y el ISO completo de `Date.toJSON()` (que es lo que manda
 * hoy la ruta). `null` si no es ninguna de las dos: un día ilegible se calla, no
 * se inventa.
 */
function aDia(v: string): Date | null {
  const d = new Date(SOLO_DIA.test(v) ? `${v}T00:00:00Z` : v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** «3 de septiembre» (con el año solo si no es este, que sería ruido). */
function diaCorto(v: string, anioActual: number): string {
  const d = aDia(v)
  if (d === null) return v
  const conAnio = d.getUTCFullYear() !== anioActual
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    ...(conAnio ? { year: 'numeric' } : {}),
  })
}

/** «el 3 y el 12 de septiembre» cuando todo cae en el mismo mes; si no, cada día entero. */
function enumerarDias(usos: readonly Uso[], anioActual: number): string {
  const fechas = usos
    .map((u) => aDia(u.dia))
    .filter((d): d is Date => d !== null)
  const mismoMes =
    fechas.length > 1 &&
    fechas.every(
      (d) => d.getUTCMonth() === fechas[0].getUTCMonth() && d.getUTCFullYear() === fechas[0].getUTCFullYear(),
    )

  const trozos = mismoMes
    ? fechas.map((d) => String(d.getUTCDate()))
    : usos.map((u) => diaCorto(u.dia, anioActual))

  const unidos =
    trozos.length === 1
      ? trozos[0]
      : `${trozos.slice(0, -1).join(', ')} y ${trozos[trozos.length - 1]}`

  if (!mismoMes) return unidos
  const mes = fechas[0].toLocaleDateString('es-ES', {
    month: 'long',
    timeZone: 'UTC',
    ...(fechas[0].getUTCFullYear() !== anioActual ? { year: 'numeric' } : {}),
  })
  return `${unidos} de ${mes}`
}

function nombreDe(v: string | null, porDefecto: string): string {
  const n = (v ?? '').trim()
  return n === '' ? porDefecto : n
}

/**
 * Cómo se llama en pantalla quien recibe el acceso.
 *
 * 🚨 Los dos huecos NO son el mismo hueco, y por eso no se dicen igual:
 *
 *   - Con `autorizadoIdentidadId` sabemos POR QUÉ no hay nombre: esa persona no
 *     es cliente de la correduría, así que no hay ficha de la que sacarlo. Eso
 *     se puede decir con palabras — «una persona invitada» — y es lo que le
 *     permite a José reconocer a quién se lo dio.
 *   - Sin ninguno de los dos es un «no lo sabemos» de verdad (la ficha ya no se
 *     lee o está fusionada), y ahí solo cabe la fórmula vaga de siempre.
 *
 * Lo que NUNCA sale es su correo ni su uuid: el portal guarda el primero
 * hasheado justo para no poder enseñárselo a nadie.
 *
 * Devuelve la forma de MEDIA frase («…el acceso de una persona invitada»); para
 * abrir un encabezado se pasa por `enCabeza`.
 */
function nombreAutorizado(a: AutorizacionVista): string {
  const n = (a.autorizadoNombre ?? '').trim()
  if (n !== '') return n
  return a.autorizadoIdentidadId !== null ? 'una persona invitada' : 'alguien de tu entorno'
}

/** Mayúscula inicial, para cuando la etiqueta abre un encabezado. Un nombre real no se toca. */
function enCabeza(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function Autorizaciones() {
  const uid = useId()
  const [carga, setCarga] = useState<Carga>('cargando')
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      const r = await fetch('/api/autorizaciones', { cache: 'no-store' })
      if (r.status === 401) {
        setCarga('error')
        setErrorCarga('Se ha cerrado tu sesión. Vuelve a entrar con tu email para ver quién tiene acceso.')
        return
      }
      if (!r.ok) {
        // Un fallo NO se pinta como «no tienes ninguna»: eso convertiría un
        // error de red en la afirmación de que nadie ve tus seguros.
        setCarga('error')
        setErrorCarga('No hemos podido cargar quién tiene acceso a tus seguros. Vuelve a intentarlo.')
        return
      }
      setDatos((await r.json()) as Respuesta)
      setCarga('listo')
    } catch {
      setCarga('error')
      setErrorCarga('No hemos podido cargar quién tiene acceso: comprueba tu conexión e inténtalo otra vez.')
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (carga === 'cargando') {
    return (
      <section className="seccion" aria-busy="true">
        <p className="suave" style={{ margin: 0 }}>
          Cargando quién puede ver tus seguros…
        </p>
      </section>
    )
  }

  if (carga === 'error' || datos === null) {
    return (
      <section className="seccion">
        <p className="editor-error" role="alert" style={{ marginTop: 0 }}>
          {errorCarga ?? 'No hemos podido cargar quién tiene acceso a tus seguros.'}
        </p>
        <button type="button" className="boton" onClick={() => void cargar()}>
          Volver a intentarlo
        </button>
      </section>
    )
  }

  return (
    <>
      <Otorgadas uid={uid} lista={datos.otorgadas} onCambio={cargar} />
      <Recibidas uid={uid} lista={datos.recibidas} onCambio={cargar} />
      <Conceder
        uid={uid}
        puedeAutorizar={datos.puedeAutorizar}
        candidatos={datos.candidatos}
        onConcedida={cargar}
      />
    </>
  )
}

/* ── 1. Has dado acceso a ──────────────────────────────────────────────── */

function Otorgadas({
  uid,
  lista,
  onCambio,
}: {
  uid: string
  lista: readonly AutorizacionVista[]
  onCambio: () => Promise<void>
}) {
  return (
    <section className="seccion" aria-labelledby={`${uid}-otorgadas`}>
      <h2 id={`${uid}-otorgadas`}>Has dado acceso a</h2>
      {lista.length === 0 ? (
        // «No le has dado acceso a nadie» es una afirmación sobre TUS actos, que
        // sí sabemos. No se dice «nadie ve tus seguros»: de lo que otros hayan
        // hecho con sus propias fichas no habla esta lista.
        <p className="suave" style={{ margin: 0 }}>
          No le has dado acceso a tus seguros a nadie.
        </p>
      ) : (
        <ul className="cartera">
          {lista.map((a) => (
            <TarjetaOtorgada key={a.id} a={a} onCambio={onCambio} />
          ))}
        </ul>
      )}
    </section>
  )
}

function TarjetaOtorgada({ a, onCambio }: { a: AutorizacionVista; onCambio: () => Promise<void> }) {
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quien = nombreAutorizado(a)
  // Si consta título, se dice: «ve X — como administrador/a de la sociedad». Un
  // apoderamiento sin decir con qué título se ejerce es justo lo que la BD no deja guardar.
  const titulo = comoTitulo(a.tituloRepresentacion)
  // Revocable = lo dice el backend Y todavía queda algo que quitar. Una caducada
  // o una ya revocada no ve nada: un botón ahí solo confundiría.
  const activa = (a.estado === 'pendiente' || a.estado === 'vigente') && a.puedoRevocar

  async function revocar() {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch(`/api/autorizaciones/${encodeURIComponent(a.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'revocar' }),
      })
      if (r.ok) {
        setConfirmando(false)
        await onCambio()
        return
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown; mensaje?: unknown } | null
      setError(textoError(ERROR_ACCION, cuerpo?.error, cuerpo?.mensaje))
    } catch {
      setError('No hemos podido revocarlo: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <li className="cartera-card">
      <h3>{enCabeza(quien)}</h3>
      <div className="linea">
        Ve {queVe(a.alcance, a.tipoOtorgante)}
        {titulo ? ` — ${titulo} de la sociedad` : ''}.
      </div>
      <Ambito a={a} mias quien={quien} />
      <EstadoOtorgada a={a} quien={quien} />
      <Accesos a={a} quien={quien} />

      <div className="chips">
        <span className={a.estado === 'vigente' ? 'chip ok' : a.estado === 'pendiente' ? 'chip aviso' : 'chip'}>
          {a.estado === 'vigente'
            ? 'en vigor'
            : a.estado === 'pendiente'
              ? 'pendiente de que lo acepte'
              : a.estado === 'caducada'
                ? 'caducada'
                : 'revocada'}
        </span>
        <span className="chip">se lo diste el {fechaLarga(a.otorgadoEn) ?? '—'}</span>
      </div>

      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}

      {activa && !confirmando && (
        <div className="editor" style={{ marginTop: 12 }}>
          <button type="button" className="boton secundario" onClick={() => setConfirmando(true)}>
            Revocar el acceso de {quien}
          </button>
        </div>
      )}

      {activa && confirmando && (
        <div className="aviso-linea">
          <strong>¿Le quitas el acceso a {quien}?</strong> Deja de ver tus seguros ahora mismo. Queda el
          registro de lo que miró mientras lo tuvo, y podrás volver a dárselo cuando quieras.
          <div className="editor-acciones" style={{ marginTop: 10 }}>
            <button type="button" className="boton" onClick={() => void revocar()} disabled={enviando}>
              {enviando ? 'Revocando…' : 'Sí, revocar'}
            </button>
            <button
              type="button"
              className="boton secundario"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
            >
              No, dejarlo como está
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * 🚨 SOBRE QUÉ va esta autorización, que hasta el 04/09/2026 no se podía elegir
 * y por eso no se decía.
 *
 * `polizaId === null` **no es «no lo sabemos»**: es TODAS las pólizas del
 * otorgante, y además las que contrate más adelante, sin volver a autorizar
 * nada. Resumirlo como «sus seguros» dejaría a José creyendo que prestó la del
 * coche cuando ha prestado la cartera entera para siempre — que es exactamente
 * la diferencia sobre la que decide si revoca. Por eso lleva `.ojo`: no es un
 * detalle, es el alcance.
 *
 * Con `polizaId` y sin `polizaEtiqueta` legible (la póliza se fusionó, o ya no
 * se puede leer) se dice «una póliza concreta» y se admite que no sabemos cuál.
 * Nunca se pinta el uuid ni se adivina un nombre.
 */
function Ambito({ a, mias, quien }: { a: AutorizacionVista; mias: boolean; quien: string }) {
  if (a.polizaId === null) {
    return (
      <div className="linea dicho ojo">
        Alcanza a <strong>{mias ? 'todas tus pólizas' : `todas las pólizas de ${quien}`}</strong>, también a
        las que {mias ? 'contrates' : 'contrate'} más adelante.
      </div>
    )
  }
  return (
    <div className="linea dicho">
      Alcanza <strong>solo a {a.polizaEtiqueta ?? 'una póliza concreta'}</strong>
      {a.polizaEtiqueta === null ? ' (no hemos podido leer cuál es)' : ''}.{' '}
      {mias ? 'El resto de tus seguros no los ve.' : 'El resto de sus seguros no los ves.'}
    </div>
  )
}

/**
 * 🚨 El estado CON su consecuencia. Nunca la palabra suelta: lo que el otorgante
 * necesita saber es si esa persona está viendo sus seguros ahora o no.
 */
function EstadoOtorgada({ a, quien }: { a: AutorizacionVista; quien: string }) {
  if (a.estado === 'pendiente') {
    const caduca = fechaLarga(a.caducaEn)
    return (
      <div className="linea dicho ojo">
        Pendiente de que {quien} lo acepte — <strong>todavía no ve nada</strong>
        {caduca ? `. Si no lo acepta antes del ${caduca}, se queda en nada.` : '.'}
      </div>
    )
  }
  if (a.estado === 'vigente') {
    const caduca = fechaLarga(a.caducaEn)
    return (
      <div className="linea dicho">
        En vigor{caduca ? ` hasta el ${caduca}` : ''} — lo aceptó
        {fechaLarga(a.aceptadoEn) ? ` el ${fechaLarga(a.aceptadoEn)}` : ''}.
      </div>
    )
  }
  if (a.estado === 'caducada') {
    const caduca = fechaLarga(a.caducaEn)
    return (
      <div className="linea dicho">
        Caducada{caduca ? ` el ${caduca}` : ''} — <strong>ya no ve nada</strong>. Si quieres, vuelve a
        dárselo abajo.
      </div>
    )
  }
  const revocada = fechaLarga(a.revocadoEn)
  return (
    <div className="linea dicho">
      Revocada{revocada ? ` el ${revocada}` : ''} — <strong>ya no ve nada</strong>.
    </div>
  )
}

/**
 * 🚨 EL registro de accesos, que es lo que hace demostrable el consentimiento.
 *
 * Tres estados, no dos:
 *   - `usos === null` → «no lo sabemos». NO se pinta como que no entró.
 *   - `usos` vacío    → «no ha entrado todavía». NUNCA «sin actividad» ni un
 *                       check verde: no entrar no es que todo vaya bien, es un
 *                       hecho neutro que el otorgante tiene derecho a saber.
 *   - con contenido   → los días, dichos en cristiano.
 *
 * Solo se pinta en las OTORGADAS. En las recibidas el contrato manda `null`
 * siempre (el registro de accesos de otro no te toca verlo) y ahí no se
 * menciona el registro: ni «no ha entrado» ni «no lo sabemos» — las dos frases
 * hablarían de un dato que no es de quien mira.
 */
function Accesos({ a, quien }: { a: AutorizacionVista; quien: string }) {
  const anioActual = useMemo(() => new Date().getFullYear(), [])

  if (a.usos === null) {
    return (
      <div className="linea dicho">
        No sabemos si {quien} ha entrado a mirar: no tenemos aquí el registro de accesos.
      </div>
    )
  }
  if (a.usos.length === 0) {
    if (a.estado === 'pendiente') {
      return <div className="linea dicho">No ha entrado a mirar: todavía no lo ha aceptado.</div>
    }
    return <div className="linea dicho">No ha entrado a mirar tus seguros todavía.</div>
  }

  // Se enseñan los últimos días, no todos: una lista de cincuenta fechas en el
  // móvil no la lee nadie, y el total sí se dice entero para no dar la
  // impresión de que entró menos veces de las que entró.
  const MAX = 8
  const mostrados = a.usos.slice(-MAX)
  const visitas = a.usos.reduce((t, u) => t + u.visitas, 0)
  const dias = enumerarDias(mostrados, anioActual)
  const omitidos = a.usos.length - mostrados.length

  return (
    <div className="linea dicho">
      Miró tus seguros el {dias}
      {omitidos > 0 ? ` (y ${omitidos} ${omitidos === 1 ? 'día más' : 'días más'} antes)` : ''} —{' '}
      {visitas === 1 ? '1 visita' : `${visitas} visitas`} en total.
    </div>
  )
}

/* ── 2. Te han dado acceso a ───────────────────────────────────────────── */

function Recibidas({
  uid,
  lista,
  onCambio,
}: {
  uid: string
  lista: readonly AutorizacionVista[]
  onCambio: () => Promise<void>
}) {
  return (
    <section className="seccion" aria-labelledby={`${uid}-recibidas`}>
      <h2 id={`${uid}-recibidas`}>Te han dado acceso a</h2>
      {lista.length === 0 ? (
        <p className="suave" style={{ margin: 0 }}>
          Nadie te ha dado acceso a sus seguros.
        </p>
      ) : (
        <ul className="cartera">
          {lista.map((a) => (
            <TarjetaRecibida key={a.id} a={a} onCambio={onCambio} />
          ))}
        </ul>
      )}
    </section>
  )
}

function TarjetaRecibida({ a, onCambio }: { a: AutorizacionVista; onCambio: () => Promise<void> }) {
  const [enviando, setEnviando] = useState<'aceptar' | 'revocar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoRenuncia, setConfirmandoRenuncia] = useState(false)

  const quien = nombreDe(a.otorganteNombre, 'Una persona de tu entorno')

  async function responder(accion: 'aceptar' | 'revocar') {
    setEnviando(accion)
    setError(null)
    try {
      const r = await fetch(`/api/autorizaciones/${encodeURIComponent(a.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      if (r.ok) {
        await onCambio()
        return
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown; mensaje?: unknown } | null
      setError(textoError(ERROR_ACCION, cuerpo?.error, cuerpo?.mensaje))
    } catch {
      setError('No hemos podido guardarlo: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(null)
    }
  }

  return (
    <li className="cartera-card">
      <h3>Los seguros de {quien}</h3>
      <LoQuePuedes a={a} />
      <Ambito a={a} mias={false} quien={quien} />

      {a.estado === 'pendiente' && (
        <>
          <div className="linea dicho ojo">
            Pendiente de que lo aceptes — <strong>todavía no ves nada</strong>.
          </div>
          {/* 🚨 La mitad que hace que la autorización valga. Sin esta frase,
              alguien entra en los datos de otro sin saber que existe un registro
              con su nombre, y ese registro es justo lo que le hace responsable
              de lo que mire. No se suaviza. */}
          <div className="aviso-linea">
            Si lo aceptas, <strong>queda registrado que has accedido a los datos de otra persona</strong>:
            se guarda quién eres, cuándo lo aceptaste y cada día que entres a mirar. {quien} puede ver ese
            registro y quitarte el acceso cuando quiera.
          </div>
          {/* Y si lo que aceptas es representar a una sociedad, lo que se asume
              no es solo mirar: es que lo que declares obliga a la empresa. Decir
              solo «queda registrado» aquí se quedaría corto. */}
          {esApoderamiento(a.alcance) && (
            <div className="aviso-linea">
              Y aceptas <strong>actuar en nombre de {quien}</strong>
              {comoTitulo(a.tituloRepresentacion) ? `, ${comoTitulo(a.tituloRepresentacion)}` : ''}:{' '}
              {a.alcance === 'partes'
                ? 'lo que declares en un parte obliga a la sociedad frente a la compañía.'
                : 'los documentos que subas se presentan por la sociedad.'}
            </div>
          )}
          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}
          <div className="editor-acciones" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="boton"
              onClick={() => void responder('aceptar')}
              disabled={enviando !== null}
            >
              {enviando === 'aceptar' ? 'Aceptando…' : 'Aceptar y que quede registrado'}
            </button>
            <button
              type="button"
              className="boton secundario"
              onClick={() => void responder('revocar')}
              disabled={enviando !== null}
            >
              {enviando === 'revocar' ? 'Rechazando…' : 'Rechazar'}
            </button>
          </div>
        </>
      )}

      {a.estado === 'vigente' && (
        <>
          <div className="linea dicho">
            En vigor{fechaLarga(a.caducaEn) ? ` hasta el ${fechaLarga(a.caducaEn)}` : ''} — sus pólizas te
            salen en «Mis seguros». Cada vez que entras queda registrado, y {quien} puede quitártelo cuando
            quiera.
          </div>

          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}

          {/* Renunciar. El botón lo autoriza el BACKEND (`puedoRevocar`), no una
              suposición de la pantalla: si el servidor no admite que renuncie el
              autorizado, aquí no hay botón que devuelva `no_te_toca`. Y existe
              porque mirar los datos de otro es una responsabilidad, no un
              premio: quien ya no quiere tenerla tiene que poder soltarla sin
              pedirle el favor al otro. */}
          {a.puedoRevocar && !confirmandoRenuncia && (
            <div className="editor" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="boton secundario"
                onClick={() => setConfirmandoRenuncia(true)}
              >
                Renunciar a este acceso
              </button>
            </div>
          )}

          {a.puedoRevocar && confirmandoRenuncia && (
            <div className="aviso-linea">
              <strong>¿Renuncias a ver los seguros de {quien}?</strong> Dejas de verlos ahora mismo. Queda
              el registro de lo que miraste mientras lo tuviste, y {quien} tendrá que dártelo otra vez si
              vuelve a hacer falta.
              <div className="editor-acciones" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="boton"
                  onClick={() => void responder('revocar')}
                  disabled={enviando !== null}
                >
                  {enviando === 'revocar' ? 'Renunciando…' : 'Sí, renunciar'}
                </button>
                <button
                  type="button"
                  className="boton secundario"
                  onClick={() => setConfirmandoRenuncia(false)}
                  disabled={enviando !== null}
                >
                  No, dejarlo como está
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {a.estado === 'caducada' && (
        <div className="linea dicho">
          Caducada{fechaLarga(a.caducaEn) ? ` el ${fechaLarga(a.caducaEn)}` : ''} —{' '}
          <strong>ya no ves sus seguros</strong>. Si los necesitas, pídele que te lo dé otra vez.
        </div>
      )}

      {a.estado === 'revocada' && (
        <div className="linea dicho">
          Revocada{fechaLarga(a.revocadoEn) ? ` el ${fechaLarga(a.revocadoEn)}` : ''} —{' '}
          <strong>ya no ves sus seguros</strong>.
        </div>
      )}

      {a.estado !== 'pendiente' && a.estado !== 'vigente' && error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

/**
 * 🚨 Qué puedes hacer TÚ con lo que te han dado — y las TRES versiones, porque
 * las tres son verdad en casos distintos y decir la de otro es mentir:
 *
 *   - Cede una PERSONA → solo mirar, y nunca su DNI, su IBAN ni sus documentos.
 *     Eso lo garantiza el módulo puro (`NUNCA_A_UN_TERCERO`), no esta pantalla.
 *   - Cede una SOCIEDAD → sí ves lo que paga, su CIF y su cuenta, y con `partes`
 *     puedes obligarla. Repetir aquí la frase de la persona prometería una
 *     protección que no existe.
 *   - No sabemos qué cede (`tipoOtorgante === null`, su ficha no se pudo leer) →
 *     se describe el alcance y se calla lo demás. No se afirma ni lo uno ni lo otro.
 */
function LoQuePuedes({ a }: { a: AutorizacionVista }) {
  const titulo = comoTitulo(a.tituloRepresentacion)
  if (a.tipoOtorgante === 'juridica' || esApoderamiento(a.alcance)) {
    return (
      <div className="linea">
        Te deja ver {queVe(a.alcance, 'juridica')}
        {titulo ? ` — actúas ${titulo} de la sociedad` : ''}.{' '}
        {esApoderamiento(a.alcance)
          ? 'No puedes autorizar a nadie más.'
          : 'Solo mirar: no puedes dar partes ni cambiar nada, ni autorizar a nadie más.'}
      </div>
    )
  }
  if (a.tipoOtorgante === 'fisica') {
    return (
      <div className="linea">
        Te deja ver {queVe(a.alcance, 'fisica')}. Solo mirar: no puedes dar partes ni cambiar nada suyo,
        y no ves su DNI, su IBAN ni sus documentos.
      </div>
    )
  }
  return (
    <div className="linea">
      Te deja ver {queVe(a.alcance, null)}. Solo mirar: no puedes dar partes ni cambiar nada suyo.
    </div>
  )
}

/* ── 3. Dar acceso a alguien ───────────────────────────────────────────── */

/** La clave de un candidato: el par de fichas, que es lo que identifica la relación. */
function claveCandidato(c: Candidato): string {
  return `${c.otorganteClienteId}|${c.autorizadoClienteId}`
}

function Conceder({
  uid,
  puedeAutorizar,
  candidatos,
  onConcedida,
}: {
  uid: string
  puedeAutorizar: boolean
  candidatos: readonly Candidato[]
  onConcedida: () => Promise<void>
}) {
  const [seleccion, setSeleccion] = useState('')
  // Un solo alcance, no un conjunto: `ver_economico` ya incluye lo de `ver`.
  // `''` = todavía no ha elegido, que NO es lo mismo que haber elegido el menor.
  const [alcance, setAlcance] = useState<Alcance | ''>('')
  // Qué se comparte. `''` = TODAS las pólizas de la ficha, que es lo que
  // significaba cualquier autorización antes del 04/09/2026 y por eso es el
  // valor de salida. Aquí `''` sí es una respuesta (no un «sin contestar» como
  // el alcance): lo que no puede pasar es que se conceda sin decirlo, y de eso
  // se encarga el aviso de abajo, que está SIEMPRE a la vista.
  const [polizaId, setPolizaId] = useState('')
  // Con qué título representa a la sociedad. `''` = sin contestar; no hay valor
  // por defecto, porque «administrador» es el título más fuerte de los tres y
  // preseleccionarlo sería que la pantalla firmara un poder por alguien.
  const [titulo, setTitulo] = useState<TituloRepresentacion | ''>('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidato = candidatos.find((c) => claveCandidato(c) === seleccion) ?? null
  // Quien cede es una SOCIEDAD: entonces —y solo entonces— se ofrece delegar la
  // gestión, no solo mirar.
  const esSociedad = candidato?.tipoOtorgante === 'juridica'
  // La lista la manda el backend. Si llegara vacía (una versión desplegada más
  // vieja del puerto), se cae a los dos de LECTURA: el lado restrictivo, nunca
  // un apoderamiento ofrecido por un hueco en la respuesta.
  const opciones: readonly Alcance[] =
    candidato && candidato.alcancesPosibles?.length ? candidato.alcancesPosibles : CONCEDIBLES_FISICA

  // Con varias fichas propias (José como particular y como autónomo, por
  // ejemplo) hay que decir DESDE CUÁL se concede: si no, dos entradas con el
  // mismo nombre de destinatario son indistinguibles.
  const variasFichas = new Set(candidatos.map((c) => c.otorganteClienteId)).size > 1

  function elegir(clave: string) {
    setSeleccion(clave)
    // El alcance y el título se reinician al cambiar de persona: lo elegido para
    // uno no es una respuesta sobre otro, y un título que se quedara puesto
    // acabaría anotando como apoderada a quien nadie dijo que lo fuera.
    setAlcance('')
    setTitulo('')
    // Y la póliza más aún: las de una ficha no son las de otra, así que un id
    // que se quedara puesto sería el de una póliza que no es del nuevo otorgante
    // — lo rechazaría el backend, pero después de que la persona creyera haber
    // compartido justo lo que quería.
    setPolizaId('')
    setError(null)
  }

  /**
   * Cambiar de póliza puede dejar marcado un alcance que YA está concedido sobre
   * ESA. Se suelta en vez de dejar marcada una opción que el formulario ya no
   * admite: un radio `checked` y `disabled` a la vez es una elección que no se
   * puede deshacer.
   */
  function elegirPoliza(v: string) {
    setPolizaId(v)
    if (alcance !== '' && candidato !== null && yaOcupado(candidato, alcance, v)) setAlcance('')
    setError(null)
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (candidato === null) {
      setError('Elige primero a quién le das acceso.')
      return
    }
    if (alcance === '') {
      setError('Elige qué puede ver.')
      return
    }
    // Más estricto que la BD a propósito: el CHECK solo exige el título para
    // «partes» y «documentos», pero si quien cede es una sociedad, decir con qué
    // título actúa esa persona es gratis y es lo que después se puede enseñar.
    if (esSociedad && titulo === '') {
      setError('Elige con qué título representa a la sociedad.')
      return
    }

    setEnviando(true)
    setError(null)
    try {
      // UNA sola llamada. Elegir `ver_economico` teniendo ya `ver` es una
      // ampliación legítima y se manda tal cual: es el backend quien decide si
      // convive con la anterior o la sustituye, no esta pantalla.
      const r = await fetch('/api/autorizaciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          otorganteClienteId: candidato.otorganteClienteId,
          autorizadoClienteId: candidato.autorizadoClienteId,
          alcance,
          // Solo cuando se comparte UNA. Omitirlo es lo que significa «todas»,
          // y se omite en vez de mandar `null` explícito para que el cuerpo
          // diga lo mismo que la pantalla: no se ha elegido ninguna en concreto.
          ...(polizaId !== '' ? { polizaId } : {}),
          // Solo cuando cede una sociedad. En una ficha de persona el backend lo
          // descarta igualmente: ahí no se representa a nadie.
          ...(esSociedad && titulo !== '' ? { tituloRepresentacion: titulo } : {}),
        }),
      })
      if (r.status !== 201) {
        const cuerpo = (await r.json().catch(() => null)) as { error?: unknown; mensaje?: unknown } | null
        setError(textoError(ERROR_CONCEDER, cuerpo?.error, cuerpo?.mensaje))
        return
      }
      setSeleccion('')
      setAlcance('')
      setTitulo('')
      setPolizaId('')
      await onConcedida()
    } catch {
      // No se sabe si llegó a grabarse: se recarga para que la lista de arriba
      // sea la que mande, en vez de dejar a la persona creyendo que no se hizo.
      setError('No hemos podido guardarlo: comprueba tu conexión y mira arriba si se ha concedido.')
      await onConcedida()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="seccion" aria-labelledby={`${uid}-conceder`}>
      <h2 id={`${uid}-conceder`}>Dar acceso a alguien</h2>

      {!puedeAutorizar ? (
        // No es «no se puede»: es que quien cede los datos tiene que ser su
        // dueño. Se dice el porqué para que no parezca una avería.
        <p className="suave" style={{ margin: 0 }}>
          Solo el titular de la ficha puede dar acceso a sus seguros, y tu acceso a esta cartera no es el
          del titular. Si crees que debería serlo, escríbenos y lo revisamos.
        </p>
      ) : candidatos.length === 0 ? (
        <p className="suave" style={{ margin: 0 }}>
          No tenemos registrada a nadie de tu entorno con quien puedas compartir tus seguros. Escríbenos
          diciéndonos a quién quieres dar acceso y lo damos de alta.
        </p>
      ) : (
        <form className="editor-form" onSubmit={enviar} noValidate>
          <div className="editor-campo">
            <label htmlFor={`${uid}-persona`}>A quién</label>
            <p className="editor-ayuda" id={`${uid}-persona-ayuda`}>
              Solo sale quien ya nos consta como parte de tu entorno. Si falta alguien, escríbenos.
            </p>
            <select
              id={`${uid}-persona`}
              className="campo"
              value={seleccion}
              onChange={(e) => elegir(e.target.value)}
              aria-describedby={`${uid}-persona-ayuda`}
              disabled={enviando}
            >
              <option value="">Elige a la persona…</option>
              {candidatos.map((c) => (
                <option key={claveCandidato(c)} value={claveCandidato(c)}>
                  {nombreDe(c.autorizadoNombre, 'Sin nombre')} · {c.tipoRelacion}
                  {variasFichas ? ` · desde ${nombreDe(c.otorganteNombre, 'tu ficha')}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 🚨 QUÉ se comparte, antes de CUÁNTO se ve de ello: primero se elige
              el objeto y después el detalle, que es como se piensa la decisión.
              El desplegable solo sale si hay algo que elegir — con la lista
              vacía, un selector con una sola opción se lee como «se ha roto» y
              encima insinuaría que hay pólizas que no salen. */}
          {candidato !== null && candidato.polizas.length > 0 && (
            <div className="editor-campo">
              <label htmlFor={`${uid}-poliza`}>Qué le dejas ver</label>
              <p className="editor-ayuda" id={`${uid}-poliza-ayuda`}>
                Puedes darle acceso a toda tu cartera o solo a una póliza — por ejemplo, la del coche que
                conduce.
              </p>
              <select
                id={`${uid}-poliza`}
                className="campo"
                value={polizaId}
                onChange={(e) => elegirPoliza(e.target.value)}
                aria-describedby={`${uid}-poliza-ayuda`}
                disabled={enviando}
              >
                <option value="">Todas mis pólizas</option>
                {candidato.polizas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 🚨 Lo que «todas» significa de verdad, VISIBLE antes de conceder y
              no escondido en la letra pequeña: incluye las que se contraten
              después, sin volver a autorizar nada. Y cuando la ficha no tiene
              hoy ninguna póliza viva, eso es lo ÚNICO que se está concediendo:
              decir «todas» sin más ahí sonaría a nada y sería justo lo contrario. */}
          {candidato !== null && polizaId === '' && (
            <div className="aviso-linea">
              {candidato.polizas.length > 0 ? (
                <>
                  Le vas a dar acceso a <strong>todas las pólizas de esta ficha</strong>, también a{' '}
                  <strong>las que contrates más adelante</strong>: no hará falta autorizar nada otra vez
                  para que las vea. Si solo quieres compartir una, elígela arriba.
                </>
              ) : (
                <>
                  Ahora mismo no tenemos ninguna póliza viva en esta ficha, así que hoy no vería ninguna —
                  pero este acceso alcanza a <strong>las que contrates más adelante</strong> sin volver a
                  autorizar nada.
                </>
              )}
            </div>
          )}

          {candidato !== null && (
            /* Radios y no casillas: son dos niveles de lo MISMO, no dos permisos
               que se sumen. Las dos a la vista para que se lea que la segunda
               incluye a la primera, y ninguna marcada de salida — un valor por
               defecto aquí sería una decisión tomada por la pantalla sobre los
               datos de alguien. */
            <fieldset className="editor-campo grupo">
              <legend>{esSociedad ? 'Qué puede hacer' : 'Qué puede ver'}</legend>
              <div className="opciones" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {opciones.map((x) => {
                  // 🚨 `yaConcedidos` trae la PÓLIZA de cada uno, y hay que
                  // compararla: bloquear con la lista a secas le negaría a José
                  // compartir la del coche porque ya compartió la de la casa.
                  // `polizaId === ''` en la pantalla es `null` en la BD, que es
                  // lo que significa «toda la ficha». La comparación es
                  // exactamente la clave del índice único, ni más ni menos.
                  const ya = yaOcupado(candidato, x, polizaId)
                  return (
                    <label key={x} className="opcion" style={{ alignItems: 'flex-start' }}>
                      <input
                        type="radio"
                        name={`${uid}-alcance`}
                        value={x}
                        // Lo ya concedido no se vuelve a conceder: se bloquea y
                        // se dice dónde se quita (arriba, que es donde queda
                        // registro de la revocación).
                        checked={alcance === x}
                        disabled={ya || enviando}
                        onChange={() => setAlcance(x)}
                        style={{ marginTop: 3 }}
                      />
                      <span style={{ minWidth: 0 }}>
                        {ETIQUETA_OPCION[x]}
                        <span className="editor-ayuda" style={{ display: 'block', fontWeight: 400 }}>
                          {ya ? 'Ya se lo has concedido. Para quitárselo, revócalo arriba.' : AYUDA_OPCION[x]}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {/* 🚨 Con qué título representa a la sociedad. Solo aparece cuando cede
              una JURÍDICA: preguntárselo a una persona no significa nada, y
              ofrecerlo daría a entender que puede apoderar, que es justo lo que
              no puede. Obligatorio: sin título, un parte dado en nombre de la
              empresa no se le puede oponer a la compañía. */}
          {candidato !== null && esSociedad && (
            <div className="editor-campo">
              <label htmlFor={`${uid}-titulo`}>Con qué título representa a la sociedad</label>
              <p className="editor-ayuda" id={`${uid}-titulo-ayuda`}>
                Queda guardado con la autorización: si esta persona actúa por la empresa, tiene que
                constar cómo.
              </p>
              <select
                id={`${uid}-titulo`}
                className="campo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value as TituloRepresentacion | '')}
                aria-describedby={`${uid}-titulo-ayuda`}
                disabled={enviando}
              >
                <option value="">Elige el título…</option>
                {TITULOS.map((t) => (
                  <option key={t} value={t}>
                    {TITULO_TEXTO[t]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 🚨 Lo que de verdad se está dando cuando quien cede es una SOCIEDAD.
              El párrafo general de esta pantalla dice «nunca ve tu DNI ni tu
              IBAN», y de una empresa eso es FALSO: su CIF y su cuenta son datos
              de la empresa, y quien la representa los necesita. Decirlo aquí no
              es un aviso legal de relleno: es la diferencia entre delegar la
              gestión de tu empresa y creer que solo dejas mirar. */}
          {candidato !== null && esSociedad && (
            <div className="aviso-linea">
              Quien represente a la sociedad <strong>sí ve lo que paga, su CIF y su cuenta bancaria</strong>
              : son datos de la empresa, no de una persona. Y si le das «dar partes»,{' '}
              <strong>lo que declare obliga a la sociedad</strong> frente a la compañía. Lo que no puede
              hacer nunca es autorizar a nadie más.
            </div>
          )}

          {/* Las dos cosas que hay que saber ANTES de conceder, no después. */}
          <p className="editor-ayuda" style={{ margin: 0 }}>
            El acceso <strong>caduca al año</strong> ({DIAS_VIGENCIA} días) y no se renueva solo: si sigue
            haciendo falta, se vuelve a dar. Puedes <strong>revocarlo en cualquier momento desde aquí</strong>
            . Hasta que la persona lo acepte, no ve nada.
          </p>

          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="boton"
            disabled={enviando || candidato === null || alcance === '' || (esSociedad && titulo === '')}
          >
            {enviando ? 'Guardando…' : 'Dar acceso'}
          </button>
        </form>
      )}
    </section>
  )
}
