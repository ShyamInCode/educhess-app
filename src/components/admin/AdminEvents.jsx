import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

/* ============================================================
   Admin management for tournaments and workshops.
   ------------------------------------------------------------
   Both are the same row shape managed the same way, so one component
   serves both tabs; `kind` picks the tables and the wording.

   Edit is a real UPDATE. It used to be delete-and-recreate, which took
   every registration with it — the reason the registration foreign keys
   are ON DELETE RESTRICT today.
   ============================================================ */

const CONFIG = {
  tournament: {
    table: "tournaments",
    registrationTable: "tournament_registrations",
    foreignKey: "tournament_id",
    label: "tournament",
    labelPlural: "Tournaments",
  },
  workshop: {
    table: "workshops",
    registrationTable: "workshop_registrations",
    foreignKey: "workshop_id",
    label: "workshop",
    labelPlural: "Workshops",
  },
};

const EMPTY = {
  title: "",
  description: "",
  format: "offline",
  venue: "",
  start_at: "",
  registration_deadline: "",
  fee: "",
  capacity: "",
  published: true,
};

const INPUT_CLASS =
  "mt-1 w-full bg-[#0f172a] border border-[#2d3b53] rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]";
const LABEL_CLASS = "text-sm font-mono text-[#93a1b8] uppercase tracking-wide";

/** ISO timestamp -> the value a <input type="datetime-local"> expects (local time). */
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * One CSV cell.
 *
 * The leading-quote guard is not decoration: these exports contain
 * parent-supplied free text, and a cell starting with = or + is executed as a
 * formula the moment someone opens the file in Excel.
 */
