import React, { useState } from "react";
import EventRegistrationForm from "./EventRegistrationForm";

/* ============================================================
   One card for a tournament or a workshop.
   ------------------------------------------------------------
   The two listings show the same facts about the same shape of row, so
   they share a card. `kind` only changes wording and which table the
   registration goes to.
   ============================================================ */

export function formatEventDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function EventCard({ kind, event }) {
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState(false);
  const isOnline = event.format === "online";

  return (
    <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wide ${
            isOnline ? "bg-[#34d399]/15 text-[#34d399]" : "bg-[#d4af37]/15 text-[#d4af37]"
          }`}>
            {isOnline ? "Online" : "Offline"}
          </span>
          <h3 className="font-display text-xl sm:text-2xl text-[#e7ecf5] mt-2">{event.title}</h3>
          <p className="text-sm font-mono text-[#93a1b8] mt-1">{formatEventDate(event.start_at)}</p>
        </div>
        {!registered && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-sm hover:bg-[#f0d98c] transition-colors"
          >
            {open ? "Close" : "Register"}
          </button>
        )}
      </div>

      {event.description && <p className="text-base text-[#93a1b8] mt-4">{event.description}</p>}

      <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
        <div className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-lg px-3 py-2">
          <p className="text-xs font-mono text-[#d4af37] uppercase tracking-wide">{isOnline ? "Platform" : "Venue"}</p>
          <p className="text-[#e7ecf5] mt-0.5">{event.venue || "To be confirmed"}</p>
        </div>
        <div className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-lg px-3 py-2">
          <p className="text-xs font-mono text-[#d4af37] uppercase tracking-wide">Fee</p>
          <p className="text-[#e7ecf5] mt-0.5">
            {event.fee || (kind === "workshop" ? "To be confirmed" : "Free")}
          </p>
        </div>
        <div className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-lg px-3 py-2">
          <p className="text-xs font-mono text-[#d4af37] uppercase tracking-wide">Capacity</p>
          <p className="text-[#e7ecf5] mt-0.5">{event.capacity ?? "Open"}</p>
        </div>
      </div>

      {registered && (
        <p className="text-[#34d399] text-sm mt-4 font-mono">
          You're registered. A confirmation email is on its way.
        </p>
      )}
      {open && !registered && (
        <EventRegistrationForm
          kind={kind}
          event={event}
          onDone={() => {
            setRegistered(true);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
