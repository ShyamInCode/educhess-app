import React from "react";
import ContactForm from "../components/ContactForm";
import { CORPORATE_DETAILS } from "../data/mockData";

export default function ContactPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Request a Consult</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Contact Us</h1>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
          <ContactForm />
        </div>

        <div className="space-y-4">
          {CORPORATE_DETAILS.map((c) => (
            <div key={c.l} className="bg-[#1e293b]/70 border border-[#2d3b53] rounded-xl p-4">
              <p className="text-xs font-mono text-[#d4af37] uppercase tracking-widest">{c.l}</p>
              <p className="text-base text-[#e7ecf5] mt-1">{c.v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
