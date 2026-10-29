// EXPLORADOR IA del tarificador RPA — el worker (fase B, 13/10/2026). Plan: docs/TARIFICADOR-RPA.md («Explorador IA»).
//
//   login DETERMINISTA (CRED_*, código del adaptador) → entrada CERRADA (`ENTRADAS_EXPLORACION`) → bucle por pantalla:
//     1. CAPTCHA / SMS-OTP / ventana nueva → PARAR (nunca se automatiza; `requiere_humano` y el aviso sale de asegura);
//     2. inventario SANEADO con refs (lo único que sale hacia asegura y la IA) y parada determinista local;
//     3. `POST /api/tarificador/explorador/paso` → lote de acciones de la lista blanca (memoria del mapa o IA);
//     4. el lote se REVALIDA aquí contra el inventario PROPIO (`validarRespuestaExplorador`): nada sin validar toca el portal;
//     5. cada acción re-resuelve su ref (el MISMO nodo inventariado, vivo, visible, y con tag/id/name/texto iguales:
//        anti-TOCTOU) y se ejecuta: `rellenar` con el VALOR que pone el worker (`resolverDato`: sintético / riesgo del
//        trabajo / env de contacto; nunca a la IA ni al log), `elegir` por valor exacto, `marcar` y `avanzar` SOLO por
//        `ctx.pulsar()` (guard de emisión) o, el único «avance autorizado» de exploración, por la función guardada de
//        guard.ts. Se recoge la red no-GET (origen + ruta) de cada avance para el mapa.
//     6. GUARDAR EL PRESUPUESTO (Alberto, 14/10/2026): en la pantalla de RESULTADO, un `avanzar` con efecto
//        `guardar_presupuesto` (Grabar/Guardar/Archivar/Descargar/Imprimir/PDF; lista única del módulo) va SOLO por
//        `pulsarGuardadoPresupuesto` (guard.ts): se escucha el PDF ANTES del clic (`esperarPdf`), se lee la REFERENCIA del
//        texto de la pantalla (`extraerReferenciaPresupuesto`; nunca al log) y ambos viajan en el cierre/resultado.
//     7. «GUARDAR» DE UN MODAL autorizado por entrada (Alberto, 14/10/2026; hoy solo Occident Hogar, modal «Datos de la
//        situación»): un `avanzar` sobre ese botón va SOLO por `pulsarGuardadoDialogoAutorizado` (guard.ts), que repite vivo
//        el diálogo y su título exactos y exige un único candidato; no abre ventana de red.
//   → `POST …/cierre` (asegura construye el MAPA de SUS pasos) → `POST /api/tarificador/resultado` (`explorado` o error).
//
// 🚨 TARIFICAR ≠ EMITIR: este fichero no pulsa nada por su cuenta (sin `.click()`), no navega a URLs libres, no teclea
//    Enter ni ejecuta JS del portal. 🚨 Nunca se emite (guardar el presupuesto NO es emitir: Emitir/Contratar/Pagar… siguen
//    prohibidos en el validador, en `pulsar()` y en `pulsarGuardadoPresupuesto`). 🔑 Ningún valor de campo ni credencial va al log, a asegura ni a la IA.

import { randomUUID } from 'node:crypto'
import { chromium, type Browser, type Frame, type Locator, type Page } from 'playwright'
import {
  CLAVES_AUTOCOMPLETADO,
  CLAVES_VALIDAN_AL_SALIR,
  opcionTipoDocumento,
  tipoDocumentoDe,
  type TipoDocumento,
  EmisionBloqueadaError,
  ENTRADAS_EXPLORACION,
  rutasAppTolerablesDe,
  extraerReferenciaPresupuesto,
  detectarBucle,
  descripcionesElemento,
  detectarParada,
  MOTIVO_FRONTERA_CUENTA,
  senalCuentaBancaria,
  fronteraEmisionPorCampos,
  pareceDatoPersonalInventario,
  esAvanceAutorizado,
  esGuardadoEnDialogoAutorizado,
  esEntradaExploracion,
  loginAsistidoDe,
  huellaPantalla,
  huellaRelleno,
  incidenciasLoteCortado,
  indiceRefs,
  nombresCredencial,
  normalizarRedNoGet,
  ordenarLote,
  relocalizarElemento,
  redactarHtml,
  resolverDato,
  entradaConTomadorMediador,
  secretosDelEntorno,
  topesExplorador,
  validarRespuestaExplorador,
  type Credenciales,
  type DetalleFinExploracion,
  type ElementoInventario,
  type EntradaExploracion,
  type IncidenciaEjecucion,
  type MarcoInventario,
  type MotivoCorteLote,
  type MotivoNoLocalizado,
  type MotivoParar,
  type VisibilidadNoVisible,
  type MotivoSinDato,
  type PantallaGuardado,
  type PresupuestoMapa,
  type TipoError,
} from '@central/module-tarificacion'
import { cerrarExploracion, enviarResultado, pedirPaso, type Config, type CuerpoResultado, type CuerpoResultadoPresupuesto, type RespuestaPaso, type Trabajo } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { ErrorTarificador, ErrorVerificacionHumana, clasificar } from './errores.ts'
import { cerrarFaseEntrada, ErrorFronteraEmision, GuardadoConDialogoError, cerrarDialogoTerminoEpac, controlOcultoDeEtiqueta, instalarGuardEmision, precioVistoEn, registrarPrecioVisto, pulsar, pulsarAccesoNseMapfre, pulsarMenuOfertaNseMapfre, pulsarEnlaceEntradaAutorizado, tolerarRutasApp, pulsarExploracionAutorizada, pulsarGuardadoDialogoAutorizado, pulsarGuardadoPresupuesto, type GuardEmision } from './guard.ts'
import { esperarPdf } from './descarga-pdf.ts'
import { capturarInventarioExploracion, type InventarioExploracion } from './inventario-dom.ts'
import { modoVistaExplorador, vistaDelPaso } from './aprendizaje/vista-aria.ts'
import { ESTABILIDAD_POR_DEFECTO, esperarEstable, vigilarRed, type OpcionesEstabilidad, type VigiaRed } from './estabilidad.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { capturarEvidencia, type EvidenciaFallo } from './evidencia.ts'
import { abrirNuevaAlta, esperarMarcoApp, login as loginEpac, type PestanaEntradaAllianz } from './adapters/allianz/intranet/index.ts'
import { login as loginMapfre } from './adapters/mapfre/login.ts'
import { abrirTarificacionPatineteMapfre, abrirTarificacionRapidaAuto } from './adapters/mapfre/entrada.ts'
import { abrirTarificacionHogar, cabeceraPortalVisible, esperarPortalOSso as esperarPortalOSsoOccident, loginPaso1 as loginPaso1Occident, pulsarSeguro as pulsarSeguroOccident } from './adapters/occident/hogar.ts'
import { esUrlSso as esUrlSsoOccident } from './adapters/occident/mapa.ts'
import { abrirFormularioViviendaFidelidade, loginFidelidade } from './adapters/fidelidade/entrada.ts'
import { loginAsistido, type CtxLoginAsistido } from './login-asistido.ts'
import type { ContextoPortal } from './adaptador.ts'
import type { Log } from './log.ts'

/** Versión del explorador del worker (va en `bot_version`). Súbela al tocar su navegación. 0.3.15 (29/10/2026): el validador deja marcar radios y casillas de consentimiento/declaración (decisión de Alberto); una casilla ya marcada no se vuelve a pulsar. 0.3.14 (29/10/2026): elección determinista de «Oficina Virtual» repetida en Fidelidade; nombre de pantalla recortado, `motivo` ignorado fuera de parar, onclick hasta 200 car., avance ePAC con títulos recortados (guard vivo), errores con causa. 0.3.9 (28/10/2026): tipo de documento también si `_tipoDoc` es input+lista/JSF (pulsar guardado) y avisos modales de Mapfre tras abrir cada menú; portal de exploración de Fidelidade (Vivienda): login + OFICINA VIRTUAL › PROYECTO › Nuevo proyecto › tarjeta 4216 › «Simulación» por la puerta exacta del guard. 0.3.8 (28/10/2026): tipo de documento pareado (NIF/NIE/CIF) antes del documento; el guard nombra el parámetro del cuerpo que casa en la ruta tolerada. 0.3.7: diagnóstico si NSE vuelve a su portada tras «Oferta / Contratación»; inventario con mensaje de error de campos inválidos y avisos del portal. 0.3.6: NIF del tomador validado (blur + espera de red) antes de la acción siguiente; tolerancia NSE también en el menú «Oferta / Contratación» (índices sin desplazar) y no con texto de acción real. 0.3.5: ruta de app NSE `/EVT21_NSE_FWEB/app/emision/` tolerada SOLO en Mapfre patinete (decisión de Alberto). 0.3.4: diálogo «Atención» del término de ePAC cerrado por código («Cancelar»); «Oferta / Contratación» del menú NSE de Mapfre por su puerta; entradas de menú (<a>, menuitem/link) avanzables. 0.3.3: ventana NSE de Mapfre adoptada (sin `sin_salida` falso), destino del avance drvp00 = servlet del marco, ids con `$`. 0.3.2: «Acceso a NSE» de Mapfre Patinetes por su puerta exacta; radios ocultos de ePAC por su label; avance `#btnAceptar`+`eventoSiguiente()` de drvp00. */
export const EXPLORADOR_VERSION = '0.3.15'

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)
const TOPE_PASO_MS = 30_000
/** Margen sobre el tope de tiempo del explorador para cerrar y mandar el resultado. */
const MARGEN_CIERRE_MS = 90_000
const ATRIBUTO_MARCA = 'data-explorador-ref'
/** Lotes seguidos cortados por repintado (sin completar ninguno) antes de darlo por bucle. */
const MAX_REPINTADOS_SEGUIDOS = 4
/** Tras rellenar un campo que autocompleta (CP, provincia…): margen para que el portal repinte antes de reinventariar. */
const ESPERA_REPINTADO_MS = 1_500
/** Mismos topes de evidencia que el flujo real (runner.ts). */
const MAX_BYTES_CAPTURA = 4 * 1024 * 1024
const MAX_BYTES_HTML = 2 * 1024 * 1024
/** Espera del PDF tras cada pulsación de guardado (si el portal no da PDF en ese clic, se sigue sin él). */
const TOPE_PDF_GUARDADO_MS = 15_000
/** Tope del PDF del presupuesto (el de asegura para un adjunto es 10 MB). */
const MAX_BYTES_PDF_PRESUPUESTO = 9 * 1024 * 1024

// ─── Portales: login y entrada, por CÓDIGO (la IA arranca después) ────────────

export type CtxEntrada = Pick<ContextoPortal, 'credenciales' | 'pausa' | 'pulsar' | 'exigirSinCaptcha' | 'log'> & {
  /** Enlace de menú autorizado de la compañía del trabajo (`pulsarEnlaceEntradaAutorizado`); solo en la ENTRADA. */
  pulsarEnlaceEntrada: (boton: Locator) => Promise<void>
  /** «Acceso a NSE» de Mapfre Patinetes (`pulsarAccesoNseMapfre`); solo en la ENTRADA. */
  pulsarAccesoNse?: (boton: Locator) => Promise<void>
  /** «Oferta / Contratación» del menú NSE de Mapfre (`pulsarMenuOfertaNseMapfre`); solo en la ENTRADA. */
  pulsarMenuNse?: (boton: Locator) => Promise<void>
  /**
   * LOGIN ASISTIDO (14/10/2026): SOLO si la compañía de la entrada está en `LOGIN_ASISTIDO` (hoy Occident). Lo que la fase
   * necesita además del contexto: la entrada, el guard (ventana de red del login) y el paso de login hacia asegura.
   */
  loginAsistido?: Pick<CtxLoginAsistido, 'entrada' | 'guard' | 'pedirPaso' | 'log'>
}

