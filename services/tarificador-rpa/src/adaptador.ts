// Tipos del worker sobre el contrato de @central/module-tarificacion: el adaptador recibe la página
// de Playwright y un contexto con `pulsar()` (el único modo de pulsar algo: guardado contra emisión).

import type { Frame, Locator, Page } from 'playwright'
import type { ModalidadPortal, NombrePasoTraza, PermisoEmision } from '@central/module-tarificacion'
import type { ContextoTarificacion, RiesgoComunidad, TarificadorAdapter } from '@central/module-tarificacion'
import type { ContextoFormador } from './formador.ts'
import type { OpcionesMatSelect } from './mat-select.ts'
import type { PasoContinuarMapfre, ClaveAntecedenteTurismos, ResultadoAntecedenteTurismos, ResultadoCompaniaActualTurismos, ResultadoOpcionHogar, ResultadoPolizaActualTurismos, ResultadoGuardarPresupuestoTurismos, SelectorAvancePestana } from './guard.ts'

export type ContextoPortal = ContextoTarificacion & {
  /** Pulsa un botón/enlace SOLO si no casa con el patrón de emisión. Nunca `locator.click()`. */
  pulsar: (boton: Locator) => Promise<void>
  /** Lanza `ErrorTarificador('captcha')` si el portal presenta un reto: requiere_humano. */
  exigirSinCaptcha: () => Promise<void>
  /** Elige la modalidad (radio). Solo Datos Básicos, una vez por trabajo, pestaña verificada en DOM. */
  elegirOpcion: (modalidad: ModalidadPortal) => Promise<void>
  /** Avanza de Datos Básicos a Tarificar. Único «Aceptar» permitido (el de Tarificar EMITE: bloqueado). */
  avanzarATarificar: () => Promise<void>
  /**
   * Avance de pestaña AUTORIZADO de Allianz ePAC Moto (Alberto, 13/10/2026): `td#datosBasicos` o `td#rate`, nada más, por
   * `pulsarAvancePestanaAutorizado` de guard.ts (lista blanca de selectores + ventana de red con dos capas). Puede dejar un
   * PROYECTO guardado en Allianz (riesgo aceptado), nunca una póliza. Devuelve el marco del formulario de la pestaña destino.
   */
  avanzarPestanaAutorizada?: (selector: SelectorAvancePestana) => Promise<Frame>
  /** Pulsa la pestaña «Proyecto» (genera el PDF sin grabar). Solo desde Tarificar. */
  abrirProyecto: (pestana: Locator) => Promise<void>
  /**
   * Formador con IA (06/10/2026). `undefined` o `activo: false` = apagado. El adaptador lo usa como
   * FALLBACK: `resolverConFormador(page, ctx.formador, …)` cuando no encuentra un campo o una acción
   * permitida, y `acompanar(page, ctx.formador, paso, …)` en los `PUNTOS_ENGANCHE` (src/formador.ts).
   */
  formador?: ContextoFormador
  /** Pausa corta «humana» (300–1200 ms) antes de cada acción (campo o pulsación). */
  pausaAccion: () => Promise<void>
  /**
   * El contexto arrancó con la sesión guardada en memoria (src/sesion.ts). El adaptador comprueba que sirve y,
   * si sirve, se salta el login; si no, hace login normal. Nunca se le dan las cookies: solo esta bandera.
   */
  sesionReutilizada: boolean
  /**
   * Portal de sesión MANUAL (el adaptador declara `sesion: 'manual'`; p. ej. Generali, SMS en el acceso). El contexto
   * arranca con la sesión que inició Alberto a mano (src/sesion-manual.ts). El adaptador NUNCA hace login ni toca la
   * pantalla de código: si ve el login, lanza o sigue y el runner lo trata como sesión rechazada (se borra y avisa).
   */
  sesionManual: boolean
  /**
   * Traza (08/10/2026): ejecuta `fn` como un paso con nombre (de `PASOS_TRAZA`), midiendo duración y código de error, y
   * RELANZA lo que lance `fn`. No altera el flujo. Nunca se le pasa ningún valor del formulario: solo el nombre del paso.
   */
  paso: <T>(nombre: NombrePasoTraza, fn: () => Promise<T>) => Promise<T>
  /**
   * EMISIÓN (10/10/2026): solo existe en un trabajo de emisión en fase «ejecutar». Pulsa el ÚNICO botón del permiso, UNA
   * vez, por `pulsarEmisionAutorizada` de guard.ts (fase + DOM + permiso). El adaptador no nombra el botón.
   */
  pulsarEmision?: (permiso: PermisoEmision, vinculo: { trabajoId: string; hashDatos: string }) => Promise<void>
  /**
   * Enlace de MENÚ autorizado de la compañía del trabajo (Mapfre «Tarificación y Emisión Rápida», 14/10/2026), por
   * `pulsarEnlaceEntradaAutorizado` de guard.ts (texto EXACTO de una lista cerrada, una vez por etiqueta).
   */
  pulsarEnlaceEntrada?: (boton: Locator) => Promise<void>
  /**
   * Mapfre NSEI (14/10/2026): confirma el vehículo del diálogo «Selección de vehículo» por `confirmarVehiculoMapfre` de
   * guard.ts (una sola fila y con la matrícula del riesgo; la comparación se hace dentro del guard). El adaptador no
   * nombra los controles del diálogo. `pagina`: la pestaña de NSEI (la abre la entrada); tiene que ser del MISMO contexto
   * del navegador que el trabajo (el guard de red está instalado en él).
   */
  confirmarVehiculoMapfre?: (pagina: Page, matricula: string, indice?: number, denominacion?: string) => Promise<void>
  /**
   * Mapfre NSEI (14/10/2026): «Continuar» del stepper desde el paso `paso` por `pulsarContinuarMapfre` de guard.ts (lista
   * cerrada 1 → 2 → 3; el del paso 3 calcula las primas: PERMITIDO por Alberto). Una vez por paso y en orden. Misma regla de
   * contexto que `confirmarVehiculoMapfre`.
   */
  continuarMapfre?: (pagina: Page, paso: PasoContinuarMapfre) => Promise<void>
  /**
   * Mapfre NSEI (14/10/2026): elige en el diálogo de selección de persona del tomador la ÚNICA fila cuyo NIF normalizado es
   * el del riesgo (`elegirTomadorMapfre` de guard.ts; la comparación y el NIF no salen del guard). `ninguna`/`varias`/
   * `sin_control` = nada pulsado: el adaptador registra atasco.
   */
  elegirTomadorMapfre?: (pagina: Page, nif: string) => Promise<'elegido' | 'ninguna' | 'varias' | 'sin_control'>
  /** Mapfre NSEI: cierra el aviso «no existe ningún registro» (texto validado en guard.ts; un solo Aceptar/Cerrar). */
  cerrarAvisoTomadorMapfre?: (pagina: Page) => Promise<'sin_registro'>
  /**
   * Mapfre NSEI (grabación 15/10/2026): cierra el diálogo «Club MAPFRE» que sale tras calcular las primas, por su botón de la
   * IZQUIERDA (texto validado en guard.ts, `cerrarClubMapfre`). Una vez y solo tras el «Continuar» desde Figuras.
   */
  cerrarClubMapfre?: (pagina: Page) => Promise<'cerrado'>
  /**
   * Allianz HOGAR (14/10/2026): marca UNA opción del riesgo (madera, tipo de vivienda, régimen, uso) de la pantalla «Vivienda»
   * por `marcarOpcionRiesgoHogarAllianz` de guard.ts (lista cerrada de etiquetas EXACTAS, marco de la app de Hogar,
   * `comprobarBoton` antes del clic). `no_unica`/`no_quedo` = hueco de mapa: el adaptador para con inventario.
   */
  marcarOpcionHogar?: (marco: Frame, etiqueta: string) => Promise<ResultadoOpcionHogar>
  /**
   * Allianz HOGAR: marca el radio de una ETIQUETA ya resuelta por la capa común (aprendido → IA → elección humana en un atasco) cuando
   * la etiqueta exacta no casó, por `marcarOpcionResueltaHogarAllianz` (guard.ts: `<label for>` único del marco + radio único).
   */
  marcarOpcionHogarResuelta?: (marco: Frame, etiqueta: Locator) => Promise<ResultadoOpcionHogar>
  /** Allianz AUTOS Turismos (15/10/2026): marca «Sí» de «¿Conoces la matrícula?» por `marcarOpcionTurismosAllianz` (guard.ts: lista cerrada, app `ngx-motor-azs`). */
  marcarOpcionTurismos?: (marco: Frame, etiqueta: string) => Promise<ResultadoOpcionHogar>
  /** Allianz AUTOS Turismos (v0.6.4, 17/10/2026): elige la tarjeta de vehículo nº `indice` (con ESA etiqueta) tras «Encuentra mi vehículo», por `marcarTarjetaVehiculoTurismosAllianz` (guard.ts). */
  marcarTarjetaVehiculoTurismos?: (marco: Frame, indice: number, etiqueta: string) => Promise<ResultadoOpcionHogar>
  /** Allianz AUTOS Turismos (v0.6.5, 17/10/2026): abre «Compañía actual del vehículo», lee sus opciones y elige como mucho la ÚNICA que casa con `buscada`, por `companiaActualTurismosAllianz` (guard.ts). */
  companiaActualTurismos?: (marco: Frame, buscada: string | null) => Promise<ResultadoCompaniaActualTurismos>
  /** Allianz AUTOS Turismos (v0.6.10, 18/10/2026): contesta una pregunta de «Antecedentes» (dato, o la opción más favorable si `dato` es null) por `marcarAntecedenteTurismosAllianz` (guard.ts). */
  marcarAntecedenteTurismos?: (marco: Frame, clave: ClaveAntecedenteTurismos, dato: number | null) => Promise<ResultadoAntecedenteTurismos>
  /** Allianz AUTOS Turismos (v0.6.11, 19/10/2026): escribe los 5 últimos dígitos de la póliza actual en «Antecedentes» por `polizaActualTurismosAllianz` (guard.ts). Dato sensible. */
  polizaActualTurismos?: (marco: Frame, ultimos5: string | null) => Promise<ResultadoPolizaActualTurismos>
  /** Allianz AUTOS Turismos (v0.6.13, 18/10/2026, autorizado por Alberto): «Guardar presupuesto» (no vinculante) en la pantalla de precios por `guardarPresupuestoTurismosAllianz` (guard.ts). */
  guardarPresupuestoTurismos?: (marco: Frame, identificador: string) => Promise<ResultadoGuardarPresupuestoTurismos>
  /**
   * Generali (18/10/2026): botón de «Seleccionar mediador» por `pulsarMediadorGenerali` de guard.ts. El guard comprueba
   * que el desplegable `selectMediador` tiene puesto EXACTAMENTE el mediador de la correduría (`MEDIADOR_GENERALI`).
   */
  confirmarMediadorGenerali?: (selectMediador: Locator) => Promise<void>
  /** Generali (v0.2.3): «ENTRAR» de CorredorInicio.po tras aceptar el mediador, por `pulsarEntrarGenerali` de guard.ts (una vez). */
  entrarPortalGenerali?: () => Promise<void>
  /** Generali: entrada NEGOCIO › EMISIÓN › CONTRATACIÓN › AUTOMÓVILES › TURISMOS (RAMO UV) por `entrarTurismosGenerali` de guard.ts (una vez). */
  entrarTurismosGenerali?: () => Promise<void>
  /** Generali (v0.2.4): cierra el modal «¿Sabías qué…?» de CorredorPortal.po por `cerrarAvisoSabiasQueGenerali` de guard.ts (una vez; sin modal no hace nada). */
  cerrarAvisoSabiasQueGenerali?: () => Promise<'cerrado' | 'sin_aviso'>
  /**
   * Generali (v0.2.0, 19/10/2026): subpestaña de «Valoración Riesgo» por `pulsarSubpestanaGenerali` de guard.ts (lista blanca de
   * textos EXACTOS, hoy solo «Garantías y Resultados»; una vez por subpestaña). Devuelve el marco donde estaba la subpestaña.
   */
  pulsarSubpestanaGenerali?: (texto: string) => Promise<Frame>
  /** Generali (v0.2.6): «Placas especiales» = «No» del selector de vehículos por `marcarPlacasEspecialesGenerali` de guard.ts. */
  marcarPlacasEspecialesGenerali?: () => Promise<void>
  /** Generali (v0.2.6): «Confirmar» del selector de vehículos (solo confirma el vehículo) por `pulsarConfirmarVehiculoGenerali` de guard.ts (una vez). */
  confirmarVehiculoGenerali?: () => Promise<void>
  /** Generali (v0.2.7): abre «Todas las marcas» por su disparador (`abrirDesplegableMarcaGenerali` de guard.ts; id `buscamarca`, una vez). */
  abrirDesplegableMarcaGenerali?: (base: string) => Promise<void>
  /** Generali (v0.2.7): pulsa el `li` de la marca elegida (`elegirMarcaListaGenerali` de guard.ts; texto exacto, una vez). */
  elegirMarcaListaGenerali?: (base: string, texto: string) => Promise<void>
  /** Generali (v0.2.11): abre el desplegable «Modelo» por su disparador (`abrirDesplegableModeloGenerali` de guard.ts; id de menú PrimeFaces distinto del de marcas, una vez). */
  abrirDesplegableModeloGenerali?: (base: string) => Promise<void>
  /** Generali (v0.2.11): pulsa el `li` del modelo elegido o «Otros» (`elegirModeloListaGenerali` de guard.ts; texto exacto, una vez). */
  elegirModeloListaGenerali?: (base: string, texto: string) => Promise<void>
  /** Generali (v0.2.14): marca la potencia («116.0 CV») de su grupo en el selector (`elegirPotenciaGenerali` de guard.ts; solo ese grupo, una vez). */
  elegirPotenciaGenerali?: (grupo: string, texto: string) => Promise<void>
  /** Generali (v0.2.14): pulsa la fila de la tabla Código | Modelo | Versión de texto exacto (`elegirFilaVersionGenerali` de guard.ts; una vez). */
  elegirFilaVersionGenerali?: (codigo: string | null, version: string) => Promise<void>
  /**
   * «Continuar»/«Siguiente» GENÉRICO entre pantallas (pieza 4, 14/10/2026; continuar.ts): fijo → aprendido → IA, siempre por el
   * guard (`pulsar`), y espera a que la pantalla cambie (error tipado si no). `pagina`: por defecto la del trabajo. Para
   * cualquier bot; Mapfre NSEI usa `continuarMapfre` (stepper cerrado), que ya lleva el mismo respaldo.
   */
  continuar?: (pagina?: Page, opciones?: { desde?: string; llegado?: (p: Page) => Promise<boolean>; esperaMs?: number }) => Promise<void>
  /**
   * Elige una opción en un `mat-select` (Angular Material) / `role=combobox` (pieza 4; mat-select.ts): lee el overlay, coincidencia
   * clara con `valores` (textos del portal), si no la IA, si no `ErrorOpcionSinResolver`. Todo por el guard.
   */
  elegirMatSelect?: (select: Locator, valores: string | readonly string[], opciones: Pick<OpcionesMatSelect, 'etiqueta' | 'clave'>) => Promise<{ texto: string; origen: 'coincidencia' | 'ia' }>
}

