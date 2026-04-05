import { Trophy, BarChart3, Target, Users } from "lucide-react";
import Leaderboard from "@/components/Leaderboard";
import ConsensusSignals from "@/components/ConsensusSignals";
import { MOCK_LEADERBOARD_ROWS, MOCK_CONSENSUS_SIGNALS } from "@/lib/mock-data";
import PeriodFilter from "@/components/PeriodFilter";

export default function HomePage() {
  const rows = MOCK_LEADERBOARD_ROWS;
  const signals = MOCK_CONSENSUS_SIGNALS;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <section className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/20 rounded-full px-4 py-1.5 mb-6">
          <Trophy className="w-4 h-4 text-brand-gold" />
          <span className="text-brand-gold text-xs font-medium">
            Tracking 20 Crypto YouTubers in Real-Time
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
          Stop watching 20 YouTube channels.
          <br />
          <span className="text-gradient-gold">
            We tell you who actually beats the market.
          </span>
        </h1>

        <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
          We watch them for you and track every altcoin call, match it against
          real price data, and compute an Alpha Score that shows who genuinely
          outperforms BTC -- and who is just noise.
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap justify-center gap-6 mt-8">
          <StatPill icon={Users} label="Creators Tracked" value="20" />
          <StatPill icon={BarChart3} label="Total Calls Scored" value="2,400+" />
          <StatPill icon={Target} label="Avg Accuracy" value="54.2%" />
        </div>
      </section>

      {/* Period filter + Leaderboard */}
      <section className="mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-white font-bold text-xl">Leaderboard</h2>
            <p className="text-gray-500 text-sm mt-1">
              Ranked by Alpha Score -- who outperforms Bitcoin the most
            </p>
          </div>
          <PeriodFilter />
        </div>

        <Leaderboard rows={rows} />
      </section>

      {/* Consensus Signals */}
      <section className="mb-12 max-w-lg">
        <ConsensusSignals signals={signals} />
      </section>
    </div>
  );
}

interface StatPillProps {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly label: string;
  readonly value: string;
}

function StatPill({ icon: Icon, label, value }: StatPillProps) {
  return (
    <div className="flex items-center gap-2 bg-brand-card border border-brand-border rounded-lg px-4 py-2.5">
      <Icon className="w-4 h-4 text-brand-gold" />
      <div className="text-left">
        <p className="text-white font-bold text-sm tabular-nums">{value}</p>
        <p className="text-gray-500 text-[10px] uppercase tracking-wider">
          {label}
        </p>
      </div>
    </div>
  );
}
