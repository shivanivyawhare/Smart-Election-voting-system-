import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Constituency } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export default function AdminConstituencies() {
  const q = useQuery({
    queryKey: ["public", "constituencies"],
    queryFn: () => apiGet<Constituency[]>("/constituencies"),
    retry: false,
  });

  return (
    <div data-testid="admin-constituencies-page">
      <PageHeader
        title="Constituencies"
        description="Electoral districts available for election configuration and voter registration."
        testid="admin-constituencies-header"
      />
      {q.isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {q.isError && <EmptyState icon={MapPin} title="Constituencies unavailable" description="The list could not be loaded." testid="admin-constituencies-error" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((c) => (
          <Card key={c.id} data-testid={`admin-constituency-card-${c.code}`}>
            <CardContent className="py-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true"><MapPin className="h-5 w-5" /></div>
                <div>
                  <p className="font-heading font-bold text-slate-900">{c.name}</p>
                  <p className="font-mono text-xs text-slate-500">{c.code}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">{c.district}, {c.state}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
