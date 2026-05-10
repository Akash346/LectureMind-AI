import { ArrowRight, BookOpenCheck, MessageSquareText, Sparkles } from "lucide-react";

import { SignInButton } from "@/components/auth-buttons";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: BookOpenCheck,
    title: "Grounded study workspace",
    body: "Keep the source, outline, study artifacts, and chat in one calm place."
  },
  {
    icon: MessageSquareText,
    title: "Source-backed chat",
    body: "Phase 1 includes the interaction shell and timestamp citation placeholders."
  },
  {
    icon: Sparkles,
    title: "Ready for AI phases",
    body: "The schema is prepared for ingestion, search, agents, and verifier workflows."
  }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="container flex h-20 items-center justify-between">
        <Brand href="/" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignInButton />
        </div>
      </header>
      <section className="container grid min-h-[calc(100vh-5rem)] items-center gap-10 pb-16 pt-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-8">
          <div className="inline-flex rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground shadow-sm">
            NotebookLM-inspired lecture study, built for students
          </div>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-normal sm:text-6xl">
              Turn lecture videos into grounded study workspaces.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Paste a public YouTube lecture URL and organize the learning flow
              around sources, notes, practice, and timestamp-backed answers.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SignInButton />
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              href="#preview"
            >
              Preview workspace <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div id="preview" className="rounded-xl border bg-card p-3 shadow-soft">
          <div className="grid min-h-[520px] gap-3 rounded-lg bg-muted/40 p-3 md:grid-cols-[0.8fr_1.4fr_0.9fr]">
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Source
              </p>
              <div className="mt-5 space-y-3">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </div>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Chat
              </p>
              <div className="mt-16 space-y-4 text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-primary/10" />
                <h2 className="text-xl font-semibold">Ask from the lecture</h2>
                <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                  The Phase 1 shell keeps responses disabled until ingestion and
                  grounding arrive.
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Studio
              </p>
              <div className="mt-5 space-y-3">
                {features.map((feature) => (
                  <Card key={feature.title} className="rounded-md">
                    <CardContent className="flex items-start gap-3 p-3">
                      <feature.icon className="mt-0.5 h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{feature.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Ready later
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
