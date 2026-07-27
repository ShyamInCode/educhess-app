import React from "react";
import { RESOURCE_CATEGORIES } from "../data/mockData";

export default function ResourcesPage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">The Resource Vault</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-4 text-[#e7ecf5]">Resources</h1>
      <p className="text-base text-[#93a1b8] max-w-2xl mb-8">
        Every quest sheet and worksheet below is mapped to a curriculum module — download, print, and hand a child a mission instead of a page of drill.
      </p>

      <div className="space-y-10">
        {RESOURCE_CATEGORIES.map((group) => (
          <div key={group.cat}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl text-[#d4af37]">{group.icon}</span>
              <h2 className="font-display text-2xl text-[#e7ecf5]">{group.cat}</h2>
              <span className="font-mono text-xs text-[#93a1b8]">({group.items.length})</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {group.items.map((it) => (
                <div key={it.t} className="bg-[#1e293b] border border-[#2d3b53] rounded-xl p-5 hover:border-[#d4af37]/60 hover:-translate-y-0.5 transition-all">
                  <span className="text-2xl text-[#d4af37]">♜</span>
                  <h3 className="font-display text-lg mt-3 text-[#e7ecf5]">{it.t}</h3>
                  <p className="text-sm font-mono text-[#93a1b8] mt-1">{it.type}</p>
                  <button className="mt-4 text-sm font-mono text-[#34d399] hover:text-[#6ee7b7]">Download →</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
