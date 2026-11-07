'use server'
// Alta de UN trabajador desde el asistente. Misma validación (`validarAlta`) y misma escritura (`darDeAltaLote`) que la
// importación Excel/CSV. La empresa sale SIEMPRE de `getSesion()`; el servidor revalida todo lo que el navegador ya miró.
// 🚨 Sin datos personales en logs: solo el código del error.
import { revalidatePath } from 'next/cache'
import { getSesion, AuthError } from '@/lib/tenant'
import { hoyMadrid } from '@/lib/fecha-madrid'
import { CAMPOS_ALTA, validarAlta, type EntradaAlta, type ErrorCampo } from '@/lib/alta-empleado'
import { convenioDeEmpresa, listarTablasConvenio } from '@/lib/convenio-tablas-repo'
import { darDeAltaLote } from '@/lib/alta-empleado-repo'

export type ResultadoAltaAccion =
  | { ok: true; id: string; avisos: string[] }
  | { ok: false; error: string; errores?: ErrorCampo[] }

export async function darDeAltaEmpleado(datos: Record<string, unknown>): Promise<ResultadoAltaAccion> {
  try {
    const { empresa_id } = await getSesion()
    // Solo los campos conocidos, como texto (nada de empresa_id ni columnas sueltas del cuerpo).
    const entrada: EntradaAlta = {}
    for (const k of CAMPOS_ALTA) if (typeof datos?.[k] === 'string') entrada[k] = datos[k] as string
    const [tablas, convenio] = await Promise.all([
      listarTablasConvenio(empresa_id).catch(() => null),
      convenioDeEmpresa(empresa_id).catch(() => null),
    ])
    const v = validarAlta(entrada, { hoy: hoyMadrid(), tablas, convenio })
    if (!v.ok) return { ok: false, error: 'Revisa los campos marcados', errores: v.errores }
    const r = await darDeAltaLote(empresa_id, [v.alta])
    if (!r.creados[0]) return { ok: false, error: r.rechazadas[0]?.motivo ?? 'No se pudo dar de alta' }
    revalidatePath('/admin/empleados')
    return { ok: true, id: r.creados[0].id, avisos: v.avisos }
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: 'Sesión caducada: vuelve a entrar' }
    console.error('[alta-empleado] fallo al guardar', (e as { code?: string })?.code ?? 'sin_codigo')
    return { ok: false, error: 'No se pudo dar de alta: vuelve a intentarlo' }
  }
}
