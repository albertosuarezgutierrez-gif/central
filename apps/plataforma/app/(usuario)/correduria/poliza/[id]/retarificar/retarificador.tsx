'use client'

// La pantalla de retarificación, DENTRO de `/correduria` — la única que Alberto
// abre. Es un port del `retarificador.tsx` de `apps/asegura` (mismos tres pasos,
// mismo combustible antes de versión, mismas advertencias), cambiando solo por
// dónde habla: en vez de `/api/cartera/*` de asegura, las dos acciones de
// servidor de `./acciones.ts`, que son las que llevan el Bearer del puerto.
//
// 🚨 Los tipos de abajo (`Opcion`, `Reparo`, `Supuesto`, `Precio`, `Fallo`)
// están DUPLICADOS respecto de `apps/asegura/lib/codeoscopic/*` a propósito:
// plataforma y asegura son dos apps separadas que se comunican por el puerto
// HTTP y por nada más — importar de la otra las acoplaría en compilación y el
// `Typecheck · plataforma` del CI ni siquiera puede resolver su `@/lib/...`.
// La razón larga, y el precio de esa duplicación, están escritos al final de
// `apps/plataforma/lib/retarificar-asegura.ts`, que es de donde se importan
// aquí para que la copia sea UNA y no dos.

import { useEffect, useMemo, useState } from 'react'
import type { Opcion, Reparo, Supuesto, Precio, Fallo, TarificacionGuardadaAuto } from '@/lib/retarificar-asegura'
import { eur } from '@/lib/dinero'
import { pedirCatalogo, pedirCotizacion } from './acciones'
import { Emision } from './emision'

/**
 * Extrae el id de `seguros.tarificaciones` del `guardado` que devuelve el
 * embudo de asegura (`Guardado`: `{estado:'guardada', cotizacionId}` |
 * `{estado:'no_guardada'|'no_intentada', motivo}`). `unknown` a propósito
 * (viene de la OTRA app): solo se confía en la forma exacta, nunca se adivina.
 */
function cotizacionIdDe(guardado: unknown): string | null {
  if (typeof guardado !== 'object' || guardado === null) return null
  const g = guardado as Record<string, unknown>
  return g.estado === 'guardada' && typeof g.cotizacionId === 'string' ? g.cotizacionId : null
}

// La fecha de HOY en local (no `toISOString()`, que es UTC y puede dar el día
// de ayer/mañana según la hora): es el valor que Allianz acepta siempre — su
// 400 real es «no puede estar a más de 90 días vista», nunca por ser hoy.
function hoyISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Quita tildes y mayúsculas para comparar «Casado» con «CASADO».
 *  Espejo de `normalizarTexto()` de `apps/asegura/lib/codeoscopic/opciones.ts`. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * 🚨 El `eur()` de plataforma devuelve «0,00€» para lo que no es un número
 * finito, y eso aquí sería una MENTIRA: una prima que la compañía no ha
 * declarado es un «no lo sé», no un cero. Tres estados, no dos.
 */
function euroODash(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : eur(n)
}

/** Una versión vista en OTRA póliza de la misma matrícula. Es una PISTA para el
 *  corredor, no un código del vendor: nunca se autoselecciona. */
export type VersionCandidata = { version: string; procedencia: string }

/**
 * Lo que la ficha sabe del coche.
 *
 * ⚠️ En plataforma esto puede ser `null` ENTERO, y no es lo mismo que un coche
 * sin marca: el puerto de asegura sirve hoy los catálogos y la cotización, pero
 * **no la precalificación de la póliza**, así que desde aquí no se pueden
 * preseleccionar marca y modelo. `null` = «no se ha podido mirar», y la
 * pantalla lo DICE en vez de dejar dos desplegables en blanco que se leerían
 * como «la póliza no dice el coche».
 */
export type VehiculoConocido = {
  marca: string | null
  modelo: string | null
  versiones: VersionCandidata[]
}

/**
 * El contador de gasto de asegura (tope diario/mensual).
 *
 * TRES estados y no dos: `no_disponible` es «no se ha podido mirar» y **no se
 * pinta como «quedan 0»**. El tope de verdad lo sigue aplicando `cotizar()` al
 * otro lado — si salta, la respuesta es un 402 con `gastado: '0,00€'` — así que
 * no saberlo aquí no autoriza a bloquear el botón ni a inventar un número.
 */
export type Consumo =
  | { estado: 'ok'; veredicto: Veredicto; gastadoMes: string }
  | { estado: 'error'; error: string }
  | { estado: 'no_disponible'; porque: string }

export type Veredicto =
  | { permitido: true; restantesHoy: number; restantesMes: number }
  | {
      permitido: false
      motivo: 'tope-diario' | 'tope-mensual'
      consumidas: number
      tope: number
      explicacion: string
    }

type Resultado =
  | { estado: 'idle' }
  | { estado: 'cotizando' }
  | {
      estado: 'ok'
      coste: string
      /** `null` = no se ha mirado el libro (modo simulación). NUNCA «quedan 0». */
      restantesHoy: number | null
      /** 🚨 El precio lo ha inventado central: no lo ha dado ninguna compañía. */
      simulado: boolean
      avisoSimulacion: string | null
      resumen: string
      precios: Precio[]
      fallos: Fallo[]
      supuestos: Supuesto[]
      /** Qué pasó con la COPIA en `seguros.tarificaciones`. Sin `cotizacionId`
       *  (dentro, si `estado==='guardada'`) no hay a qué proyecto pedirle el
       *  ReRate/Submit reales: `cotizacionIdDe()` lo extrae con cuidado. */
      guardado: unknown
    }
  | { estado: 'faltan'; faltan: Reparo[] }
  /**
   * 🚨 `gastoDesconocido` es lo que impide la mentira barata. `false` solo
   * cuando asegura ha DECLARADO que no se ha gastado nada (el 402 del tope, el
   * 422 de los datos que faltan, el 400 de la confirmación: todos llevan
   * `gastado: '0,00€'`). En un timeout o un fallo de red es `true`, porque la
   * cotización puede haberse creado igualmente en el vendor y el cargo puede
   * existir — y la pantalla tiene que decir «no sé si ha salido», nunca «no se
   * ha gastado».
   */
  | { estado: 'error'; mensaje: string; tope?: boolean; gastoDesconocido: boolean }

// `Precio`, `Fallo`, `Supuesto` y `Reparo` se importan de
// `@/lib/retarificar-asegura`, que es quien lee la respuesta del puerto: el
// contrato lo fija quien interpreta el JSON, no la pantalla. Redefinirlos aquí
// sería la forma de que las dos copias divergieran sin que nada fallase — que
// es exactamente lo que pasó con `primaAnual`/`primaEur` en asegura.

/**
 * El resumen honrado de una cotización, a partir de solo sus precios (sin
 * fallos: la cotización GUARDADA no los persiste, ver `apps/asegura/lib/
 * codeoscopic/cotizaciones.ts`). Mismo criterio que `resumirCotizacion()` de
 * asegura, recortado a lo que hay.
 */
function resumenDePrecios(precios: Precio[]): string {
  const firmes = precios.filter((p) => p.firmeza === 'firme').length
  const noFirmes = precios.length - firmes
  return `${precios.length} precios (${firmes} en firme${noFirmes > 0 ? `, ${noFirmes} con reparos)` : ')'}`
}

/**
 * Convierte la cotización YA GUARDADA en el mismo `Resultado` que pinta una
 * cotización recién pedida — para que la pantalla no necesite un camino
 * aparte para «lo que ya había» frente a «lo que se acaba de pagar».
 *
 * 🚨 El `coste` NO dice «0,50€»: sería mentir sobre un cargo que no ha pasado
 * ahora. Y `fallos`/`supuestos` van vacíos porque no se persisten — es la
 * letra pequeña de una cotización recuperada, no de una recién pedida.
 */
function resultadoDeGuardada(g: TarificacionGuardadaAuto): Resultado {
  return {
    estado: 'ok',
    coste: 'recuperada de una cotización anterior — no se ha vuelto a cobrar',
    restantesHoy: null,
    simulado: false,
    avisoSimulacion: null,
    resumen: resumenDePrecios(g.precios),
    precios: g.precios,
    fallos: [],
    supuestos: [],
    guardado: { estado: 'guardada', cotizacionId: g.cotizacionId },
  }
}

/**
 * Borrador LOCAL de esta pantalla — lo que se ha tecleado ANTES de pagar los
 * 0,50€. Vive en `localStorage` del navegador, no en `seguros.*`: no es una
 * cotización real, solo la red de seguridad de lo tecleado mientras tanto.
 * `guardadaPrevia` (cotización YA pagada) SIEMPRE manda sobre este borrador.
 *
 * `localStorage` puede fallar (modo privado, cuota, o `window` sin existir
 * durante el render en servidor): un fallo aquí nunca debe romper la
 * pantalla, solo perder la comodidad de recuperar lo tecleado.
 */
type DatosBorrador = {
  marcaId?: string
  modeloId?: string
  motorId?: string
  codigoVehiculo?: string
  garaje?: string
  estadoCivilId?: string
  municipioId?: string
  matriculacion?: string
  correcciones?: Record<string, string>
}
type Borrador = DatosBorrador & { guardadoEn: number }