export type PortalExploracion = {
  /** Clave de los fly secrets `CRED_<clave>_USER/_PASS`. */
  credencial: string
  /** Devuelve la página donde sigue la exploración si la entrada abrió una PESTAÑA NUEVA; sin valor = la misma `page`. */
  entrar: (page: Page, ctx: CtxEntrada, e: EntradaExploracion) => Promise<Page | void>
}

/** Lista CERRADA de portales con entrada de exploración. Otra compañía = sin portal = no se abre el navegador. */
export const PORTALES_EXPLORACION: Readonly<Record<string, PortalExploracion>> = Object.freeze({
  allianz: Object.freeze({
    credencial: 'ALLIANZ_EPAC',
    entrar: async (page: Page, ctx: CtxEntrada, e: EntradaExploracion) => {
      await loginEpac(page, ctx)
      await exigirSinVerificacion(page, 'allianz')
      await abrirNuevaAlta(page, ctx, { pestana: e.pestana as PestanaEntradaAllianz, producto: e.productoMenu })
      // El formulario vive en el iframe `appArea`: sin esperarlo, el paso 1 inventariaba la carcasa con el modal abierto.
      await esperarMarcoApp(page)
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await ctx.exigirSinCaptcha()
    },
  }),
  // Mapfre wmediadores (14/10/2026): login → menús → «Tarificación y Emisión Rápida», que abre una PESTAÑA NUEVA con el
  // formulario NSEI; `entrar` la DEVUELVE y el bucle sigue en ella (la original queda abierta y no cuenta como ventana
  // nueva). El contexto NO lleva `httpCredentials` (a propósito: el diálogo de auth básica se cancela con 401).
  mapfre: Object.freeze({
    credencial: 'MAPFRE_WMEDIADORES',
    entrar: async (page: Page, ctx: CtxEntrada, e: EntradaExploracion): Promise<Page> => {
      await loginMapfre(page, ctx)
      await exigirSinVerificacion(page, 'mapfre')
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await ctx.exigirSinCaptcha()
      // Patinetes (28/10/2026): tarjeta «Patinetes» › «Tarificación y Emisión» (MásPatín). El resto de Mapfre: Turismos y Motos.
      if (e.ramo === 'patinete') {
        const pat = await abrirTarificacionPatineteMapfre(page, ctx)
        await exigirSinVerificacion(pat, 'mapfre')
        await pat.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
        await exigirSinCaptcha(pat)
        return pat
      }
      const nsei = await abrirTarificacionRapidaAuto(page, ctx)
      await exigirSinVerificacion(nsei, 'mapfre')
      await nsei.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await exigirSinCaptcha(nsei)
      return nsei
    },
  }),
  // Fidelidade (28/10/2026): intranet de mediadores con usuario y contraseña (sin 2FA) → «OFICINA VIRTUAL › PROYECTO › Nuevo proyecto» →
  // tarjeta «Producto 4216 · Fidelidade Vivienda» (nunca EMPRESAS) → «Simulación». Los clics de la ruta, SOLO por `pulsarEnlaceEntrada`
  // (puerta exacta del guard). Devuelve la página del formulario (la misma, o la pestaña nueva si «Simulación» la abre).
  fidelidade: Object.freeze({
    credencial: 'FIDELIDADE_MEDIADORES',
    entrar: async (page: Page, ctx: CtxEntrada, _e: EntradaExploracion): Promise<Page> => {
      await loginFidelidade(page, ctx)
      await exigirSinVerificacion(page, 'fidelidade')
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await ctx.exigirSinCaptcha()
      return abrirFormularioViviendaFidelidade(page, ctx)
    },
  }),
  // Occident (14/10/2026): SSO → menú «Productos › Análisis de necesidades › Hogar › Tarificación» → ruta SPA de hogar, con el
  // formulario en un iframe (el inventario ya recorre los marcos, como el `appArea` de Allianz). Paso 1 del SSO grabado
  // (`occident/hogar.ts`); la 2.ª pantalla (dos variantes sin DOM) la resuelve el LOGIN ASISTIDO (`login-asistido.ts`: la IA
  // solo ve claves, nunca credenciales). Hosts = lista blanca de `occident/guarda.ts` (sin ampliar). La misma `page`.
  occident: Object.freeze({
    credencial: 'OCCIDENT_PORTAL',
    entrar: async (page: Page, ctx: CtxEntrada, _e: EntradaExploracion) => {
      const resolverSso = async () => {
        if (!ctx.loginAsistido) throw new ErrorTarificador('portal', 'occident: la 2.ª pantalla del SSO solo se resuelve con el login asistido')
        await loginAsistido(page, {
          ...ctx.loginAsistido, credenciales: ctx.credenciales, pausa: ctx.pausa, exigirSinCaptcha: ctx.exigirSinCaptcha,
          pulsar: (boton) => pulsarSeguroOccident(ctx, boton),
          enPortal: (ms) => cabeceraPortalVisible(page, ms),
        })
      }
      if (await loginPaso1Occident(page, ctx)) {
        await resolverSso()
      } else if (esUrlSsoOccident(page.url())) {
        await resolverSso()
      } else {
        // Carrera SSO/cabecera (la cabecera puede ser fugaz y acabar en el SSO); gana el SSO → login asistido.
        const donde = await esperarPortalOSsoOccident(page, 25_000)
        if (donde === 'sso') await resolverSso()
        else if (donde === null) throw new ErrorTarificador('credenciales', 'occident: no se llegó al portal (sin SSO ni cabecera)')
      }
      ctx.log('login ok')
      await exigirSinVerificacion(page, 'occident')
      await abrirTarificacionHogar(page, ctx)
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      await ctx.exigirSinCaptcha()
    },
  }),
})

// ─── Reglas puras (con test) ─────────────────────────────────────────────────

export type MotivoFinExploracion = MotivoParar | 'resultado' | 'bucle' | 'tope' | 'error_portal' | 'guard_emision'
export type EfectoPortal = 'posible_proyecto_guardado' | 'presupuesto_guardado' | 'ninguno_visto'

/** Lo que dejó el guardado del presupuesto en el worker (el PDF va en bytes; al cierre solo si llegó). */
export type PresupuestoWorker = { guardado: boolean; referencia: string | null; pdf: Buffer | null; pdfIntentado: boolean }

/** Para el cierre (`mapa.presupuesto`): tres estados del PDF (`null` = no se intentó). Pura. */
export function presupuestoParaCierre(p: PresupuestoWorker): PresupuestoMapa {
  if (!p.guardado) return { guardado: false, referencia: null, pdf: null }
  return { guardado: true, referencia: p.referencia, pdf: p.pdf ? true : p.pdfIntentado ? false : null }
}

/** Para el resultado del trabajo: `null` sin guardado; si no, referencia y PDF (base64) si llegó. Pura. */
export function presupuestoParaResultado(p: PresupuestoWorker, compania: string): CuerpoResultadoPresupuesto | null {
  if (!p.guardado) return null
  return { referencia: p.referencia, pdf: p.pdf ? { nombre: `presupuesto-${compania}.pdf`, base64: p.pdf.toString('base64') } : null }
}

export type FinBucle = {
  /** `perdido` = asegura ya no reconoce la exploración (404): ni cierre ni resultado. */
  motivo: MotivoFinExploracion | 'perdido'
  error: { tipo: TipoError; mensaje: string } | null
  redNoGet: string[]
  efectos: EfectoPortal[]
  pasos: number
  acciones: number
  /** Guardado del presupuesto (14/10/2026). Ausente = nada guardado. */
  presupuesto?: PresupuestoWorker
  /** Qué comprobación del worker cortó (lista cerrada, sin valores): distingue los `ambiguo` entre sí. */
  detalle?: DetalleFinExploracion
  /** 0.3.11: motivo legible del fin (p. ej. «frontera bancaria: campo «<etiqueta>»», ≤60). Solo ETIQUETA del campo, nunca su valor. */
  nota?: string
  /** Incidencias de ejecución del ÚLTIMO lote aún sin contar a asegura (van en el cierre). Sin valores. */
  incidencias?: IncidenciaEjecucion[]
  /** Solo en los fallos de la ENTRADA cerrada (antes del primer paso): URL, captura y HTML ya redactados. */
  evidencia?: EvidenciaSaneada
}

/** Evidencia lista para salir hacia asegura: URL redactada, captura y HTML con marcos pasado por `redactarHtml`. */
export type EvidenciaSaneada = { url: string | null; capturaBase64?: string; html?: string }

/**
 * Evidencia cruda → la que sale (como el runner del flujo real): URL por el redactor, HTML por `redactarHtml` con los
 * secretos del entorno, y captura/HTML solo si caben en los topes. Pura.
 */
export function sanearEvidencia(ev: EvidenciaFallo, redactar: (t: string) => string, secretos: readonly string[]): EvidenciaSaneada {
  const html = ev.html ? redactarHtml(ev.html, secretos) : null
  return {
    url: ev.url ? redactar(ev.url).slice(0, 500) : null,
    ...(ev.captura && ev.captura.length <= MAX_BYTES_CAPTURA ? { capturaBase64: ev.captura.toString('base64') } : {}),
    ...(html && Buffer.byteLength(html) <= MAX_BYTES_HTML ? { html } : {}),
  }
}

/**
 * ¿Se corta el lote tras este `rellenar` para volver a inventariar? Sí si la clave suele disparar autocompletado
 * (`CLAVES_AUTOCOMPLETADO`) o si la pantalla cambió de estructura (huella o nº de elementos) tras escribir. Pura.
 */
export function cortarLoteTrasRellenar(dato: string, antes: { huella: string; elementos: number }, despues: { huella: string; elementos: number } | null): boolean {
  return motivoCorteTrasRellenar(dato, antes, despues) !== null
}

/** El MOTIVO del corte tras un `rellenar` (`null` = no se corta): autocompletar, huella o nº de elementos. Pura. */
export function motivoCorteTrasRellenar(dato: string, antes: { huella: string; elementos: number }, despues: { huella: string; elementos: number } | null): MotivoCorteLote | null {
  if (CLAVES_AUTOCOMPLETADO.has(dato)) return 'autocompletar'
  if (despues === null) return null
  if (despues.huella !== antes.huella) return 'huella'
  return despues.elementos !== antes.elementos ? 'n_elementos' : null
}

const nElementos = (inv: InventarioExploracion['inventario']) => inv.marcos.reduce((n, m) => n + m.elementos.length, 0)

/** Un dato que no se puede poner → por qué se para (fail-closed: nunca se inventa). */
export function motivoSinDato(m: MotivoSinDato): MotivoParar {
  // `dato_no_disponible` (14/10/2026): falta un dato del riesgo (año, m²…), no es un dato SENSIBLE; decirlo así despistaba.
  return m === 'clave_desconocida' ? 'ambiguo' : m === 'dato_no_disponible' ? 'dato_no_disponible' : 'dato_sensible_requerido'
}

