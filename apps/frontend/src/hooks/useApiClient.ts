import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { createApiClient } from "../lib/apiClient.js";

export function useApiClient() {
  const { role, userId } = useAuth();
  return useMemo(() => createApiClient({ role, userId }), [role, userId]);
}
