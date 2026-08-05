import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { TAB_METHODS, googleEnabled } from "../lib/authMethods";

const FOCUSABLE =
  'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Resend cooldown for the SMS code. Every tap costs real money and Supabase
// rate-limits OTP sends anyway, so the button is disabled rather than letting
// the user hammer it into a provider-side error.
const RESEND_SECONDS = 30;

const COUNTRY_CODE = "+91";

const INPUT_BASE =
  "mt-1 w-full bg-[#0f172a] border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37]";
const LABEL_CLASS = "text-sm font-mono text-[#93a1b8] uppercase tracking-wide";

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

/* Google's brand mark. Inline rather than a remote asset so it renders with
   the modal and survives the CSP; the four-colour "G" and a light button are
   what Google's branding guidelines require. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

export default function AuthModal({ open, onClose }) {
  const { signIn, signUp, signInWithGoogle, signInWithPhone, verifyPhoneOtp } = useAuth();
  // "email" | "phone" | null. null means Google is the only method configured,
  // so the modal is just the one button.
  const [method, setMethod] = useState(TAB_METHODS[0] ?? null);
  const [mode, setMode] = useState("login"); // "login" | "signup" | "confirm"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneStep, setPhoneStep] = useState("number"); // "number" | "code"
  const [cooldown, setCooldown] = useState(0);
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Dialog keyboard behaviour: Escape closes, Tab cycles inside.
  //
  // Without the trap a keyboard user could Tab straight past the modal into
  // the page behind it and interact with controls they can't see, with no way
  // to close the dialog at all.
  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;

    const visibleFocusables = () => {
      const node = dialogRef.current;
      if (!node) return [];
      return [...node.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.offsetParent !== null);
    };

    visibleFocusables()[0]?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        // Capture phase + stopPropagation so this wins over the nav's own
        // Escape handler instead of both firing.
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = visibleFocusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Send focus back where it came from (usually the Login button).
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Resend countdown. One interval for the whole modal, cleared on unmount so
  // a closed dialog isn't still ticking in the background.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  if (!open) return null;

  function resetFields() {
    setName("");
    setEmail("");
    setPassword("");
    setConsent(false);
    setShowPassword(false);
    setPhone("");
    setOtp("");
    setPhoneStep("number");
    setCooldown(0);
    setFieldErrors({});
  }

  function switchMethod(next) {
    setMethod(next);
    setMode("login");
    setError("");
    setNotice("");
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
    setMethod(TAB_METHODS[0] ?? null);
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
      if (!consent) {
        errs.consent = "Please confirm the parent/guardian statement.";
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
    const { error } =
      mode === "login" ? await signIn(email, password) : await signUp(email, password, name.trim(), consent);
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

  async function sendCode(e) {
    e?.preventDefault();
    setError("");
    setNotice("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setFieldErrors({ phone: "Enter the 10-digit mobile number, without the country code." });
      return;
    }
    setFieldErrors({});
    setLoading(true);
    const { error } = await signInWithPhone(`${COUNTRY_CODE}${digits}`);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPhoneStep("code");
    setCooldown(RESEND_SECONDS);
    setNotice(`Code sent to ${COUNTRY_CODE} ${digits}.`);
  }

  async function confirmCode(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    const token = otp.replace(/\D/g, "");
    if (token.length !== 6) {
      setFieldErrors({ otp: "Enter the 6-digit code from the SMS." });
      return;
    }
    setFieldErrors({});
    setLoading(true);
    const { error } = await verifyPhoneOtp(`${COUNTRY_CODE}${phone.replace(/\D/g, "")}`, token);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    handleClose();
  }

  async function google() {
    setError("");
    setNotice("");
    setLoading(true);
    const { error } = await signInWithGoogle();
    // On success the browser is already navigating to Google, so there is no
    // "done" state to render — only a failure to start needs handling.
    if (error) {
      setLoading(false);
      setError(error.message);
    }
  }

  const title =
    mode === "confirm"
      ? "Confirm your email"
      : method === "phone"
        ? "Sign in with phone"
        : method === null
          ? "Sign in to EduChess"
          : mode === "login"
            ? "Log In"
            : "Create Account";

  return (
    /*
      The backdrop is decorative; click-to-close is a mouse convenience layered
      on top of the two accessible ways out (Escape, handled by the focus-trap
      effect, and the × button). role="presentation" says exactly that, and the
      keyboard-handler rules don't apply to it — a keyboard user never needs to
      "activate" a backdrop.
    */
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm px-4"
      onClick={handleClose}
    >
      {/* Stops a click inside the dialog from bubbling to the backdrop above. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="w-full max-w-sm bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "confirm" ? (
          <div className="text-center py-2">
            <span className="text-5xl block mb-4">📧</span>
            <h2 id="auth-modal-title" className="font-display text-xl text-[#e7ecf5] mb-2">Confirm your email</h2>
            <p className="text-base text-[#93a1b8]">
              We've sent a confirmation link to <span className="text-[#e7ecf5] font-medium">{confirmEmail}</span>.
              Open it to activate your account, then log in below.
            </p>
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="mt-6 w-full py-3 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors"
            >
              Go to Log In
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 id="auth-modal-title" className="font-display text-xl text-[#e7ecf5]">
                {title}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="text-[#93a1b8] hover:text-[#e7ecf5] text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {googleEnabled && (
              <button
                type="button"
                onClick={google}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-lg bg-white text-[#1f1f1f] font-semibold text-base hover:bg-[#f1f3f4] transition-colors disabled:opacity-60"
              >
                <GoogleMark />
                Continue with Google
              </button>
            )}

            {/* Google-only is the default configuration, so this says what the
                button gets you rather than leaving a lone button with no
                context. See src/lib/authMethods.js for why. */}
            {googleEnabled && method === null && (
              <p className="text-sm text-[#93a1b8] mt-4 text-center">
                One tap, no password to remember. We only ever see your name and email address.
              </p>
            )}

            {googleEnabled && TAB_METHODS.length > 0 && (
              <div className="flex items-center gap-3 my-5" aria-hidden="true">
                <span className="h-px flex-1 bg-[#2d3b53]" />
                <span className="text-xs font-mono text-[#93a1b8] uppercase tracking-wide">or</span>
                <span className="h-px flex-1 bg-[#2d3b53]" />
              </div>
            )}

            {TAB_METHODS.length > 1 && (
              <div className="grid grid-cols-2 gap-2 mb-5" role="tablist" aria-label="Sign-in method">
                {TAB_METHODS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={method === key}
                    onClick={() => switchMethod(key)}
                    className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      method === key
                        ? "border-[#d4af37] text-[#d4af37] bg-[#0f172a]"
                        : "border-[#2d3b53] text-[#93a1b8] hover:text-[#e7ecf5]"
                    }`}
                  >
                    {key === "phone" ? "Phone" : "Email"}
                  </button>
                ))}
              </div>
            )}

            {method === null ? null : method === "phone" ? (
              <form onSubmit={phoneStep === "number" ? sendCode : confirmCode} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="auth-phone" className={LABEL_CLASS}>
                    Parent's mobile number
                  </label>
                  <div className="mt-1 flex items-stretch">
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-[#2d3b53] bg-[#0f172a] text-base text-[#93a1b8] font-mono">
                      {COUNTRY_CODE}
                    </span>
                    <input
                      id="auth-phone"
                      required
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      disabled={phoneStep === "code"}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      aria-invalid={fieldErrors.phone ? true : undefined}
                      aria-describedby={fieldErrors.phone ? "auth-phone-error" : "auth-phone-hint"}
                      className={`flex-1 min-w-0 bg-[#0f172a] border rounded-r-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#d4af37] disabled:opacity-60 ${
                        fieldErrors.phone ? "border-[#f87171]" : "border-[#2d3b53]"
                      }`}
                    />
                  </div>
                  {fieldErrors.phone ? (
                    <p id="auth-phone-error" className="text-[#f87171] text-xs mt-1">
                      {fieldErrors.phone}
                    </p>
                  ) : (
                    <p id="auth-phone-hint" className="text-[#93a1b8] text-xs mt-1">
                      Students are children, so we sign in with a parent's number.
                    </p>
                  )}
                </div>

                {phoneStep === "code" && (
                  <div>
                    <label htmlFor="auth-otp" className={LABEL_CLASS}>
                      6-digit code
                    </label>
                    <input
                      id="auth-otp"
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      aria-invalid={fieldErrors.otp ? true : undefined}
                      aria-describedby={fieldErrors.otp ? "auth-otp-error" : undefined}
                      className={`${INPUT_BASE} tracking-[0.4em] font-mono ${
                        fieldErrors.otp ? "border-[#f87171]" : "border-[#2d3b53]"
                      }`}
                    />
                    {fieldErrors.otp && (
                      <p id="auth-otp-error" className="text-[#f87171] text-xs mt-1">
                        {fieldErrors.otp}
                      </p>
                    )}
                  </div>
                )}

                {error && <p className="text-[#f87171] text-sm">{error}</p>}
                {notice && <p className="text-[#34d399] text-sm">{notice}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-[#d4af37] text-[#0f172a] font-semibold text-base hover:bg-[#f0d98c] transition-colors disabled:opacity-60"
                >
                  {loading ? "Please wait…" : phoneStep === "number" ? "Send code" : "Verify & sign in"}
                </button>

                {phoneStep === "code" && (
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneStep("number");
                        setOtp("");
                        setError("");
                        setNotice("");
                      }}
                      className="text-sm text-[#93a1b8] hover:text-[#e7ecf5]"
                    >
                      Change number
                    </button>
                    <button
                      type="button"
                      onClick={sendCode}
                      disabled={cooldown > 0 || loading}
                      className="text-sm text-[#34d399] hover:text-[#6ee7b7] font-medium disabled:text-[#93a1b8] disabled:hover:text-[#93a1b8]"
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                    </button>
                  </div>
                )}
              </form>
            ) : (
              <>
                <form onSubmit={submit} className="space-y-4" noValidate>
                  {mode === "signup" && (
                    <div>
                      <label htmlFor="auth-name" className={LABEL_CLASS}>
                        Name
                      </label>
                      <input
                        id="auth-name"
                        required
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        aria-invalid={fieldErrors.name ? true : undefined}
                        aria-describedby={fieldErrors.name ? "auth-name-error" : undefined}
                        className={`${INPUT_BASE} ${fieldErrors.name ? "border-[#f87171]" : "border-[#2d3b53]"}`}
                      />
                      {fieldErrors.name && (
                        <p id="auth-name-error" className="text-[#f87171] text-xs mt-1">
                          {fieldErrors.name}
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label htmlFor="auth-email" className={LABEL_CLASS}>
                      Email
                    </label>
                    <input
                      id="auth-email"
                      required
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={fieldErrors.email ? true : undefined}
                      aria-describedby={fieldErrors.email ? "auth-email-error" : undefined}
                      className={`${INPUT_BASE} ${fieldErrors.email ? "border-[#f87171]" : "border-[#2d3b53]"}`}
                    />
                    {fieldErrors.email && (
                      <p id="auth-email-error" className="text-[#f87171] text-xs mt-1">
                        {fieldErrors.email}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="auth-password" className={LABEL_CLASS}>
                      Password
                    </label>
                    <div className="relative mt-1">
                      <input
                        id="auth-password"
                        required
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        minLength={mode === "signup" ? 8 : undefined}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={fieldErrors.password ? true : undefined}
                        aria-describedby={fieldErrors.password ? "auth-password-error" : "auth-password-hint"}
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
                      <p id="auth-password-error" className="text-[#f87171] text-xs mt-1">
                        {fieldErrors.password}
                      </p>
                    ) : mode === "signup" ? (
                      <p id="auth-password-hint" className="text-[#93a1b8] text-xs mt-1">
                        At least 8 characters, with a letter and a number.
                      </p>
                    ) : null}
                  </div>

                  {mode === "signup" && (
                    <div>
                      <label htmlFor="auth-consent" className="flex items-start gap-2.5 text-sm text-[#93a1b8]">
                        <input
                          id="auth-consent"
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                          aria-invalid={fieldErrors.consent ? true : undefined}
                          aria-describedby={fieldErrors.consent ? "auth-consent-error" : undefined}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#d4af37]"
                        />
                        <span>
                          I am a parent/guardian, or I have my parent's permission to use this account.
                        </span>
                      </label>
                      {fieldErrors.consent && (
                        <p id="auth-consent-error" className="text-[#f87171] text-xs mt-1">
                          {fieldErrors.consent}
                        </p>
                      )}
                    </div>
                  )}

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
                  <button
                    type="button"
                    onClick={() => switchMode(mode === "login" ? "signup" : "login")}
                    className="text-[#34d399] hover:text-[#6ee7b7] font-medium"
                  >
                    {mode === "login" ? "Create an account" : "Log in"}
                  </button>
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