function csvCell(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS = [
  ["created_at", "Registered at"],
  ["child_name", "Child"],
  ["grade", "Grade"],
  ["parent_name", "Parent"],
  ["parent_email", "Parent email"],
  ["parent_phone", "Parent phone"],
  ["notes", "Notes"],
];

// U+FEFF, written as an escape: a literal BOM in source is invisible and
// trips the linter's irregular-whitespace rule.
const BOM = "\uFEFF";

function downloadCsv(filename, rows) {
  const header = CSV_COLUMNS.map(([, title]) => csvCell(title)).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map(([key]) => csvCell(r[key])).join(",")).join("\n");
  // The BOM makes Excel read it as UTF-8 — without it, Indian names with
  // non-ASCII characters arrive mangled.
  const blob = new Blob([BOM + `${header}\n${body}\n`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slug(text) {
  return String(text || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export default function AdminEvents({ kind }) {
  const config = CONFIG[kind] || CONFIG.tournament;
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [openRegistrations, setOpenRegistrations] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [registrationsError, setRegistrationsError] = useState("");
  const [registrationsLoading, setRegistrationsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data, error: listError } = await supabase
      .from(config.table)
      .select("*")
      .order("start_at", { ascending: false });
    if (listError) {
      setLoadError(listError.message);
      setLoading(false);
      return;
    }
    setEvents(data || []);

    // One aggregate, not every registration row (audit PERF-01). This used to
    // download one column for EVERY registration across all events and tally
    // them in JavaScript, which grows without bound as the academy does.
    // event_registration_counts() is is_admin()-gated and returns one row per
    // event.
    const { data: countRows, error: countError } = await supabase.rpc("event_registration_counts", {
      p_kind: config.label,
    });
    if (!countError) {
      const tally = {};
      (countRows || []).forEach((r) => {
        tally[r.event_id] = r.registrations;
      });
      setCounts(tally);
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setError("");
    setSuccess("");
    setForm({
      title: row.title || "",
      description: row.description || "",
      format: row.format || "offline",
      venue: row.venue || "",
      start_at: toLocalInput(row.start_at),
      registration_deadline: toLocalInput(row.registration_deadline),
      fee: row.fee || "",
      capacity: row.capacity ?? "",
      published: !!row.published,
    });
    // <main> is the app's scroll container, not the window (see App.jsx), so
    // window.scrollTo here would silently do nothing and the edit form would
    // stay off-screen above the list.
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!form.title.trim() || !form.start_at) {
      setError("Title and start date/time are required.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      format: form.format,
      venue: form.venue.trim() || null,
      start_at: new Date(form.start_at).toISOString(),
      registration_deadline: form.registration_deadline
        ? new Date(form.registration_deadline).toISOString()
        : null,
      fee: form.fee.trim() || null,
      capacity: form.capacity ? Number(form.capacity) : null,
      published: form.published,
    };
    const { error: writeError } = editingId
      ? await supabase.from(config.table).update(payload).eq("id", editingId)
      : await supabase.from(config.table).insert(payload);
    setSaving(false);
    if (writeError) {
      setError(writeError.message || `Couldn't save that ${config.label}.`);
      return;
    }
    setSuccess(editingId ? "Changes saved." : `${config.label[0].toUpperCase()}${config.label.slice(1)} created.`);
    resetForm();
    load();
  }

  async function togglePublished(row) {
    setBusyId(row.id);
    setError("");
    const { error: writeError } = await supabase
      .from(config.table)
      .update({ published: !row.published })
      .eq("id", row.id);
    setBusyId(null);
    if (writeError) {
      setError(writeError.message || "Couldn't change that.");
      return;
    }
    load();
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete "${row.title}"?`)) return;
    setBusyId(row.id);
    setError("");
    const { error: deleteError } = await supabase.from(config.table).delete().eq("id", row.id);
    setBusyId(null);
    if (deleteError) {
      // The FK is ON DELETE RESTRICT, so this is the expected answer once
      // anyone has registered. Say what to do instead of showing the raw
      // Postgres text.
      setError(
        /foreign key|violates/i.test(deleteError.message)
          ? `This ${config.label} has registrations, so it can't be deleted — unpublish it instead to take it off the site.`
          : deleteError.message
      );
      return;
    }
    load();
  }

  async function showRegistrations(row) {
    if (openRegistrations === row.id) {
      setOpenRegistrations(null);
      return;
    }
    setOpenRegistrations(row.id);
    setRegistrations([]);
    setRegistrationsError("");
    setRegistrationsLoading(true);
    const { data, error: regError } = await supabase
      .from(config.registrationTable)
      .select("*")
      .eq(config.foreignKey, row.id)
      .order("created_at", { ascending: true });
    setRegistrationsLoading(false);
    if (regError) {
      setRegistrationsError("Couldn't load the registration list.");
      return;
    }
    setRegistrations(data || []);
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">{config.labelPlural}</span>
        <h2 className="font-display text-2xl mt-2 mb-6 text-[#e7ecf5]">
          {editingId ? `Edit ${config.label}` : `Create a ${config.label}`}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div>
            <label htmlFor={`${kind}-title`} className={LABEL_CLASS}>Title</label>
            <input id={`${kind}-title`} required maxLength={160} value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor={`${kind}-description`} className={LABEL_CLASS}>Description</label>
            <textarea id={`${kind}-description`} rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT_CLASS} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${kind}-format`} className={LABEL_CLASS}>Format</label>
              <select id={`${kind}-format`} value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value })} className={INPUT_CLASS}>
                <option value="offline">Offline</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${kind}-venue`} className={LABEL_CLASS}>
                {form.format === "online" ? "Platform / Link" : "Venue"}
              </label>
              <input id={`${kind}-venue`} value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${kind}-start`} className={LABEL_CLASS}>Start Date &amp; Time</label>
              <input id={`${kind}-start`} required type="datetime-local" value={form.start_at}
                onChange={(e) => setForm({ ...form, start_at: e.target.value })} className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor={`${kind}-deadline`} className={LABEL_CLASS}>Registration Deadline</label>
              <input id={`${kind}-deadline`} type="datetime-local" value={form.registration_deadline}
                onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${kind}-fee`} className={LABEL_CLASS}>Fee (e.g. "Free" or "₹500")</label>
              <input id={`${kind}-fee`} value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })} className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor={`${kind}-capacity`} className={LABEL_CLASS}>Capacity (optional)</label>
              <input id={`${kind}-capacity`} type="number" min="1" value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })} className={INPUT_CLASS} />
            </div>
          </div>
          <label htmlFor={`${kind}-published`} className="flex items-center gap-2.5 text-sm text-[#93a1b8]">
            <input id={`${kind}-published`} type="checkbox" checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
              className="h-4 w-4 accent-[#d4af37]" />
            <span>Published — visible on the public page</span>
          </label>

          {error && <p className="text-[#f87171] text-sm">{error}</p>}
          {success && <p className="text-[#34d399] text-sm">{success}</p>}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60">
              {saving ? "Saving…" : editingId ? "Save Changes" : `Create ${config.label[0].toUpperCase()}${config.label.slice(1)}`}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm}
                className="px-5 py-2.5 rounded-lg border border-[#2d3b53] text-[#e7ecf5] font-semibold text-base hover:border-[#d4af37]/60 transition-colors">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">{config.labelPlural}</span>
        <h2 className="font-display text-xl mt-2 mb-4 text-[#e7ecf5]">All {config.labelPlural.toLowerCase()}</h2>
        {loading && <p className="text-sm text-[#93a1b8]">Loading…</p>}
        {!loading && loadError && (
          <p className="text-sm text-[#f87171]">Couldn't load the list. ({loadError})</p>
        )}
        {!loading && !loadError && events.length === 0 && (
          <p className="text-sm text-[#93a1b8]">No {config.labelPlural.toLowerCase()} yet.</p>
        )}

        <div className="space-y-2">
          {events.map((row) => (
            <div key={row.id} className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-base text-[#e7ecf5] truncate">
                    {row.title}
                    {!row.published && (
                      <span className="ml-2 text-xs font-mono uppercase tracking-wide text-[#93a1b8] border border-[#2d3b53] rounded px-1.5 py-0.5">
                        Draft
                      </span>
                    )}
                  </p>
                  <p className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">
                    {row.format} · {new Date(row.start_at).toLocaleDateString()} ·{" "}
                    {counts[row.id] || 0} registered
                    {row.capacity ? ` / ${row.capacity}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button onClick={() => showRegistrations(row)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#e7ecf5] border border-[#2d3b53] hover:border-[#d4af37]/60 transition-colors">
                    {openRegistrations === row.id ? "Hide" : "Registrations"}
                  </button>
                  <button onClick={() => startEdit(row)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#e7ecf5] border border-[#2d3b53] hover:border-[#d4af37]/60 transition-colors">
                    Edit
                  </button>
                  <button onClick={() => togglePublished(row)} disabled={busyId === row.id}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#34d399] border border-[#34d399]/40 hover:bg-[#34d399]/10 transition-colors disabled:opacity-50">
                    {row.published ? "Unpublish" : "Publish"}
                  </button>
                  <button onClick={() => handleDelete(row)} disabled={busyId === row.id}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#f87171] border border-[#f87171]/40 hover:bg-[#f87171]/10 transition-colors disabled:opacity-50">
                    Delete
                  </button>
                </div>
              </div>

              {openRegistrations === row.id && (
                <div className="mt-4 border-t border-[#2d3b53] pt-4">
                  {registrationsLoading && <p className="text-sm text-[#93a1b8]">Loading registrations…</p>}
                  {!registrationsLoading && registrationsError && (
                    <p className="text-sm text-[#f87171]">{registrationsError}</p>
                  )}
                  {!registrationsLoading && !registrationsError && registrations.length === 0 && (
                    <p className="text-sm text-[#93a1b8]">Nobody has registered yet.</p>
                  )}
                  {!registrationsLoading && !registrationsError && registrations.length > 0 && (
                    <>
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <p className="text-sm text-[#93a1b8]">{registrations.length} registered</p>
                        <button
                          onClick={() => downloadCsv(`${config.label}-${slug(row.title)}-registrations.csv`, registrations)}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#d4af37] border border-[#d4af37]/40 hover:bg-[#d4af37]/10 transition-colors">
                          Export CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs font-mono uppercase tracking-wide text-[#93a1b8]">
                              <th scope="col" className="py-2 pr-4">Child</th>
                              <th scope="col" className="py-2 pr-4">Grade</th>
                              <th scope="col" className="py-2 pr-4">Parent</th>
                              <th scope="col" className="py-2 pr-4">Email</th>
                              <th scope="col" className="py-2 pr-4">Phone</th>
                              <th scope="col" className="py-2">Registered</th>
                            </tr>
                          </thead>
                          <tbody>
                            {registrations.map((r) => (
                              <tr key={r.id} className="border-t border-[#2d3b53]">
                                <td className="py-2 pr-4 text-[#e7ecf5]">{r.child_name}</td>
                                <td className="py-2 pr-4 text-[#93a1b8]">{r.grade || "—"}</td>
                                <td className="py-2 pr-4 text-[#93a1b8]">{r.parent_name}</td>
                                <td className="py-2 pr-4 text-[#34d399] font-mono text-xs">{r.parent_email}</td>
                                <td className="py-2 pr-4 text-[#93a1b8] font-mono text-xs">{r.parent_phone || "—"}</td>
                                <td className="py-2 text-[#93a1b8] font-mono text-xs">
                                  {new Date(r.created_at).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
