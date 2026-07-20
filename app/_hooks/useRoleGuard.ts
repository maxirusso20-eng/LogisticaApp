// app/_hooks/useRoleGuard.ts
//
// Hook que protege pantallas según el ROL del usuario (modelo de 4 roles,
// espejo de la web). Si el rol resuelto no está permitido (por deep link,
// notificación o bug de navegación), redirige a la pantalla que le corresponde.
//
// Roles: admin | subadmin | coordinador | chofer  (ver lib/auth.ts)
//
// USO:
//   const { autorizado, verificando } = useRoleGuard('admin'); // admin + subadmin
//   const { autorizado, verificando } = useRoleGuard(['admin','subadmin','coordinador']);
//   if (verificando) return <Loader />;
//   if (!autorizado) return null; // el hook ya redirigió

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { resolveRol, type Rol } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

// Alias de compatibilidad + lista explícita de roles.
//   'admin'  → admin + subadmin   (los subadmins mantienen el acceso)
//   'chofer' → solo chofer
//   'ambos'  → cualquier sesión autenticada
type GuardArg = 'admin' | 'chofer' | 'ambos' | Rol[];

interface RoleGuardResult {
  /** true = puede ver la pantalla; false = redirigido o sin sesión */
  autorizado: boolean;
  /** true mientras se resuelve la sesión (mostrar loader) */
  verificando: boolean;
  /** email del usuario actual (null si no hay sesión) */
  email: string | null;
  /** rol resuelto (null mientras verifica / sin sesión) */
  rol: Rol | null;
}

function permitidosDe(arg: GuardArg): Rol[] | 'todos' {
  if (arg === 'ambos') return 'todos';
  if (arg === 'admin') return ['admin', 'subadmin'];
  if (arg === 'chofer') return ['chofer'];
  return arg;
}

// A dónde mandar a alguien sin acceso, según su rol real.
function destinoPara(rol: Rol | null): string {
  return rol === 'chofer' ? '/(drawer)/colectas' : '/(drawer)/';
}

export function useRoleGuard(rolRequerido: GuardArg = 'admin'): RoleGuardResult {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [rol, setRol] = useState<Rol | null>(null);

  // Clave estable: si el caller pasa un array inline (nueva referencia por
  // render) el efecto no debe re-dispararse en loop.
  const reqKey = Array.isArray(rolRequerido) ? rolRequerido.join(',') : rolRequerido;

  useEffect(() => {
    let activo = true;

    const verificar = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!activo) return;

        const mail = session?.user?.email ?? null;
        setEmail(mail);

        if (!mail) {
          setAutorizado(false);
          router.replace('/login' as any);
          return;
        }

        const rolResuelto = await resolveRol(session);
        if (!activo) return;
        setRol(rolResuelto);

        const permitidos = permitidosDe(rolRequerido);
        const ok = permitidos === 'todos' || (rolResuelto != null && permitidos.includes(rolResuelto));

        if (!ok) {
          setAutorizado(false);
          router.replace(destinoPara(rolResuelto) as any);
          return;
        }

        setAutorizado(true);
      } catch (err) {
        console.warn('[useRoleGuard]', err);
        if (activo) {
          setAutorizado(false);
          router.replace('/login' as any);
        }
      } finally {
        if (activo) setVerificando(false);
      }
    };

    verificar();
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey, router]);

  return { autorizado, verificando, email, rol };
}

// Default export vacío para silenciar el warning de Expo Router (trata los
// archivos dentro de app/ como rutas potenciales aunque tengan prefijo _).
export default function _HooksRouteIgnore() {
  return null;
}
