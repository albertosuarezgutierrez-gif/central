// CONSULTA DE VEHÍCULO POR MATRÍCULA (04/11/2026, explorador 0.3.48). Sustituye a Avant2 `GET /vehicles?registrationPlate=` (cuesta
// créditos) por el bot de Allianz (gratis): login ePAC › Nueva Alta › Autos › Turismos › «¿Conoces la matrícula? Sí» › Matrícula ›
// «Encuentra mi vehículo» › LEER marca/modelo/versión/combustible/1ª matriculación › cerrar. Asegura encola el trabajo (modo
// `vehiculo`, riesgo = SOLO `{matricula}`) y guarda la respuesta en una caché de 24 h (apps/asegura/lib/tarificador-vehiculo*.ts).
//
// 🚨 TARIFICAR ≠ EMITIR, y aquí ni siquiera se tarifica: tras «Encuentra mi vehículo» NO se pulsa NADA (ni tarjeta, ni versión, ni
//    «SIGUIENTE»). Dos cerrojos: el guard de emisión de siempre (`pulsar(boton, guard)`) y el VETO propio de este modo
//    (`pulsacionVetadaVehiculo`: cualquier control con rótulo de avance/cotización se rechaza ANTES del guard) con un tope de clics.
//    Las puertas de avance/tarificación/proyecto/PDF del contexto están PROHIBIDAS.
// 🙅 Sin resultado del portal (aviso, marca/modelo que no se leen o tarjetas de modelos distintos) → `sin_resultado`: nunca se inventa.
// 🔒 La matrícula es dato del riesgo: va al redactor (todas sus formas), nunca a un log ni a un mensaje de error (`enmascararMatricula`).
// 📝 Respaldo Mapfre: su autorrelleno por matrícula vive en el paso 2 de NSEI («Objeto asegurado», `consultarVehiculoPorMatricula…` de
//    adapters/mapfre/auto.ts), DESPUÉS de los datos del tomador (NIF): no es reutilizable sin tomador. Queda anotado, no implementado.

import { chromium, type Browser, type Page } from 'playwright'
import { crearRedactor, esMatriculaEspanola, nombresCredencial, normalizarMatricula, secretosDelEntorno, type CandidatoVersion, type Credenciales, type TipoError } from '@central/module-tarificacion'
import type { ContextoPortal } from './adaptador.ts'
import { enviarResultado, enviarResultadoVehiculo, type Config, type CuerpoVehiculo, type Trabajo } from './api.ts'
import { exigirSinCaptcha } from './captcha.ts'
import { exigirSinRechazoCredenciales } from './credenciales.ts'
import { ErrorTarificador, clasificar } from './errores.ts'
import { instalarGuardEmision, marcarOpcionTurismosAllianz, pulsar, type GuardEmision } from './guard.ts'
import { conRedaccionMediador } from './privacidad-mediador.ts'
import { exigirSinVerificacion } from './verificacion.ts'
import { EXPLORADOR_VERSION } from './explorador.ts'
import { allianzAuto, consultarMatriculaTurismos, marcoFormularioTurismos, type ConsultaMatriculaTurismos } from './adapters/allianz/auto.ts'
import { abrirNuevaAlta, login as loginAllianz, TARJETA_AUTOS } from './adapters/allianz/intranet/index.ts'

export const VEHICULO_VERSION = EXPLORADOR_VERSION
const TOPE_VEHICULO_MS = 4 * 60_000
const TOPE_PASO_MS = 30_000
/** Clics de toda la consulta: login (1) + Nueva Alta, pestaña, tarjeta (3) + «Encuentra mi vehículo» (1), con margen. */
export const MAX_PULSACIONES_VEHICULO = 8

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const azar = (min: number, max: number) => min + Math.random() * (max - min)

// ───────────────────────── puras ─────────────────────────

/** Matrícula del riesgo, normalizada y española plausible; si no, `null` (sin eco del valor). PURA. */
export function matriculaDelRiesgo(riesgo: unknown): string | null {
  const m = riesgo && typeof riesgo === 'object' && !Array.isArray(riesgo) ? (riesgo as Record<string, unknown>).matricula : undefined
  if (typeof m !== 'string' || m.length > 20) return null
  const s = normalizarMatricula(m)
  return /^[A-Z0-9]{4,10}$/.test(s) && esMatriculaEspanola(s) ? s : null
}

/** Para logs: solo las 3 últimas (`****BCD`). PURA. */
export function enmascararMatricula(m: string): string {
  const s = normalizarMatricula(m)
  return s.length <= 3 ? '***' : `${'*'.repeat(Math.min(4, s.length - 3))}${s.slice(-3)}`
}

