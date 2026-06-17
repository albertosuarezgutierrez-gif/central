import Stripe from 'stripe'

// Versión de API Stripe canónica para toda la casa de marcas.
// Cambiar aquí propaga a todas las verticales.
export const STRIPE_API_VERSION = '2026-04-22.dahlia' as const

export function createStripe(secretKey?: string): Stripe {
  return new Stripe(
    secretKey ?? process.env.STRIPE_SECRET_KEY!,
    { apiVersion: STRIPE_API_VERSION as never },
  )
}

export type { default as Stripe } from 'stripe'
export type CentralApp = 'ia-rest' | 'ialimp' | 'rrhh'
