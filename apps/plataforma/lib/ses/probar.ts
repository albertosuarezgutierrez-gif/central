// Prueba de conexión de UN establecimiento contra SES.HOSPEDAJES.
//
// Compartida a propósito entre el botón «probar conexión» de la pantalla y el cron
// del latido: si fueran dos implementaciones, el día que divergieran el botón diría
// verde y el latido rojo (o al revés) y no habría forma de saber cuál miente.
//
// 🚨 SOLO LECTURA: operación `C` (consulta) de un lote inexistente. No da de alta ni
// anula nada en el Ministerio. Ejercita el camino entero —TLS → Basic → cabecera →
// ZIP— sin tocar un solo dato.
import { ENDPOINTS, peticionConsulta, enviarSes } from '@central/module-ses'
import { credencialesDe, anotarPrueba } from './establecimientos'
import { evaluarSondaSes } from './sonda'

// UUID bien formado que no existe: la petición más inocua que admite el servicio.
const LOTE_INEXISTENTE = '00000000-0000-0000-0000-000000000000'

export type ResultadoPrueba = {
  ok: boolean
  /** 'ninguna' | 'esperar' | 'revisar_portal' — qué hacer, sin interpretar. */
  accion: 'ninguna' | 'esperar' | 'revisar_portal'
  detalle: string
}

export async function probarEstablecimiento(id: string): Promise<ResultadoPrueba> {
  const cred = await credencialesDe(id)
  if (!cred) {
    // Sin contraseña no se prueba, pero tampoco se dice que falle la conexión: es
    // un «falta un dato», no una avería del Ministerio. Confundirlos manda a mirar
    // al sitio equivocado.
    const detalle = 'sin contraseña guardada: métela en la pantalla de establecimientos'
    await anotarPrueba(id, false, detalle)
    return { ok: false, accion: 'revisar_portal', detalle }
  }

  const respuesta = await enviarSes({
    url: ENDPOINTS[cred.entorno] ?? ENDPOINTS.produccion,
    credenciales: { usuario: cred.usuario, password: cred.password },
    sobre: peticionConsulta({
      codigoArrendador: cred.codigoArrendador,
      aplicacion: process.env.SES_APLICACION ?? 'central',
      lotes: [LOTE_INEXISTENTE],
    }),
  })

  const veredicto = evaluarSondaSes(respuesta)
  const detalle = `${cred.entorno} · ${veredicto.detalle}`
  await anotarPrueba(id, veredicto.transporteOk, detalle)
  return { ok: veredicto.transporteOk, accion: veredicto.accion, detalle }
}
