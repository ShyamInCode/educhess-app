import React from "react";
import { PRICING_TIERS } from "../data/mockData";

export default function PricingPage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Choose your gambit</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Pricing</h1>
      <div className="grid md:grid-cols-3 gap-6">
        {PRICING_TIERS.map((t) => (
          <div key={t.name} className={`rounded-2xl p-6 border flex flex-col ${t.highlight ? "bg-[#1e293b] border-[#d4af37] shadow-2xl scale-[1.02]" : "bg-[#1e293b]/70 border-[#2d3b53]"}`}>
            <span className="font-mono text-sm uppercase tracking-widest text-[#34d399]">{t.tag}</span>
            <h3 className="font-display text-2xl mt-2 text-[#e7ecf5]">{t.medal} {t.name}</h3>
            <p className="font-mono text-3xl text-[#d4af37] mt-3">{t.price}</p>
            <p className="text-base text-[#93a1b8] mt-3 flex-1">{t.desc}</p>
            <ul className="mt-4 space-y-2">
              {t.features.map((f) => (
                <li key={f} className="text-base text-[#e7ecf5] flex gap-2"><span className="text-[#d4af37]">♟</span>{f}</li>
              ))}
            </ul>
            <button className={`mt-6 py-2.5 rounded-lg font-semibold text-base transition-colors ${t.highlight ? "bg-[#d4af37] text-[#0f172a] hover:bg-[#f0d98c]" : "bg-[#0f172a] border border-[#2d3b53] text-[#e7ecf5] hover:border-[#d4af37]"}`}>
              Select Tier
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
