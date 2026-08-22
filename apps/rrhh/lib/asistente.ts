import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { iaChat, iaDisponible } from '@/lib/ai'
import { listarExpediente } from '@/lib/documental'
import { misSolicitudes, tipoEtiqueta } from '@/lib/solicitudes'
import { ACTOR_TITULAR } from '@/lib/carpetas'
import { construirSystemPrompt, type ContextoEmpleado } from '@/lib/asistente-prompt'

export type MensajeAsistente = { role: 'user' | 'assistant'; content: string }

const SIN_IA = 'El asistente no está disponible ahora mismo. Inténtalo más tarde o escribe a tu responsable de RR.HH. por el chat.'

/** Reúne el contexto del empleado (scoped) y pregunta a la IA. Devuelve la respuesta en texto. */
export async function responderAsistente(
  empresaId: string,
  empleadoId: string,
  messages: MensajeAsistente[],
): Promise<{ respuesta: string }> {
  // Sin vía de IA (ni pasarela ni key directa) → degradación elegante (no 500).
  if (!iaDisponible()) {
    console.error('[asistente] IA no configurada en runtime (ni AI_GATEWAY_* ni NVIDIA_API_KEY)')
    return { respuesta: SIN_IA }
  }

  const [datos, documentos, solicitudes] = await Promise.all([
    prisma.$queryRaw<{ nombre: string; puesto: string | null; fecha_alta: unknown }[]>(Prisma.sql`
      SELECT nombre, puesto, fecha_alta FROM rrhh.empleados
      WHERE id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`),
    listarExpediente(empresaId, empleadoId, ACTOR_TITULAR),
    misSolicitudes(empresaId, empleadoId),
  ])
  if (!datos[0]) throw new Error('Empleado no encontrado')

  const ctx: ContextoEmpleado = {
    nombre: datos[0].nombre,
    puesto: datos[0].puesto,
    fecha_alta: datos[0].fecha_alta ? String(datos[0].fecha_alta) : null,
    documentos: documentos.map(d => ({
      nombre: d.nombre, carpeta: d.carpeta, estado_firma: d.estado_firma, fecha: String(d.creada_at),
    })),
    solicitudes: solicitudes.map(s => ({
      tipo: tipoEtiqueta(s.tipo),
      fecha_inicio: s.fecha_inicio ? String(s.fecha_inicio) : null,
      fecha_fin: s.fecha_fin ? String(s.fecha_fin) : null,
      estado: s.estado,
    })),
  }

  // Limita el historial a los últimos 10 turnos para acotar tokens.
  const recientes = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

  try {
    const respuesta = await iaChat(recientes, {
      system: construirSystemPrompt(ctx),
      model: 'meta/llama-3.1-70b-instruct',
      maxTokens: 700,
      // El cliente debe esperar MÁS que el timeout de NIM en la pasarela (25 s) para no abortar
      // justo cuando la pasarela aún está respondiendo (causaba "no disponible" con NIM lento).
      timeoutMs: 35_000,
    })
    return { respuesta: respuesta.trim() || 'No he podido generar una respuesta. Inténtalo de nuevo.' }
  } catch (e) {
    // Loguea el motivo REAL (status/mensaje de pasarela o NIM) para diagnosticar en los Runtime Logs.
    console.error('[asistente] fallo IA:', e instanceof Error ? `${e.name}: ${e.message}` : e)
    return { respuesta: SIN_IA }
  }
}