/**
 * ¿El control quedó con el valor escrito? (14/10/2026: un datepicker Angular puede vaciar o reformatear lo que `fill` puso.)
 * Tolera el reformateo del portal: espacios, «€», separadores de fecha/miles/decimales («15/01/1980» ↔ «15-01-1980»,
 * «120000» ↔ «120.000,00»). Vacío o distinto → `false`. Pura; los valores nunca salen de aquí.
 */
export function valorAplicado(escrito: string, leido: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/€/g, '')
  const a = n(escrito)
  const b = n(leido)
  if (b === '') return a === ''
  if (a === b) return true
  const sinSep = (s: string) => s.replace(/,0+$/, '').replace(/[.,/-]/g, '')
  return sinSep(a) === sinSep(b)
}

/**
 * Qué hacer con un `rellenar` cuya clave no tiene valor (13/10/2026). Con datos REALES y una clave del riesgo ausente
 * (`dato_no_disponible`: p. ej. año o m², que el portal autocompleta del Catastro tras la dirección) y el control YA
 * relleno por el portal → `saltar` (no se toca). En cualquier otro caso, parar: nunca un valor de prueba en su lugar.
 */
export function accionSinDato(m: MotivoSinDato, conDatosReales: boolean, controlConValor: boolean): 'saltar' | MotivoParar {
  if (m === 'dato_no_disponible' && conDatosReales && controlConValor) return 'saltar'
  return motivoSinDato(m)
}

/** Lo que se lee del nodo VIVO justo antes de tocarlo. */
export type NodoVivo = { tag: string; id: string | null; name: string | null; type: string | null; texto: string }

const sinElipsis = (s: string) => (s.endsWith('…') ? s.slice(0, -1) : s)
const plano = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Anti-TOCTOU: ¿el nodo vivo sigue siendo el elemento del inventario? Mismo tag; id/name/type iguales cuando el inventario
 * los tiene (si el saneado los recortó, por prefijo); y el texto visible igual (o prefijo, si se recortó). Si el inventario
 * no tiene un atributo (p. ej. lo quitó el filtro de datos personales) no se compara: lo demás tiene que casar.
 */
export function coincideConInventario(vivo: NodoVivo | null, el: ElementoInventario): boolean {
  return motivoNoCoincide(vivo, el) === null
}

/**
 * La misma comprobación que {@link coincideConInventario}, pero diciendo QUÉ no casa (`null` = es él): `desconectado` (sin
 * nodo vivo) o `no_coincide_<tag|id|name|type|texto>`. Solo el nombre del atributo, nunca su valor. Pura.
 */
export function motivoNoCoincide(vivo: NodoVivo | null, el: ElementoInventario): MotivoNoLocalizado | null {
  if (!vivo) return 'desconectado'
  if (vivo.tag !== el.tag) return 'no_coincide_tag'
  const igual = (inv: string | undefined, v: string | null) => {
    if (inv === undefined) return true
    const base = sinElipsis(inv)
    return inv.endsWith('…') ? plano(v).startsWith(base) : plano(v) === inv
  }
  if (!igual(el.id, vivo.id)) return 'no_coincide_id'
  if (!igual(el.name, vivo.name)) return 'no_coincide_name'
  if (!igual(el.type, vivo.type)) return 'no_coincide_type'
  return igual(el.texto, vivo.texto) ? null : 'no_coincide_texto'
}

/** Lo que se lee de la CAJA de un nodo que Playwright no ve (solo medidas y estilo; nunca valores). */
export type CajaNodo = { ancho: number; alto: number; estiloVisible: boolean }

/** Por qué no se ve: oculto por estilo/ancestro (`checkVisibility`, `visibility`), o la caja sin ancho, sin alto o sin ambos. Pura. */
export function visibilidadDeCaja(c: CajaNodo): VisibilidadNoVisible {
  if (!c.estiloVisible) return 'oculto'
  if (c.ancho <= 0 && c.alto <= 0) return 'sin_caja'
  return c.ancho <= 0 ? 'sin_ancho' : c.alto <= 0 ? 'sin_alto' : 'oculto'
}

/** Fecha dd/mm/aaaa → aaaa-mm-dd para un `<input type=date>` (el catálogo da dd/mm/aaaa). Otra forma: tal cual. */
export function valorParaControl(valor: string, el: ElementoInventario): string {
  if (el.tag !== 'input' || (el.type ?? '').toLowerCase() !== 'date') return valor
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : valor
}

/** Del error que cortó la exploración a su motivo de fin. Nunca lanza. */
/** 0.3.11: «frontera bancaria: campo «<etiqueta>»» (≤60). La etiqueta del control, nunca su valor. */
export function notaFronteraBancaria(etiqueta: string): string | null {
  // SOLO el nombre canónico de la lista cerrada (`CAMPOS_BANCARIOS`): el texto libre de la pantalla puede llevar un IBAN.
  const campo = fronteraEmisionPorCampos([etiqueta]).campoBancario
  return campo === null ? null : `frontera bancaria: campo «${campo}»`
}

export function finDeError(e: unknown): { motivo: MotivoFinExploracion; error: { tipo: TipoError; mensaje: string } | null; detalle?: DetalleFinExploracion; nota?: string } {
  if (e instanceof ErrorVerificacionHumana) return { motivo: 'otp', error: null }
  // Frontera de emisión (cuenta bancaria en pantalla): fin CORRECTO de la exploración, no un fallo del guard.
  if (e instanceof ErrorFronteraEmision) return { motivo: 'cerca_de_emision', error: null, detalle: 'frontera_cuenta_bancaria', ...(notaFronteraBancaria(e.etiqueta) !== null ? { nota: notaFronteraBancaria(e.etiqueta)! } : {}) }
  if (e instanceof EmisionBloqueadaError) return { motivo: 'guard_emision', error: { tipo: 'emision', mensaje: e.message } }
  if (e instanceof ErrorTarificador && e.tipo === 'captcha') return { motivo: 'captcha', error: null }
  const c = clasificar(e)
  return { motivo: 'error_portal', error: { tipo: c.tipo === 'emision' ? 'emision' : c.tipo, mensaje: c.mensaje } }
}

/**
 * El cuerpo del resultado que cierra el TRABAJO. OTP/SMS y CAPTCHA → `captcha` (requiere_humano: una persona; el aviso sale
 * de asegura). Guard de emisión → `emision`. Fallo del portal/infra → su tipo. Cualquier otra parada (incluido llegar al
 * precio, `cerca_de_emision`, `dato_sensible_requerido`, bucle, topes) es una exploración TERMINADA: `explorado`.
 */
export function resultadoDeFin(trabajoId: string, compania: string, fin: Pick<FinBucle, 'motivo' | 'error' | 'evidencia' | 'presupuesto'>, redactar: (t: string) => string): CuerpoResultado | null {
  const meta = { botVersion: EXPLORADOR_VERSION }
  // Evidencia de la entrada (si la hay): URL en el error; captura y HTML al lado, como en el flujo real.
  const ev = fin.evidencia
  const url = ev?.url ?? null
  const adjuntos = { ...(ev?.capturaBase64 ? { capturaBase64: ev.capturaBase64 } : {}), ...(ev?.html ? { html: ev.html } : {}) }
  if (fin.motivo === 'perdido') return null
  if (fin.motivo === 'otp') return { trabajoId, resultado: 'error', error: { tipo: 'captcha', mensaje: new ErrorVerificacionHumana(compania).message, url }, ...adjuntos, ...meta }
  if (fin.motivo === 'captcha') return { trabajoId, resultado: 'error', error: { tipo: 'captcha', mensaje: 'exploración: el portal presenta un CAPTCHA: requiere una persona', url }, ...adjuntos, ...meta }
  if (fin.motivo === 'guard_emision' || fin.motivo === 'error_portal') {
    const tipo: TipoError = fin.error?.tipo ?? (fin.motivo === 'guard_emision' ? 'emision' : 'portal')
    return { trabajoId, resultado: 'error', error: { tipo, mensaje: redactar(`exploración: ${fin.error?.mensaje ?? fin.motivo}`).slice(0, 2000), url }, ...adjuntos, ...meta }
  }
  // Presupuesto guardado: su referencia y su PDF viajan con el resultado (asegura guarda el PDF como documento del trabajo).
  const presupuesto = fin.presupuesto ? presupuestoParaResultado(fin.presupuesto, compania) : null
  return { trabajoId, resultado: 'explorado', motivoFin: fin.motivo, ...(presupuesto ? { presupuesto } : {}), ...meta }
}

// ─── El bucle (sobre una página ya dentro del portal) ────────────────────────

export type ContextoBucle = {
  trabajoId: string
  compania: string
  ramo: string
  entrada: string
  conDatosReales: boolean
  riesgo: unknown
  env: Record<string, string | undefined>
  guard: GuardEmision
  /** `ctx.pulsar` del runner: pausa + `pulsar(boton, guard)`. */
  pulsar: (boton: Locator) => Promise<void>
  /** El único avance «autorizado» de exploración (guard.ts). */
  pulsarAutorizado: (boton: Locator, el: ElementoInventario, marco: MarcoInventario) => Promise<void>
  /** El guardado de presupuesto autorizado (guard.ts, `pulsarGuardadoPresupuesto`). `trasClic` espera el PDF dentro de la ventana. */
  pulsarGuardado: (boton: Locator, el: ElementoInventario, pantalla: PantallaGuardado, trasClic: () => Promise<void>) => Promise<void>
  /** El «Guardar» de un modal autorizado por entrada (guard.ts, `pulsarGuardadoDialogoAutorizado`). */
  pulsarGuardadoDialogo: (boton: Locator, el: ElementoInventario, marco: MarcoInventario) => Promise<void>
  pausaAccion: () => Promise<void>
  /** `incidencias` (14/10/2026): lo que el lote ANTERIOR no pudo aplicar (ref + clave + causa; nunca el valor). */
  pedirPaso: (cuerpo: { trabajoId: string; inventario: InventarioExploracion['inventario']; avancesFallidos: number; incidencias?: IncidenciaEjecucion[]; vistaAria?: string }) => Promise<RespuestaPaso>
  log: Log
  ahora?: () => number
  hoy?: () => Date
  /** Espera tras rellenar un campo que autocompleta, antes de reinventariar (por defecto `ESPERA_REPINTADO_MS`). */
  esperaRepintadoMs?: number
  /** Páginas que ya existían al terminar la ENTRADA (por defecto, solo `page`): cualquier otra = ventana nueva → `sin_salida`. */
  paginasDeEntrada?: readonly Page[]
  /** Espera del PDF tras cada guardado (por defecto `TOPE_PDF_GUARDADO_MS`). */
  topePdfMs?: number
  /** Pantalla QUIETA (sin red en vuelo ni DOM cambiando) antes de inventariar y de tocar nada (`esperarEstable`). */
  estabilidad?: OpcionesEstabilidad
}

class Parar extends Error {
  constructor(readonly motivo: MotivoFinExploracion | 'perdido', readonly detalle?: DetalleFinExploracion, readonly nota?: string) {
    super(`parar:${motivo}`)
  }
}

/**
 * El bucle del explorador. Nunca lanza: devuelve cómo terminó. Topes locales (los del módulo; el env solo los baja):
 * pasos, acciones y tiempo; asegura aplica además los de llamadas y €.
 */
