import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { createApiClient } from "../lib/apiClient.js";

export function useApiClient() {
  const { accessToken } = useAuth();
  return useMemo(() => createApiClient({ accessToken }), [accessToken]);
}
