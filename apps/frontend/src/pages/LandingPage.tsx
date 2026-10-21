import { Link } from "react-router";
import { NOTICE } from "../components/EducationalNotice";
import { useAuth } from "../lib/auth";

const BENEFITS = [
  {
    title: "Verifiable counting",
    body: "Totals are computed by a smart contract from accepted votes only, and can be recomputed by anyone from public events.",
  },
  {
    title: "One vote per voter",
    body: "The contract rejects a second vote from the same wallet in the same session — enforced on-chain, not just in the UI.",
  },
  {
    title: "Weighted by entitlement",
    body: "Each shareholder's vote counts with the voting weight registered before the session opened.",
  },
  {
    title: "Role-based access",
    body: "Administrators, organizers, shareholders and auditors have separate permissions, checked by the API and the contract.",
  },
  {
    title: "Transparent rules",
    body: "Options, schedule and quorum are fixed on-chain when voting opens; configuration cannot change afterwards.",
  },
  {
    title: "Auditable trail",
    body: "Every lifecycle step emits a blockchain event; the app adds an audit log and an exportable report.",
  },
];

const STEPS = [
  "Organizer drafts an election: options, schedule and quorum.",
  "Organizer selects eligible shareholders and their voting weights.",
  "The session is published and voters are registered on the smart contract.",
  "Shareholders sign one vote each with their own wallet while the session is open.",
  "After closing, results and an independent event recount are available to auditors.",
];

export function LandingPage() {
  const { me } = useAuth();
  return (
    <div className="min-h-screen">
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200" role="note">
        {NOTICE}
      </div>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold text-white">SecureVote</span>
        </div>
        <Link
          to={me ? "/app" : "/login"}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          {me ? "Open dashboard" : "Sign in to the demo"}
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 md:py-24">
          <p className="text-sm font-medium uppercase tracking-widest text-blue-400">Educational blockchain prototype</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            Weighted corporate voting with verifiable, tamper-evident counting.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-400">
            SecureVote demonstrates how a smart contract can enforce eligibility, one-vote-per-voter and weighted tallies for
            shareholder meetings — running entirely on a local development blockchain with fictional data.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
              Try the demo
            </Link>
            <a
              href="#how"
              className="rounded-md border border-navy-600 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-navy-800"
            >
              How it works
            </a>
          </div>
        </section>

        <section aria-labelledby="benefits" className="pb-16">
          <h2 id="benefits" className="text-xl font-semibold text-white">
            Why a smart contract?
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-xl border border-navy-700 bg-navy-900/70 p-5">
                <h3 className="font-medium text-white">{b.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="pb-16">
          <h2 id="how-title" className="text-xl font-semibold text-white">
            How it works
          </h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s} className="rounded-xl border border-navy-700 bg-navy-900/70 p-4 text-sm text-slate-300">
                <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/20 font-semibold text-blue-300">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="limits" className="pb-16">
          <div className="rounded-xl border border-navy-700 bg-navy-900/70 p-6">
            <h2 id="limits" className="text-xl font-semibold text-white">
              What this prototype does <em>not</em> guarantee
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-400">
              <li>
                <strong className="text-slate-200">No secret ballot.</strong> Each vote event publicly links a wallet address to
                its choice. Pseudonymous addresses are not anonymity.
              </li>
              <li>
                <strong className="text-slate-200">No legal validity.</strong> Using a blockchain does not make a corporate
                decision legally valid; that depends on corporate law and the company charter.
              </li>
              <li>
                <strong className="text-slate-200">Not audited.</strong> The contract has automated tests but no professional
                security audit. It runs only on a local Hardhat network with fictional data.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-navy-800 px-6 py-6 text-center text-xs text-slate-500">
        SecureVote · Introduction to Finance, Astana IT University, 2026–2027 · Fictional organizations and synthetic data ·
        AI-assisted implementation (see docs/AI_DISCLOSURE.md)
      </footer>
    </div>
  );
}