/** El borrador puede llevar DNI/nombre/teléfono/fecha de nacimiento tecleados
 *  a mano (`correcciones`): una caducidad corta acota cuánto tiempo se queda
 *  ese dato personal en el navegador si nunca se llega a pagar la cotización
 *  (`borrarBorrador` ya lo limpia ANTES, en cuanto eso pasa). */
const BORRADOR_TTL_MS = 3 * 24 * 60 * 60 * 1000

function leerBorrador(clave: string): DatosBorrador | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(clave)
    if (!raw) return null
    const b: unknown = JSON.parse(raw)
    if (!b || typeof b !== 'object') return null
    const { guardadoEn, ...datos } = b as Borrador
    if (typeof guardadoEn !== 'number' || Date.now() - guardadoEn > BORRADOR_TTL_MS) {
      window.localStorage.removeItem(clave)
      return null
    }
    return datos
  } catch {
    return null
  }
}

function guardarBorrador(clave: string, datos: DatosBorrador) {
  try {
    if (typeof window === 'undefined') return
    const b: Borrador = { ...datos, guardadoEn: Date.now() }
    window.localStorage.setItem(clave, JSON.stringify(b))
  } catch {
    // Ver el comentario del tipo: perder el borrador no puede romper nada.
  }
}

function borrarBorrador(clave: string) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(clave)
  } catch {
    // Ver el comentario del tipo.
  }
}

/**
 * Resultado de buscar un texto de la ficha en un catálogo del vendor.
 *
 * Cuatro estados y no un booleano, porque los cuatro se arreglan distinto y
 * un desplegable vacío los cuenta todos como el mismo «no lo sabemos»:
 *  - `sin_dato`   → la ficha no lo trae. Ausencia comprobada.
 *  - `no_buscado` → todavía no se ha podido mirar (catálogo sin llegar, o la
 *                   marca no casó y sin ella no hay lista de modelos).
 *  - `casa`       → emparejado: el desplegable viene puesto y se dice de dónde.
 *  - `no_casa`    → la ficha lo dice y el catálogo no lo tiene con ESE nombre.
 *                   `cuantas` distingue «no está» (0) de «hay varias iguales» (>1).
 */
type Emparejamiento =
  | { estado: 'sin_dato' }
  | { estado: 'no_buscado'; porque: string }
  | { estado: 'casa'; opcion: Opcion; texto: string }
  | { estado: 'no_casa'; texto: string; cuantas: number }

/**
 * Empareja un texto de la ficha con una opción del catálogo.
 *
 * Mismo criterio que `emparejar()` de `opciones.ts` —exacto y normalizado, y
 * ante la duda no preselecciona— pero devolviendo POR QUÉ no ha casado, que es
 * lo que la pantalla necesita para poder decirlo.
 */
function buscarEnCatalogo(catalogo: Opcion[], texto: string | null): Emparejamiento {
  if (texto === null || texto.trim() === '') return { estado: 'sin_dato' }
  if (catalogo.length === 0) {
    return { estado: 'no_buscado', porque: 'el catálogo de Codeoscopic no ha llegado' }
  }
  const buscado = normalizarTexto(texto)
  const coincidencias = catalogo.filter((o) => normalizarTexto(o.nombre) === buscado)
  if (coincidencias.length === 1) return { estado: 'casa', opcion: coincidencias[0], texto }
  return { estado: 'no_casa', texto, cuantas: coincidencias.length }
}

/**
 * El único sitio de la app donde un clic cuesta 0,50€ — **salvo en simulación**.
 *
 * Cuatro cosas son deliberadas:
 *  - El botón dice EN el botón lo que cuesta el clic, no en una nota al pie, y
 *    dice la verdad en los dos modos: «cuesta 0,50€» o «no cuesta nada».
 *  - Se deshabilita mientras cotiza: `POST /insurances` no es idempotente, así
 *    que un doble clic serían dos proyectos y dos cargos.
 *  - Si el vendor tarda y no responde, NO se reintenta solo. La cotización queda
 *    contada como gastada porque no hay prueba de que no se haya facturado.
 *  - **La duda siempre se resuelve hacia «esto cuesta dinero».** Que un precio
 *    sea simulado se decide con el campo `simulado` de la RESPUESTA (y con el
 *    `project_id` negativo), nunca con la prop: si la pantalla se pintó en
 *    simulación y la respuesta viene sin marcar, se trata como real.
 *
 * La pantalla son tres pasos con pesos distintos a propósito: lo que ya se sabe
 * (informativo y compacto), lo que hay que decidir (los campos, protagonistas) y
 * el disparo (separado, con su advertencia y con la letra pequeña del precio).
 */
