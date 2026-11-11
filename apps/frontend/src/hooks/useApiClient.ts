import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { createApiClient } from "../lib/apiClient.js";

export function useApiClient() {
  const { accessToken, refreshAccessToken, isSessionCurrent } = useAuth();
  return useMemo(() => createApiClient({ accessToken, refreshAccessToken, isSessionCurrent }), [accessToken, refreshAccessToken, isSessionCurrent]);
}
