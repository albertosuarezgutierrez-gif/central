-- ============================================================================
-- 02/09/2026 — Traspaso de Supabase Auth del CRM (proyecto de Manuel → central)
-- ============================================================================
-- Esto YA ESTÁ APLICADO en central (migraciones `seguros_auth_handle_new_user` y
-- la copia por dblink). Se guarda como referencia: NO re-ejecutar a ciegas.
--
-- Qué se copió (mismos UUIDs, por dblink, del proyecto de Manuel a `auth.*` de central):
--   auth.users        9 filas  (2 reales con contraseña + MFA: Alberto y Manuel; 7 de pruebas)
--   auth.identities  11 filas  (email + google de los dos admins)
--   auth.mfa_factors  2 filas  (TOTP verificados: la app de autenticación sigue valiendo)
-- Conservar el `id` es lo que mantiene válido `seguros.usuarios.auth_user_id` (9/9 enlazados).
-- Las contraseñas viajan como hash bcrypt (`encrypted_password`), que GoTrue acepta tal cual.
--
-- Trampas que costaron tres intentos (para no repetirlas):
--   · `postgres` NO es dueño de `auth.*`: `GRANT SELECT ON auth.users TO rol` no surte efecto
--     (aviso, no error). La lectura se da con `GRANT pg_read_all_data TO rol`.
--   · En PG16 la opción INHERIT se fija POR CADA GRANT de pertenencia: un rol creado NOINHERIT
--     no hereda aunque luego se le haga `ALTER ROLE … INHERIT`. Hay que re-conceder
--     `WITH INHERIT TRUE`.
--   · `auth.users/identities/mfa_factors` del proyecto de Manuel tienen RLS ACTIVADO con 0
--     políticas → cualquier rol sin BYPASSRLS ve 0 filas SIN error. Un `count(*) = 0` ahí no es
--     «no hay usuarios»: es «no te dejan verlos» (regla «dato que no hay ≠ dato que no se ha
--     mirado»).
--   · `auth.users.confirmed_at` es columna GENERADA: no entra en el INSERT.
--   · Los tokens (`confirmation_token`, `recovery_token`, …) se copian con `coalesce(x, '')`:
--     GoTrue rompe el login si son NULL.
--
-- Rol temporal `traspaso_auth_tmp` en el proyecto de Manuel: creado y BORRADO el mismo día
-- (migraciones `traspaso_auth_rol_temporal*` allí). Sin credenciales vivas.

-- ── Trigger de alta (portado de public.handle_new_user del CRM) ─────────────
-- Cuando Supabase Auth crea un usuario, aparece su fila en seguros.usuarios.
-- Lo dispara `supabase_auth_admin`: SECURITY DEFINER (corre como postgres) + EXECUTE explícito.
create or replace function seguros.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'seguros'
as $function$
begin
  insert into seguros.usuarios (auth_user_id, email, nombre, rol, correduria_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'nombre'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Usuario'
    ),
    'usuario'::seguros.user_role,
    null
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$function$;

revoke all on function seguros.handle_new_user() from public;
grant execute on function seguros.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function seguros.handle_new_user();

-- ── Comprobación (lo que debe salir en central) ──────────────────────────────
-- select (select count(*) from auth.users) users,            -- 9
--        (select count(*) from auth.identities) identities,  -- 11
--        (select count(*) from auth.mfa_factors) mfa,        -- 2
--        (select count(*) from auth.users u
--          where exists (select 1 from seguros.usuarios s where s.auth_user_id = u.id)) enlazados; -- 9
