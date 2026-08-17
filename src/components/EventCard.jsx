import React, { useCallback, useEffect, useState } from "react";
import EventRegistrationForm from "./EventRegistrationForm";
import { supabase } from "../lib/supabaseClient";

/* ============================================================
   One card for a tournament or a workshop.
   ------------------------------------------------------------
   The two listings show the same facts about the same shape of row, so
   they share a card. `kind` only changes wording, which table the
   registration goes to, and which spots-left RPC is called.
   ============================================================ */

const RPC = {
  tournament: { fn: "tournament_spots_left", arg: "p_tournament_id" },
  workshop: { fn: "workshop_spots_left", arg: "p_workshop_id" },
};

export function formatEventDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Registration shuts at the deadline, or at the start if none was set. */
function isClosed(event) {
  const closesAt = event.registration_deadline || event.start_at;
  return !!closesAt && new Date(closesAt).getTime() <= Date.now();
}

export default function EventCard({ kind, event }) {
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState(false);
  // null means "no limit set", which is also what we show when the count
  // can't be read — there is simply no number to display either way.
  const [spotsLeft, setSpotsLeft] = useState(null);
  const isOnline = event.format === "online";
  const closed = isClosed(event);

  const rpc = RPC[kind] || RPC.tournament;

  const loadSpots = useCallback(async () => {
    if (event.capacity === null || event.capacity === undefined) return;
    const { data, error } = await supabase.rpc(rpc.fn, { [rpc.arg]: event.id });
    if (error) {
      // Cosmetic enhancement only — the trigger is what actually enforces
      // capacity, so a missing RPC must not stop anyone registering.
      console.warn(`[EduChess] couldn't read remaining places: ${error.message}`);
      return;
    }
    setSpotsLeft(typeof data === "number" ? data : null);
  }, [event.capacity, event.id, rpc.arg, rpc.fn]);

  useEffect(() => {
    loadSpots();
  }, [loadSpots]);

  const full = spotsLeft === 0;
  const canRegister = !closed && !full;

  return (
    <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wide ${
              isOnline ? "bg-[#34d399]/15 text-[#34d399]" : "bg-[#d4af37]/15 text-[#d4af37]"
            }`}>
              {isOnline ? "Online" : "Offline"}
            </span>
            {closed && (
              <span className="inline-block px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wide bg-[#93a1b8]/15 text-[#93a1b8]">
                Registration closed
              </span>
            )}
            {!closed && full && (
              <span className="inline-block px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wide bg-[#f87171]/15 text-[#f87171]">
                Full
              </span>
            )}
          </div>
          <h3 className="font-display text-xl sm:text-2xl text-[#e7ecf5] mt-2">{event.title}</h3>
          <p className="text-sm font-mono text-[#93a1b8] mt-1">{formatEventDate(event.start_at)}</p>
        </div>
        {!registered && canRegister && (
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
          <p className="text-xs font-mono text-[#d4af37] uppercase tracking-wide">Places</p>
          <p className="text-[#e7ecf5] mt-0.5">
            {event.capacity === null || event.capacity === undefined
              ? "Open"
              : spotsLeft === null
                ? `${event.capacity} total`
                : spotsLeft === 0
                  ? "Full"
                  : `${spotsLeft} of ${event.capacity} left`}
          </p>
        </div>
      </div>

      {registered && (
        <p className="text-[#34d399] text-sm mt-4 font-mono">
          You're registered. A confirmation email should arrive shortly; if it doesn't, just get in touch.
        </p>
      )}
      {!registered && closed && (
        <p className="text-sm text-[#93a1b8] mt-4">
          Registration for this one has closed. Get in touch and we'll tell you what's next.
        </p>
      )}
      {!registered && !closed && full && (
        <p className="text-sm text-[#93a1b8] mt-4">
          Every place has gone. Get in touch and we'll add your child to the list for the next date.
        </p>
      )}
      {open && !registered && canRegister && (
        <EventRegistrationForm
          kind={kind}
          event={event}
          onDone={() => {
            setRegistered(true);
            setOpen(false);
            // Keep the visible count honest for anyone else reading the page.
            loadSpots();
          }}
        />
      )}
    </div>
  );
}
