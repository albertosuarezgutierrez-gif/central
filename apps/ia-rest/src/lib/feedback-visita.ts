// Adaptadores de feedback/propinas de ia-rest hacia @central/module-feedback, para reutilizar
// la agregación (promedio de valoraciones, totales de propinas).
import type {
  Feedback,
  FeedbackAdapter,
  Propina,
  PropinaAdapter,
} from '@central/module-feedback'

export interface FeedbackVisitaRow {
  id: string
  nota: number | null
  comentario: string | null
  estado: string | null
  respondido_at: string | null
  created_at: string | null
  token?: string | null
}

export interface PropinaRow {
  id: string
  importe: number | null
  estado: string | null
  pagada_at: string | null
  created_at: string | null
  token?: string | null
}

export const feedbackVisitaAdapter: FeedbackAdapter<FeedbackVisitaRow> = {
  toFeedback(row): Feedback {
    return {
      id: row.id,
      token: row.token ?? null,
      nota: row.nota,
      comentario: row.comentario,
      estado: (row.estado ?? 'pendiente') as Feedback['estado'],
      respondidoAt: row.respondido_at,
      createdAt: row.created_at,
    }
  },
  fromFeedback(f): FeedbackVisitaRow {
    return {
      id: f.id,
      nota: f.nota,
      comentario: f.comentario ?? null,
      estado: f.estado,
      respondido_at: f.respondidoAt ?? null,
      created_at: f.createdAt ?? null,
      token: f.token ?? null,
    }
  },
}

export const propinaAdapter: PropinaAdapter<PropinaRow> = {
  toPropina(row): Propina {
    return {
      id: row.id,
      token: row.token ?? null,
      importe: row.importe ?? 0,
      estado: (row.estado ?? 'pendiente') as Propina['estado'],
      pagadaAt: row.pagada_at,
      createdAt: row.created_at,
    }
  },
  fromPropina(p): PropinaRow {
    return {
      id: p.id,
      importe: p.importe,
      estado: p.estado,
      pagada_at: p.pagadaAt ?? null,
      created_at: p.createdAt ?? null,
      token: p.token ?? null,
    }
  },
}