export async function bucleExploracion(page: Page, k: ContextoBucle): Promise<FinBucle> {
  const ahora = k.ahora ?? Date.now
  const inicio = ahora()
  const topes = topesExplorador(k.env)
  const modoVista = modoVistaExplorador(k.env)
  const red = new Set<string>()
  const efectos = new Set<EfectoPortal>()
  const huellas: string[] = []
  const deEntrada = new Set<Page>(k.paginasDeEntrada ?? [page])
  /** Huella de RELLENO de cada pantalla de `huellas` (alineadas): misma huella con más campos rellenos no es bucle. */
  const rellenos: (string | null)[] = []
  let pasos = 0
  let acciones = 0
  let avancesFallidos = 0
  let huellaAntesDeAvanzar: string | null = null
  let captura: InventarioExploracion | null = null
  /** El lote anterior se CORTÓ porque la pantalla se repintó (no terminó): esta pantalla no cuenta para el bucle. */
  let trasRepintado = false
  let repintadosSeguidos = 0
  /** Guardado del presupuesto: se rellena al pulsar un guardar_presupuesto (y habilita el 2.º y el `terminar` sin importes). */
  const presupuesto: PresupuestoWorker = { guardado: false, referencia: null, pdf: null, pdfIntentado: false }
  const estabilidad = k.estabilidad ?? ESTABILIDAD_POR_DEFECTO
  /** La red se vigila durante TODO el bucle: así cuenta la validación que salió al quitar el foco de un `rellenar`. */
  const vigia = vigilarRed(page)
  /** Espera a pantalla quieta; si se agota el tope se sigue (y queda en el log local, sin valores). */
  const asentar = async (donde: string) => {
    if ((await esperarEstable(page, estabilidad, vigia)) === 'tope') k.log('exploracion_espera', { n: pasos, donde, estado: 'tope' })
  }
  /** Incidencias del lote en curso: salen con el SIGUIENTE paso (o con el cierre). */
  let incidencias: IncidenciaEjecucion[] = []
  const avisosDiagnostico: string[] = []
  const fin = (motivo: FinBucle['motivo'], error: FinBucle['error'] = null, detalle?: DetalleFinExploracion, nota?: string): FinBucle => ({
    motivo, error, redNoGet: [...red].slice(0, 50), efectos: efectos.size ? [...efectos] : ['ninguno_visto'], pasos, acciones,
    ...(detalle ? { detalle } : {}),
    ...(nota ? { nota } : {}),
    ...(incidencias.length ? { incidencias: [...incidencias] } : {}),
    ...(presupuesto.guardado ? { presupuesto: { ...presupuesto } } : {}),
  })
  try {
    for (;;) {
      if (pasos >= topes.maxPasos || ahora() - inicio >= topes.maxMs) throw new Parar('tope')
      k.guard.comprobar()
      await exigirSinCaptcha(page)
      await exigirSinVerificacion(page, k.compania)
      // Una ventana nueva (popup) abierta DURANTE el bucle no se sigue en v1: hueco. Las de la entrada no cuentan.
      if (page.context().pages().some((p) => !deEntrada.has(p))) throw new Parar('sin_salida')
      await captura?.liberar()
      // ePAC (28/10/2026): el diálogo «Atención» que propone alargar el término se cierra por CÓDIGO («Cancelar»/«×», nunca «Aceptar»).
      if (ENTRADAS_EXPLORACION[k.entrada]?.cierraDialogoTermino && (await cerrarDialogoTerminoEpac(page, k.guard))) {
        k.log('exploracion_dialogo_termino', { n: pasos + 1, estado: 'cerrado' })
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)
      }
      // Pantalla QUIETA antes de inventariar (14/10/2026, 8d0676f9: tras rellenar el número de la vía, la validación
      // asíncrona repintó la sección DESPUÉS de inventariar y el nodo del año quedó obsoleto).
      await asentar('inventario')
      captura = await capturarInventarioExploracion(page)
      if (!captura) throw new Error('no se pudo leer el inventario de la pantalla')
      const inv = captura.inventario
      if (avisosDiagnostico.length > 0 && inv.marcos[0]) {
        inv.marcos[0].avisosPortal = [...avisosDiagnostico.splice(0), ...(inv.marcos[0].avisosPortal ?? [])].slice(0, 5)
      }
      // PRECIO PEGAJOSO (revisión de seguridad 28/10/2026): un importe visto en cualquier marco cierra el avance por id para el resto del trabajo.
      if (inv.marcos.some((m) => (m.importes?.length ?? 0) > 0)) registrarPrecioVisto(k.guard)
      const parada = detectarParada(inv)
      if (parada) {
        // La señal (p. ej. la ETIQUETA del campo de cuenta bancaria; nunca un valor) va al log local; al cierre, el código.
        // Paradas por TÍTULO o CAMPO: su señal es texto de la página (puede llevar datos personales) → solo el código.
        const senalSegura = parada.detalle?.startsWith('titulo:') || parada.detalle?.startsWith('campo:') ? {} : { senal: parada.senal }
        if (parada.detalle) k.log('exploracion_parada', { motivo: parada.motivo, detalle: parada.detalle, ...senalSegura })
        throw new Parar(parada.motivo, parada.detalle)
      }
      const huella = huellaPantalla(inv)
      if (huellaAntesDeAvanzar !== null) avancesFallidos = huella === huellaAntesDeAvanzar ? avancesFallidos + 1 : 0
      huellaAntesDeAvanzar = null
      // Un lote cortado por repintado no es un intento fallido de avanzar: la pantalla que sigue no cuenta para el bucle
      // (lo acotan los repintados seguidos y los topes de acciones/pasos/tiempo).
      if (trasRepintado) {
        if (++repintadosSeguidos > MAX_REPINTADOS_SEGUIDOS) throw new Parar('bucle', 'repintados_seguidos')
      } else {
        repintadosSeguidos = 0
        const relleno = huellaRelleno(inv)
        if (detectarBucle(huellas, huella, avancesFallidos, { anteriores: rellenos, actual: relleno })) throw new Parar('bucle')
        huellas.push(huella)
        rellenos.push(relleno)
      }
      trasRepintado = false

      // Vista aria opcional (TARIFICADOR_EXPLORADOR_VISTA; defecto `dom` = nada cambia). Mide tamaños dom vs aria, sin datos.
      // En modo `dom` (el de siempre) ni se serializa el inventario para medirlo ni se loguea nada: coste cero.
      const vista = modoVista === 'dom' ? { metrica: null, vistaAria: undefined } : await vistaDelPaso(page, modoVista, JSON.stringify(inv).length)
      if (vista.metrica) k.log('exploracion_vista', { n: pasos + 1, ...vista.metrica })
      const r = await k.pedirPaso({ trabajoId: k.trabajoId, inventario: inv, avancesFallidos, ...(incidencias.length ? { incidencias } : {}), ...(vista.vistaAria ? { vistaAria: vista.vistaAria } : {}) })
      incidencias = []
      pasos++
      if (r.estado === 'perdido') throw new Parar('perdido')
      // REVALIDACIÓN contra el inventario PROPIO (el que se mandó): lo que no valida aquí no toca el portal.
      const v = validarRespuestaExplorador(r.respuesta, { inventario: inv, ramo: k.ramo, entrada: k.entrada, datosReales: k.conDatosReales ? { riesgo: k.riesgo } : null, presupuestoEnCurso: presupuesto.guardado, precioVisto: precioVistoEn(k.guard) })
      if (!v.ok) throw new Parar('ambiguo', 'lote_no_valido')
      if (r.estado !== 'ok') {
        const p = v.respuesta.acciones[0]
        throw p?.accion === 'parar' ? new Parar(p.motivo) : new Parar('ambiguo', 'paso_no_ok')
      }
      const refs = indiceRefs(inv)
      // ORDEN (14/10/2026, 8d0676f9): todo en el orden de la IA salvo los rellenar que REPINTAN (CP, combobox…), que pasan
      // al final, antes del avance: así año y m² se escriben ANTES de que el CP o la vía repinten y corten el lote.
      const lote = ordenarLote(v.respuesta.acciones, inv)
      k.log('exploracion_paso', {
        n: pasos,
        pantalla: v.respuesta.pantalla.tipo,
        acciones: lote.map((a) => (a.accion === 'rellenar' ? `rellenar ${a.ref}=${a.dato}` : 'ref' in a ? `${a.accion} ${a.ref}` : a.accion)),
      })

      const antes = { huella, elementos: nElementos(inv) }
      /** Acciones de ESTE lote que ya tocaron el portal: con alguna hecha, un nodo que ya no está = repintado, no ambigüedad. */
      let hechas = 0
      /** Corta el lote: las acciones que quedan SIN ejecutar viajan como incidencias `lote_cortado` (ref + clave; sin valor). */
      const cortarLote = (desde: number, corte: MotivoCorteLote, primera?: Exclude<Localizado, { loc: Locator }>) => {
        const pendientes = incidenciasLoteCortado(lote.slice(desde), corte, primera)
        incidencias.push(...pendientes)
        trasRepintado = true
        k.log('exploracion_lote_cortado', { n: pasos, corte, ...(primera ? { motivo: primera.motivo } : {}), hechas, pendientes: pendientes.length })
      }
      lote: for (let i = 0; i < lote.length; i++) {
        const a = lote[i]
        if (a.accion === 'parar') throw new Parar(a.motivo)
        if (a.accion === 'terminar') throw new Parar('resultado')
        if (++acciones > topes.maxAcciones) throw new Parar('tope')
        let hit = refs.get(a.ref)
        const nodo = captura.nodos.get(a.ref)
        if (!hit || !nodo) throw new Parar('ambiguo', 'ref_fuera_de_captura')
        // Frontera de emisión: un campo de cuenta bancaria NUNCA se rellena, elige ni marca (segunda barrera tras detectarParada).
        const exigirSinCuenta = (el: ElementoInventario) => {
          // Descripciones COMPLETAS (texto, aria-label, etiqueta, id, name, onclick, placeholder, formControlName).
          const cuenta = senalCuentaBancaria(descripcionesElemento(el))
          if (cuenta === null) return
          k.log('exploracion_parada', { motivo: 'cerca_de_emision', detalle: 'frontera_cuenta_bancaria', senal: `${MOTIVO_FRONTERA_CUENTA} («${cuenta}»)` })
          throw new Parar('cerca_de_emision', 'frontera_cuenta_bancaria', notaFronteraBancaria(cuenta) ?? undefined)
        }
        exigirSinCuenta(hit.el)
        // Antes del PRIMER rellenar del lote: pantalla quieta (un repintado a medias dejaría el nodo a punto de caducar).
        if (i === 0 && a.accion === 'rellenar') await asentar('primer_rellenar')
        const localizado = await localizar(nodo, hit.el)
        let loc: Locator | null = 'loc' in localizado ? localizado.loc : null
        const fallo = 'loc' in localizado ? undefined : localizado
        if (fallo) k.log('exploracion_no_localizado', { n: pasos, ref: a.ref, motivo: fallo.motivo, ...(fallo.visibilidad ? { visibilidad: fallo.visibilidad } : {}) })
        // ES el control (conectado, misma identidad) pero no se ve ni traído a la vista: NO es un repintado (b921b476: el
        // corte del lote y la re-localización eran falsos positivos). No se escribe nunca en un control oculto: incidencia
        // `control_no_visible` (sin valor) y el lote SIGUE con lo demás.
        if (fallo?.motivo === 'no_visible' && a.accion === 'rellenar') {
          incidencias.push({ accion: 'rellenar', ref: a.ref, dato: a.dato, causa: 'control_no_visible', motivo: 'no_visible', ...(fallo.visibilidad ? { visibilidad: fallo.visibilidad } : {}) })
          continue
        }
        // `rellenar` como PRIMERA acción con el nodo repintado (14/10/2026, Allianz Hogar: Angular re-renderiza el formulario
        // entre el inventario y el lote): se re-inventaría UNA vez y se busca el MISMO control por su identidad.
        if (!loc && hechas === 0 && a.accion === 'rellenar') {
          // Solo en la MISMA pantalla que se validó (`huella` de este paso): si cambió, no se relocaliza (fail-closed).
          const re = await relocalizar(page, hit.el, hit.marco, huella, k.esperaRepintadoMs ?? ESPERA_REPINTADO_MS, estabilidad, vigia)
          k.log('exploracion_relocalizacion', { n: pasos, ref: a.ref, estado: re ? 'ok' : 'no_encontrado' })
          if (re) {
            ({ loc, hit } = re)
            // La frontera se repite sobre el control RELOCALIZADO antes de escribir (revisión PR #4648).
            try {
              exigirSinCuenta(hit.el)
            } catch (err) {
              await loc.evaluate((n, at) => n.removeAttribute(at), ATRIBUTO_MARCA).catch(() => undefined)
              throw err
            }
          } else {
            incidencias.push({ accion: 'rellenar', ref: a.ref, dato: a.dato, causa: 'nodo_no_relocalizado', ...(fallo ? { motivo: fallo.motivo, ...(fallo.visibilidad ? { visibilidad: fallo.visibilidad } : {}) } : {}) })
            throw new Parar('ambiguo', 'nodo_no_relocalizado')
          }
        }
        if (!loc) {
          // Lo ya hecho en este lote pudo repintar la pantalla (autocompletado): se corta aquí y se reinventaría; la IA ve
          // la pantalla nueva. Sin nada hecho, el nodo cambió sin que lo tocásemos: anti-TOCTOU, se para.
          if (hechas > 0) {
            acciones--
            cortarLote(i, 'repintado', fallo)
            break lote
          }
          throw new Parar('ambiguo', 'nodo_no_localizado')
        }
        let cortar: MotivoCorteLote | null = null
        try {
          if (a.accion === 'rellenar') {
            const d = resolverDato(a.dato, { ramo: k.ramo, tomadorMediador: entradaConTomadorMediador(k.entrada), conDatosReales: k.conDatosReales, riesgo: k.riesgo, env: k.env, hoy: (k.hoy ?? (() => new Date()))() })
            if (!d.ok) {
              const conValor = d.motivo === 'dato_no_disponible' && k.conDatosReales
                ? await loc.inputValue({ timeout: 5_000 }).then((v) => v.trim() !== '').catch(() => false)
                : false
              const que = accionSinDato(d.motivo, k.conDatosReales, conValor)
              if (que === 'saltar') continue
              throw new Parar(que, d.motivo === 'clave_desconocida' ? 'clave_desconocida' : undefined)
            }
            await k.pausaAccion()
            // 🔑 El valor no se loguea ni sale del proceso: va directo al campo.
            const escrito = valorParaControl(d.valor, hit.el)
            // 0.3.8 (real 28/10/2026 18:31, ePAC): el tipo de documento VA ANTES del número (vacío → «Número de identificación
            // incorrecto»). Orden: tipo de documento → documento → salir del campo. Solo el TIPO (NIF/NIE/CIF) sale del valor.
            if (CLAVES_VALIDAN_AL_SALIR.has(a.dato)) {
              const tipo = tipoDocumentoDe(escrito)
              if (tipo) {
                const estado = await elegirTipoDocumentoPareado(nodo.marco, loc, tipo, k.pulsar)
                // 0.3.10: sin opción/desplegable → diagnóstico estructural (tag/role/id/class, ≤15, sin valores) al log y a los avisos del inventario del paso siguiente.
                const diag = estado === 'sin_opcion' || estado === 'sin_desplegable' ? await diagnosticoTipoDocumento(loc) : null
                k.log('exploracion_tipo_documento', { n: pasos, ref: a.ref, tipo, estado, ...(diag ? { diagnostico: diag } : {}) })
                if (diag) avisosDiagnostico.push(lineaDiagnosticoTipoDoc(estado, diag))
                const cat = estado === 'sin_opcion' ? lineaCatalogoTipoDoc(await catalogoTipoDocumento(loc)) : null
                if (cat) avisosDiagnostico.push(cat)
              }
            }
            await loc.fill(escrito, { timeout: 10_000 })
            hechas++
            const quedan = i < lote.length - 1
            if (CLAVES_AUTOCOMPLETADO.has(a.dato)) {
              // El autocompletado suele colgar del `change`, que sale al perder el foco: se le quita (sin clic ni Enter) y se
              // deja repintar ANTES de seguir, aunque fuera la última acción (la próxima captura ya ve la pantalla nueva).
              await loc.blur({ timeout: 5_000 }).catch(() => undefined)
              await dormir(k.esperaRepintadoMs ?? ESPERA_REPINTADO_MS)
              await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
              cortar = quedan ? 'autocompletar' : null
            } else {
              const fijado = await fijarValor(loc, escrito)
              if (fijado !== 'ok') k.log('exploracion_valor', { n: pasos, ref: a.ref, estado: fijado })
              // El portal valida este dato al SALIR del campo (NIF en ePAC): foco fuera y red quieta ANTES de la acción siguiente.
              if (CLAVES_VALIDAN_AL_SALIR.has(a.dato)) {
                await loc.blur({ timeout: 5_000 }).catch(() => undefined)
                await dormir(k.esperaRepintadoMs ?? ESPERA_REPINTADO_MS)
                await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
              }
              // Ni con el reintento tecleando: queda como error del paso en asegura (ref + clave; nunca el valor).
              if (fijado === 'no_aplicado') incidencias.push({ accion: 'rellenar', ref: a.ref, dato: a.dato, causa: 'valor_no_aplicado' })
              if (quedan) {
                // ¿Cambió la estructura al escribir? Solo importa si quedan acciones (si no, el bucle reinventaría igualmente).
                const sonda = await capturarInventarioExploracion(page).catch(() => null)
                const despues = sonda ? { huella: huellaPantalla(sonda.inventario), elementos: nElementos(sonda.inventario) } : null
                await sonda?.liberar()
                cortar = motivoCorteTrasRellenar(a.dato, antes, despues)
              }
            }
          } else if (a.accion === 'elegir' && hit.el.tag === 'nx-dropdown') {
            // Desplegable ndbx (Allianz ePAC): abrir y pulsar la opción de texto EXACTO, ambas por `k.pulsar` (guard). Si no está,
            // no se pulsa ninguna opción: la lista queda ABIERTA y el lote se corta; el paso siguiente ve sus opciones.
            await k.pausaAccion()
            const r = await elegirNxDropdown(nodo.marco, loc, a.opcion.valor, k.pulsar)
            if (r === 'no_encontrada') {
              k.log('exploracion_nx_opcion', { n: pasos, ref: a.ref, estado: 'no_encontrada' })
              acciones--
              cortarLote(i, 'repintado')
              break lote
            }
            hechas++
          } else if (a.accion === 'elegir') {
            await k.pausaAccion()
            const elegidas = await loc.selectOption({ value: a.opcion.valor }, { timeout: 10_000 })
            if (elegidas.length !== 1 || elegidas[0] !== a.opcion.valor) throw new Parar('ambiguo', 'opcion_no_aplicada')
            hechas++
          } else if (a.accion === 'marcar') {
            // 0.3.15: una casilla ya marcada no se pulsa (desmarcaría); el radio sí (idempotente).
            const esCasilla = ((hit.el.type ?? '').toLowerCase() === 'checkbox')
            if (!(esCasilla && (await loc.isChecked({ timeout: 5_000 })))) await k.pulsar(loc)
            hechas++
          } else {
            const alPedir = (q: { method(): string; url(): string }) => {
              if (q.method() === 'GET') return
              const n = normalizarRedNoGet(q.url())
              if (n) red.add(n)
            }
            page.on('request', alPedir)
            try {
              if (a.efectoEsperado === 'guardar_presupuesto') {
                // GUARDAR PRESUPUESTO: por su puerta (guard.ts), con el PDF escuchado ANTES del clic.
                const pantalla: PantallaGuardado = { tipoPantalla: v.respuesta.pantalla.tipo, hayImportes: inv.marcos.some((m) => (m.importes?.length ?? 0) > 0), presupuestoEnCurso: presupuesto.guardado }
                const espera = presupuesto.pdf ? null : esperarPdf(page, k.topePdfMs ?? TOPE_PDF_GUARDADO_MS)
                try {
                  await k.pulsarGuardado(loc, hit.el, pantalla, async () => {
                    const pdf = espera ? await espera.promesa : null
                    if (pdf && pdf.bytes.length <= MAX_BYTES_PDF_PRESUPUESTO) presupuesto.pdf = pdf.bytes
                  })
                } finally {
                  espera?.cancelar()
                }
                presupuesto.guardado = true
                presupuesto.pdfIntentado ||= espera !== null
                efectos.add('presupuesto_guardado')
                await page.waitForLoadState('domcontentloaded', { timeout: TOPE_PASO_MS }).catch(() => undefined)
                await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
                // La REFERENCIA, del texto visible de la pantalla tras guardar (no se loguea; solo si se vio).
                presupuesto.referencia ??= await referenciaVisible(page)
                k.log('exploracion_presupuesto', { n: pasos, pdf: presupuesto.pdf ? 'si' : 'no', referencia: presupuesto.referencia ? 'si' : 'no' })
              } else if (esAvanceAutorizado(k.entrada, hit.el, hit.marco)) {
                efectos.add('posible_proyecto_guardado')
                await k.pulsarAutorizado(loc, hit.el, hit.marco)
              } else if (esGuardadoEnDialogoAutorizado(k.entrada, hit.el)) {
                // «Guardar» de un modal autorizado por entrada (Occident, «Datos de la situación»): por SU puerta, que lo
                // repite vivo (diálogo y título exactos, un solo candidato). No se sabe si el portal persiste algo: se anota.
                efectos.add('posible_proyecto_guardado')
                await k.pulsarGuardadoDialogo(loc, hit.el, hit.marco)
              } else {
                await k.pulsar(loc)
              }
              await page.waitForLoadState('domcontentloaded', { timeout: TOPE_PASO_MS }).catch(() => undefined)
              await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
            } finally {
              page.off('request', alPedir)
            }
            k.guard.comprobar()
            huellaAntesDeAvanzar = huella
          }
        } finally {
          await loc.evaluate((n, at) => n.removeAttribute(at), ATRIBUTO_MARCA).catch(() => undefined)
        }
        if (cortar) {
          cortarLote(i + 1, cortar)
          break lote
        }
      }
    }
  } catch (e) {
    if (e instanceof Parar) return fin(e.motivo, null, e.detalle, e.nota)
    // Un diálogo al guardar (confirm/alert): el robot no confirma; se para con su detalle (no es un fallo del guard).
    if (e instanceof GuardadoConDialogoError && !k.guard.violacion()) return fin('ambiguo', null, 'guardado_con_dialogo')
    // Una violación del guard en segundo plano manda sobre el error con el que se cortó.
    const f = finDeError(k.guard.violacion() ?? e)
    return fin(f.motivo, f.error, f.detalle, f.nota)
  } finally {
    vigia.soltar()
    await captura?.liberar()
  }
}

