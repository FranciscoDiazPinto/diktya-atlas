import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { ApiVenue } from "../types/api.js";

export function useVenues() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<ApiVenue[]>("/venues"),
  });
}

export function useVenue(venueId: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["venue", venueId ?? ""],
    queryFn: () => api.get<ApiVenue>(`/venues/${venueId}`),
    enabled: Boolean(venueId),
  });
}

export function useCreateVenue() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nombre, file }: { nombre: string; file: File }) => {
      const form = new FormData();
      form.append("nombre", nombre);
      form.append("file", file);
      return api.postForm<ApiVenue>("/venues", form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["venues"] }),
  });
}
