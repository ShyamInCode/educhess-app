import React, { useCallback, useEffect, useState } from "react";
import EventRegistrationForm from "./EventRegistrationForm";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";

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
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState(false);
  // null means "no limit set", which is also what we show when the count
  // can't be read — there is simply no number to display either way.
  const [spotsLeft, setSpotsLeft] = useState(null);
  const [meetingUrl, setMeetingUrl] = useState(null);
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

  /*
    The joining link for an online event.

    It is not a column on this row and never reaches the browser as part of
    the listing: it lives in event_meeting_links, a table with RLS on and no
    policies at all, reachable only through event_meeting_url()
    (supabase/02_functions.sql). That function requires a signed-in caller
    with a registration for this event, or an admin.

    So the three outcomes here are all normal and none is an error worth
    showing: no account, no registration, or no link set for this event. Only
    a successful read renders anything.
  */
  const loadMeetingUrl = useCallback(async () => {
    if (!user || !isOnline) return;
    const { data, error } = await supabase.rpc("event_meeting_url", {
      p_kind: kind === "workshop" ? "workshop" : "tournament",
      p_event_id: event.id,
    });
    if (error) return; // NOT_REGISTERED / SIGN_IN_REQUIRED — nothing to show
    setMeetingUrl(data || null);
  }, [user, isOnline, kind, event.id]);

  useEffect(() => {
    loadMeetingUrl();
  }, [loadMeetingUrl]);

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

      {/* The joining link, for a signed-in registrant of an online event.
          Rendered outside the `registered` branch on purpose: someone who
          registered last week and came back should see it too, and the only
          thing that decides is whether the server hands it over. */}
      {meetingUrl && (
        <div className="mt-4 bg-[#0f172a]/60 border border-[#34d399]/40 rounded-lg px-3 py-2">
          <p className="text-xs font-mono text-[#34d399] uppercase tracking-wide">Joining link</p>
          <a
            href={meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[#e7ecf5] hover:text-[#34d399] break-all"
          >
            {meetingUrl}
          </a>
        </div>
      )}

      {registered && (
        <p className="text-[#34d399] text-sm mt-4 font-mono">
          {isOnline && !meetingUrl
            ? "You're registered. The joining link appears here once it's set — check back closer to the date."
            : "You're registered. We'll be in touch on the details you gave us."}
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
            // And the link becomes readable the moment the registration lands.
            loadMeetingUrl();
          }}
        />
      )}
    </div>
  );
}
