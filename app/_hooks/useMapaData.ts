// app/hooks/useMapaData.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ADMIN_EMAIL } from '../../lib/constants';

export interface ChoferConGPS {
  id: number;
  nombre: string;
  condicion: string;
  zona: string | string[];
  latitud: number | null;
  longitud: number | null;
  ultima_actualizacion: string | null;
}

export function useMapaData() {
  const [vehiculos, setVehiculos] = useState<ChoferConGPS[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [paradas, setParadas] = useState<any[]>([]);
  const [esAdmin, setEsAdmin] = useState(false);
  const [choferSeleccionado, setChoferSeleccionado] = useState<ChoferConGPS | null>(null);

  const canalGpsRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const canalParadasRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchVehiculos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('Choferes')
        .select('id, nombre, condicion, zona, latitud, longitud, ultima_actualizacion')
        .order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setVehiculos(data || []);
      setUltimaActualizacion(new Date());
    } catch (err) {
      console.error('Error cargando vehículos:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  const handleRealtimeUpdate = useCallback((payload: any) => {
    const updated = payload.new as ChoferConGPS;
    setVehiculos(prev => {
      const existe = prev.find(v => v.id === updated.id);
      if (!existe) return [...prev, updated];
      return prev.map(v => v.id === updated.id ? { ...v, ...updated } : v);
    });
    setUltimaActualizacion(new Date());
    setChoferSeleccionado(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
  }, []);

  const handleRealtimeDelete = useCallback((payload: any) => {
    const deleted = payload.old as { id: number };
    setVehiculos(prev => prev.filter(v => v.id !== deleted.id));
    setChoferSeleccionado(prev => prev?.id === deleted.id ? null : prev);
  }, []);

  useEffect(() => {
    fetchVehiculos();

    canalGpsRef.current = supabase
      .channel('mapa-gps-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Choferes' }, handleRealtimeUpdate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Choferes' }, fetchVehiculos)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Choferes' }, handleRealtimeDelete)
      .subscribe();

    return () => {
      if (canalGpsRef.current) {
        void supabase.removeChannel(canalGpsRef.current);
        canalGpsRef.current = null;
      }
    };
  }, [fetchVehiculos, handleRealtimeUpdate, handleRealtimeDelete]);

  useEffect(() => {
    const initAdminParadas = async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user?.email === ADMIN_EMAIL) {
        setEsAdmin(true);

        const { data: pd } = await supabase.from('rutas_activas').select('*');
        if (pd) setParadas(pd);

        canalParadasRef.current = supabase
          .channel('mapa-paradas-sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas_activas' }, (payload) => {
            if (payload.eventType === 'INSERT')
              setParadas(prev => [...prev, payload.new]);
            else if (payload.eventType === 'DELETE')
              setParadas(prev => prev.filter(p => p.id !== payload.old.id));
          })
          .subscribe();
      }
    };

    initAdminParadas();

    return () => {
      if (canalParadasRef.current) {
        void supabase.removeChannel(canalParadasRef.current);
        canalParadasRef.current = null;
      }
    };
  }, []);

  return {
    vehiculos,
    paradas,
    cargando,
    ultimaActualizacion,
    esAdmin,
    choferSeleccionado,
    setChoferSeleccionado,
    fetchVehiculos,
  };
}