/**
 * Lo que un adaptador con emisión sabe hacer (fase 1: Allianz Comunidades). Nada de esto pulsa el botón de emitir: lo
 * pulsa el runner con el permiso. `hastaPantallaPrevia` deja la página en la pantalla PREVIA (sin pulsar nada que emita)
 * y devuelve la prima total que enseña, en céntimos (`null` = no se pudo leer: no se sigue).
 */
export type EmisionPortal = {
  hastaPantallaPrevia: (page: Page, riesgo: RiesgoComunidad, ctx: ContextoPortal) => Promise<{ primaCents: number | null }>
  /** Tras el clic: nº de póliza si la pantalla lo enseña sin lugar a dudas. `null` = no consta (≠ «no se emitió»). */
  leerNumeroPoliza: (page: Page) => Promise<string | null>
}

export type AdaptadorPortal = TarificadorAdapter<Page, RiesgoComunidad, ContextoPortal> & {
  /** Adaptador de COMUNIDADES (riesgo `RiesgoComunidad`). Los de vehículo (auto/moto) son `AdaptadorVehiculo` (ramo.ts). */
  readonly ramo: 'comunidades'
  /** Clave de la credencial: fly secrets `CRED_<clave>_USER` / `CRED_<clave>_PASS`. */
  readonly credencial: string
  /** Versión semver del adaptador (empieza en '0.1.0'); el trabajo la guarda en `bot_version`. Súbela al tocar su navegación. */
  readonly version: string
  /**
   * `'manual'`: el portal pide SMS en el acceso. El robot no tiene credenciales de ese portal (no se leen los CRED_*),
   * solo reutiliza la sesión sellada que dio de alta una persona; sin ella, `requiere_humano` sin abrir el navegador.
   */
  readonly sesion?: 'manual'
  /**
   * `'okta-generali'` (19/10/2026): si el portal pide el SMS de Okta tras el login, el runner pide el código por Telegram
   * (relevo-sms.ts), verifica marcando «No volver a solicitar en este dispositivo en 30 días» y guarda el dispositivo de
   * confianza en la bóveda (30 días). Ausente = una pantalla de código es `requiere_humano`, como siempre.
   */
  readonly codigoSms?: 'okta-generali'
  /** Emisión asistida (10/10/2026). Ausente = este portal NO emite (y además tiene que estar en la lista blanca del módulo). */
  readonly emision?: EmisionPortal
}
