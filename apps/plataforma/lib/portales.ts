// Constantes de portales OTA — fuente única para toda la app.
// Importable desde cliente ('use client') y servidor.

export const PORTAL_COLORS: Record<string, string> = {
  BOOKING:  '#003580',
  AIRBNB:   '#ff5a5f',
  VRBO:     '#1a5276',
  DIRECTO:  'var(--primary)',
  EXPEDIA:  '#ffc72c',
  AGODA:    '#e84142',
  OTRO:     '#71717a',
}

export const PORTAL_LABELS: Record<string, string> = {
  BOOKING:  'Booking.com',
  AIRBNB:   'Airbnb',
  VRBO:     'VRBO',
  DIRECTO:  'Directo',
  EXPEDIA:  'Expedia',
  AGODA:    'Agoda',
  OTRO:     'Otro',
}

// Mapeo nombre Smoobu → código interno (usado en smoobu-sync)
export const PORTAL_MAP: Record<string, string> = {
  'Booking.com':        'BOOKING',
  'Airbnb':             'AIRBNB',
  'VRBO / HomeAway':    'VRBO',
  'VRBO':               'VRBO',
  'Expedia':            'EXPEDIA',
  'Agoda':              'AGODA',
  'Reserva directa':    'DIRECTO',
  'Sitio web':          'DIRECTO',
}
