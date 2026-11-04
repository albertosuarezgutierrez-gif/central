# CLAUDE.md — apps/taller (vertical Taller de vehículos, piloto Global 2)

> Gestión de taller **regalada** a talleres (recepción, presupuesto, orden de trabajo, avisos). Piloto:
> **Talleres de Automoción G2** (Camas, Sevilla). Spec única: `docs/superpowers/specs/2026-11-04-taller-global2.md`.
> Compone el módulo puro `@central/module-taller` (sin BD). Schema `taller` y rol de BD propio: pendientes (F1).

## Reglas
- **Multi-taller desde el inicio:** toda lectura/escritura lleva `taller_id`; la clave de negocio es la matrícula.
- **Marca:** logo y colores del taller (`MARCA_TALLERES_G2` de `@central/brand`); «con Grupo ASegura» va fijo y pequeño
  (`coMarca`), no es editable. Resolución por taller en `lib/marca.ts`.
- **Login por PIN** (`@central/core-identity/pin`): 4 dígitos, bloqueo tras N fallos. PinStore real en `lib/pin-store-bd.ts`
  (login en una transacción con `pg_advisory_xact_lock`); el stub `lib/pin-store.ts` es solo para tests. Acceso a BD siempre por `conTaller()` (RLS). Secreto `TALLER_SESSION_SECRET` vía `requireSecret`, nunca literal.
- **Consentimiento:** el cliente final es del taller; solo pasa a lead de ASegura con su casilla propia, y el servicio
  nunca se condiciona a marcarla. Ningún lead a `seguros` sin consentimiento registrado.
- **Configuración autoservicio:** precios, IVA, intervalos y horarios son datos que edita el dueño en Ajustes; ningún
  literal de ese tipo en código (spec 3bis).
- **Sin WhatsApp:** avisos por push de la app + correo. Nada sale a terceros ni a proveedores sin botón del dueño.
- Dinero en formato español (`2.162,49€`); UI usable a ≥320 px, botones ≥44 px.
- Vercel: `vercel.json` con `ignoreCommand` y `--sin-previews`; app en la matriz de `tests.yml`.
