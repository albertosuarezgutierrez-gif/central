// Veredicto del latido de SES, en función PURA para poder probarlo sin red ni credenciales.
//
// 🚨 Lo que mide este latido es **la puerta, no el contenido**: que el TLS cierre, que las
// credenciales valgan y que el arrendador tenga habilitado el servicio web. NO mide que un parte
// esté bien formado, porque el latido no manda ningún parte.
//
// De ahí la decisión que parece rara y no lo es: **un error de DATOS cuenta como verde.** Si SES
// contesta «te falta el campo X», ya nos ha dicho todo lo que preguntábamos — hemos llegado, nos
// ha autenticado y nos ha leído. Poner eso en rojo sería avisar de una avería que no existe, y un
// vigía que da falsas alarmas se ignora y deja de servir.
//
// Rojo solo dos cosas, que además piden acciones distintas:
//   · `transporte`   → «espera»: TLS, red o el Ministerio caído. No hay nada que arreglar aquí.
//   · `configuracion`→ «actúa»: credenciales o alta. Lo arregla una persona en el portal SES.
import type { RespuestaSes } from '@central/module-ses'

export type VeredictoSonda = {
  /** true = la puerta con SES sigue abierta. */
  transporteOk: boolean
  /** Qué hacer, para que el aviso no obligue a interpretar. */
  accion: 'ninguna' | 'esperar' | 'revisar_portal'
  detalle: string
}

export function evaluarSondaSes(r: RespuestaSes): VeredictoSonda {
  if (r.clase === 'transporte') {
    return { transporteOk: false, accion: 'esperar', detalle: `SES no responde — ${r.detalle}` }
  }
  if (r.clase === 'configuracion') {
    return {
      transporteOk: false,
      accion: 'revisar_portal',
      detalle: `credenciales o alta rechazadas — ${r.detalle}`,
    }
  }
  if (r.clase === 'desconocido') {
    // Ni verde ni rojo por su cuenta: no sabemos leer lo que ha contestado. Se marca como fallo
    // para que aparezca, con el cuerpo crudo, en vez de inventarnos un veredicto.
    return {
      transporteOk: false,
      accion: 'esperar',
      detalle: `respuesta no reconocida — ${r.detalle}`,
    }
  }
  // ok / datos / limite: hemos hablado con SES y nos ha entendido. La puerta está abierta.
  return {
    transporteOk: true,
    accion: 'ninguna',
    detalle: r.clase === 'ok'
      ? `transporte OK — ${r.detalle}`
      : `transporte OK (SES contesta y nos lee; responde ${r.clase}: ${r.detalle})`,
  }
}
