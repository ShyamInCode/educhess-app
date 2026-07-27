import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import AuthModal from "./AuthModal";
import { NAV_LINKS, COURSES_DROPDOWN } from "../data/mockData";

export default function NavBar({ navRef, openDropdown, setOpenDropdown, profileOpen, setProfileOpen, goTo, activePage }) {
  const { user, profile, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSubOpen, setMobileSubOpen] = useState(null);
  const mobilePanelRef = useRef(null);
  const displayName = profile?.name || user?.email || "";
  const initial = displayName ? displayName.charAt(0).toUpperCase() : "?";
  const isAdmin = profile?.role === "admin";

  function mobileGoTo(page, detail) {
    setMobileMenuOpen(false);
    setMobileSubOpen(null);
    goTo(page, detail);
  }

  useEffect(() => {
    function onClick(e) {
      if (
        mobilePanelRef.current &&
        !mobilePanelRef.current.contains(e.target) &&
        navRef.current &&
        !navRef.current.contains(e.target)
      ) {
        setMobileMenuOpen(false);
        setMobileSubOpen(null);
      }
    }
    function onResize() {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
        setMobileSubOpen(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("resize", onResize);
    };
  }, [navRef]);

  return (
    <>
      <nav ref={navRef} className="relative z-30 border-b border-[#d4af37]/25 bg-[#151f36]/95 backdrop-blur px-4 sm:px-8 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => goTo("home")} className="flex items-center shrink-0 hover:opacity-90 transition-opacity">
          <img
            src="/educhess_title.png"
            alt="EduChess — Chess & Education"
            className="h-10 sm:h-10 w-auto object-contain"
          />
        </button>

        <div className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((l) => {
            if (l.key === "courses") {
              return (
                <div key={l.key} className="relative flex items-center">
                  <button
                    onClick={() => goTo("courses")}
                    className={`pl-3 pr-1.5 py-2 text-base font-medium rounded-l-md transition-colors ${
                      activePage === "courses" ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                    }`}
                  >
                    {l.label}
                  </button>
                  <button
                    aria-label="Toggle courses menu"
                    onClick={() => setOpenDropdown(openDropdown === "courses" ? null : "courses")}
                    className={`pl-1 pr-2.5 py-2 text-sm rounded-r-md transition-colors ${
                      openDropdown === "courses" ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                    }`}
                  >
                    <span className={`inline-block transition-transform ${openDropdown === "courses" ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  {openDropdown === "courses" && (
                    <div className="absolute top-full mt-2 left-0 w-64 bg-[#1e293b] border border-[#2d3b53] rounded-xl shadow-2xl p-2 z-40">
                      {COURSES_DROPDOWN.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => goTo("courses", c.key)}
                          className="w-full flex items-center justify-between px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399] transition-colors"
                        >
                          <span>{c.label} <span className="text-[#93a1b8] text-sm">({c.tag})</span></span>
                        </button>
                      ))}
                      <div className="my-1 border-t border-[#2d3b53]" />
                      <button
                        onClick={() => goTo("courses")}
                        className="w-full flex items-center justify-between px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399] transition-colors"
                      >
                        <span>All courses</span>
                        <span className="text-[#d4af37]">→</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            if (l.key === "quiz" || l.key === "practice" || l.key === "pricing" || l.key === "contact") {
              return (
                <button
                  key={l.key}
                  onClick={() => goTo(l.key)}
                  className={`px-3 py-2 text-base font-medium rounded-md transition-colors ${
                    activePage === l.key ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                  }`}
                >
                  {l.label}
                </button>
              );
            }
            return (
              <div key={l.key} className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === l.key ? null : l.key)}
                  className={`px-3 py-2 text-base font-medium rounded-md transition-colors ${
                    activePage === l.key || openDropdown === l.key ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                  }`}
                >
                  {l.label}
                </button>
                {openDropdown === l.key && (
                  <div className="absolute top-full mt-2 left-0 w-64 bg-[#1e293b] border border-[#2d3b53] rounded-xl shadow-2xl p-2 z-40">
                    {l.items.map((it) => (
                      <button
                        key={it}
                        onClick={() => goTo(l.key)}
                        className="w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399] transition-colors"
                      >
                        {it}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative">
            {!user ? (
              <button
                onClick={() => setAuthOpen(true)}
                className="px-3 sm:px-4 py-2 rounded-md bg-[#d4af37] text-[#0f172a] font-semibold text-sm sm:text-base hover:bg-[#f0d98c] transition-colors"
              >
                Login
              </button>
            ) : (
              <>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-[#1e293b] border border-[#2d3b53] hover:border-[#d4af37]/50 transition-colors"
                >
                  <span className="w-7 h-7 rounded-full bg-[#d4af37] text-[#0f172a] flex items-center justify-center font-display text-base shrink-0">{initial}</span>
                  <span className="text-base text-[#e7ecf5] hidden sm:inline">{displayName}</span>
                </button>
                {profileOpen && (
                  <div className="absolute top-full mt-2 right-0 w-48 bg-[#1e293b] border border-[#2d3b53] rounded-xl shadow-2xl p-2 z-40">
                    <p className="px-3 py-1 text-xs font-mono text-[#93a1b8] uppercase tracking-wide">
                      {profile?.rank_points ?? 0} pts earned
                    </p>
                    <button onClick={() => goTo("dashboard")} className="w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a]">Dashboard</button>
                    <button onClick={() => goTo("mylearning")} className="w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a]">My Learning</button>
                    <button onClick={() => goTo("practice")} className="w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a]">Practice vs Engine</button>
                    {isAdmin && (
                      <button onClick={() => goTo("admin")} className="w-full text-left px-3 py-2 text-base rounded-lg text-[#d4af37] hover:bg-[#0f172a]">Admin Panel</button>
                    )}
                    <button onClick={() => goTo("contact")} className="w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a]">Help</button>
                    <button
                      onClick={() => { signOut(); setProfileOpen(false); }}
                      className="w-full text-left px-3 py-2 text-base rounded-lg text-[#f87171] hover:bg-[#0f172a]"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Hamburger — visible below the lg breakpoint where the full nav collapses */}
          <button
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            className="lg:hidden flex flex-col justify-center items-center gap-1.5 w-9 h-9 rounded-md border border-[#2d3b53] bg-[#1e293b] hover:border-[#d4af37]/50 transition-colors shrink-0"
          >
            <span className={`block w-5 h-0.5 bg-[#d4af37] transition-transform ${mobileMenuOpen ? "translate-y-2 rotate-45" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#d4af37] transition-opacity ${mobileMenuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#d4af37] transition-transform ${mobileMenuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      {mobileMenuOpen && (
        <div ref={mobilePanelRef} className="lg:hidden relative z-30 border-b border-[#d4af37]/25 bg-[#151f36] px-4 py-3 space-y-1 shrink-0 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {NAV_LINKS.map((l) => {
            if (l.key === "courses") {
              return (
                <div key={l.key}>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => mobileGoTo("courses")}
                      className={`flex-1 text-left px-3 py-2.5 text-base font-medium rounded-md transition-colors ${
                        activePage === "courses" ? "text-[#d4af37] bg-[#1e293b]" : "text-[#e7ecf5] hover:bg-[#1e293b]"
                      }`}
                    >
                      {l.label}
                    </button>
                    <button
                      aria-label="Toggle courses submenu"
                      onClick={() => setMobileSubOpen(mobileSubOpen === "courses" ? null : "courses")}
                      className="px-3 py-2.5 text-[#93a1b8]"
                    >
                      <span className={`inline-block transition-transform ${mobileSubOpen === "courses" ? "rotate-180" : ""}`}>▾</span>
                    </button>
                  </div>
                  {mobileSubOpen === "courses" && (
                    <div className="pl-3 pb-1 space-y-1">
                      {COURSES_DROPDOWN.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => mobileGoTo("courses", c.key)}
                          className="w-full text-left px-3 py-2 text-sm rounded-lg text-[#e7ecf5] hover:bg-[#1e293b] hover:text-[#34d399] transition-colors"
                        >
                          {c.label} <span className="text-[#93a1b8] text-xs">({c.tag})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (l.key === "quiz" || l.key === "practice") {
              return (
                <button
                  key={l.key}
                  onClick={() => mobileGoTo(l.key)}
                  className={`w-full text-left px-3 py-2.5 text-base font-medium rounded-md transition-colors ${
                    activePage === l.key ? "text-[#d4af37] bg-[#1e293b]" : "text-[#e7ecf5] hover:bg-[#1e293b]"
                  }`}
                >
                  {l.label}
                </button>
              );
            }
            return (
              <div key={l.key}>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => mobileGoTo(l.key)}
                    className={`flex-1 text-left px-3 py-2.5 text-base font-medium rounded-md transition-colors ${
                      activePage === l.key ? "text-[#d4af37] bg-[#1e293b]" : "text-[#e7ecf5] hover:bg-[#1e293b]"
                    }`}
                  >
                    {l.label}
                  </button>
                  <button
                    aria-label={`Toggle ${l.label} submenu`}
                    onClick={() => setMobileSubOpen(mobileSubOpen === l.key ? null : l.key)}
                    className="px-3 py-2.5 text-[#93a1b8]"
                  >
                    <span className={`inline-block transition-transform ${mobileSubOpen === l.key ? "rotate-180" : ""}`}>▾</span>
                  </button>
                </div>
                {mobileSubOpen === l.key && (
                  <div className="pl-3 pb-1 space-y-1">
                    {l.items.map((it) => (
                      <button
                        key={it}
                        onClick={() => mobileGoTo(l.key)}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg text-[#e7ecf5] hover:bg-[#1e293b] hover:text-[#34d399] transition-colors"
                      >
                        {it}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {isAdmin && (
            <button
              onClick={() => mobileGoTo("admin")}
              className="w-full text-left px-3 py-2.5 text-base font-medium rounded-md text-[#d4af37] hover:bg-[#1e293b]"
            >
              Admin Panel
            </button>
          )}
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