/** Texto visible de todos los marcos (acotado) → referencia del presupuesto, o `null`. El texto no sale de aquí. */
async function referenciaVisible(page: Page): Promise<string | null> {
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const t = await f.evaluate(() => (document.body?.innerText ?? '').slice(0, 20_000)).catch(() => '')
    const r = extraerReferenciaPresupuesto(t)
    if (r) return r
  }
  return null
}

/**
 * Tras el `fill` de un campo SIN autocompletado (14/10/2026): se le quita el foco (sin clic ni Enter) y se RELEE. Si el
 * portal lo dejó vacío o distinto (datepicker Angular), UN reintento tecleando carácter a carácter (`pressSequentially`,
 * solo el valor: nunca Enter ni Tab). Nunca lanza; el valor no sale de aquí (ni al log). `desconocido` = el nodo ya no se
 * puede leer (repintado): lo verá el siguiente inventario (`conValor`/`invalido`).
 */
async function fijarValor(loc: Locator, valor: string): Promise<'ok' | 'reintentado' | 'no_aplicado' | 'desconocido'> {
  const leer = () => loc.inputValue({ timeout: 5_000 }).catch(() => null)
  await loc.blur({ timeout: 5_000 }).catch(() => undefined)
  const v1 = await leer()
  if (v1 === null) return 'desconocido'
  if (valorAplicado(valor, v1)) return 'ok'
  try {
    await loc.clear({ timeout: 5_000 })
    await loc.pressSequentially(valor, { delay: 60, timeout: 15_000 })
    await loc.blur({ timeout: 5_000 }).catch(() => undefined)
  } catch {
    return 'no_aplicado'
  }
  const v2 = await leer()
  return v2 !== null && valorAplicado(valor, v2) ? 'reintentado' : 'no_aplicado'
}

