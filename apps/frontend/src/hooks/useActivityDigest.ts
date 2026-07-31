import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { ActivityDigest } from "../types/api.js";

export function useActivityDigest(desde: string, hasta: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.activityDigest(desde, hasta),
    queryFn: () =>
      api.get<ActivityDigest>(`/reports/digest?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`),
  });
}
