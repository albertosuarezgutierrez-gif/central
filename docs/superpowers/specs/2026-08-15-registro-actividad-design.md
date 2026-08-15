# Registro de accesos y actividad de ialimp — visible en el god-panel de plataforma

**Fecha:** 15/08/2026 · **Decisión de Alberto:** historial en su panel de plataforma, detalle completo
(logins + páginas + acciones).

## Problema
No existía rastro de cuándo entra Vanessa (Sique Brilla) ni de qué hace: el login de empresa solo
guardaba el flag `sesion_activa` (sin fecha) y no había historial de navegación/acciones de ningún perfil.

## Diseño
- **Tabla compartida `registro_actividad`** (BD `wswbehlcuxqxyinousql`): quién (`actor_tipo`
  owner/usuario/limpiadora/propietario + `actor_id`/`actor_nombre`), qué (`accion` login/login_forzado/
  pagina/accion + `metodo`/`ruta`/`detalle`), desde dónde (`ip`, `user_agent`), scopeada por `empresa_id`.
  GRANTs: `prisma_ialimp` escribe (y purga a 90 días), `prisma_plataforma` solo lee. Sin acceso anon.
- **Captura en ialimp** (el emisor):
  - Logins: los 4 endpoints de login registran la entrada (empresa/owner, usuario, limpiadora con
    vía enlace/pin, propietario). El login de empresa además estampa la nueva columna
    `empresas.ultimo_acceso`.
  - Páginas y acciones: el **middleware** emite fire-and-forget (`event.waitUntil`, latencia 0) a
    `POST /api/interno/actividad` (Bearer `CRON_SECRET`) las navegaciones de página (document o RSC
    no-prefetch) y las escrituras a `/api/*`. El admin viaja ya identificado desde el JWT; limpiadora y
    propietario van por su token de cookie y los resuelve el endpoint. El superadmin no se registra.
- **Lectura en plataforma**: página `/operador/actividad` (sidebar Operador, solo superadmin) con
  «último acceso por persona» + historial filtrable (empresa/perfil/tipo/texto), paginado a 50 + Ver más.

## Regla NULL respetada
La tabla nace vacía: la UI declara desde cuándo hay registro y pinta «sin login registrado», nunca
«no ha entrado». La purga de 90 días también se declara implícitamente en el aviso de la página.

## Alternativas descartadas
- Log dentro de `requireEmpresaId`/`getSession`: no captura páginas SSR ni perfiles con cookie propia,
  y añade un write por request de API (ruido). El middleware ve todo el tráfico y no añade latencia.
- Historial en el `/superadmin` de ialimp: Alberto lo quiere en su panel de plataforma (misma BD).
