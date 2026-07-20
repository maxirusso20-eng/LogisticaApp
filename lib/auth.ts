// lib/auth.ts
// ─────────────────────────────────────────────────────────────────────────
// Modelo de ROLES — PORTADO de la web (src/components/shared/AuthContext.jsx).
// Mantener en sync con la web: si cambia la resolución de rol allá, cambiar acá.
//
//   admin       → ve TODO, puede asignar roles (Accesos)
//   subadmin    → opera igual que admin (incluido Accesos)
//   coordinador → ve solo Recorridos, Mapa y Chat
//   chofer      → ve lo suyo (Panel, Mis Colectas, Mi Rendimiento, etc.)
//
// La fuente de la verdad del rol es la tabla `roles_usuarios` + la lista
// ADMIN_EMAILS + el dominio @hogareno.com + fallback en `Choferes`.
// ─────────────────────────────────────────────────────────────────────────

import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { ADMIN_EMAILS, esEmailConductor } from './constants';
import { supabase } from './supabase';

export type Rol = 'admin' | 'subadmin' | 'coordinador' | 'chofer';

export const esAdminRol = (rol: Rol | null): boolean => rol === 'admin' || rol === 'subadmin';

// prevRol: último rol conocido del usuario. Red de seguridad para NO degradar el
// acceso ante un fallo transitorio de red (mismo criterio que la web: un fallo al
// consultar roles_usuarios no debe bajar a un subadmin a 'coordinador').
export async function resolveRol(
  session: Session | null,
  prevRol: Rol | null = null,
): Promise<Rol | null> {
  if (!session?.user) return null;
  const email = (session.user.email ?? '').toLowerCase();
  if (!email) return null;

  // 1) Admins fijos (dueños).
  if (ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email)) return 'admin';

  // 2) Rol explícito en roles_usuarios (puede no existir).
  let rolDB: string | null = null;
  let consultaFallo = false;
  try {
    const { data, error } = await supabase
      .from('roles_usuarios')
      .select('rol')
      .eq('email', email)
      .maybeSingle();
    if (error) {
      consultaFallo = true;
      console.warn('[Auth] Error consultando roles_usuarios:', error.message);
    } else if (data?.rol) {
      rolDB = String(data.rol).trim().toLowerCase();
    }
  } catch (err) {
    consultaFallo = true;
    console.warn('[Auth] Excepción consultando roles_usuarios:', err);
  }

  // Una elevación explícita a admin/subadmin tiene prioridad sobre el dominio.
  if (rolDB === 'admin' || rolDB === 'subadmin') return rolDB as Rol;

  // Si la consulta falló y ya teníamos rol → NO degradar.
  if (consultaFallo && prevRol) return prevRol;

  // 3) Regla de dominio: cualquier @hogareno.com es chofer.
  if (esEmailConductor(email)) return 'chofer';

  // 4) Otro rol explícito (ej. coordinador).
  if (rolDB === 'coordinador') return 'coordinador';

  // 5) Fallback: si su email está en Choferes, es chofer.
  try {
    const { data: ch } = await supabase
      .from('Choferes')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (ch) return 'chofer';
  } catch (err) {
    console.warn('[Auth] Excepción consultando Choferes:', err);
  }

  return prevRol || 'coordinador'; // acceso mínimo por defecto
}

// Hook: resuelve y mantiene el rol del usuario logueado. Reemplaza a useEsAdmin.
// Cachea el último rol por email en un ref para no re-consultar la DB en cada
// TOKEN_REFRESHED / refoco (igual que roleCacheRef de la web).
export function useRol(): { rol: Rol | null; miEmail: string } {
  const [rol, setRol] = useState<Rol | null>(null);
  const [miEmail, setMiEmail] = useState('');
  const cacheRef = useRef<{ email: string | null; rol: Rol | null }>({ email: null, rol: null });

  useEffect(() => {
    let mounted = true;

    const aplicar = async (session: Session | null) => {
      const email = (session?.user?.email ?? '').toLowerCase() || null;
      if (mounted) setMiEmail(session?.user?.email ?? '');
      if (email && cacheRef.current.email === email && cacheRef.current.rol) {
        if (mounted) setRol(cacheRef.current.rol);
        return;
      }
      const r = await resolveRol(session, cacheRef.current.rol);
      cacheRef.current = { email, rol: r };
      if (mounted) setRol(r);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) void aplicar(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        cacheRef.current = { email: null, rol: null };
        setMiEmail('');
        setRol(null);
        return;
      }
      void aplicar(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { rol, miEmail };
}
