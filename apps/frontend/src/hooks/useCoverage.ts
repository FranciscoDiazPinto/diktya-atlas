import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { CoveragePoint, CoverageGapCell } from "../types/api.js";

export function useCoverageAtPoint(
  eventId: string | undefined,
  zoneId: string | undefined,
  point: { x: number; y: number } | null
) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["coverage-point", eventId ?? "", zoneId ?? "", point?.x ?? null, point?.y ?? null],
    queryFn: () =>
      api.get<CoveragePoint>(`/events/${eventId}/zones/${zoneId}/coverage?x=${point!.x}&y=${point!.y}`),
    enabled: Boolean(eventId) && Boolean(zoneId) && point !== null,
  });
}

export function useCoverageGaps(
  eventId: string | undefined,
  zoneId: string | undefined,
  plan: { widthPx: number; heightPx: number; cellSizeMeters?: number } | null
) {
  const api = useApiClient();
  return useQuery({
    queryKey: [
      "coverage-gaps",
      eventId ?? "",
      zoneId ?? "",
      plan?.widthPx ?? null,
      plan?.heightPx ?? null,
      plan?.cellSizeMeters ?? null,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        planWidthPx: String(plan!.widthPx),
        planHeightPx: String(plan!.heightPx),
      });
      if (plan!.cellSizeMeters) params.set("cellSizeMeters", String(plan!.cellSizeMeters));
      return api.get<CoverageGapCell[]>(`/events/${eventId}/zones/${zoneId}/coverage/gaps?${params.toString()}`);
    },
    enabled: Boolean(eventId) && Boolean(zoneId) && plan !== null,
  });
}