export default function Retarificador({
  polizaId,
  faltanInicial,
  garajes,
  civiles,
  municipios,
  municipiosMotivo,
  estadoCivilAuto,
  fechaMatriculacion,
  vehiculo,
  consumo,
  simulacion,
  deshabilitado,
  guardadaPrevia,
}: {
  polizaId: string
  /**
   * Los huecos que la ficha NO tapa, ya revisados. **`null` = no se ha podido
   * precalificar** (el puerto de asegura no sirve todavía la precalificación de
   * la póliza), que NO es lo mismo que `[]` = «se ha revisado y no falta nada».
   * Con `null` la pantalla lo dice y se apoya en el 422 del servidor, que corta
   * ANTES de gastar.
   */
  faltanInicial: Reparo[] | null
  garajes: Opcion[]
  civiles: Opcion[]
  /**
   * Los municipios del código postal del tomador, **ya resueltos por asegura**.
   *
   * 🔒 El CP no cruza el puerto (es un dato personal del tomador, como el DNI o
   * la dirección), pero la cotización no lo necesita: necesita el **id de
   * municipio del catálogo del vendor**, que no es personal. Así que asegura
   * hace el CP → municipios por dentro y aquí llega solo la lista.
   *
   * Tres estados: `null` = no se ha podido mirar · `[]` = se ha mirado y no hay
   * (y `municipiosMotivo` dice por qué: la ficha no trae CP, o el CP no devolvió
   * ninguno) · con contenido = elige el corredor.
   */
  municipios: Opcion[] | null
  /** Por qué la lista viene vacía o nula. `null` = no hay nada que explicar. */
  municipiosMotivo: string | null
  estadoCivilAuto: Opcion | null
  fechaMatriculacion: string | null
  /** Marca, modelo y versiones vistas en otras pólizas de la misma matrícula.
   *  `null` = no se ha podido leer de la ficha (ver el tipo). */
  vehiculo: VehiculoConocido | null
  consumo: Consumo
  /**
   * ¿Tiene el servidor de asegura `CODEOSCOPIC_SIMULACION` puesta? Lo publica el
   * puerto de precalificación; si no se pudo preguntar llega `false`, porque la
   * duda sobre el dinero SIEMPRE se resuelve hacia «esto CUESTA».
   *
   * 🚨 Esto es solo el rótulo PREVIO de la pantalla. **Que un precio CONCRETO
   * sea simulado lo decide el campo `simulado` de la RESPUESTA de cotizar**,
   * nunca esta prop: si la pantalla se pintó en simulación y la respuesta viene
   * sin marcar, se trata como real. Rotular de real algo simulado se arregla
   * mirando; rotular de simulado un cargo real haría creer que no se ha pagado.
   */
  simulacion: boolean
  deshabilitado: boolean
  /**
   * La última cotización REAL ya guardada de esta póliza (11/09/2026),
   * gratis de leer. `null` = no hay ninguna todavía (normal en la primera
   * visita). Sirve para no perder el trabajo si se recarga la pantalla: el
   * formulario se prellena con lo que se tecleó y la tabla de precios sale
   * directamente, SIN volver a pagar los 0,50€ del `POST /insurances`.
   */
  guardadaPrevia: TarificacionGuardadaAuto | null
}) {
  // Borrador local (localStorage) de esta póliza — ver `leerBorrador`/
  // `guardarBorrador`/`borrarBorrador` arriba.
  const claveBorrador = `asegura_retarificar_borrador_${polizaId}`

  // ── Vehículo: marca → modelo → versión, todo del catálogo y todo gratis ────
  const [marcas, setMarcas] = useState<Opcion[]>([])
  const [modelos, setModelos] = useState<Opcion[]>([])
  const [versiones, setVersiones] = useState<Opcion[]>([])
  const [motores, setMotores] = useState<Opcion[]>([])
  const [marcaId, setMarcaId] = useState('')
  const [modeloId, setModeloId] = useState('')
  // 🚨 El combustible NO es un adorno: `/car/…/vehicles` lo exige como
  // parámetro `engine` y sin él responde 400, así que sin elegirlo no hay
  // versiones que enseñar. Y no se adivina de la ficha: lo que ella guarda es
  // un código EIAC («1»), de OTRO catálogo — traducirlo a ojo sería inventar el
  // motor de un coche real. Lo elige el corredor.
  const [motorId, setMotorId] = useState('')
  // 🚨 Si hay cotización guardada, el código Base7 se recupera TAL CUAL —no
  // el ID de marca/modelo/motor, que el vendor no pide y aquí no se guardan—.
  // Por eso puede llegar «puesto» sin que marca/modelo/motor lo estén: se
  // pinta como un chip bloqueado (ver `faltaVersion`/`Campo id="version"`) en
  // vez de un desplegable con un valor que no está en su lista de opciones.
  const [codigoVehiculo, setCodigoVehiculo] = useState(guardadaPrevia?.formulario.codigoVehiculo ?? '')
  const [cargando, setCargando] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  // Cómo fue la preselección desde la ficha. Se guarda para poder DECIRLO: un
  // desplegable en blanco sin explicación parece «no lo sabemos» cuando sí lo
  // sabemos y lo que pasa es que el catálogo no lo tiene con ese nombre.
  const [autoMarca, setAutoMarca] = useState<Emparejamiento>({
    estado: 'no_buscado',
    porque: 'todavía se está leyendo el catálogo',
  })
  const [autoModelo, setAutoModelo] = useState<Emparejamiento>({
    estado: 'no_buscado',
    porque: 'primero hace falta la marca',
  })

  const [garaje, setGaraje] = useState(guardadaPrevia?.formulario.garaje ?? '')
  const [estadoCivilId, setEstadoCivilId] = useState(
    guardadaPrevia?.formulario.estadoCivilId ?? estadoCivilAuto?.id ?? '',
  )
  // 🔒 Aquí NO hay caja de código postal, y es deliberado. Durante unas horas la
  // hubo —el puerto no servía la precalificación y se le pedía el CP a Alberto—
  // y eran las dos cosas malas a la vez: hacerle teclear un dato que la ficha ya
  // tiene, y sacar por la puerta de atrás justo el dato personal que
  // `apps/asegura/CLAUDE.md` mantiene dentro. Lo que la cotización necesita es
  // el **id de municipio del catálogo del vendor**, que no es personal: asegura
  // resuelve el CP por dentro y manda la lista ya hecha.
  const listaMunicipios = municipios ?? []
  const [municipioId, setMunicipioId] = useState(
    guardadaPrevia?.formulario.municipioId != null
      ? String(guardadaPrevia.formulario.municipioId)
      : listaMunicipios.length === 1
        ? listaMunicipios[0].id
        : '',
  )
  const [matriculacion, setMatriculacion] = useState(
    guardadaPrevia?.formulario.fechaMatriculacion ?? fechaMatriculacion ?? '',
  )
  const [correcciones, setCorrecciones] = useState<Record<string, string>>(() => ({
    // La fecha de efecto SIEMPRE arranca con un valor — nunca en blanco (ver
    // el campo en el Paso 2). Una `guardadaPrevia` sin ese campo (cotizaciones
    // de antes del 12/09/2026) tampoco lo trae vacío: cae al mismo default.
    fechaEfecto: hoyISO(),
    ...(guardadaPrevia?.formulario.correcciones ?? {}),
  }))
  const [resultado, setResultado] = useState<Resultado>(
    guardadaPrevia ? resultadoDeGuardada(guardadaPrevia) : { estado: 'idle' },
  )
  // 🚨 `guardadaPrevia` recupera GRATIS el precio de una cotización ya
  // pagada — pero si ese proyecto quedó con una `effectiveDate` que el
  // vendor rechaza (>90 días vista) y no se puede corregir (11-12/09/2026,
  // caso real de Pilar Franco Ruz: `effectiveDate` es de solo lectura tras
  // el `POST /insurances` inicial), la única salida es descartarlo y pedir
  // un precio NUEVO. Sin esta vía, la pantalla resuelve `resultado` directo
  // a `ok` con el proyecto viejo y el botón «Emitir» de la tabla de precios
  // confirma ESE proyecto sin pasar nunca por el campo de fecha de arriba.
  const [guardadaDescartada, setGuardadaDescartada] = useState(false)

  /**
   * Un catálogo del vendor, por el puerto. **Gratis.**
   *
   * Va por una acción de servidor y no por `fetch` porque el Bearer del puerto
   * (`ASEGURA_OPERADOR_SECRET`) no puede bajar al navegador. Un fallo LANZA en
   * vez de devolver `[]`: un desplegable vacío sobre un error de red diría
   * «esta marca no tiene modelos», que es una ausencia que nadie ha comprobado.
   */
  async function catalogo(qs: string): Promise<Opcion[]> {
    const r = await pedirCatalogo(Object.fromEntries(new URLSearchParams(qs)))
    if (r.estado !== 'ok') throw new Error(r.mensaje)
    return r.opciones
  }

  // ── Preselección desde la ficha ────────────────────────────────────────────
  //
  // La compañía manda matrícula, MARCA y MODELO; lo único que falta es la
  // versión. Así que al abrir la pantalla se bajan las marcas, se empareja la
  // de la ficha, se bajan sus modelos y se empareja el modelo. Todo gratis.
  //
  // 🚨 La versión NO se autoselecciona NUNCA, ni cuando solo hay una candidata:
  // `vehiculo.versiones` son textos de otra póliza, no códigos Base7. Elegir
  // por parecido cambiaría el precio sin que nadie se entere.
  useEffect(() => {
    if (deshabilitado) return
    let vivo = true

    void (async () => {
      setCargando('marcas')
      let lista: Opcion[] = []
      try {
        lista = await catalogo('tipo=marcas')
      } catch (e) {
        if (vivo) setFallo((e as Error).message)
      } finally {
        if (vivo) setCargando(null)
      }
      if (!vivo) return
      setMarcas(lista)

      // 🚨 Un borrador LOCAL (lo que ya se había tecleado, sin pagar todavía)
      // manda sobre la preselección por ficha: son ids que YA pasaron por el
      // catálogo la vez anterior, no hay nada que emparejar por texto. Si el
      // catálogo cambió y el id ya no existe, se cae al flujo normal de abajo.
      const borradorLocal = guardadaPrevia ? null : leerBorrador(claveBorrador)
      if (borradorLocal?.codigoVehiculo) setCodigoVehiculo(borradorLocal.codigoVehiculo)
      if (borradorLocal?.marcaId) {
        const marcaEncontrada = lista.find((m) => m.id === borradorLocal.marcaId)
        if (marcaEncontrada) {
          setMarcaId(marcaEncontrada.id)
          setAutoMarca({ estado: 'casa', opcion: marcaEncontrada, texto: '(borrador)' })

          setCargando('modelos')
          let listaModelos: Opcion[] = []
          try {
            listaModelos = await catalogo(`tipo=modelos&marcaId=${encodeURIComponent(marcaEncontrada.id)}`)
          } catch (e) {
            if (vivo) setFallo((e as Error).message)
          } finally {
            if (vivo) setCargando(null)
          }
          if (!vivo) return
          setModelos(listaModelos)

          const modeloEncontrado = borradorLocal.modeloId
            ? listaModelos.find((m) => m.id === borradorLocal.modeloId)
            : undefined
          if (modeloEncontrado) {
            setModeloId(modeloEncontrado.id)
            setAutoModelo({ estado: 'casa', opcion: modeloEncontrado, texto: '(borrador)' })
          } else if (borradorLocal.modeloId) {
            // El modelo del borrador ya no está en el catálogo (cambió desde
            // la vez anterior): decirlo, en vez de dejar el mensaje inicial
            // «primero hace falta la marca» — que ya no es cierto, la marca
            // SÍ está puesta.
            setAutoModelo({
              estado: 'no_buscado',
              porque: 'el modelo del borrador ya no está en el catálogo del vendor: elígelo de nuevo',
            })
          }

          setCargando('motores')
          let listaMotores: Opcion[] = []
          try {
            listaMotores = await catalogo('tipo=motores')
          } catch (e) {
            if (vivo) setFallo((e as Error).message)
          } finally {
            if (vivo) setCargando(null)
          }
          if (!vivo) return
          setMotores(listaMotores)

          const motorEncontrado = borradorLocal.motorId
            ? listaMotores.find((m) => m.id === borradorLocal.motorId)
            : undefined
          if (modeloEncontrado && motorEncontrado) {
            setMotorId(motorEncontrado.id)
            void cargarVersiones(marcaEncontrada.id, modeloEncontrado.id, motorEncontrado.id)
          }
          return
        }
      }

      // 🚨 Sin `vehiculo` NO se llama a `buscarEnCatalogo`: devolvería
      // `sin_dato`, cuyo texto es «la ficha no lo trae» — una ausencia
      // COMPROBADA. Aquí lo que pasa es que no se ha podido mirar, y son cosas
      // distintas que se arreglan en sitios distintos.
      const m: Emparejamiento =
        vehiculo === null
          ? { estado: 'no_buscado', porque: 'el puerto no sirve la marca de la ficha' }
          : buscarEnCatalogo(lista, vehiculo.marca)
      setAutoMarca(m)
      if (m.estado !== 'casa') {
        setAutoModelo({
          estado: 'no_buscado',
          porque:
            vehiculo === null
              ? 'no se ha podido leer la marca de la ficha, y sin ella no hay lista de modelos'
              : m.estado === 'sin_dato'
                ? 'la ficha no dice la marca, y sin ella no hay lista de modelos'
                : 'la marca no está resuelta, y sin ella no hay lista de modelos',
        })
        return
      }
      setMarcaId(m.opcion.id)

      setCargando('modelos')
      let lista2: Opcion[] = []
      try {
        lista2 = await catalogo(`tipo=modelos&marcaId=${encodeURIComponent(m.opcion.id)}`)
      } catch (e) {
        if (vivo) setFallo((e as Error).message)
      } finally {
        if (vivo) setCargando(null)
      }
      if (!vivo) return
      setModelos(lista2)

      // `vehiculo` no puede ser null aquí (con null, `m` es `no_buscado` y la
      // función ya ha vuelto arriba), pero TypeScript no puede saberlo.
      const mo = buscarEnCatalogo(lista2, vehiculo?.modelo ?? null)
      setAutoModelo(mo)
      if (mo.estado !== 'casa') return
      setModeloId(mo.opcion.id)

      // Las versiones NO se pueden pedir todavía: falta el combustible, que es
      // obligatorio en el catálogo del vendor. Se baja su lista y ahí para la
      // cadena automática — el corredor elige motor y entonces sí.
      setCargando('motores')
      try {
        const ms = await catalogo('tipo=motores')
        if (vivo) setMotores(ms)
      } catch (e) {
        if (vivo) setFallo((e as Error).message)
      } finally {
        if (vivo) setCargando(null)
      }
    })()

    return () => {
      vivo = false
    }
    // Se corre una sola vez por póliza: la ficha no cambia mientras la miras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deshabilitado])

  // Borrador local — el resto de campos (no dependen de ningún catálogo, así
  // que no hace falta la cadena async de arriba). Mismo criterio de
  // prioridad: `guardadaPrevia` (ya pagada) manda si existe.
  useEffect(() => {
    if (deshabilitado || guardadaPrevia) return
    const b = leerBorrador(claveBorrador)
    if (!b) return
    if (b.garaje && garajes.some((g) => g.id === b.garaje)) setGaraje(b.garaje)
    if (b.estadoCivilId && civiles.some((c) => c.id === b.estadoCivilId)) setEstadoCivilId(b.estadoCivilId)
    if (b.municipioId && listaMunicipios.some((m) => m.id === b.municipioId)) setMunicipioId(b.municipioId)
    if (b.matriculacion) setMatriculacion(b.matriculacion)
    if (b.correcciones) setCorrecciones(b.correcciones)
    // Se restaura una sola vez al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autoguardado: CUALQUIER cambio se guarda en el navegador, aunque nunca se
  // llegue a pulsar «Pedir precio». Es la red de seguridad de lo tecleado
  // ANTES de pagar — `guardadaPrevia` sigue siendo la fuente de verdad de lo
  // YA pagado y siempre manda sobre este borrador al recargar la pantalla.
  useEffect(() => {
    const t = setTimeout(() => {
      guardarBorrador(claveBorrador, {
        marcaId,
        modeloId,
        motorId,
        codigoVehiculo,
        garaje,
        estadoCivilId,
        municipioId,
        matriculacion,
        correcciones,
      })
    }, 400)
    return () => clearTimeout(t)
  }, [
    claveBorrador,
    marcaId,
    modeloId,
    motorId,
    codigoVehiculo,
    garaje,
    estadoCivilId,
    municipioId,
    matriculacion,
    correcciones,
  ])

  async function alElegirMarca(id: string) {
    setMarcaId(id)
    setModeloId('')
    setCodigoVehiculo('')
    setModelos([])
    setVersiones([])
    if (!id) return
    setCargando('modelos')
    try {
      setModelos(await catalogo(`tipo=modelos&marcaId=${encodeURIComponent(id)}`))
    } catch (e) {
      setFallo((e as Error).message)
    } finally {
      setCargando(null)
    }
  }

  function alElegirModelo(id: string) {
    setModeloId(id)
    setCodigoVehiculo('')
    // Cambiar de modelo invalida las versiones, pero NO el combustible: el
    // coche sigue siendo el mismo y volver a preguntarlo sería ruido.
    setVersiones([])
    if (id && motorId) void cargarVersiones(marcaId, id, motorId)
  }

  function alElegirMotor(id: string) {
    setMotorId(id)
    setCodigoVehiculo('')
    setVersiones([])
    if (id && modeloId) void cargarVersiones(marcaId, modeloId, id)
  }

  /**
   * Las versiones del catálogo. Los TRES parámetros son obligatorios para el
   * vendor: sin `engine` responde 400 y la pantalla se queda sin el único dato
   * que de verdad hay que elegir.
   */
  async function cargarVersiones(marca: string, modelo: string, motor: string) {
    setCargando('versiones')
    setFallo(null)
    try {
      setVersiones(
        await catalogo(
          `tipo=versiones&marcaId=${encodeURIComponent(marca)}` +
            `&modeloId=${encodeURIComponent(modelo)}&motor=${encodeURIComponent(motor)}`,
        ),
      )
    } catch (e) {
      setFallo((e as Error).message)
    } finally {
      setCargando(null)
    }
  }

  /**
   * 🚨 **EL CLIC QUE CUESTA 0,50€ REALES.**
   *
   * Va por la acción de servidor, que es la que añade `confirmado: true` (el
   * booleano exacto que exige el puerto) y la que lleva el Bearer. El navegador
   * no puede llamar a Codeoscopic ni por accidente.
   *
   * No hay reintento automático en ningún camino: `POST /insurances` no es
   * idempotente y repetir crea otro proyecto y otro cargo.
   */
  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    const r = await pedirCotizacion({
      polizaId,
      resueltos: {
        codigoVehiculo,
        garaje,
        estadoCivilId,
        municipioId,
        fechaMatriculacion: matriculacion,
        garajeEsSupuesto: true,
      },
      correcciones,
    })

    switch (r.estado) {
      case 'faltan':
        // 422: corta ANTES del vendor. No se ha gastado nada.
        setResultado({ estado: 'faltan', faltan: r.faltan })
        return
      case 'tope':
        setResultado({ estado: 'error', mensaje: r.mensaje, tope: true, gastoDesconocido: false })
        return
      case 'ramo':
      case 'no_encontrada':
      case 'sin_configurar':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: false })
        return
      case 'error':
        // 🚨 `gastoDesconocido` viene del lector del puerto y NO se recalcula
        // aquí: un timeout puede haber dejado la cotización creada y el cargo
        // hecho, así que el mensaje dice «no sé si ha salido», nunca «no se ha
        // gastado». Ver `lib/retarificar-asegura.ts`.
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: r.gastoDesconocido })
        return
      case 'ok':
        // 🚨 Cotización REAL pagada: a partir de ahora la fuente de verdad es
        // `seguros.tarificaciones` (vía `guardadaPrevia` en la próxima carga).
        // El borrador local ya no hace falta y dejarlo podría, en teoría,
        // resucitar un valor tecleado y luego cambiado antes de pulsar.
        if (!r.simulado) borrarBorrador(claveBorrador)
        setResultado({
          estado: 'ok',
          coste: r.coste,
          restantesHoy: r.restantesHoy,
          // Simulado lo decide la RESPUESTA (el lector ya une el booleano del
          // embudo con el `projectId` negativo), nunca la prop de la pantalla.
          simulado: r.simulado,
          avisoSimulacion: r.avisoSimulacion,
          resumen: r.resumen,
          precios: r.precios,
          fallos: r.fallos,
          supuestos: r.supuestos,
          guardado: r.guardado,
        })
        return
    }
  }

  // ── Qué falta, campo a campo ───────────────────────────────────────────────
  //
  // Se marca EN el campo, no en una lista lejos del sitio donde se arregla.
  const faltaVersion = !codigoVehiculo
  const faltaGaraje = !garaje
  const faltaCivil = !estadoCivilId
  const faltaMunicipio = !municipioId
  const faltaMatriculacion = !matriculacion

  /** Los huecos de la ficha que SÍ se teclean aquí (sexo + los de texto). */
  const aMano = useMemo(
    () => (faltanInicial ?? []).filter((f) => f.campo === 'sexo' || CAMPOS_A_MANO[f.campo]),
    [faltanInicial],
  )
  const aManoSinRellenar = aMano.filter((f) => !(correcciones[f.campo] ?? '').trim())

  /**
   * Huecos que esta pantalla NO puede arreglar (ni desplegable ni caja). No se
   * callan: el servidor los rechazará con un 422 —sin gastar— y quien mire la
   * pantalla tiene que saber por qué antes de pulsar.
   */
  const huerfanos = (faltanInicial ?? []).filter(
    (f) => !RESUELTOS_EN_PANTALLA.has(f.campo as string) && !CAMPOS_A_MANO[f.campo],
  )

  const cotizando = resultado.estado === 'cotizando'
  /**
   * 🚨 `no_disponible` NO bloquea el botón, y es deliberado: desde plataforma el
   * contador de asegura no se puede leer, y tratar ese «no lo sé» como «quedan
   * 0» dejaría la pantalla inservible por un dato que nadie ha mirado. El tope
   * de verdad lo sigue aplicando `cotizar()` al otro lado — si salta, responde
   * 402 con `gastado: '0,00€'` y no se cobra nada. Un `error` sí frena: ahí SÍ
   * se ha mirado y la respuesta fue mala.
   */
  const consumoPermite =
    consumo.estado === 'ok' ? consumo.veredicto.permitido : consumo.estado === 'no_disponible'
  const faltaAlgo =
    faltaVersion ||
    faltaGaraje ||
    faltaCivil ||
    faltaMunicipio ||
    faltaMatriculacion ||
    aManoSinRellenar.length > 0
  // En simulación no se llama al vendor ni se toca el libro, así que el tope no
  // pinta nada: bloquear por él sería impedir algo que no cuesta. Lo que NO
  // cambia es el resto de la guarda: los datos siguen haciendo falta porque el
  // cuerpo se revisa igual antes de responder.
  const puedePulsar = !deshabilitado && !cotizando && !faltaAlgo && (simulacion || consumoPermite)

  // El código Base7 vino de una cotización guardada (no del desplegable en
  // vivo) mientras no aparezca entre las versiones ya cargadas: marca/modelo/
  // motor no se recuperan (el vendor no los pide, así que no se guardan), y
  // sin ellos el desplegable de versiones no tiene con qué mostrar el nombre.
  const versionRecuperada = codigoVehiculo !== '' && !versiones.some((v) => v.id === codigoVehiculo)

  return (
    <>
      {guardadaPrevia && !guardadaDescartada && (
        <BannerRecuperada
          guardadaPrevia={guardadaPrevia}
          onDescartar={() => {
            setGuardadaDescartada(true)
            setResultado({ estado: 'idle' })
          }}
        />
      )}
      {simulacion && <BannerSimulacion />}

      {/* ── Paso 1 · el vehículo ───────────────────────────────────────────── */}
      <Paso n={1} titulo="El vehículo" sub="Lo único que hay que elegir es la versión.">
        <SabidoDeLaFicha vehiculo={vehiculo} autoMarca={autoMarca} autoModelo={autoModelo} />

        {fallo && <p className="err">{fallo}</p>}

        <div className="form-grid" style={{ marginTop: 12 }}>
          <Campo
            id="marca"
            etiqueta="Marca"
            falta={false}
            ayuda={<ProcedenciaCatalogo emp={autoMarca} elegido={marcaId} que="marca" />}
          >
            <select
              id="marca"
              value={marcaId}
              onChange={(e) => void alElegirMarca(e.target.value)}
              disabled={deshabilitado || cargando === 'marcas'}
              style={{ minHeight: 44 }}
            >
              <option value="">{cargando === 'marcas' ? 'Cargando…' : 'Elige marca'}</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="modelo"
            etiqueta="Modelo"
            falta={false}
            ayuda={<ProcedenciaCatalogo emp={autoModelo} elegido={modeloId} que="modelo" />}
          >
            <select
              id="modelo"
              value={modeloId}
              onChange={(e) => void alElegirModelo(e.target.value)}
              disabled={!marcaId || cargando === 'modelos'}
              style={{ minHeight: 44 }}
            >
              <option value="">{cargando === 'modelos' ? 'Cargando…' : 'Elige modelo'}</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="motor"
            etiqueta="Combustible"
            falta={motorId === ''}
            faltaTexto="lo elige el corredor"
            ayuda={
              <span>
                El catálogo del vendor <strong>exige</strong> el combustible para poder darte las
                versiones. La ficha no lo dice en un formato que se pueda traducir sin adivinar, así
                que lo eliges tú.
              </span>
            }
          >
            <select
              id="motor"
              value={motorId}
              onChange={(e) => alElegirMotor(e.target.value)}
              disabled={deshabilitado || cargando === 'motores'}
              style={{ minHeight: 44 }}
            >
              <option value="">{cargando === 'motores' ? 'Cargando…' : 'Elige combustible'}</option>
              {motores.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="version"
            etiqueta="Versión"
            falta={faltaVersion}
            faltaTexto="la elige el corredor"
            ayuda={
              <span>
                Es el único dato del coche que <strong>ninguna</strong> póliza guarda, y el que pide
                el tarificador (código Base7). El catálogo las lista por combustible, así que ese va
                primero.
              </span>
            }
          >
            {versionRecuperada ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  minHeight: 44,
                  padding: '0 2px',
                }}
              >
                <span className="badge ok">recuperada</span>
                <code style={{ fontSize: 13 }}>{codigoVehiculo}</code>
                <button
                  type="button"
                  className="ghost"
                  style={{ minHeight: 32, padding: '4px 10px' }}
                  onClick={() => setCodigoVehiculo('')}
                >
                  Olvidar y elegir otra
                </button>
              </div>
            ) : (
              <select
                id="version"
                value={codigoVehiculo}
                onChange={(e) => setCodigoVehiculo(e.target.value)}
                disabled={!modeloId || !motorId || cargando === 'versiones'}
                style={{ minHeight: 44 }}
              >
                <option value="">
                  {cargando === 'versiones'
                    ? 'Cargando…'
                    : !motorId
                      ? 'Elige antes el combustible'
                      : 'Elige versión'}
                </option>
                {versiones.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            )}
          </Campo>

          <Campo
            id="matriculacion"
            etiqueta="Fecha de matriculación"
            falta={faltaMatriculacion}
            ayuda={
              fechaMatriculacion
                ? 'La ha devuelto Codeoscopic desde la matrícula, y es APROXIMADA.'
                : 'No ha llegado por la matrícula: ponla a mano.'
            }
          >
            <input
              id="matriculacion"
              type="date"
              value={matriculacion}
              onChange={(e) => setMatriculacion(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </Campo>

          <Campo
            id="garaje"
            etiqueta="¿Dónde duerme?"
            falta={faltaGaraje}
            ayuda="No está en la ficha: lo elige el corredor y viaja marcado como supuesto."
          >
            <select
              id="garaje"
              value={garaje}
              onChange={(e) => setGaraje(e.target.value)}
              style={{ minHeight: 44 }}
            >
              <option value="">Elige garaje</option>
              {garajes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <PistasDeVersion versiones={vehiculo?.versiones ?? []} />
      </Paso>

      {/* ── Paso 2 · el tomador ────────────────────────────────────────────── */}
      <Paso
        n={2}
        titulo="El tomador"
        sub={
          aMano.length > 0
            ? 'Los datos personales NUNCA se suponen: los que falten se teclean aquí.'
            : 'La ficha trae todo lo personal; solo hay que confirmar estos dos.'
        }
      >
        <div className="form-grid">
          <Campo
            id="civil"
            etiqueta="Estado civil"
            falta={faltaCivil}
            ayuda={
              estadoCivilAuto
                ? `Viene de la ficha («${estadoCivilAuto.nombre}»). Se puede cambiar.`
                : 'La ficha no lo dice o no casa con el catálogo: elígelo.'
            }
          >
            <select
              id="civil"
              value={estadoCivilId}
              onChange={(e) => setEstadoCivilId(e.target.value)}
              style={{ minHeight: 44 }}
            >
              <option value="">Elige estado civil</option>
              {civiles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            id="municipio"
            etiqueta="Municipio"
            falta={faltaMunicipio}
            ayuda={
              // Los tres estados, dichos con palabras distintas: el desplegable
              // vacío por un fallo y el vacío porque la ficha no trae código
              // postal se arreglan en sitios distintos.
              municipios === null
                ? municipiosMotivo ??
                  'No se ha podido resolver el municipio del tomador. No es que no lo tenga: no se ha podido mirar.'
                : listaMunicipios.length === 0
                  ? municipiosMotivo ??
                    'El código postal de la ficha no ha devuelto ningún municipio. Sin municipio no se puede cotizar.'
                  : listaMunicipios.length === 1
                    ? 'Único municipio del código postal del tomador: viene puesto desde la ficha.'
                    : 'Varios municipios comparten el código postal del tomador: elige uno.'
            }
          >
            <select
              id="municipio"
              value={municipioId}
              onChange={(e) => setMunicipioId(e.target.value)}
              style={{ minHeight: 44 }}
            >
              <option value="">
                {listaMunicipios.length === 0 ? 'Sin municipios que elegir' : 'Elige municipio'}
              </option>
              {listaMunicipios.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {/* La frase solo aparece si DEBAJO hay algo que rellenar. Antes se
            pintaba siempre y quedaba huérfana cuando no faltaba ningún dato. */}
        {aMano.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ margin: '0 0 8px' }}>
              De la ficha faltan {aMano.length === 1 ? 'este dato' : `estos ${aMano.length} datos`}.
              Rellénalos aquí — no se inventan solos:
            </p>
            <div className="form-grid">
              {aMano.some((f) => f.campo === 'sexo') && (
                <Campo
                  id="c-sexo"
                  etiqueta="Sexo"
                  falta={!(correcciones.sexo ?? '').trim()}
                  ayuda="La ficha no lo dice y no se adivina por el nombre."
                >
                  <select
                    id="c-sexo"
                    value={correcciones.sexo ?? ''}
                    onChange={(e) => setCorrecciones((c) => ({ ...c, sexo: e.target.value }))}
                    style={{ minHeight: 44 }}
                  >
                    <option value="">Elige</option>
                    <option value="hombre">Hombre</option>
                    <option value="mujer">Mujer</option>
                  </select>
                </Campo>
              )}
              {aMano
                .filter((f) => CAMPOS_A_MANO[f.campo])
                .map((f) => (
                  <Campo
                    key={f.campo}
                    id={`c-${f.campo}`}
                    etiqueta={CAMPOS_A_MANO[f.campo]!.etiqueta}
                    falta={!(correcciones[f.campo] ?? '').trim()}
                    ayuda={f.motivo}
                  >
                    <input
                      id={`c-${f.campo}`}
                      type={CAMPOS_A_MANO[f.campo]!.tipo}
                      value={correcciones[f.campo] ?? ''}
                      onChange={(e) =>
                        setCorrecciones((c) => ({ ...c, [f.campo]: e.target.value }))
                      }
                      style={{ minHeight: 44 }}
                    />
                  </Campo>
                ))}
            </div>
          </div>
        )}

        {huerfanos.length > 0 && (
          <div className="err" style={{ marginTop: 12 }}>
            <strong>Esto no se arregla desde esta pantalla:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {huerfanos.map((f) => (
                <li key={f.campo}>
                  <strong>{String(f.campo)}</strong>: {f.motivo}
                </li>
              ))}
            </ul>
            <p style={{ margin: '6px 0 0' }}>
              Hay que corregirlo en la ficha del cliente. Si se pulsa igualmente, el servidor lo
              rechaza <strong>sin gastar nada</strong>.
            </p>
          </div>
        )}

        {/* 🚨 Fecha de efecto — corrección MANUAL, NUNCA gated por "falta": el
            servidor SIEMPRE supone una (el día siguiente al vencimiento de la
            póliza actual, o mañana si no hay vencimiento), así que nunca
            aparece en `faltanInicial`. Existe porque ese supuesto se rechaza
            al confirmar el precio (ReRate) si cae a más de 90 días vista — y
            para entonces ya se ha pagado el 0,50€ de esta pantalla. Se
            corrige AQUÍ, antes de pagar, no después: `effectiveDate` no es
            editable una vez creado el proyecto en el vendor (11-12/09/2026,
            varios intentos reales sobre el proyecto de Pilar Franco Ruz).
            🚨 Precargada a HOY (12/09/2026, dictado de Alberto: «tiene que
            salir por defecto hoy, no puede ser opcional») — nunca en blanco,
            porque hoy SIEMPRE cumple el límite de 90 días del vendor, al
            revés que el supuesto automático cuando el vencimiento real está
            lejos. Se puede cambiar, pero el campo nunca arranca vacío. */}
        <div style={{ marginTop: 16 }}>
          <Campo
            id="c-fechaEfecto"
            etiqueta="Fecha de efecto"
            falta={false}
            ayuda={
              <>
                Precargada a hoy: es la fecha que se manda al pedir precio. Cámbiala solo si el
                cliente quiere que la póliza empiece otro día — <strong>siempre a ≤90 días vista</strong>,
                la compañía rechaza fechas más lejanas al confirmar el precio, y para entonces ya se
                ha pagado la cotización. No se puede arreglar después: hay que acertarla aquí.
              </>
            }
          >
            <input
              id="c-fechaEfecto"
              type="date"
              value={correcciones.fechaEfecto ?? ''}
              onChange={(e) => setCorrecciones((c) => ({ ...c, fechaEfecto: e.target.value }))}
              style={{ minHeight: 44 }}
            />
          </Campo>
        </div>
      </Paso>

      {/* ── Paso 3 · el disparo ────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          borderColor: simulacion ? 'var(--warn)' : 'var(--danger)',
          borderWidth: 2,
        }}
      >
        <CabeceraPaso n={3} titulo={simulacion ? 'Simular precio' : 'Pedir precio'} />

        {simulacion ? (
          <div style={CAJA_SIMULACION}>
            <strong style={{ color: 'var(--warn)' }}>🧪 No se llama a ninguna compañía.</strong>{' '}
            El precio lo inventa central para poder ver la pantalla funcionando. No cuesta nada, no
            se toca el libro de consumo y no se puede enseñar a un cliente.
          </div>
        ) : (
          <div style={CAJA_COSTE}>
            <strong style={{ color: 'var(--danger)' }}>Este clic gasta 0,50€ reales.</strong> El
            cargo es irreversible y solo hay <strong>un intento</strong>: la petición no es
            idempotente, así que reintentar crea otro proyecto y otro cargo.
          </div>
        )}

        <Contador consumo={consumo} simulacion={simulacion} />

        {faltaAlgo && !deshabilitado && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            El botón se enciende cuando no quede ningún <span className="badge warn">falta</span> de
            arriba. Corregir arriba no cuesta nada.
          </p>
        )}

        <button
          type="button"
          className="primary"
          onClick={() => void cotizar()}
          disabled={!puedePulsar}
          style={{
            minHeight: 44,
            width: '100%',
            maxWidth: 420,
            marginTop: 12,
            background: simulacion ? 'var(--warn)' : undefined,
          }}
        >
          {cotizando
            ? simulacion
              ? 'Simulando…'
              : 'Cotizando… (puede tardar hasta 2 min)'
            : simulacion
              ? 'Simular precio — no cuesta nada'
              : 'Pedir precio — cuesta 0,50€'}
        </button>

        {resultado.estado === 'faltan' && (
          <div style={{ marginTop: 12 }}>
            <p className="badge ok">No se ha gastado nada</p>
            <ul>
              {resultado.faltan.map((f) => (
                <li key={f.campo}>
                  <strong>{String(f.campo)}</strong>: {f.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {resultado.estado === 'error' && (
          <p className="err" style={{ marginTop: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {resultado.tope ? '🛑 Tope alcanzado: ' : '⚠️ '}
            {resultado.mensaje}
          </p>
        )}

        {resultado.estado === 'ok' && (
          <Precios r={resultado} simulacion={simulacion} />
        )}
      </div>
    </>
  )
}

// ─── El resultado ────────────────────────────────────────────────────────────

function Precios({
  r,
  simulacion,
}: {
  r: Extract<Resultado, { estado: 'ok' }>
  simulacion: boolean
}) {
  // Qué fila tiene abierto el panel de emisión real (ver emision.tsx). `null` =
  // ninguna. Vive aquí, no en el padre: es puro estado de pantalla, no algo
  // que la póliza necesite recordar entre visitas.
  const [abierta, setAbierta] = useState<string | null>(null)
  return (
    <div style={{ marginTop: 16 }}>
      {/* Un precio simulado y uno real se leen igual: la única diferencia está
          en este cartel y en la etiqueta de cada prima, así que van ENCIMA y
          DENTRO de la tabla, no como nota al pie. Tiene que aguantar una
          captura recortada y una mirada de lejos. */}
      {r.simulado && (
        <div
          style={{
            border: '2px solid var(--warn)',
            background: 'rgba(217, 119, 6, 0.1)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: 'var(--warn)' }}>
            🧪 ESTO ES UNA SIMULACIÓN
          </p>
          <p style={{ margin: '4px 0 0' }}>
            {r.avisoSimulacion ??
              'Precio inventado por central para probar la pantalla: ninguna compañía lo ha dado y no ' +
                'se ha gastado ni un céntimo.'}
          </p>
        </div>
      )}

      {/* La pantalla se pintó en simulación y la respuesta NO viene marcada:
          se trata como REAL. La duda sobre el dinero se resuelve siempre así. */}
      {simulacion && !r.simulado && (
        <div className="err" style={{ marginBottom: 12 }}>
          ⚠️ Esta pantalla se abrió en modo simulación, pero la respuesta{' '}
          <strong>no viene marcada como simulada</strong>: trátala como una cotización REAL y
          comprueba el consumo antes de volver a pulsar.
        </div>
      )}

      <p style={{ margin: '0 0 4px' }}>
        <strong>{r.resumen}</strong>
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        Coste de esta consulta: {r.coste}
        {/* `null` = no se ha leído el libro (simulación). Decir «quedan 0» sería
            convertir un «no se sabe» en una cifra. */}
        {r.restantesHoy !== null ? (
          <> · quedan hoy {r.restantesHoy}.</>
        ) : (
          <> · el libro de consumo no se ha mirado (no hacía falta).</>
        )}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Compañía</th>
              <th>Producto</th>
              <th>Cobertura</th>
              <th>Prima anual</th>
              <th>Franquicia</th>
              <th>Firmeza</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {r.precios.map((p, i) => {
              const id = `${p.compania}-${p.producto}-${i}`
              return (
              <tr key={id}>
                <td>{p.compania ?? '—'}</td>
                <td>{p.producto ?? '—'}</td>
                <td>{p.categoria ?? <span className="muted">sin declarar</span>}</td>
                <td>
                  <strong>{euroODash(p.primaEur)}</strong>
                  {r.simulado && (
                    <>
                      {' '}
                      <span className="badge warn">simulado</span>
                    </>
                  )}
                </td>
                <td>
                  {/* `null` NO es «sin franquicia»: es «el producto no la
                      declara». Callarlo sería vender un todo riesgo ocultando
                      1.500€ de franquicia. */}
                  {p.franquiciaEur === null || p.franquiciaEur === undefined ? (
                    <span className="muted">no la declara</span>
                  ) : (
                    euroODash(p.franquiciaEur)
                  )}
                </td>
                <td>
                  {/* La firmeza va PEGADA al precio: enseñar la prima sola
                      promete algo que la compañía no ha cerrado. */}
                  <span
                    className={`badge ${p.firmeza === 'firme' ? 'ok' : 'warn'}`}
                    title={p.avisos?.join(' · ')}
                  >
                    {p.firmeza ?? 'sin determinar'}
                  </span>
                </td>
                <td>
                  {/* El botón real (11/09/2026): confirma con la compañía
                      (ReRate) y, si sale firme, permite el Submit de verdad.
                      Sin `cotizacionId` (la cotización no quedó guardada) no
                      hay proyecto al que pedírselo. */}
                  <button
                    type="button"
                    className="ghost"
                    disabled={r.simulado || cotizacionIdDe(r.guardado) === null}
                    title={
                      r.simulado
                        ? 'Simulado: no hay proyecto real de Codeoscopic'
                        : cotizacionIdDe(r.guardado) === null
                          ? 'Esta cotización no quedó guardada: no se puede emitir sin su id'
                          : undefined
                    }
                    onClick={() => setAbierta(abierta === id ? null : id)}
                  >
                    {abierta === id ? 'Ocultar' : 'Emitir'}
                  </button>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {r.precios.map((p, i) => {
        const id = `${p.compania}-${p.producto}-${i}`
        if (abierta !== id) return null
        const cotizacionId = cotizacionIdDe(r.guardado)
        if (!cotizacionId) return null
        return (
          <Emision
            key={id}
            tarificacionId={cotizacionId}
            compania={p.compania ?? ''}
            categoria={p.categoria ?? ''}
            primaEur={p.primaEur ?? null}
            onCerrar={() => setAbierta(null)}
          />
        )
      })}

      {!r.simulado && r.precios.some((p) => p.firmeza !== 'firme') && (
        <p className="muted">
          Los precios marcados como estimado o condicionado <strong>no son ofertas cerradas</strong>:
          la compañía puede cambiarlos al verificar los datos.
        </p>
      )}

      {/* Las compañías que NO dieron precio: sin ellas, «5 precios» se lee como
          «esto es el mercado entero». Cerrado por defecto (regla de rendimiento). */}
      {r.fallos.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ cursor: 'pointer', minHeight: 24, fontSize: 12 }}>
            {r.fallos.length} {r.fallos.length === 1 ? 'producto' : 'productos'} sin precio — ver por qué
          </summary>
          <ul style={{ margin: '6px 0 0' }}>
            {r.fallos.map((f, i) => (
              <li key={`${f.compania}-${i}`}>
                <strong>{f.compania ?? '—'}</strong>
                {f.producto ? ` · ${f.producto}` : ''}: {f.motivo ?? 'sin motivo declarado'}
                {f.tambienDioPrecio && (
                  <>
                    {' '}
                    <span className="badge ok">esta compañía sí dio otro precio</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Los supuestos, OTRA VEZ y al lado del precio: son la letra pequeña de
          esa cifra, y verlos antes de pulsar no basta. */}
      {r.supuestos.length > 0 && (
        <div
          style={{
            marginTop: 12,
            borderLeft: '3px solid var(--warn)',
            paddingLeft: 10,
          }}
        >
          <p className="muted" style={{ margin: '0 0 4px' }}>
            Este precio sale con estos supuestos. Si alguno no es cierto, la prima real cambia:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {r.supuestos.map((s, i) => (
              <li key={`${String(s.campo)}-${String(s.valor)}-${i}`}>
                <ValorSupuesto s={s} /> — {s.porque}
                {s.optimista && (
                  <>
                    {' '}
                    <span className="badge warn">puede abaratar el precio</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Piezas de la pantalla ───────────────────────────────────────────────────

/**
 * Un supuesto, con su valor — o con la explicación de por qué no lo hay.
 *
 * 🔒 `oculto` NO es «no hay valor»: es «lo hay y se queda en asegura», porque es
 * un dato personal del tomador (su código postal, típicamente). Pintarlo como
 * `null` o como un hueco diría que la ficha no lo trae, que es lo contrario de
 * lo que pasa. Y el supuesto se enseña ENTERO igualmente: es letra pequeña del
 * precio, y esconderlo por proteger el valor sería cambiar una fuga por un
 * silencio.
 */
export function ValorSupuesto({ s }: { s: Supuesto }) {
  return (
    <>
      <strong>{String(s.campo)}</strong>:{' '}
      {s.oculto ? (
        <span className="muted">
          (el dato está en la ficha; no sale de asegura por ser personal)
        </span>
      ) : (
        <code>{String(s.valor)}</code>
      )}
    </>
  )
}

/**
 * El cartel de simulación, arriba del todo y sin ambigüedad.
 *
 * 🚨 Sustituye al aviso ROJO de «tarificación apagada» que se pintaba aquí. Ese
 * aviso era falso con la simulación puesta: en `cotizar()` el paso 0 es la
 * simulación y va ANTES de mirar `CODEOSCOPIC_TARIFICACION_ACTIVA`, así que el
 * botón SÍ funciona y NO cuesta nada.
 */
/**
 * Avisa de que la pantalla ha arrancado con una cotización YA PAGADA, para
 * que no se lea como si el precio de abajo fuera gratis o recién pedido.
 * Todo lo prellenado sigue siendo editable: volver a pulsar «Pedir precio»
 * pide una cotización nueva (y esa sí cuesta 0,50€).
 */
function BannerRecuperada({
  guardadaPrevia,
  onDescartar,
}: {
  guardadaPrevia: TarificacionGuardadaAuto
  onDescartar: () => void
}) {
  const fecha = new Date(guardadaPrevia.creadaEn)
  const cuando = Number.isNaN(fecha.getTime())
    ? 'antes'
    : fecha.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div
      className="card"
      style={{ borderColor: 'var(--ok)', borderWidth: 2, background: 'rgba(22, 163, 74, 0.08)' }}
    >
      <p style={{ margin: 0, fontWeight: 800, color: 'var(--ok)' }}>
        📋 Cotización recuperada ({cuando})
      </p>
      <p style={{ margin: '4px 0 0' }}>
        Ya se pidió precio para esta póliza y sigue guardado — <strong>no se ha vuelto a cobrar</strong>.
        Los datos de abajo están precargados; se pueden cambiar y, si hace falta un precio nuevo,
        «Pedir precio» sigue funcionando (y ese sí cuesta 0,50€).
      </p>
      {/* 🚨 El botón «Emitir» de la tabla de precios de abajo confirma ESTE
          proyecto recuperado directamente — sin pasar por «Pedir precio» ni
          por el campo «Fecha de efecto». Si este proyecto quedó con una
          fecha que la compañía rechaza (>90 días vista) y no hay forma de
          corregirla (effectiveDate es de solo lectura tras crear el
          proyecto), pulsar «Emitir» aquí repite el mismo 400 para siempre.
          «Descartar» oculta el precio recuperado para forzar un «Pedir
          precio» de cero, con la fecha de efecto ya corregida. */}
      <button
        type="button"
        className="ghost"
        style={{ marginTop: 8 }}
        onClick={onDescartar}
      >
        Descartar y pedir precio de cero
      </button>
    </div>
  )
}

function BannerSimulacion() {
  return (
    <div
      className="card"
      style={{
        borderColor: 'var(--warn)',
        borderWidth: 2,
        background: 'rgba(217, 119, 6, 0.08)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: 'var(--warn)' }}>
        🧪 Modo simulación
      </p>
      <p style={{ margin: '4px 0 0' }}>
        Los precios que salgan aquí <strong>los inventamos nosotros</strong>: no se llama a ninguna
        compañía, <strong>no se cobra nada</strong> y no cuentan contra el tope. Sirve para probar la
        pantalla, no para dar un precio a un cliente.
      </p>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
        Lo decide el interruptor del servidor, nunca la pantalla ni la petición: si pudiera pedirse
        desde el navegador, cualquiera podría hacer que la app enseñara precios inventados.
      </p>
    </div>
  )
}

function CabeceraPaso({ n, titulo, sub }: { n: number; titulo: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 24,
            height: 24,
            flex: '0 0 auto',
            borderRadius: 999,
            background: 'var(--brand)',
            color: '#fff',
            fontWeight: 800,
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {n}
        </span>
        <h2 style={{ margin: 0 }}>{titulo}</h2>
      </div>
      {sub && (
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function Paso({
  n,
  titulo,
  sub,
  children,
}: {
  n: number
  titulo: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <CabeceraPaso n={n} titulo={titulo} sub={sub} />
      {children}
    </div>
  )
}

/**
 * Un campo del formulario: etiqueta, control, ayuda y —si falta— su marca.
 *
 * La marca va AQUÍ y no en una lista encima del botón: «falta la versión» a
 * diez centímetros del desplegable de la versión obliga a buscar dónde se
 * arregla.
 */
function Campo({
  id,
  etiqueta,
  falta,
  faltaTexto,
  ayuda,
  children,
}: {
  id: string
  etiqueta: string
  falta: boolean
  faltaTexto?: string
  ayuda?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{etiqueta}</span>
        {falta && <span className="badge warn">falta{faltaTexto ? ` · ${faltaTexto}` : ''}</span>}
      </label>
      {children}
      {ayuda && (
        <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          {ayuda}
        </span>
      )}
    </div>
  )
}

/**
 * Lo que la cartera YA sabe del coche: informativo, compacto y sin competir con
 * los campos.
 *
 * Sustituye al texto que durante un día negó que la compañía mandara el modelo.
 * Era falso y medido al revés: las 80 pólizas de auto vivas traen matrícula,
 * marca Y modelo. Lo único que no trae ninguna es la versión. (La frase exacta
 * no se repite aquí ni para citarla: la persigue un guardián por texto,
 * `test/regression-retarificar-vehiculo.test.ts`.)
 */
function SabidoDeLaFicha({
  vehiculo,
  autoMarca,
  autoModelo,
}: {
  vehiculo: VehiculoConocido | null
  autoMarca: Emparejamiento
  autoModelo: Emparejamiento
}) {
  // 🚨 `null` NO es «la póliza no dice el coche»: es que desde plataforma no se
  // ha podido mirar. Se declara, con el sitio donde sí está, en vez de dejar
  // dos desplegables en blanco que se leerían como una ausencia comprobada.
  if (vehiculo === null) {
    return (
      <div
        style={{
          background: 'var(--panel2)',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          padding: '10px 12px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 6,
        }}
      >
        <p className="muted" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
          MARCA Y MODELO: SIN COMPROBAR
        </p>
        <p style={{ margin: 0 }}>
          La póliza <strong>sí</strong> trae matrícula, marca y modelo, pero la precalificación de
          asegura no ha llegado, así que aquí <strong>no se han podido leer</strong>. No es que la
          compañía no los mande: es que no se han mirado. Elígelos abajo en el catálogo (gratis) o
          míralos en la ficha de la póliza.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Los desplegables son el catálogo de Codeoscopic y <strong>no cuestan nada</strong>.
        </p>
      </div>
    )
  }
  return (
    <div
      style={{
        background: 'var(--panel2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 6,
      }}
    >
      <p className="muted" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
        LO QUE YA SABEMOS
      </p>
      <p style={{ margin: 0 }}>
        La compañía manda <strong>matrícula, marca y modelo</strong>. Lo que no manda ninguna póliza
        es la <strong>versión</strong>, que es justo lo que pide el tarificador.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Dato etiqueta="Marca (ficha)" valor={vehiculo.marca} estado={autoMarca.estado} />
        <Dato etiqueta="Modelo (ficha)" valor={vehiculo.modelo} estado={autoModelo.estado} />
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Los desplegables son el catálogo de Codeoscopic y <strong>no cuestan nada</strong>: buscar el
        coche por matrícula sí costaría (créditos aparte, hoy sin contratar).
      </p>
    </div>
  )
}

function Dato({
  etiqueta,
  valor,
  estado,
}: {
  etiqueta: string
  valor: string | null
  estado: Emparejamiento['estado']
}) {
  return (
    <span style={{ minWidth: 0 }}>
      <span className="muted" style={{ fontSize: 12 }}>
        {etiqueta}:{' '}
      </span>
      {/* `null` = no consta en la póliza. No se pinta un hueco mudo. */}
      {valor === null ? (
        <span className="muted">no consta en la póliza</span>
      ) : (
        <strong>{valor}</strong>
      )}
      {valor !== null && estado === 'casa' && (
        <>
          {' '}
          <span className="badge ok">en el catálogo</span>
        </>
      )}
      {valor !== null && estado === 'no_casa' && (
        <>
          {' '}
          <span className="badge warn">no casa con el catálogo</span>
        </>
      )}
    </span>
  )
}

/** De dónde sale lo que hay puesto en un desplegable — o por qué no hay nada. */
function ProcedenciaCatalogo({
  emp,
  elegido,
  que,
}: {
  emp: Emparejamiento
  elegido: string
  que: string
}) {
  if (emp.estado === 'casa') {
    return elegido === emp.opcion.id ? (
      <>
        Viene de la ficha (<strong>{emp.texto}</strong>). Se puede cambiar.
      </>
    ) : (
      <>
        La ficha dice <strong>{emp.texto}</strong>; aquí hay elegida otra cosa a mano.
      </>
    )
  }
  if (emp.estado === 'no_casa') {
    return (
      <>
        La ficha dice <strong>{emp.texto}</strong>
        {emp.cuantas > 1
          ? `, pero el catálogo tiene ${emp.cuantas} entradas con ese mismo nombre y no se elige por ti: `
          : ', pero no está en el catálogo con ese nombre: '}
        elige la {que} a mano. <strong>No es que no lo sepamos</strong>: es que el catálogo lo llama
        de otra forma.
      </>
    )
  }
  if (emp.estado === 'sin_dato') {
    return <>La póliza no trae la {que}: elígela a mano.</>
  }
  return <>Sin preseleccionar: {emp.porque}.</>
}

/**
 * Las versiones vistas en OTRAS pólizas de la misma matrícula.
 *
 * 🚨 Son PISTAS, nunca una selección. Son texto histórico de otra póliza, no
 * códigos Base7 del catálogo, y con dos o más pueden contradecirse entre sí
 * (caso real: `FORTWO COUPE PURE 52…` contra `FORFOUR PURE 1.1…`). Con 2+
 * candidatas decide la persona, y la pantalla lo dice en vez de insinuar que
 * una de ellas es «el dato».
 */
function PistasDeVersion({ versiones }: { versiones: VersionCandidata[] }) {
  if (versiones.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Ninguna otra póliza de esta matrícula guarda la versión. Sale de la ficha técnica (campo{' '}
        <strong>D.2</strong>) o preguntando al cliente.
      </p>
    )
  }
  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--warn)',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>
        {versiones.length === 1 ? 'Una pista' : `${versiones.length} pistas`} para buscar la versión
      </p>
      <p className="muted" style={{ margin: '2px 0 6px', fontSize: 12 }}>
        Texto de otras pólizas de esta misma matrícula. <strong>No son opciones del catálogo</strong>{' '}
        y por eso no se preselecciona ninguna
        {versiones.length > 1 && (
          <>
            {' '}
            — y encima <strong>se contradicen entre sí</strong>, así que aquí decides tú
          </>
        )}
        .
      </p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {versiones.map((v, i) => (
          <li key={`${v.version}-${i}`}>
            <code>{v.version}</code>{' '}
            <span className="muted" style={{ fontSize: 12 }}>
              — {v.procedencia}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * El contador de gasto.
 *
 * En simulación no se toca el libro, así que su estado se cuenta como
 * información de contexto y NO en rojo: un «tarificación apagada» en rojo sobre
 * una pantalla que sí funciona y no cuesta nada es una afirmación falsa.
 */
function Contador({ consumo, simulacion }: { consumo: Consumo; simulacion: boolean }) {
  if (simulacion) {
    return (
      <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
        En simulación no se apunta nada en el libro de consumo ni cuenta contra el tope.{' '}
        {consumo.estado === 'error' ? (
          <>Estado del interruptor real (no afecta a esta pantalla): {consumo.error}</>
        ) : consumo.estado === 'no_disponible' ? (
          <>Del contador real no se sabe nada: {consumo.porque}</>
        ) : (
          <>
            Del contador real: gastado este mes {consumo.gastadoMes}
            {consumo.veredicto.permitido ? (
              <> · quedarían hoy {consumo.veredicto.restantesHoy} cotizaciones de verdad.</>
            ) : (
              <> · el tope real está alcanzado ({consumo.veredicto.explicacion}).</>
            )}
          </>
        )}
      </p>
    )
  }
  if (consumo.estado === 'error') {
    // Se ha mirado y la respuesta fue mala: eso sí frena.
    return <p className="err">{consumo.error}</p>
  }
  if (consumo.estado === 'no_disponible') {
    // 🚨 «No se ha podido mirar» NO es «quedan 0», y tampoco es «quedan
    // muchas»: no se pinta ninguna cifra. Se dice qué pasa si el tope salta,
    // que es lo único que se sabe con certeza.
    return (
      <p className="muted" style={{ marginBottom: 0 }}>
        <strong>No se ha podido leer el contador de gasto.</strong> {consumo.porque} El tope lo sigue
        aplicando asegura: si estuviera alcanzado, la respuesta lo dirá y{' '}
        <strong>no se cobrará nada</strong>.
      </p>
    )
  }
  return (
    <p className={consumo.veredicto.permitido ? 'muted' : 'err'} style={{ marginBottom: 0 }}>
      Gastado este mes: <strong>{consumo.gastadoMes}</strong>
      {consumo.veredicto.permitido ? (
        <>
          {' '}
          · quedan hoy <strong>{consumo.veredicto.restantesHoy}</strong> cotizaciones.
        </>
      ) : (
        <> — {consumo.veredicto.explicacion}</>
      )}
    </p>
  )
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const CAJA_SIMULACION: React.CSSProperties = {
  border: '1px solid var(--warn)',
  background: 'rgba(217, 119, 6, 0.08)',
  borderRadius: 8,
  padding: '10px 12px',
}

const CAJA_COSTE: React.CSSProperties = {
  border: '1px solid var(--danger)',
  background: 'rgba(220, 38, 38, 0.08)',
  borderRadius: 8,
  padding: '10px 12px',
}

/** Los campos que el corredor puede teclear cuando la ficha no los trae. */
const CAMPOS_A_MANO: Record<string, { etiqueta: string; tipo: string } | undefined> = {
  dni: { etiqueta: 'DNI', tipo: 'text' },
  nombre: { etiqueta: 'Nombre', tipo: 'text' },
  apellido1: { etiqueta: 'Primer apellido', tipo: 'text' },
  telefono: { etiqueta: 'Móvil', tipo: 'tel' },
  fechaNacimiento: { etiqueta: 'Fecha de nacimiento', tipo: 'date' },
  fechaCarnet: { etiqueta: 'Fecha del carnet', tipo: 'date' },
}

/**
 * Reparos que ESTA pantalla resuelve con un desplegable o una caja. Lo que no
 * esté aquí ni en `CAMPOS_A_MANO` se declara como «no se arregla desde aquí»
 * en vez de desaparecer: un hueco que no se ve es el peor de los estados.
 */
const RESUELTOS_EN_PANTALLA = new Set<string>([
  'codigoVehiculo',
  'garaje',
  'fechaMatriculacion',
  'municipioCirculacionId',
  'estadoCivil',
  'sexo',
])