/** Formas en que la matrícula puede aparecer en un texto del portal (para el redactor): `0000BBB`, `0000 BBB`, `0000-BBB`. PURA. */
export function formasMatricula(m: string): string[] {
  const s = normalizarMatricula(m)
  const r = /^(\d{4})([A-Z]{3})$/.exec(s)
  return r ? [s, `${r[1]} ${r[2]}`, `${r[1]}-${r[2]}`] : [s]
}

/**
 * Rótulos que este modo NUNCA pulsa (además del guard): todo avance de pasos o de cotización, guardar/archivar, y la acción final.
 * Basta con que la palabra aparezca en el texto, aria-label, value o title del control. PURA.
 */
const RE_VETO_VEHICULO = /\b(siguiente|continuar|anterior|calcular|recalcular|tarificar|cotizar|presupuesto|precio|seleccionar|elegir|guardar|archivar|emitir|emision|contratar|contratacion|pagar|firmar|confirmar|confirmacion)\b/
export function pulsacionVetadaVehiculo(descripcion: string): boolean {
  const t = descripcion.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return RE_VETO_VEHICULO.test(t)
}

export type VehiculoLeido = { marca: string; modelo: string; version: string | null; fechaMatriculacion: string | null; combustible: string | null }
export type DecisionVehiculo = { estado: 'ok'; vehiculo: VehiculoLeido } | { estado: 'sin_resultado'; motivo: string }

