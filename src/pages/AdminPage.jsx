import React from "react";
import { useAuth } from "../lib/AuthContext";
import AdminPanel from "../components/AdminPanel";

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="w-full max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Restricted Area</span>
      <h1 className="font-display text-3xl sm:text-4xl mt-3 mb-8 text-[#e7ecf5]">Admin Panel</h1>

      {loading && <p className="text-base text-[#93a1b8]">Checking access…</p>}

      {!loading && !user && (
        <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6">
          <p className="text-base text-[#e7ecf5]">Log in with an admin account to manage course videos.</p>
        </div>
      )}

      {!loading && user && !isAdmin && (
        <div className="bg-[#1e293b] border border-[#f87171]/40 rounded-2xl p-6">
          <p className="text-base text-[#f87171]">
            Your account doesn't have admin access. Ask an existing admin to set your{" "}
            <code className="text-[#d4af37]">profiles.role</code> to <code className="text-[#d4af37]">'admin'</code>.
          </p>
        </div>
      )}

      {!loading && user && isAdmin && <AdminPanel />}
    </div>
  );
}
