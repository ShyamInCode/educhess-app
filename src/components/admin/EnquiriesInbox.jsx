import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function EnquiriesInbox() {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("contact_submissions")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setEnquiries(data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
      <span className="font-mono text-sm text-[#d4af37] tracking-widest uppercase">Leads</span>
      <h2 className="font-display text-2xl mt-2 mb-1 text-[#e7ecf5]">Enquiries</h2>
      <p className="text-sm text-[#93a1b8] mb-4">Submissions from the Contact form, newest first.</p>

      {error && (
        <p className="text-[#f87171] text-sm mb-3">
          Couldn't load enquiries — run <code className="text-[#d4af37]">migration_contact_admin_view.sql</code> in
          Supabase if you haven't yet. ({error})
        </p>
      )}
      {loading && <p className="text-sm text-[#93a1b8]">Loading…</p>}
      {!loading && !error && enquiries.length === 0 && (
        <p className="text-sm text-[#93a1b8]">No enquiries yet.</p>
      )}

      <div className="space-y-2">
        {enquiries.map((e) => (
          <div key={e.id} className="bg-[#0f172a]/60 border border-[#2d3b53] rounded-xl px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-base text-[#e7ecf5] font-medium truncate">{e.name}</p>
              <p className="text-xs font-mono text-[#93a1b8] shrink-0">
                {new Date(e.created_at).toLocaleDateString()}
              </p>
            </div>
            <p className="text-sm text-[#34d399] font-mono">{e.email}{e.grade ? ` · Grade ${e.grade}` : ""}</p>
            {e.struggles && <p className="text-sm text-[#93a1b8] mt-1">{e.struggles}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
