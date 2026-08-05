import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import AuthModal from "./AuthModal";

/**
 * Route guard for pages that are meaningless logged out (`/dashboard`,
 * `/mylearning`), which were both reachable anonymously.
 *
 * It prompts in place rather than redirecting home: sign-in lives in a modal,
 * so a redirect would drop the visitor somewhere else with no way back to
 * where they were headed. Signing in flips `user` and the page renders.
 */
export default function RequireAuth({ children }) {
  const { user, loading, authError } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="font-mono text-sm text-[#93a1b8]">Checking access…</p>
      </div>
    );
  }

  if (user) return children;

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-20 text-center">
      <span className="font-mono text-sm tracking-[0.3em] text-[#34d399] uppercase">Members only</span>
      <h1 className="font-display text-3xl mt-4 mb-3 text-[#e7ecf5]">Sign in to continue</h1>
      <p className="text-base text-[#93a1b8] mb-8">
        This page shows your own progress, so we need to know who you are.
      </p>
      {authError && <p className="text-sm text-[#f87171] mb-6">{authError}</p>}
      <button
        type="button"
        onClick={() => setAuthOpen(true)}
        className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold hover:bg-[#f0d98c] transition-colors"
      >
        Sign in
      </button>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
