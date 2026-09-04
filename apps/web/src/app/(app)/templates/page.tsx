"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  useGetApiTemplates,
  usePostApiTemplatesBySlugUse,
} from "@/lib/api/dashboard/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface TemplateRow {
  slug: string;
  title: string;
  category: string;
  description: string;
}

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Generated hooks, per the repo rule that no frontend data fetching is
  // hand-written. Both routes have been in the spec all along; this page was
  // reaching past them to `customFetch` and re-declaring its own row type.
  const { data: raw, isLoading } = useGetApiTemplates();
  const templates = (Array.isArray(raw) ? raw : []) as unknown as TemplateRow[];

  /** Which card is working, so the whole grid does not go dead at once. */
  const [pending, setPending] = useState<string | null>(null);

  const use = usePostApiTemplatesBySlugUse({
    mutation: {
      onSuccess: (created) => {
        void queryClient.invalidateQueries({ queryKey: ["forms"] });
        router.push(`/forms/${(created as unknown as { id: string }).id}`);
      },
      /**
       * Said out loud. A refused "Use template" — a form-count limit, a role
       * that cannot create — used to do nothing at all and explain nothing.
       * (A plan denial still opens the global paywall; this is for the rest.)
       */
      onError: (err) =>
        toast.error("Couldn't start from this template", { description: (err as Error).message }),
      onSettled: () => setPending(null),
    },
  });

  const categories = Array.from(new Set(templates.map((t) => t.category)));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Templates</h1>
        <p className="text-muted-foreground mt-1 text-sm">Start from a proven structure — every template is fully editable.</p>
      </header>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      )}
      {!isLoading && templates.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">No templates available yet.</CardContent>
        </Card>
      )}
      {categories.map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="text-muted-foreground mb-3 text-xs font-medium uppercase">{cat}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates
              .filter((t) => t.category === cat)
              .map((t) => (
                <Card key={t.slug} className="flex flex-col transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="font-display text-lg">{t.title}</CardTitle>
                    <CardDescription className="line-clamp-2">{t.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Badge variant="secondary" className="mb-3">{t.category}</Badge>
                    <Button
                      size="sm"
                      className="w-full rounded-full"
                      disabled={use.isPending}
                      onClick={() => {
                        setPending(t.slug);
                        use.mutate({ slug: t.slug });
                      }}
                    >
                      {pending === t.slug ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" /> Creating…
                        </>
                      ) : (
                        <>
                          Use template <ArrowRight className="size-3.5" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
