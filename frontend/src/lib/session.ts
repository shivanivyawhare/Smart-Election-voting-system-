// Session cache ownership (TEMPLATE.md §4). After login/signup call beginSession();
// every sign-out must await endSession() — hand-rolled logout leaks the previous
// account's react-query cache into the next login on the same browser.
import { queryClient } from "./queryClient";
import { apiPost } from "./api";

export async function beginSession(): Promise<void> {
  await queryClient.invalidateQueries();
}

export async function endSession(): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } catch {
    // Session may already be gone server-side; clearing the local cache is still required.
  }
  queryClient.clear();
}
