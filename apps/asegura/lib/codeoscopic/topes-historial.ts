// Topes aprendidos del historial del seguro anterior (29/09/2026). La lógica pura vive en
// `@central/module-seguros` (`historial-maximo.ts`); aquí solo la BD.
//
// Leer NUNCA tumba una cotización: sin la tabla se cotiza con lo que venga (el máximo), y si el
// vendor lo rechaza vuelve a enseñarlo — que es justo lo que se aprende. Guardar solo BAJA un
// tope (`least`): un mensaje raro no puede subir lo que otro ya enseñó.
import { prisma } from '../tenant.ts'
import { CAMPOS_ANIOS_VENDOR, type CampoAniosVendor, type TopesHistorial } from '@central/module-seguros'

export async function leerTopesHistorial(): Promise<TopesHistorial> {
  try {
    const filas = await prisma.$queryRaw<{ campo: string; maximo: number }[]>`
      select campo, maximo from seguros.codeoscopic_topes_historial`
    const out: TopesHistorial = {}
    for (const f of filas) {
      if ((CAMPOS_ANIOS_VENDOR as readonly string[]).includes(f.campo)) out[f.campo as CampoAniosVendor] = Number(f.maximo)
    }
    return out
  } catch (e) {
    console.error('[topes-historial] no se pudieron leer (se cotiza sin recortar):', e instanceof Error ? e.message : e)
    return {}
  }
}

export async function guardarTopesHistorial(topes: TopesHistorial, mensaje: string): Promise<void> {
  for (const campo of CAMPOS_ANIOS_VENDOR) {
    const maximo = topes[campo]
    if (maximo === undefined) continue
    try {
      await prisma.$executeRaw`
        insert into seguros.codeoscopic_topes_historial (campo, maximo, mensaje)
        values (${campo}, ${maximo}, ${mensaje.slice(0, 2000)})
        on conflict (campo) do update set
          maximo = least(seguros.codeoscopic_topes_historial.maximo, excluded.maximo),
          mensaje = case when excluded.maximo < seguros.codeoscopic_topes_historial.maximo
                         then excluded.mensaje else seguros.codeoscopic_topes_historial.mensaje end,
          aprendido_at = case when excluded.maximo < seguros.codeoscopic_topes_historial.maximo
                              then now() else seguros.codeoscopic_topes_historial.aprendido_at end`
    } catch (e) {
      console.error('[topes-historial] no se pudo guardar el tope de', campo, e instanceof Error ? e.message : e)
    }
  }
}