const limpio = (t: string | null | undefined): string | null => {
  const s = (t ?? '').replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

/** Campos de una tarjeta «Marca del vehículo X Modelo Y Tipo de combustible Z Versión W» (en el orden en que vengan). PURA. */
export function camposTarjetaVehiculo(etiqueta: string): { marca: string | null; modelo: string | null; combustible: string | null; version: string | null } {
  const claves: Array<[keyof ReturnType<typeof camposTarjetaVehiculo>, RegExp]> = [
    ['marca', /marca del veh[ií]culo/i],
    ['modelo', /\bmodelo\b/i],
    ['combustible', /tipo de combustible/i],
    ['version', /\bversi[oó]n\b/i],
  ]
  const pos = claves
    .map(([k, re]) => {
      const m = re.exec(etiqueta)
      return m ? { k, ini: m.index, fin: m.index + m[0].length } : null
    })
    .filter((x): x is { k: keyof ReturnType<typeof camposTarjetaVehiculo>; ini: number; fin: number } => x !== null)
    .sort((a, b) => a.ini - b.ini)
  const out = { marca: null, modelo: null, combustible: null, version: null } as ReturnType<typeof camposTarjetaVehiculo>
  pos.forEach((p, i) => {
    out[p.k] = limpio(etiqueta.slice(p.fin, i + 1 < pos.length ? pos[i + 1]!.ini : undefined))
  })
  return out
}

const igual = (a: string | null, b: string | null) => (a ?? '').toUpperCase() === (b ?? '').toUpperCase()
const comun = (xs: readonly (string | null)[]): string | null => (xs.length > 0 && xs.every((x) => x !== null && igual(x, xs[0]!)) ? xs[0]! : null)
const esVacia = (t: string) => /^\s*(|seleccion[ea].*|-+)\s*$/i.test(t)

/**
 * Lo que se devuelve de la consulta. PURA. Tarjetas: marca y modelo COMUNES a todas (si difieren → `sin_resultado`, no se elige);
 * versión y combustible solo si son únicos. Versiones (`<select>`): marca/modelo de la lectura de respaldo; versión si hay una sola o
 * una fijada. Aviso del portal → `sin_resultado`. Nada se deduce de lo que no se lee.
 */
export function decidirVehiculo(c: ConsultaMatriculaTurismos): DecisionVehiculo {
  if (c.tipo === 'aviso') return { estado: 'sin_resultado', motivo: 'aviso_portal' }
  if (c.tipo === 'tarjetas') {
    const campos = c.etiquetas.map(camposTarjetaVehiculo)
    const marca = comun(campos.map((x) => x.marca))
    const modelo = comun(campos.map((x) => x.modelo))
    if (!marca || !modelo) return { estado: 'sin_resultado', motivo: campos.length > 1 ? 'tarjetas_distintas' : 'tarjeta_ilegible' }
    return { estado: 'ok', vehiculo: { marca, modelo, version: comun(campos.map((x) => x.version)), combustible: comun(campos.map((x) => x.combustible)), fechaMatriculacion: c.fechaMatriculacion } }
  }
  const marca = limpio(c.legado.marca)
  const modelo = limpio(c.legado.modelo)
  if (!marca || !modelo) return { estado: 'sin_resultado', motivo: 'sin_marca_modelo' }
  const ops: CandidatoVersion[] = c.opciones.filter((o) => !esVacia(o.etiqueta))
  const version = limpio(c.legado.versionSeleccionada?.etiqueta) ?? (ops.length === 1 ? limpio(ops[0]!.etiqueta) : null)
  return { estado: 'ok', vehiculo: { marca, modelo, version, combustible: limpio(c.legado.combustible), fechaMatriculacion: c.fechaMatriculacion ?? c.legado.fechaMatriculacion } }
}

/** El cuerpo del cierre (sin la matrícula; un texto que la contenga no viaja: `sin_resultado`). PURA. */
export function cuerpoVehiculo(trabajoId: string, d: DecisionVehiculo, matricula: string): CuerpoVehiculo {
  if (d.estado === 'ok') {
    const v = d.vehiculo
    const conMatricula = [v.marca, v.modelo, v.version, v.combustible].some((t) => t !== null && normalizarMatricula(t).includes(normalizarMatricula(matricula)))
    const fecha = v.fechaMatriculacion && /^\d{4}-\d{2}-\d{2}$/.test(v.fechaMatriculacion) ? v.fechaMatriculacion : null
    if (!conMatricula) return { trabajoId, resultado: 'vehiculo', estado: 'ok', vehiculo: { marca: v.marca.slice(0, 80), modelo: v.modelo.slice(0, 120), version: v.version?.slice(0, 200) ?? null, fechaMatriculacion: fecha, combustible: v.combustible?.slice(0, 40) ?? null }, botVersion: VEHICULO_VERSION }
  }
  return { trabajoId, resultado: 'vehiculo', estado: 'sin_resultado', botVersion: VEHICULO_VERSION }
}

// ───────────────────────── el trabajo ─────────────────────────

const prohibido = (nombre: string) => (): never => {
  throw new ErrorTarificador('datos', `vehiculo: «${nombre}» no está permitido en la consulta de vehículo (solo leer la pantalla del vehículo)`)
}

/** Descripción del control para el veto (texto visible, aria-label, value, title). Si no se puede leer → vetado (fail-closed). */
async function describirParaVeto(boton: Parameters<ContextoPortal['pulsar']>[0]): Promise<string | null> {
  return boton
    .evaluate((el) => {
      const h = el as HTMLElement & { value?: unknown }
      return [h.innerText || h.textContent || '', h.getAttribute('aria-label') || '', typeof h.value === 'string' ? h.value : '', h.getAttribute('title') || ''].join(' ')
    }, undefined, { timeout: 5_000 })
    .catch(() => null)
}

/** `pulsar` del modo vehículo: veto propio + tope de clics, y luego el guard de siempre. */
export function pulsarConVetoVehiculo(guard: GuardEmision, pausa: () => Promise<void>, conteo: { n: number } = { n: 0 }): ContextoPortal['pulsar'] {
  return async (boton) => {
    const d = await describirParaVeto(boton)
    if (d === null || pulsacionVetadaVehiculo(d)) throw new ErrorTarificador('emision', 'vehiculo: pulsación vetada (avance o cotización: la consulta de vehículo no pasa de la pantalla del vehículo)')
    if (++conteo.n > MAX_PULSACIONES_VEHICULO) throw new ErrorTarificador('emision', `vehiculo: tope de ${MAX_PULSACIONES_VEHICULO} pulsaciones superado`)
    await pausa()
    await pulsar(boton, guard)
  }
}

export type DepsVehiculo = {
  cfg: Config
  trabajo: Trabajo
  env: Record<string, string | undefined>
  log: (m: string, d?: Record<string, unknown>) => void
  redactar: (t: string) => string
}

/** Una consulta de vehículo de principio a fin. Devuelve el código de salida (0 = resultado entregado). */
export async function ejecutarVehiculo(d: DepsVehiculo): Promise<number> {
  const { cfg, trabajo, env, log } = d
  const matricula = matriculaDelRiesgo(trabajo.riesgo)
  // La matrícula, en todas sus formas, al redactor de TODO lo que sale (mensajes de error incluidos).
  const redactar = conRedaccionMediador(crearRedactor([...secretosDelEntorno(env), ...(matricula ? formasMatricula(matricula) : [])]))
  const error = async (tipo: TipoError, mensaje: string): Promise<number> => {
    const st = await enviarResultado(cfg, { trabajoId: trabajo.id, resultado: 'error', error: { tipo, mensaje: redactar(`vehiculo: ${mensaje}`).slice(0, 2000), url: null }, botVersion: VEHICULO_VERSION })
    log('vehiculo_error_enviado', { status: st, tipo })
    return 1
  }
  if (String(trabajo.compania).toLowerCase() !== 'allianz' || trabajo.ramo !== 'auto') return error('datos', 'solo Allianz auto (Turismos) consulta por matrícula en esta imagen')
  if (!matricula) return error('datos', 'el riesgo no trae una matrícula válida')
  log('vehiculo_inicio', { matricula: enmascararMatricula(matricula) })

  const n = nombresCredencial(allianzAuto.credencial)
  const usuario = env[n.usuario] ?? ''
  const contrasena = env[n.contrasena] ?? ''
  if (!usuario || !contrasena) return error('credenciales', `faltan los fly secrets ${n.usuario} / ${n.contrasena}`)
  const credenciales: Credenciales = { usuario, contrasena }

  const respaldo = setTimeout(() => {
    log('tope_duro_superado: salida forzada')
    process.exit(2)
  }, TOPE_VEHICULO_MS + 60_000)
  respaldo.unref()

  let browser: Browser | null = null
  let actual: Page | null = null
  let fallo: unknown = null
  let consulta: ConsultaMatriculaTurismos | null = null
  try {
    browser = await chromium.launch({ headless: true })
    // Contexto LIMPIO, sin descargas ni tracing.
    const context = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: false })
    const guard = await instalarGuardEmision(context)
    const page = await context.newPage()
    actual = page
    page.setDefaultTimeout(TOPE_PASO_MS)
    page.setDefaultNavigationTimeout(TOPE_PASO_MS)
    const pausaAccion = () => dormir(azar(300, 1_200))
    const ctx: ContextoPortal = {
      trabajoId: trabajo.id,
      credenciales,
      log: (m) => log(m),
      pausa: () => dormir(azar(800, 2_500)),
      pausaAccion,
      sesionReutilizada: false,
      sesionManual: false,
      trasLogin: async () => {
        await exigirSinVerificacion(page, trabajo.compania)
        await exigirSinRechazoCredenciales(page, trabajo.compania, { soloInutilizable: true })
      },
      adjuntarPdf: prohibido('adjuntarPdf'),
      pulsar: pulsarConVetoVehiculo(guard, pausaAccion),
      elegirOpcion: prohibido('elegirOpcion'),
      avanzarATarificar: prohibido('avanzarATarificar'),
      abrirProyecto: prohibido('abrirProyecto'),
      exigirSinCaptcha: () => exigirSinCaptcha(page),
      paso: (_nombre, fn) => fn(),
      marcarOpcionTurismos: async (marco, clave) => {
        if (marco.page() !== page) throw new ErrorTarificador('portal', 'vehiculo: el marco no es de este trabajo')
        await pausaAccion()
        return marcarOpcionTurismosAllianz(marco, guard, clave)
      },
    }
    let tope: ReturnType<typeof setTimeout> | undefined
    try {
      consulta = await Promise.race([
        (async () => {
          await loginAllianz(page, ctx)
          await ctx.trasLogin()
          await abrirNuevaAlta(page, ctx, { pestana: 'Autos', producto: 'Turismos', selectorTarjeta: TARJETA_AUTOS.turismos })
          const marco = await marcoFormularioTurismos(page)
          const c = await consultarMatriculaTurismos(page, marco, matricula, ctx)
          guard.comprobar()
          return c
        })(),
        new Promise<never>((_, rechazar) => {
          tope = setTimeout(() => rechazar(new ErrorTarificador('infra', `tope de la consulta de ${Math.round(TOPE_VEHICULO_MS / 1000)} s superado`)), TOPE_VEHICULO_MS)
        }),
      ])
    } catch (e) {
      fallo = guard.violacion() ?? e
    } finally {
      clearTimeout(tope)
    }
  } catch (e) {
    fallo = e
  } finally {
    await actual?.context().close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    clearTimeout(respaldo)
  }

  if (fallo || !consulta) {
    const c = clasificar(fallo ?? new ErrorTarificador('portal', 'sin lectura'))
    return error(c.tipo === 'portal' && !actual ? 'infra' : c.tipo, c.mensaje)
  }
  const decision = decidirVehiculo(consulta)
  const cuerpo = cuerpoVehiculo(trabajo.id, decision, matricula)
  const st = await enviarResultadoVehiculo(cfg, cuerpo)
  log('vehiculo_enviado', { status: st, estado: cuerpo.estado, ...(decision.estado === 'sin_resultado' ? { motivo: decision.motivo } : {}) })
  return st >= 200 && st < 300 ? 0 : 1
}
