export interface TicketFilters {
  estado?: string;
  severidad?: string;
  nodoAfectadoId?: string;
}

/**
 * Únicas en un solo lugar para que useRealtimeSocket pueda invalidar por
 * prefijo (`invalidateQueries` hace match parcial de queryKey por
 * defecto) sin tener que conocer los filtros exactos de cada vista.
 */
export const queryKeys = {
  networkStatus: (sitio?: string) => ["network-status", sitio ?? null] as const,
  nodeDetail: (id: string) => ["network-node", id] as const,
  opnsenseStatus: () => ["opnsense-status"] as const,
  unifiOsStatus: () => ["unifi-os-status"] as const,
  tickets: (filters: TicketFilters) => ["tickets", filters] as const,
  ticketDetail: (id: string) => ["ticket", id] as const,
};
