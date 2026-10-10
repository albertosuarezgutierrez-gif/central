// Máquina de FASES de ePAC «Comunidades 2020» (05/10/2026). PURA.
//
// En ePAC «Aceptar» existe en dos pantallas con efectos opuestos:
//   · Datos Básicos → «Aceptar» SOLO avanza a la pestaña «Tarificar» (no emite);
//   · Tarificar     → «Aceptar» AVANZA A EMITIR: prohibido siempre.
// Por eso «Aceptar» y el radio de opción (bajo «ELIJA UNA OPCIÓN») no se bloquean por texto sino por
// FASE: solo se permiten en `datos_basicos`, UNA vez por trabajo, y solo si la pestaña activa que
// el DOM declara es «Datos Básicos». Cualquier otra cosa aborta como `emision` (error_definitivo).
// Las pestañas «Emitir», «Archivar» y «Proyecto Ampliado» siguen bloqueadas por texto (guard-emision).
//
// La máquina consume el permiso ANTES de pulsar (fail-closed): si el clic falla, no hay segundo intento.

import { EmisionBloqueadaError } from './guard-emision.ts'

export type FaseTarificacion = 'datos_basicos' | 'tarificar' | 'proyecto'
/** Pestaña activa tal como la detecta el worker en el DOM. `null` = no se pudo determinar (→ bloquea). */
export type PestanaActiva = FaseTarificacion | null

export class MaquinaFases {
  private fase_: FaseTarificacion = 'datos_basicos'
  private opcionUsada = false
  private aceptarUsado = false
  private ventanaAceptar = false
  private emisionUsada = false

  fase(): FaseTarificacion {
    return this.fase_
  }

  /** ¿Hay un «Aceptar» de Datos Básicos autorizado y aún sin confirmar su avance a «Tarificar»? */
  aceptarEnVuelo(): boolean {
    return this.ventanaAceptar
  }

  private bloquear(que: string, detalle: string): never {
    throw new EmisionBloqueadaError('fase', `${que}: ${detalle} (fase ${this.fase_})`)
  }

  private exigirDatosBasicos(que: string, pestana: PestanaActiva): void {
    if (this.fase_ !== 'datos_basicos') this.bloquear(que, 'solo se permite en Datos Básicos')
    if (pestana !== 'datos_basicos') this.bloquear(que, `la pestaña activa no es Datos Básicos (${pestana ?? 'desconocida'})`)
  }

  /** Radio de modalidad bajo «Elija una opción»: Datos Básicos, una vez. */
  autorizarOpcion(pestana: PestanaActiva): void {
    this.exigirDatosBasicos('opción', pestana)
    if (this.opcionUsada) this.bloquear('opción', 'ya se eligió una vez en este trabajo')
    this.opcionUsada = true
  }

  /** «Aceptar» de Datos Básicos: tras elegir opción, una vez, con la pestaña verificada. */
  autorizarAceptar(pestana: PestanaActiva): void {
    this.exigirDatosBasicos('aceptar', pestana)
    if (!this.opcionUsada) this.bloquear('aceptar', 'antes hay que elegir modalidad')
    if (this.aceptarUsado) this.bloquear('aceptar', 'ya se pulsó una vez en este trabajo')
    this.aceptarUsado = true
    this.ventanaAceptar = true
  }

  /** El «Aceptar» autorizado llevó a «Tarificar» (verificado en DOM). Cierra la ventana. */
  confirmarTarificar(pestana: PestanaActiva): void {
    if (!this.ventanaAceptar || pestana !== 'tarificar') this.bloquear('avance', 'no hay un Aceptar de Datos Básicos pendiente o la pestaña no es Tarificar')
    this.fase_ = 'tarificar'
    this.ventanaAceptar = false
  }

  /** Pestaña «Proyecto» (genera el PDF sin grabar): solo desde Tarificar, una vez. */
  autorizarProyecto(pestana: PestanaActiva): void {
    if (this.fase_ !== 'tarificar') this.bloquear('proyecto', 'solo se abre desde Tarificar')
    if (pestana !== 'tarificar') this.bloquear('proyecto', `la pestaña activa no es Tarificar (${pestana ?? 'desconocida'})`)
    this.fase_ = 'proyecto'
  }

  /**
   * EMISIÓN autorizada (10/10/2026, emision.ts): el «Aceptar» de Tarificar, SOLO desde Tarificar (no tras «Proyecto»),
   * con la pestaña verificada en el DOM y UNA vez por trabajo. No basta con esto: además hace falta un `PermisoEmision`
   * válido (`usarPermisoEmision`), que solo existe tras canjear el token de Alberto. Sin él, todo sigue bloqueado.
   */
  autorizarEmision(pestana: PestanaActiva): void {
    if (this.fase_ !== 'tarificar') this.bloquear('emision', 'solo desde Tarificar')
    if (pestana !== 'tarificar') this.bloquear('emision', `la pestaña activa no es Tarificar (${pestana ?? 'desconocida'})`)
    if (this.emisionUsada) this.bloquear('emision', 'ya se pulsó una vez en este trabajo')
    this.emisionUsada = true
  }
}
