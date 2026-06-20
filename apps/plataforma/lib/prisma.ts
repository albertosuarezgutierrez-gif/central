// Shim de compatibilidad: el módulo de concursos (portado de ialimp) importa
// `prisma` desde '@/lib/prisma'. En plataforma el cliente vive en '@/lib/db'.
export { prisma } from './db'
