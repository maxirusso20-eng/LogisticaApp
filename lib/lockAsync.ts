// Idempotencia de UI (espejo de la web): evita que un handler async corra dos
// veces en paralelo por un doble tap / conexión lenta. Mientras la clave esté
// en vuelo, cualquier reintento se ignora en silencio.
const enVuelo = new Set<string>();

export async function conLock<T>(clave: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (enVuelo.has(clave)) return undefined;
  enVuelo.add(clave);
  try {
    return await fn();
  } finally {
    enVuelo.delete(clave);
  }
}
