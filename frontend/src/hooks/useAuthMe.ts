import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { AuthMe } from "@/lib/types";

export function useAuthMe() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<AuthMe>("/auth/me"),
    staleTime: 60_000,
    retry: false,
  });
}
