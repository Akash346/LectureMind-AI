"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { motion, useInView } from "motion/react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LMLogo, LMWordmark } from "@/components/ui/brand";

const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

const proofCells = [
  {
    title: "Grounded in the source",
    body: "Every line in every artifact links back to a moment in the video. If LectureMind cannot find it in the lecture, it does not say it."
  },
  {
    title: "Interactive by default",
    body: "Flashcards flip. Quiz questions advance. Mind map nodes expand on click. Built for active study, not passive scrolling."
  },
  {
    title: "Bilingual study materials",
    body: "Generated study materials are available in English and a growing set of languages. The source video stays the source. The study layer adapts to the student."
  }
];

const artifacts = ["Outline", "Summary", "Flashcards", "Quiz", "Mind Map", "Report"];

export default function LandingPage() {
  const [demoOpen, setDemoOpen] = React.useState(false);

  return (
    <main className="min-h-screen bg-lm-paper text-lm-ink dark:bg-lm-ink dark:text-lm-paper">
      <header className="sticky top-0 z-50 h-16 border-b border-black/10 bg-lm-paper/80 backdrop-blur-2xl dark:border-white/10 dark:bg-lm-ink/80">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3">
            <LMLogo size={28} />
            <LMWordmark className="text-xl" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost">
              <Link href="/auth/signin">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[720px] px-6 pb-24 pt-[120px] text-center">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: 0.2
              }
            }
          }}
          className="space-y-7"
        >
          <HeroItem>
            <p className="text-sm font-medium tracking-[0.18em] text-lm-indigo dark:text-lm-amber">
              Built for the way students actually study
            </p>
          </HeroItem>
          <HeroItem>
            <h1 className="font-space-grotesk text-5xl font-semibold leading-tight sm:text-7xl">
              Watch any lecture.
              <span className="block text-lm-amber">Actually understand it.</span>
            </h1>
          </HeroItem>
          <HeroItem>
            <p className="mx-auto max-w-2xl text-lg leading-8 text-black/70 dark:text-white/70">
              LectureMind turns any YouTube lecture into a grounded study
              environment. Every claim cites the exact moment it came from in
              the video. No hallucination, no busywork.
            </p>
          </HeroItem>
          <HeroItem>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/start">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setDemoOpen(true)}
              >
                <Play className="h-4 w-4" />
                Watch a 60 second demo
              </Button>
            </div>
          </HeroItem>
        </motion.div>
      </section>

      <FadeSection className="mx-auto max-w-5xl px-6 py-20">
        <p className="text-sm font-medium tracking-[0.18em] text-lm-indigo dark:text-lm-amber">
          The problem
        </p>
        <h2 className="mt-4 max-w-3xl font-space-grotesk text-4xl font-semibold">
          Lecture video sits archived and unwatched.
        </h2>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-black/70 dark:text-white/70">
          Universities and health systems capture terabytes of recorded
          teaching. Students watch it once, sometimes, and forget most of it
          within a week. The medium punishes attention and rewards passive
          consumption. Faculty get no useful feedback on what landed and what
          did not.
        </p>
      </FadeSection>

      <FadeSection className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <p className="text-sm font-medium tracking-[0.18em] text-lm-indigo dark:text-lm-amber">
            The solution
          </p>
          <h2 className="mt-4 font-space-grotesk text-4xl font-semibold">
            A multi agent study environment that respects the source.
          </h2>
          <p className="mt-5 text-lg leading-8 text-black/70 dark:text-white/70">
            LectureMind takes a single lecture URL and produces an outline,
            layered summaries, flashcards, a quiz, an interactive mind map, and
            a long form report. Every output cites a timestamped moment in the
            video. Click any citation and the player jumps there and pauses.
            Nothing is invented. Everything is grounded.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {artifacts.map((artifact) => (
            <div
              key={artifact}
              className="rounded-lg border border-black/10 bg-black/[0.03] p-5 font-medium dark:border-white/10 dark:bg-white/[0.06]"
            >
              {artifact}
            </div>
          ))}
        </div>
      </FadeSection>

      <FadeSection className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-space-grotesk text-4xl font-semibold">The proof</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {proofCells.map((cell) => (
            <article
              key={cell.title}
              className="rounded-lg border border-black/10 bg-black/[0.03] p-6 dark:border-white/10 dark:bg-white/[0.06]"
            >
              <h3 className="font-space-grotesk text-xl font-semibold">
                {cell.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-black/70 dark:text-white/70">
                {cell.body}
              </p>
            </article>
          ))}
        </div>
      </FadeSection>

      <FadeSection className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-space-grotesk text-4xl font-semibold">
          Stop rewatching. Start understanding.
        </h2>
        <div className="mt-7">
          <Button asChild size="lg">
            <Link href="/start">Get started</Link>
          </Button>
        </div>
        <p className="mt-4 text-sm text-black/60 dark:text-white/60">
          Free to try. No account needed for the demo session.
        </p>
      </FadeSection>

      <footer className="border-t border-black/10 px-6 py-8 dark:border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-black/60 dark:text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-lm-ink dark:text-lm-paper">
              LectureMind
            </p>
            <p>2026 LectureMind</p>
          </div>
          <Link
            href="https://github.com/Akash346/LectureMind-AI"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-lm-ink hover:text-lm-indigo dark:text-lm-paper dark:hover:text-lm-amber"
          >
            GitHub
          </Link>
        </div>
      </footer>

      <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
        <DialogContent className="border-black/10 bg-lm-paper text-lm-ink dark:border-white/10 dark:bg-lm-ink dark:text-lm-paper">
          <DialogTitle className="font-space-grotesk text-2xl">
            Demo preview
          </DialogTitle>
          <p className="text-sm leading-7 text-black/70 dark:text-white/70">
            The recorded demo will be added before submission. For now, continue
            as a demo user to test the full flow.
          </p>
          <Button asChild>
            <Link href="/demo">Continue as Demo User</Link>
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function HeroItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: spring }
      }}
    >
      {children}
    </motion.div>
  );
}

function FadeSection({
  children,
  className
}: {
  children: React.ReactNode;
  className: string;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={spring}
      className={className}
    >
      {children}
    </motion.section>
  );
}
