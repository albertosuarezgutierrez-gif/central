# Copia semanal de la cartera (`seguros`)

Workflow `.github/workflows/copia-seguros.yml` (lunes 03:00 UTC + manual). Vuelca el schema
`seguros`, **lo restaura en un Postgres 17 desechable y compara recuentos** (clientes, pólizas,
recibos, siniestros exactos) antes de dar la copia por buena, la cifra con GPG (AES256) y la deja
como artefacto del run durante 90 días. Si falla, avisa por Telegram (`/api/internal/alerta`).

## Puesta en marcha (una vez, Alberto)
1. Supabase → SQL: `ALTER ROLE backup_seguros WITH PASSWORD '<generada>';`
   (el rol ya existe, sin contraseña, solo lectura de `seguros`:
   `apps/asegura/prisma/sql/2026-09-23c_rol_backup_seguros.sql`).
2. GitHub → repo `central` → Settings → Secrets → Actions, en el MISMO paso:
   - `SEGUROS_BACKUP_DATABASE_URL` = conexión **directa** o pooler en modo **sesión** (puerto 5432),
     usuario `backup_seguros` (en el pooler: `backup_seguros.wswbehlcuxqxyinousql`). El pooler de
     transacción (6543) NO sirve para `pg_dump`.
   - `SEGUROS_BACKUP_PASSPHRASE` = clave larga; **guárdala también fuera de GitHub** (gestor de
     contraseñas). Sin ella la copia no se puede abrir.
3. Actions → «Copia semanal de seguros» → Run workflow. Debe acabar en verde.

## Restaurar
```bash
gpg --decrypt seguros-AAAA-MM-DD.dump.gpg > seguros.dump        # pide la passphrase
pg_restore --list seguros.dump | head                            # ver qué trae
# En una BD destino con las extensiones pgcrypto, uuid-ossp, pg_trgm, unaccent y el schema `auth`
# de Supabase (o sus stubs, ver el paso «Restaurar» del workflow):
pg_restore --dbname="$DESTINO" --no-owner --no-privileges seguros.dump
```
⚠️ Restaurar **sobre** la BD de producción pisa la cartera viva: restaura en una BD aparte y copia
de ahí lo que haga falta. Los datos personales siguen cifrados (`v1:`) dentro de la copia: para
leerlos hacen falta las mismas `PII_ENCRYPTION_KEY`/`PII_LOOKUP_KEY` de Vercel.

## Límites
- Semanal: se puede perder hasta una semana de cambios hechos a mano (lo de CIMA se vuelve a pedir).
- 90 días de artefactos en GitHub. Es una red hasta pasar a Supabase Pro, no un sustituto.
