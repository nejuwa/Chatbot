import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/home/navbar";

export const metadata: Metadata = {
  title: "Chatbot — A clearer way to think",
  description: "A calm, focused space to ask questions and explore ideas with AI.",
};

const features = [
  {
    number: "01",
    title: "A space for every thought",
    description: "Start a conversation whenever a question, plan, or passing idea comes to mind.",
  },
  {
    number: "02",
    title: "Ideas that keep moving",
    description: "Explore a topic, ask a follow-up, and take your thinking a little further.",
  },
  {
    number: "03",
    title: "Your conversations, together",
    description: "Return to your chat history and pick up right where you left off.",
  },
];

export default function HomePage() {
  return (
    <main>
      <section className="relative isolate flex min-h-[min(820px,100svh)] flex-col overflow-hidden bg-[#073849] text-white">
        <Image
          src="/particle-wave.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-center"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[#042d3b]/45" />

        <Navbar />

        <div className="mx-auto flex w-full max-w-7xl flex-1 items-center px-6 pb-20 pt-20 mobile:px-10 tablet:px-16 desktop:px-20">
          <div className="max-w-3xl">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              A thoughtful AI companion
            </p>
            <h1 className="max-w-3xl text-4xl font-medium leading-[1.1] tracking-[-0.04em] mobile:text-5xl tablet:text-6xl desktop:text-7xl">
              Make room for
              <br className="hidden mobile:block" /> better questions.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/80 mobile:text-lg mobile:leading-8">
              A calm place to think out loud, explore new ideas, and find your next
              step—with an AI that is ready when you are.
            </p>
            <div className="mt-9 flex flex-col gap-3 mobile:flex-row">
              <Link
                href="/register"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-cyan-300 px-6 py-3 text-sm font-semibold text-[#052f3e] transition-colors hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Create your account
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/50 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-6 pb-7 mobile:px-10 tablet:px-16 desktop:px-20">
          <a
            href="#features"
            className="inline-flex items-center gap-3 text-xs font-medium tracking-wide text-white/75 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            A little more about the space
            <span aria-hidden="true" className="text-base">↓</span>
          </a>
        </div>
      </section>

      <FeatureSection />
      <Footer />
    </main>
  );
}

function FeatureSection() {
  return (
    <section id="features" aria-labelledby="features-heading" className="bg-canvas px-6 py-20 mobile:px-10 mobile:py-24 tablet:px-16 desktop:px-20">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            A space to think
          </p>
          <h2 id="features-heading" className="mt-4 text-3xl font-medium leading-tight tracking-tight text-ink mobile:text-4xl">
            Useful conversation,
            <br className="hidden mobile:block" /> without the noise.
          </h2>
        </div>
        <ul className="mt-12 grid gap-8 border-t border-line pt-8 tablet:grid-cols-3 tablet:gap-10">
          {features.map((feature) => (
            <li key={feature.number}>
              <p className="text-xs font-medium tracking-[0.12em] text-accent">{feature.number}</p>
              <h3 className="mt-4 text-lg font-semibold text-ink">{feature.title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted">{feature.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-canvas px-6 py-6 mobile:px-10 tablet:px-16 desktop:px-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-muted mobile:flex-row mobile:items-center mobile:justify-between">
        <Link href="/" className="w-fit font-semibold tracking-[0.16em] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          CHATBOT
        </Link>
        <p>A quieter place to think things through.</p>
        <Link href="/login" className="w-fit hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          Sign in
        </Link>
      </div>
    </footer>
  );
}