/**
 * Tras un repintado: espera a que el portal se asiente, RE-INVENTARÍA una vez y busca el mismo control por su identidad
 * (`relocalizarElemento`, pura) SOLO si la pantalla nueva tiene la huella validada del paso. Devuelve su Locator y su entrada del inventario NUEVO, o `null`. Nunca lanza; libera la captura.
 */
async function relocalizar(page: Page, el: ElementoInventario, marco: MarcoInventario, huellaValidada: string, esperaMs: number, estabilidad: OpcionesEstabilidad, vigia: VigiaRed): Promise<{ loc: Locator; hit: { el: ElementoInventario; marco: MarcoInventario } } | null> {
  await dormir(esperaMs)
  // `networkidle` no sirve en una SPA (resuelve al instante tras la carga): se espera a la pantalla QUIETA de verdad.
  await esperarEstable(page, estabilidad, vigia)
  const nueva = await capturarInventarioExploracion(page).catch(() => null)
  if (!nueva) return null
  try {
    const ref = relocalizarElemento(el, marco.url, nueva.inventario, huellaValidada)
    const hit = ref ? indiceRefs(nueva.inventario).get(ref) : undefined
    const nodo = ref ? nueva.nodos.get(ref) : undefined
    if (!hit || !nodo) return null
    const r = await localizar(nodo, hit.el)
    return 'loc' in r ? { loc: r.loc, hit } : null
  } catch {
    // Revisión: «nunca lanza» de verdad. Un fallo aquí = no se relocaliza (fail-closed: el bucle para «nodo_no_relocalizado»).
    return null
  } finally {
    await nueva.liberar()
  }
}

/** Resultado de {@link localizar}: el Locator, o POR QUÉ no (lista cerrada; nunca valores). */
type Localizado = { loc: Locator } | { motivo: MotivoNoLocalizado; visibilidad?: VisibilidadNoVisible }
type NodoInv = InventarioExploracion['nodos'] extends Map<string, infer N> ? N : never

/** Cuánto se espera, tras traer el nodo a la vista, a que el portal lo pinte (NDBX perezoso, animaciones). */
const ESPERA_VISIBLE_MS = 1_500

/**
 * Lee el nodo VIVO: `null` = desconectado; lanza si `evaluate` falla (lo traduce `localizar`). Una `<label>` de un control de elección
 * oculto se lee COMO ese control (`controlOcultoDeEtiqueta` de guard.ts, la MISMA resolución que el inventario): si cambió, no casa.
 */
const leerVivo = async (nodo: NodoInv): Promise<NodoVivo | null> => {
  const vivo = await nodo.handle.evaluate((n) => {
    const e = n as HTMLElement
    if (!e.isConnected || typeof e.getAttribute !== 'function') return null
    return { tag: e.tagName.toLowerCase(), id: e.id || null, name: e.getAttribute('name'), type: e.getAttribute('type'), texto: (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() }
  })
  if (vivo?.tag !== 'label') return vivo
  const ctl = await nodo.handle.evaluate(controlOcultoDeEtiqueta as (n: Node) => ReturnType<typeof controlOcultoDeEtiqueta>)
  return ctl ? { tag: 'input', id: ctl.id, name: ctl.name, type: ctl.type, texto: vivo.texto } : vivo
}

/**
 * ¿Lo ve Playwright? Si no, lo TRAE a la vista (14/10/2026, b921b476: año y m² de Allianz Hogar, inventariados con etiqueta,
 * no pasaban `isVisible()`) y espera un poco a que se pinte. Nunca relaja la identidad: el llamante la vuelve a comprobar
 * sobre el MISMO handle. Nunca lanza.
 */
async function visibleTrasTraer(nodo: NodoInv): Promise<boolean> {
  const visible = () => nodo.handle.isVisible().catch(() => false)
  if (await visible()) return true
  await nodo.handle.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined)
  // Si Playwright no pudo (nodo sin caja), el scroll nativo, dentro de su contenedor con scroll también.
  await nodo.handle.evaluate((n) => (n as Element).scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => undefined)
  const hasta = Date.now() + ESPERA_VISIBLE_MS
  while (Date.now() < hasta) {
    if (await visible()) return true
    await dormir(100)
  }
  return visible()
}

/**
 * TIPO DE DOCUMENTO pareado con un campo de documento (0.3.8, ePAC «Figuras Intervinientes»): el campo `<x>_doc` tiene su desplegable
 * `<x>_tipoDoc` (un `<select>`, normalmente OCULTO tras un botón sin texto). Elige la ÚNICA opción cuyo texto corresponde a `tipo`
 * (`opcionTipoDocumento`) con `selectOption` (dispara `change`). Nunca toca otra cosa; si no hay desplegable u opción, no hace nada.
 */
export async function elegirTipoDocumentoPareado(marco: Frame, loc: Locator, tipo: TipoDocumento, pulsarGuardado?: (b: Locator) => Promise<void>): Promise<'elegido' | 'ya' | 'sin_desplegable' | 'sin_opcion'> {
  const info = await loc.evaluate((el) => {
    const id = (el as HTMLElement).id || ''
    if (!/_doc$/.test(id)) return null
    const base = id.slice(0, -'_doc'.length) + '_tipoDoc'
    let selId = base
    let s: Element | null = el.ownerDocument.getElementById(selId)
    if (!s) {
      if (!el.ownerDocument.getElementById(selId + '_label')) return null
      // 0.3.10 (real 28/10/2026, Allianz patinete): existe `<base>_label` pero NO `<base>`. JSF/RichFaces suele dar al control un id
      // derivado (`<base>_input`, `<base>Menu`, un combobox…): SOLO si hay EXACTAMENTE UN control (select/input/button/combobox) cuyo
      // id empieza por la base del label (sin ser el propio label) se usa ese. 0 o >1: se queda con la etiqueta como disparador.
      const prefijados = Array.from(el.ownerDocument.querySelectorAll('[id]')).filter((n) => {
        const nid = n.id
        if (nid === base || !nid.startsWith(base) || /_label$/.test(nid)) return false
        if (!/^(?:_input|_focus|Menu|_menu|_list|_combobox)/.test(nid.slice(base.length))) return false
        const t = n.tagName
        return t === 'SELECT' || t === 'INPUT' || t === 'BUTTON' || n.getAttribute('role') === 'combobox'
      })
      if (prefijados.length !== 1) return { selId, base, widget: true as const, actual: '', opciones: [] }
      s = prefijados[0]!
      selId = s.id
    }
    if (s.tagName !== 'SELECT') return { selId, base, widget: true as const, actual: ((s as HTMLInputElement).value || s.textContent || '').replace(/\s+/g, ' ').trim(), opciones: [] }
    const sel = s as HTMLSelectElement
    return { selId, base, widget: false as const, actual: sel.value, opciones: Array.from(sel.options).slice(0, 40).map((o) => ({ valor: o.value, texto: (o.textContent || '').replace(/\s+/g, ' ').trim() })) }
  }).catch(() => null)
  if (!info) return 'sin_desplegable'
  if (info.widget) return elegirTipoDocumentoWidget(marco, info.selId, info.actual, tipo, pulsarGuardado, info.base)
  const valor = opcionTipoDocumento(tipo, info.opciones)
  // 0.3.11 (real 28/10/2026, Allianz): el `<select>` existe pero sus opciones cargan al ABRIR: sin opciones (o sin coincidencia) se prueba el widget.
  if ((info.opciones.length === 0 || valor === null) && pulsarGuardado) {
    const r = await elegirTipoDocumentoWidget(marco, info.selId, info.actual, tipo, pulsarGuardado, info.base)
    return r === 'elegido' || r === 'ya' ? r : 'sin_opcion'
  }
  if (valor === null) return 'sin_opcion'
  if (info.actual === valor) return 'ya'
  const sel = marco.locator(`[id="${info.selId.replace(/["\\]/g, '\\$&')}"]`)
  if ((await sel.count().catch(() => 0)) !== 1) return 'sin_desplegable'
  const r = await sel.selectOption({ value: valor }, { force: true, timeout: 5_000 }).catch(() => [] as string[])
  return r.length === 1 && r[0] === valor ? 'elegido' : 'sin_opcion'
}

/**
 * 0.3.10: DIAGNÓSTICO ESTRUCTURAL (sin valores) de un tipo de documento que no se pudo elegir. Parte del campo `<x>_doc` y mira la base
 * `<x>_tipoDoc`: etiqueta, hermanos de la etiqueta y elementos cuyo id empieza por la base. Solo tag/role/id/class (máx. 15 elementos,
 * ids/clases recortados). NUNCA `value`, texto ni atributos de datos. Nunca lanza. `null` si el campo no es un `_doc`.
 */
