// app/_hooks/useRoleGuard.ts
//
// Hook que protege pantallas que deberían ser solo para admin.
// Si un chofer no-admin intenta acceder (por deep link, notificación,
// o bug de navegación), se redirige a su pantalla de Panel.
//
// USO:
//   export default function PantallaAdmin() {
//     const { autorizado, verificando } = useRoleGuard('admin');
//     if (verificando) return <LoaderPantalla />;
//     if (!autorizado) return null; // el hook ya redirigió
//     return <MiContenidoAdmin />;
//   }

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ADMIN_EMAIL } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

type Rol = 'admin' | 'chofer';

interface RoleGuardResult {
  /** true = puede ver la pantalla; false = redirigido o sin sesión */
  autorizado: boolean;
  /** true mientras se resuelve la sesión (mostrar loader) */
  verificando: boolean;
  /** email del usuario actual (null si no hay sesión) */
  email: string | null;
}

/**
 * Protege una pantalla según el rol requerido.
 *
 * @param rolRequerido 'admin' = solo admin; 'chofer' = solo NO-admin
 */
export function useRoleGuard(rolRequerido: Rol = 'admin'): RoleGuardResult {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;

    const verificar = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!activo) return;

        const mail = session?.user?.email ?? null;
        setEmail(mail);

        if (!mail) {
          // Sin sesión → al login
          setAutorizado(false);
          router.replace('/login' as any);
          return;
        }

        const esAdmin = mail === ADMIN_EMAIL;

        if (rolRequerido === 'admin' && !esAdmin) {
          // Chofer intentando entrar a pantalla de admin → al Panel
          setAutorizado(false);
          router.replace('/(drawer)/Panel' as any);
          return;
        }

        if (rolRequerido === 'chofer' && esAdmin) {
          // Admin en pantalla solo-chofer → al home
          setAutorizado(false);
          router.replace('/(drawer)' as any);
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
  }, [rolRequerido, router]);

  return { autorizado, verificando, email };
}

// Default export vacío para silenciar el warning de Expo Router.
// Expo Router trata los archivos dentro de app/ como rutas potenciales.
// Aunque el prefijo _ debería hacer que lo ignore, en algunas versiones
// igual tira warning. Este default export lo silencia sin afectar nada.
export default function _HooksRouteIgnore() {
  return null;
}