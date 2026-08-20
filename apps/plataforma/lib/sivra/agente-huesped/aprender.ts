// lib/sivra/agente-huesped/aprender.ts — log, aprendizaje, gaps y config de autonomía.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { esHechoDelPiso } from './reglas'
import { guardarHecho } from './hechos'

export async function logMensaje(p: {
  bookingId: string; propertyId: string; categoria: string; pregunta: string; respuesta: string
  fuente: string; confidence: number; sentimiento: string; needs_human: boolean; auto_sent: boolean; edited: boolean
}): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_log (booking_id, property_id, categoria, pregunta, respuesta, fuente, confidence, sentimiento, needs_human, auto_sent, edited)
    VALUES (${p.bookingId}, ${p.propertyId}, ${p.categoria}, ${p.pregunta}, ${p.respuesta}, ${p.fuente}, ${p.confidence}, ${p.sentimiento}, ${p.needs_human}, ${p.auto_sent}, ${p.edited})
  `).catch(() => {})
}

// Guarda lo que Alberto aprueba o corrige. DOS destinos, no uno:
//   · HECHO del piso (`mensajes_hechos`) si el huésped preguntaba algo y la respuesta enseña algo de
//     la vivienda → permanente, va SIEMPRE al prompt.
//   · Ejemplo de ESTILO (`mensajes_aprendizaje`) en cualquier otro caso (cortesías, despedidas) →
//     solo alimenta el tono y caduca con los 8 últimos.
// Antes iba todo al mismo montón y el conocimiento se perdía debajo de los «gracias a ti».
export async function aprenderCorreccion(p: { propertyId: string; categoria: string; pregunta: string; respuestaFinal: string }): Promise<void> {
  if (esHechoDelPiso(p.pregunta, p.respuestaFinal)) {
    await guardarHecho({ propertyId: p.propertyId, pregunta: p.pregunta, hecho: p.respuestaFinal, origen: 'alberto', estado: 'confirmado' })
    return
  }
  const norm = (p.pregunta || '').toLowerCase().slice(0, 300)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_aprendizaje (property_id, categoria, pregunta_norm, respuesta_final)
    VALUES (${p.propertyId}, ${p.categoria}, ${norm}, ${p.respuestaFinal})
  `).catch(() => {})
}

// Registra un hueco de la guía (incrementa el contador si ya existía esa pregunta para el piso).
export async function registrarGap(propertyId: string, pregunta: string): Promise<void> {
  const norm = (pregunta || '').toLowerCase().slice(0, 200)
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT id FROM mensajes_guia_gaps WHERE property_id = ${propertyId} AND pregunta = ${norm} LIMIT 1
  `)
  if (rows[0]) {
    await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_guia_gaps SET veces = veces + 1, ultima_fecha = now() WHERE id = ${rows[0].id}`).catch(() => {})
  } else {
    await prisma.$executeRaw(Prisma.sql`INSERT INTO mensajes_guia_gaps (property_id, pregunta) VALUES (${propertyId}, ${norm})`).catch(() => {})
  }
}
