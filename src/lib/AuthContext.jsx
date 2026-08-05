import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { effectiveTier } from "./tiers";

const AuthContext = createContext(null);

const SESSION_ERROR = "Couldn't reach the login service. Try reloading the page.";
const PROFILE_ERROR = "Couldn't load your profile, so some details may be out of date.";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  // Load the current session once, then keep listening for changes
  // (login, logout, token refresh) anywhere in the app.
  //
  // The `.catch`/`.finally` are not optional: without them a network failure
  // inside getSession() leaves `loading` true forever and every guarded route
  // sits on "Checking access…" with no way out.
  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setAuthError(SESSION_ERROR);
        setSession(data?.session ?? null);
      })
      .catch(() => {
        if (!cancelled) setAuthError(SESSION_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthError("");
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  const loadProfile = useCallback(async () => {
    if (!userId) return { data: null, error: null };
    return supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  }, [userId]);

  // Pull the logged-in user's row from `profiles`.
  //
  // On error we deliberately *keep* whatever profile we already had. Blanking
  // it on a failed fetch quietly demotes an admin mid-session and hides the
  // admin panel, which reads as a permissions bug rather than a network blip.
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return undefined;
    }
    let cancelled = false;
    loadProfile().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setAuthError(PROFILE_ERROR);
        return;
      }
      setProfile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, loadProfile]);

  /**
   * Re-read the profile row and return it.
   *
   * Call this after anything that changes server-side state the UI shows —
   * awarding quest points, for instance, which otherwise flashes "+10" while
   * the visible total stays at 0 until a hard reload.
   */
  const refreshProfile = useCallback(async () => {
    const { data, error } = await loadProfile();
    if (error) {
      setAuthError(PROFILE_ERROR);
      return null;
    }
    setProfile(data);
    return data;
  }, [loadProfile]);

  async function signUp(email, password, name, consent = false) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // `consent` is read by handle_new_user() to stamp profiles.consent_at,
      // so a parent who ticked the box on sign-up isn't asked again.
      options: { data: { name, consent } },
    });
    return { error };
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  /**
   * Google OAuth. This navigates away from the SPA and comes back to
   * `window.location.origin` with the tokens in the URL; supabase-js's default
   * `detectSessionInUrl` consumes them and fires onAuthStateChange, which the
   * effect above is already listening to. So there is nothing to await here
   * beyond a failure to *start* the redirect.
   */
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return { error };
  }

  /** Send a 6-digit SMS code. `phone` must be in E.164 form, e.g. +919876543210. */
  async function signInWithPhone(phone) {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    return { error };
  }

  /** Exchange the SMS code for a session. */
  async function verifyPhoneOtp(phone, token) {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    // Expiry applied, so consumers never have to remember to check
    // tier_expires_at. Display and gating only — the database enforces the
    // puzzle quota itself.
    tier: effectiveTier(profile),
    loading,
    authError,
    refreshProfile,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithPhone,
    verifyPhoneOtp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}
