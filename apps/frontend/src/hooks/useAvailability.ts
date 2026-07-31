import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { ApiAvailability } from "../types/api.js";

export function useAvailability(desde: string, hasta: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.availability(desde, hasta),
    queryFn: () =>
      api.get<ApiAvailability>(
        `/reports/availability?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
      ),
  });
}