export type ElemDiagTipoDoc = { tag: string; role?: string; id?: string; clase?: string; rel: 'etiqueta' | 'hermano' | 'prefijo' }
export async function diagnosticoTipoDocumento(loc: Locator): Promise<{ base: string; elementos: ElemDiagTipoDoc[] } | null> {
  return loc.evaluate((el) => {
    const id = (el as HTMLElement).id || ''
    if (!/_doc$/.test(id)) return null
    const base = id.slice(0, -'_doc'.length) + '_tipoDoc'
    const doc = el.ownerDocument
    // Sin funciones con nombre dentro del evaluate (tsx/esbuild inyecta `__name`, que no existe en la página).
    const cand: { n: Element; rel: 'etiqueta' | 'hermano' | 'prefijo' }[] = []
    const etiqueta = doc.getElementById(base + '_label')
    if (etiqueta) {
      cand.push({ n: etiqueta, rel: 'etiqueta' })
      const padre = etiqueta.parentElement
      if (padre) for (const h of Array.from(padre.children)) if (h !== etiqueta) cand.push({ n: h, rel: 'hermano' })
    }
    for (const n of Array.from(doc.querySelectorAll('[id]'))) if (n.id.startsWith(base)) cand.push({ n, rel: 'prefijo' })
    const out: { tag: string; role?: string; id?: string; clase?: string; rel: 'etiqueta' | 'hermano' | 'prefijo' }[] = []
    const vistos = new Set<Element>()
    for (const { n, rel } of cand) {
      if (out.length >= 15) break
      if (vistos.has(n)) continue
      vistos.add(n)
      const o: { tag: string; role?: string; id?: string; clase?: string; rel: 'etiqueta' | 'hermano' | 'prefijo' } = { tag: n.tagName.toLowerCase(), rel }
      const role = n.getAttribute('role')
      if (role) o.role = role.slice(0, 30)
      if (n.id) o.id = n.id.slice(0, 80)
      const c = n.getAttribute('class')
      if (c) o.clase = c.replace(/\s+/g, ' ').trim().slice(0, 60)
      out.push(o)
    }
    return { base, elementos: out }
  }).catch(() => null)
}
/**
 * 0.3.11: CATÁLOGO del `<select>` `<x>_tipoDoc` (NIF/NIE/Pasaporte…): nº de opciones y sus textos (≤10, ≤30 car.), descartando cualquier texto
 * que parezca un número de documento o una fecha. Pura sobre los textos; nunca lanza. `null` si no hay select.
 */
