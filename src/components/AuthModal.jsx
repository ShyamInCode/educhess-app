import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password must be at least 8 characters and include at least one letter
// and one number — a light-touch rule that still blocks trivially weak
// passwords like "123456" or "password".
function passwordIssues(pw) {
  const issues = [];
  if (pw.length < 8) issues.push("at least 8 characters");
  if (!/[A-Za-z]/.test(pw)) issues.push("a letter");
  if (!/[0-9]/.test(pw)) issues.push("a number");
  return issues;
}

export default function AuthModal({ open, onClose }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup" | "confirm"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  if (!open) return null;

  function resetFields() {
    setName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setFieldErrors({});
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setNotice("");
    setFieldErrors({});
    if (next === "login") {
      setPassword("");
    }
  }

  function handleClose() {
    resetFields();
    setMode("login");
    setError("");
    setNotice("");
    onClose();
  }

  function validate() {
    const errs = {};
    if (mode === "signup" && !name.trim()) {
      errs.name = "Enter your name.";
    }
    if (!EMAIL_RE.test(email.trim())) {
      errs.email = "Enter a valid email address.";
    }
    if (mode === "signup") {
      const issues = passwordIssues(password);
      if (issues.length) {
        errs.password = `Password needs ${issues.join(", ")}.`;
      }
    } else if (!password) {
      errs.password = "Enter your password.";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!validate()) return;

    setLoading(true);
    const { error } = mode === "login" ? await signIn(email, password) : await signUp(email, password, name.trim());
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    if (mode === "signup") {
      setConfirmEmail(email.trim());
      resetFields();
      setMode("confirm");
      return;
    }
    handleClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm px-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-sm bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "confirm" ? (
          <div className="text-center py-2">
            <span className="text-5xl block mb-4">📧</span>
            <h2 className="font-display text-xl text-[#e7ecf5] mb-2">Confirm your email</h2>
            <p className="text-base text-[#93a1b8]">
              We've sent a confirmation link to <span className="text-[#e7ecf5] font-medium">{confirmEmail}</span>.
              Open it to activate your account, then log in below.
            </p>
            <button
              onClick={() => switchMode("login")}
              className="mt-6 w-full py-3 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors"
            >
              Go to Log In
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl text-[#e7ecf5]">{mode === "login" ? "Log In" : "Create Account"}</h2>
              <button onClick={handleClose} className="text-[#93a1b8] hover:text-[#e7ecf5] text-2xl leading-none">×</button>
            </div>

            <form onSubmit={submit} className="space-y-4" noValidate>
              {mode === "signup" && (
                <div>
                  <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Name</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`mt-1 w-full bg-[#0f172a] border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37] ${
                      fieldErrors.name ? "border-[#f87171]" : "border-[#2d3b53]"
                    }`}
                  />
                  {fieldErrors.name && <p className="text-[#f87171] text-xs mt-1">{fieldErrors.name}</p>}
                </div>
              )}
              <div>
                <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Email</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`mt-1 w-full bg-[#0f172a] border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37] ${
                    fieldErrors.email ? "border-[#f87171]" : "border-[#2d3b53]"
                  }`}
                />
                {fieldErrors.email && <p className="text-[#f87171] text-xs mt-1">{fieldErrors.email}</p>}
              </div>
              <div>
                <label className="text-sm font-mono text-[#93a1b8] uppercase tracking-wide">Password</label>
                <div className="relative mt-1">
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    minLength={mode === "signup" ? 8 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full bg-[#0f172a] border rounded-lg px-3 py-2.5 pr-11 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37] ${
                      fieldErrors.password ? "border-[#f87171]" : "border-[#2d3b53]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0 top-0 h-full px-3 flex items-center text-[#93a1b8] hover:text-[#e7ecf5]"
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <p className="text-[#f87171] text-xs mt-1">{fieldErrors.password}</p>
                ) : mode === "signup" ? (
                  <p className="text-[#93a1b8] text-xs mt-1">At least 8 characters, with a letter and a number.</p>
                ) : null}
              </div>

              {error && <p className="text-[#f87171] text-sm">{error}</p>}
              {notice && <p className="text-[#34d399] text-sm">{notice}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60"
              >
                {loading ? "Please wait…" : mode === "login" ? "Log In" : "Sign Up"}
              </button>
            </form>

            <p className="text-sm text-[#93a1b8] mt-4 text-center">
              {mode === "login" ? "New to EduChess?" : "Already have an account?"}{" "}
              <button onClick={() => switchMode(mode === "login" ? "signup" : "login")} className="text-[#34d399] hover:text-[#6ee7b7] font-medium">
                {mode === "login" ? "Create an account" : "Log in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
