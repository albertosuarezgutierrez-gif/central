// La «vista de corredor»: Alberto abre el portal COMO lo ve un cliente
// (08/09/2026). El enlace lo crea asegura; aquí se consume UNA vez y se monta
// la sesión. Reglas y constantes en `@central/module-seguros-portal/vista-corredor`.
//
// 🚨 Cómo se consigue «ver lo mismo» sin tocar ninguna lectura: cada APERTURA crea su propia
// identidad (`portal_identidad.id = portal_vista_corredor.id`) con un vínculo TEMPORAL a la
// ficha (`origen = 'corredor'`), y las diez lecturas del portal, que filtran por identidad,
// hacen el resto. Dos vistas abiertas a la vez (ficha A y ficha B) son dos identidades que no
// se tocan (02/11/2026: con la identidad compartida, abrir B cortaba la vista de A). Reglas y
// limpieza en `vista-corredor-identidad.ts`. Y asegura excluye ese origen al decir «ya entra
// al portal», que es lo único que este atajo podría romper.
import {
  IDENTIDAD_CORREDOR_ID,
  ORIGEN_VINCULO_CORREDOR,
  estadoEnlaceVista,
  formatoTokenVistaValido,
  hashTokenVista,
} from '@central/module-seguros-portal'

import { prisma } from './db'
export { destinoVistaCorredor } from './vista-previa'
import { getIdentidad } from './session'
import { consumirEnlaceVista } from './vista-corredor-consumo'
import { NOMBRE_IDENTIDAD_VISTA, crearIdentidadDeVista, limpiarIdentidadesDeVistaCaducadas } from './vista-corredor-identidad'

export type AperturaVista =
  | { estado: 'ok'; identidadId: string; clienteId: string }
  | { estado: 'enlace_invalido' | 'usado' | 'caducado' }

export async function abrirVistaCorredor(tokenCrudo: unknown): Promise<AperturaVista> {
  if (!formatoTokenVistaValido(tokenCrudo)) return { estado: 'enlace_invalido' }
  const fila = await prisma.portalVistaCorredor.findUnique({
    where: { tokenHash: await hashTokenVista(tokenCrudo) },
    select: { id: true, correduriaId: true, clienteId: true, creadoEn: true, usadoEn: true },
  })
  if (!fila) return { estado: 'enlace_invalido' }
  const estado = estadoEnlaceVista(fila, new Date())
  if (estado !== 'valido') return { estado }

  // Barrido de las vistas cuya sesión ya caducó. Best-effort y FUERA de la transacción: un fallo
  // aquí no puede impedir abrir la vista, ni deshacer el consumo del enlace.
  try {
    await limpiarIdentidadesDeVistaCaducadas(prisma)
  } catch (e) {
    console.error('[portal/vista-corredor] no se pudo limpiar vistas caducadas:', e instanceof Error ? e.message : e)
  }

  // Transacción interactiva: el enlace se gasta ATÓMICAMENTE (solo si seguía sin usar) y, si
  // alguien lo gastó entre medias, no se crea nada. La identidad es de ESTA apertura: no se
  // borra ni se toca ningún vínculo de otra vista abierta.
  const identidadId = await prisma.$transaction(async (tx) => {
    if (!(await consumirEnlaceVista(tx, fila.id))) return null
    return crearIdentidadDeVista(tx, { vistaId: fila.id, correduriaId: fila.correduriaId, clienteId: fila.clienteId })
  })
  if (identidadId === null) return { estado: 'usado' }
  return { estado: 'ok', identidadId, clienteId: fila.clienteId }
}

/**
 * Al salir: si la sesión es la del corredor, se suelta su vínculo temporal.
 * La ficha sale de la SESIÓN, no de un parámetro: nadie puede pedir por HTTP
 * que se suelte el vínculo de otra. Best-effort — la cookie se borra igual.
 */
export async function cerrarVistaCorredorDeSesion(): Promise<void> {
  const identidad = await getIdentidad()
  if (!identidad?.corredor) return
  try {
    if (identidad.id === IDENTIDAD_CORREDOR_ID) {
      // Sesión abierta antes del cambio (identidad compartida): se suelta solo su vínculo.
      await prisma.portalVinculo.deleteMany({
        where: { identidadId: IDENTIDAD_CORREDOR_ID, clienteId: identidad.corredor.clienteId, origen: ORIGEN_VINCULO_CORREDOR },
      })
      return
    }
    // La identidad de ESTA vista (id de la cookie firmada + marca exacta): en cascada se va su vínculo.
    await prisma.portalIdentidad.deleteMany({ where: { id: identidad.id, nombre: NOMBRE_IDENTIDAD_VISTA } })
  } catch (e) {
    console.error('[portal/vista-corredor] no se pudo soltar la vista:', e instanceof Error ? e.message : e)
  }
}

/**
 * Para la banda «Estás viendo el portal de …»: el nombre de la ficha que la
 * sesión del corredor tiene abierta. `null` = sesión normal (no hay banda) o
 * no se pudo leer. Igual que arriba, el id sale de la sesión.
 */
export async function nombreDeFichaEnVista(): Promise<string | null> {
  const identidad = await getIdentidad()
  if (!identidad?.corredor) return null
  try {
    const c = await prisma.cliente.findUnique({
      where: { id: identidad.corredor.clienteId },
      select: { nombre: true, apellidos: true },
    })
    if (!c) return 'este cliente'
    const n = [c.nombre, c.apellidos].filter((s) => typeof s === 'string' && s.trim() !== '').join(' ').trim()
    return n === '' ? 'este cliente' : n
  } catch {
    return 'este cliente'
  }
}
