import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { CsvUploadResponse } from "../types/api.js";

export function useCsvUpload() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.postForm<CsvUploadResponse>("/csv/upload", form);
    },
  });
}