export function lineaCatalogoTipoDoc(textos: readonly string[] | null): string | null {
  if (textos === null) return null
  const parece = (t: string) => /\d{4,}/.test(t) || /\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/.test(t) || /^[XYZxyz]?\d{5,}[A-Za-z]?$/.test(t.replace(/\s/g, ''))
  const limpios = textos.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '' && !parece(t) && !/\d/.test(t) && !pareceDatoPersonalInventario(t)).slice(0, 10).map((t) => t.slice(0, 30))
  return `diag tipoDoc catálogo: ${textos.length} opciones${limpios.length ? ` [${limpios.join(' | ')}]` : ''}`.slice(0, 400)
}
export async function catalogoTipoDocumento(loc: Locator): Promise<string[] | null> {
  return loc.evaluate((el) => {
    const id = (el as HTMLElement).id || ''
    if (!/_doc$/.test(id)) return null
    const s = el.ownerDocument.getElementById(id.slice(0, -'_doc'.length) + '_tipoDoc')
    if (!s || s.tagName !== 'SELECT') return null
    return Array.from((s as HTMLSelectElement).options).slice(0, 40).map((o) => (o.textContent || '').replace(/\s+/g, ' ').trim())
  }).catch(() => null)
}
/** Línea corta (≤160) para `avisosPortal` del inventario del paso siguiente (llega a la BD): estado + ids/tags, nunca valores. */
export function lineaDiagnosticoTipoDoc(estado: string, d: { base: string; elementos: ElemDiagTipoDoc[] } | null): string {
  const partes = (d?.elementos ?? []).map((e) => `${e.tag}${e.role ? `[${e.role}]` : ''}${e.id ? `#${e.id.replace(/^.*_tipoDoc/, '~')}` : ''}`)
  return `diag tipoDoc ${estado}: ${partes.join(' ') || 'sin elementos'}`.slice(0, 160)
}

/**
 * 0.3.9 (real 28/10/2026, Allianz patinete): `<x>_tipoDoc` NO es un `<select>` sino un `<input>` + lista (`role=listbox/option`) o una
 * lista JSF `ul/li`. Se abre con el `pulsar` GUARDADO y se pulsa la ÚNICA opción visible que `opcionTipoDocumento` elige por su texto
 * (NIF exacto, DNI…); luego espera a la red. 0 o >1 candidatas (o sin `pulsar`): `sin_opcion` y no se pulsa ninguna opción.
 */
async function elegirTipoDocumentoWidget(marco: Frame, selId: string, actual: string, tipo: TipoDocumento, pulsarGuardado?: (b: Locator) => Promise<void>, base: string = selId): Promise<'elegido' | 'ya' | 'sin_desplegable' | 'sin_opcion'> {
  if (!pulsarGuardado) return 'sin_desplegable'
  if (actual && opcionTipoDocumento(tipo, [{ valor: '0', texto: actual }]) !== null) return 'ya'
  const esc = (t: string) => t.replace(/["\\]/g, '\\$&')
  const visible = (q: string) => marco.locator(q).filter({ visible: true })
  const ctl = visible(`[id="${esc(selId)}"]`)
  const etiqueta = visible(`[id="${esc(selId)}_label"]`)
  const disparador = (await ctl.count().catch(() => 0)) === 1 ? ctl : (await etiqueta.count().catch(() => 0)) === 1 ? etiqueta : null
  if (!disparador) return 'sin_desplegable'
  // Solo opciones ATADAS a este control: `ul[id^=selId] li`, `[id^=selId][role=listbox] > *` o la lista que nombra su `aria-controls`/`aria-owns`.
  // Nunca una lista genérica del marco (un desplegable ajeno con «NIF» no se elige). Se abre SIEMPRE con el `pulsar` guardado.
  const ids = await disparador.first().evaluate((n) => `${n.getAttribute('aria-controls') ?? ''} ${n.getAttribute('aria-owns') ?? ''}`.split(/\s+/).filter(Boolean).slice(0, 4)).catch(() => [] as string[])
  // 0.3.10: también listas cuyo id empieza por la BASE del control (`<base>_lista`, `<base>_panel`…), siempre atadas a su id.
  const propias = [`ul[id^="${esc(selId)}"] li`, `[id^="${esc(selId)}"][role="listbox"] > *`]
  propias.push(`ul[id^="${esc(base)}"] li`, `[id^="${esc(base)}"][role="listbox"] > *`, `[id^="${esc(base)}"][role="listbox"] [role="option"]`, `div[id^="${esc(base)}"] li`)
  for (const id of ids) propias.push(`[id="${esc(id)}"] > *`, `[id="${esc(id)}"] li`, `[id="${esc(id)}"] [role="option"]`)
  const opciones = visible(propias.join(', '))
  await pulsarGuardado(disparador.first())
  await opciones.first().waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined)
  const textos = await opciones.evaluateAll((ns) => ns.slice(0, 40).map((n) => ((n as HTMLElement).innerText || n.textContent || '').replace(/\s+/g, ' ').trim())).catch(() => [] as string[])
  const v = opcionTipoDocumento(tipo, textos.map((texto, i) => ({ valor: String(i), texto })))
  if (v === null) return 'sin_opcion'
  await pulsarGuardado(opciones.nth(Number(v)))
  await marco.page().waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  return 'elegido'
}

/**
 * `elegir` sobre un `nx-dropdown` (ndbx): mismo mecanismo que Comunidades/Hogar (abrir el desplegable y pulsar la opción de texto
 * EXACTO, ambas por el `pulsar` guardado). Si ya está abierto NO se vuelve a pulsar (cerraría la lista). Exactamente UNA opción
 * visible con ese texto; si no, `no_encontrada` y no se pulsa ninguna (la lista queda abierta para que el paso siguiente la vea).
 */
export async function elegirNxDropdown(marco: Frame, loc: Locator, texto: string, pulsarGuardado: (b: Locator) => Promise<void>): Promise<'ok' | 'no_encontrada'> {
  const items = marco.locator('nx-dropdown-item, [role="option"]').filter({ visible: true })
  if ((await loc.getAttribute('aria-expanded')) !== 'true') {
    await pulsarGuardado(loc)
    await items.first().waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined)
  }
  const escapado = texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const exactas = items.filter({ hasText: new RegExp(`^\\s*${escapado}\\s*$`) })
  if ((await exactas.count()) !== 1) return 'no_encontrada'
  await pulsarGuardado(exactas.first())
  return 'ok'
}

/**
 * Re-resuelve la ref: el MISMO nodo inventariado, aún conectado y visible (traído a la vista si hace falta), con
 * tag/id/name/type/texto iguales. Devuelve un Locator único (marca temporal en el nodo) para `ctx.pulsar()`/`fill`/
 * `selectOption`, o el MOTIVO por el que no (desconectado | no_coincide_<campo> | no_visible | error_evaluate | no_unico).
 */
async function localizar(nodo: NodoInv, el: ElementoInventario): Promise<Localizado> {
  const comprobar = async (): Promise<MotivoNoLocalizado | null> => {
    let vivo: NodoVivo | null
    try {
      vivo = await leerVivo(nodo)
    } catch {
      return 'error_evaluate'
    }
    return motivoNoCoincide(vivo, el)
  }
  const m = await comprobar()
  if (m) return { motivo: m }
  if (!(await visibleTrasTraer(nodo))) {
    const caja = await nodo.handle
      .evaluate((n) => {
        const e = n as HTMLElement
        const r = e.getBoundingClientRect()
        const cv = typeof e.checkVisibility === 'function' ? e.checkVisibility() : true
        return { ancho: r.width, alto: r.height, estiloVisible: cv && getComputedStyle(e).visibility === 'visible' }
      })
      .catch(() => null)
    return caja ? { motivo: 'no_visible', visibilidad: visibilidadDeCaja(caja) } : { motivo: 'error_evaluate' }
  }
  // Traerlo a la vista pudo despertar al portal: la identidad se REPITE sobre el mismo nodo antes de marcarlo.
  const m2 = await comprobar()
  if (m2) return { motivo: m2 }
  const marca = randomUUID().slice(0, 12)
  const ok = await nodo.handle.evaluate((n, [at, mc]) => { (n as HTMLElement).setAttribute(at, mc); return true }, [ATRIBUTO_MARCA, marca] as const).catch(() => false)
  if (!ok) return { motivo: 'error_evaluate' }
  const loc = nodo.marco.locator(`[${ATRIBUTO_MARCA}="${marca}"]`)
  if ((await loc.count().catch(() => 0)) === 1) return { loc }
  await nodo.handle.evaluate((n, at) => (n as HTMLElement).removeAttribute(at), ATRIBUTO_MARCA).catch(() => undefined)
  return { motivo: 'no_unico' }
}

// ─── El trabajo completo ─────────────────────────────────────────────────────

/**
 * Fin de una exploración que murió en la ENTRADA cerrada (antes del primer paso): su motivo/error y la evidencia de la
 * pantalla en la que se quedó (la del flujo real: URL, captura y HTML con marcos, redactados). Nunca lanza.
 */
export async function finDeEntrada(e: unknown, page: Page, redactar: (t: string) => string, env: Record<string, string | undefined>): Promise<FinBucle> {
  const f = finDeError(e)
  // La evidencia es un extra: si sanearla fallara, el fin conserva su motivo/error en vez de caer al catch genérico.
  const evidencia = await capturarEvidencia(page).then((ev) => sanearEvidencia(ev, redactar, secretosDelEntorno(env))).catch(() => undefined)
  return { motivo: f.motivo, error: f.error, redNoGet: [], efectos: ['ninguno_visto'], pasos: 0, acciones: 0, ...(f.detalle ? { detalle: f.detalle } : {}), ...(f.nota ? { nota: f.nota } : {}), ...(evidencia ? { evidencia } : {}) }
}

/**
 * La ENTRADA cerrada y el bucle, sobre la página donde terminó la entrada (la que `entrar` devuelve si abrió una pestaña
 * nueva; si no, la misma `page`). Cierra la fase de entrada del guard antes del primer paso. Nunca lanza: un fallo de la
 * entrada sale por `finDeEntrada` con la evidencia de esa página.
 */
export async function entrarYExplorar(
  page: Page,
  portal: PortalExploracion,
  ctx: CtxEntrada,
  e: EntradaExploracion,
  d: {
    guard: GuardEmision
    redactar: (t: string) => string
    env: Record<string, string | undefined>
    alEntrar?: () => void
    contextoBucle: (pagina: Page) => ContextoBucle
  },
): Promise<FinBucle> {
  let pagina = page
  try {
    const devuelta = await portal.entrar(page, ctx, e)
    if (devuelta && devuelta !== page) {
      pagina = devuelta
      pagina.setDefaultTimeout(TOPE_PASO_MS)
      pagina.setDefaultNavigationTimeout(TOPE_PASO_MS)
      pagina.on('dialog', (dlg) => { dlg.dismiss().catch(() => {}) })
    }
    cerrarFaseEntrada(d.guard)
    d.alEntrar?.()
    // TODAS las páginas abiertas al cerrar la entrada son de la entrada (real 28/10/2026, Mapfre Patinetes: home → pestaña del
    // enlace de la tarjeta → ventana de «Acceso a NSE»; la intermedia contaba como ventana nueva y el bucle paraba `sin_salida`).
    return await bucleExploracion(pagina, { ...d.contextoBucle(pagina), paginasDeEntrada: [...new Set([page, pagina, ...pagina.context().pages()])] })
  } catch (err) {
    // Fallo de la ENTRADA cerrada (login, menús, producto): antes del primer paso. Con la evidencia del flujo real.
    return finDeEntrada(d.guard.violacion() ?? err, pagina, d.redactar, d.env)
  }
}

export type EntradaEjecucion = {
  cfg: Config
  trabajo: Trabajo
  env: Record<string, string | undefined>
  log: Log
  redactar: (t: string) => string
}

/** Valida que el trabajo es una exploración ejecutable por esta imagen. `null` = sí; si no, por qué. */
export function problemaTrabajoExploracion(t: Trabajo): string | null {
  const e = t.exploracion
  if (!e || typeof e.entrada !== 'string' || typeof e.conDatosReales !== 'boolean') return 'exploración sin entrada'
  if (!esEntradaExploracion(e.entrada)) return `entrada de exploración desconocida: ${String(e.entrada).slice(0, 60)}`
  const def = ENTRADAS_EXPLORACION[e.entrada]
  if (def.compania !== t.compania || def.ramo !== t.ramo) return 'la entrada no casa con la compañía/ramo del trabajo'
  if (!Object.hasOwn(PORTALES_EXPLORACION, t.compania)) return `sin portal de exploración para ${t.compania}`
  return null
}

/**
 * ¿Quedó cerrada la cabecera? 2xx, o 409 (`exploracion_cerrada`: un intento anterior ya la cerró). `cerrarExploracion`
 * devuelve 0 si tras los reintentos el servidor seguía ocupado o inalcanzable.
 */
export function cierreCorrecto(status: number): boolean {
  return (status >= 200 && status < 300) || status === 409
}

/**
 * El cuerpo que cierra el TRABAJO, sabiendo cómo fue el cierre de la cabecera. Si la cabecera NO se cerró, nunca se informa
 * `explorado` (el mapa no está guardado y la pantalla la vería abierta): se informa un fallo de infra.
 */
export function cuerpoTrasCierre(trabajoId: string, compania: string, fin: Pick<FinBucle, 'motivo' | 'error' | 'evidencia' | 'presupuesto'>, stCierre: number, redactar: (t: string) => string): CuerpoResultado | null {
  const cuerpo = resultadoDeFin(trabajoId, compania, fin, redactar)
  if (cuerpo?.resultado === 'explorado' && !cierreCorrecto(stCierre)) {
    return { trabajoId, resultado: 'error', error: { tipo: 'infra', mensaje: `exploración: no se pudo cerrar la cabecera (estado ${stCierre})`, url: null }, botVersion: EXPLORADOR_VERSION }
  }
  return cuerpo
}

/** Ejecuta un trabajo `modo = 'exploracion'` de punta a punta. Devuelve el código de salida del proceso. */
export async function ejecutarExploracion(p: EntradaEjecucion): Promise<number> {
  const { cfg, trabajo, env, log, redactar } = p
  const problema = problemaTrabajoExploracion(trabajo)
  if (problema) {
    await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: 'datos', mensaje: problema, url: null }, botVersion: EXPLORADOR_VERSION })
    return 1
  }
  const exp = trabajo.exploracion!
  const entrada = ENTRADAS_EXPLORACION[exp.entrada]
  const portal = PORTALES_EXPLORACION[trabajo.compania]
  let credenciales: Credenciales
  try {
    const n = nombresCredencial(portal.credencial)
    const usuario = env[n.usuario] ?? ''
    const contrasena = env[n.contrasena] ?? ''
    if (!usuario || !contrasena) throw new Error(`faltan los fly secrets ${n.usuario} / ${n.contrasena}`)
    credenciales = { usuario, contrasena }
  } catch (e) {
    await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo: 'credenciales', mensaje: e instanceof Error ? e.message : String(e), url: null }, botVersion: EXPLORADOR_VERSION })
    return 1
  }

  const topes = topesExplorador(env)
  // Respaldo duro: el explorador tiene SU tope (15 min); si algo se cuelga por encima, se sale (asegura vence el lease).
  const respaldo = setTimeout(() => {
    log('tope_duro_superado: salida forzada (exploración)')
    process.exit(2)
  }, topes.maxMs + MARGEN_CIERRE_MS + 60_000)
  respaldo.unref()

  let browser: Browser | null = null
  let finExp: FinBucle
  try {
    browser = await chromium.launch({ headless: true })
    // Descargas ACEPTADAS (14/10/2026): el PDF del presupuesto guardado llega como descarga; solo lo lee `esperarPdf` en memoria.
    const context = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true })
    const guard = await instalarGuardEmision(context)
    // Rutas de aplicación tolerables de la entrada (Mapfre NSE `/app/emision/`, decisión de Alberto 28/10/2026); las demás, ninguna.
    const tolerables = rutasAppTolerablesDe(exp.entrada)
    if (tolerables.length > 0) tolerarRutasApp(guard, tolerables)
    const page = await context.newPage()
    page.setDefaultTimeout(TOPE_PASO_MS)
    page.setDefaultNavigationTimeout(TOPE_PASO_MS)
    // Ningún diálogo del portal se acepta.
    page.on('dialog', (d) => { d.dismiss().catch(() => {}) })
    const ctxEntrada: CtxEntrada = {
      credenciales,
      log: (m) => log(m),
      pausa: () => dormir(azar(800, 2_500)),
      pulsar: async (boton) => {
        await dormir(azar(300, 1_200))
        await pulsar(boton, guard)
      },
      exigirSinCaptcha: () => exigirSinCaptcha(page),
      pulsarEnlaceEntrada: async (boton) => {
        await dormir(azar(300, 1_200))
        await pulsarEnlaceEntradaAutorizado(boton, guard, trabajo.compania)
      },
      pulsarAccesoNse: async (boton) => {
        await dormir(azar(300, 1_200))
        await pulsarAccesoNseMapfre(boton, guard, trabajo.compania)
      },
      pulsarMenuNse: async (boton) => {
        await dormir(azar(300, 1_200))
        await pulsarMenuOfertaNseMapfre(boton, guard, trabajo.compania)
      },
      // Login asistido SOLO para las compañías de la lista cerrada del módulo (asegura lo vuelve a comprobar por la entrada).
      ...(loginAsistidoDe(exp.entrada) ? { loginAsistido: { entrada: exp.entrada, guard, log, pedirPaso: (c) => pedirPaso(cfg, { trabajoId: trabajo.id, ...c, fase: 'login' }) } } : {}),
    }
    finExp = await entrarYExplorar(page, portal, ctxEntrada, entrada, {
      guard, redactar, env,
      alEntrar: () => log('exploracion_entrada_ok', { entrada: exp.entrada }),
      contextoBucle: (pagina) => ({
        trabajoId: trabajo.id, compania: trabajo.compania, ramo: trabajo.ramo, entrada: exp.entrada, conDatosReales: exp.conDatosReales,
        riesgo: trabajo.riesgo, env, guard,
        pulsar: ctxEntrada.pulsar,
        pulsarAutorizado: async (boton, el, marco) => {
          await dormir(azar(300, 1_200))
          await pulsarExploracionAutorizada(pagina, guard, boton, { entrada: exp.entrada, el, marco })
        },
        pulsarGuardado: async (boton, el, pantalla, trasClic) => {
          await dormir(azar(300, 1_200))
          await pulsarGuardadoPresupuesto(pagina, guard, boton, { el, pantalla }, trasClic)
        },
        pulsarGuardadoDialogo: async (boton, el, marco) => {
          await dormir(azar(300, 1_200))
          await pulsarGuardadoDialogoAutorizado(pagina, guard, boton, { entrada: exp.entrada, el, marco })
        },
        pausaAccion: () => dormir(azar(300, 1_200)),
        pedirPaso: (cuerpo) => pedirPaso(cfg, cuerpo),
        log,
      }),
    })
  } catch (e) {
    const c = clasificar(e)
    finExp = { motivo: 'error_portal', error: { tipo: c.tipo === 'portal' ? 'infra' : c.tipo, mensaje: c.mensaje }, redNoGet: [], efectos: ['ninguno_visto'], pasos: 0, acciones: 0 }
  } finally {
    await (browser as Browser | null)?.close().catch(() => undefined)
  }

  log('exploracion_fin', { motivo: finExp.motivo, ...(finExp.detalle ? { detalle: finExp.detalle } : {}), ...(finExp.nota ? { nota: finExp.nota } : {}), pasos: finExp.pasos, acciones: finExp.acciones, red: finExp.redNoGet.length, ...(finExp.error ? { tipo: finExp.error.tipo, mensaje: redactar(finExp.error.mensaje).slice(0, 300) } : {}) })
  if (finExp.motivo === 'perdido') {
    clearTimeout(respaldo)
    return 0
  }
  const stCierre = await cerrarExploracion(cfg, {
    trabajoId: trabajo.id, motivoFin: finExp.motivo, ...(finExp.detalle ? { detalleFin: finExp.detalle } : {}), ...(finExp.nota ? { notaFin: finExp.nota } : {}), ...(finExp.incidencias?.length ? { incidencias: finExp.incidencias } : {}), redNoGet: finExp.redNoGet, efectosEnPortal: finExp.efectos,
    presupuesto: presupuestoParaCierre(finExp.presupuesto ?? { guardado: false, referencia: null, pdf: null, pdfIntentado: false }),
  })
  log('exploracion_cierre', { status: stCierre })
  const cuerpo = cuerpoTrasCierre(trabajo.id, trabajo.compania, finExp, stCierre, redactar)
  const st = cuerpo ? await enviarResultado(cfg, cuerpo) : 0
  log('exploracion_resultado_enviado', { status: st, resultado: cuerpo?.resultado ?? null })
  clearTimeout(respaldo)
  return cuerpo?.resultado === 'explorado' && st >= 200 && st < 300 ? 0 : 1
}
