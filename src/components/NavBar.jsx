import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import AuthModal from "./AuthModal";
import { NAV_LINKS, COURSES_DROPDOWN } from "../data/mockData";

/** Route path for a nav key, e.g. ("courses", "chess") -> "/courses/chess". */
function pathFor(page, detail = null) {
  if (page === "home") return "/";
  return detail ? `/${page}/${detail}` : `/${page}`;
}

export default function NavBar({ navRef, openDropdown, setOpenDropdown, profileOpen, setProfileOpen }) {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSubOpen, setMobileSubOpen] = useState(null);
  const mobilePanelRef = useRef(null);
  const displayName = profile?.name || user?.email || "";
  const initial = displayName ? displayName.charAt(0).toUpperCase() : "?";
  const isAdmin = profile?.role === "admin";
  const activePage = location.pathname === "/" ? "home" : location.pathname.split("/")[1];

  const closeMobile = useCallback(() => {
    setMobileMenuOpen(false);
    setMobileSubOpen(null);
  }, []);

  useEffect(() => {
    function onClick(e) {
      if (
        mobilePanelRef.current &&
        !mobilePanelRef.current.contains(e.target) &&
        navRef.current &&
        !navRef.current.contains(e.target)
      ) {
        closeMobile();
      }
    }
    function onResize() {
      if (window.innerWidth >= 1024) closeMobile();
    }
    // Every popup in the nav closes on Escape. Without this a keyboard user
    // who opened a dropdown had no way to dismiss it at all.
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      setOpenDropdown(null);
      setProfileOpen(false);
      closeMobile();
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [navRef, closeMobile, setOpenDropdown, setProfileOpen]);

  const desktopLinkClass = (key) =>
    `px-3 py-2 text-base font-medium rounded-md transition-colors ${
      activePage === key ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
    }`;

  const mobileLinkClass = (key) =>
    `block w-full text-left px-3 py-2.5 text-base font-medium rounded-md transition-colors ${
      activePage === key ? "text-[#d4af37] bg-[#1e293b]" : "text-[#e7ecf5] hover:bg-[#1e293b]"
    }`;

  return (
    <>
      {/* `relative` so the mobile panel can overlay the page instead of being
          laid out in the flex column, where it squeezed <main> to a sliver. */}
      <div className="relative z-30 shrink-0">
        <nav
          ref={navRef}
          className="border-b border-[#d4af37]/25 bg-[#151f36]/95 backdrop-blur px-4 sm:px-8 py-3 flex items-center justify-between"
        >
          <Link to="/" className="flex items-center shrink-0 hover:opacity-90 transition-opacity">
            <img
              src="/educhess_title.png"
              alt="EduChess"
              className="h-10 sm:h-10 w-auto object-contain"
            />
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((l) => {
              if (l.key === "courses") {
                const open = openDropdown === "courses";
                return (
                  <div
                    key={l.key}
                    className="relative flex items-center"
                    onMouseEnter={() => setOpenDropdown("courses")}
                    onMouseLeave={() => setOpenDropdown((d) => (d === "courses" ? null : d))}
                  >
                    <Link
                      to="/courses"
                      aria-current={activePage === "courses" ? "page" : undefined}
                      className={`pl-3 pr-1.5 py-2 text-base font-medium rounded-l-md transition-colors ${
                        activePage === "courses" ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                      }`}
                    >
                      {l.label}
                    </Link>
                    <button
                      type="button"
                      aria-label="Toggle courses menu"
                      aria-expanded={open}
                      aria-haspopup="true"
                      onClick={() => setOpenDropdown(open ? null : "courses")}
                      className={`pl-1 pr-2.5 py-2 text-sm rounded-r-md transition-colors ${
                        open ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                      }`}
                    >
                      <span className={`inline-block transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
                    </button>
                    {open && (
                      <div className="absolute top-full mt-2 left-0 w-64 bg-[#1e293b] border border-[#2d3b53] rounded-xl shadow-2xl p-2 z-40">
                        {COURSES_DROPDOWN.map((c) => (
                          <Link
                            key={c.key}
                            to={pathFor("courses", c.key)}
                            onClick={() => setOpenDropdown(null)}
                            className="w-full flex items-center justify-between px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399] transition-colors"
                          >
                            <span>
                              {c.label} <span className="text-[#93a1b8] text-sm">({c.tag})</span>
                            </span>
                          </Link>
                        ))}
                        <div className="my-1 border-t border-[#2d3b53]" />
                        <Link
                          to="/courses"
                          onClick={() => setOpenDropdown(null)}
                          className="w-full flex items-center justify-between px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399] transition-colors"
                        >
                          <span>All courses</span>
                          <span className="text-[#d4af37]">→</span>
                        </Link>
                      </div>
                    )}
                  </div>
                );
              }

              if (["about", "workshops", "puzzles", "tournaments", "contact"].includes(l.key)) {
                return (
                  <Link
                    key={l.key}
                    to={pathFor(l.key)}
                    aria-current={activePage === l.key ? "page" : undefined}
                    className={desktopLinkClass(l.key)}
                  >
                    {l.label}
                  </Link>
                );
              }

              const open = openDropdown === l.key;
              return (
                <div key={l.key} className="relative">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-haspopup="true"
                    onClick={() => setOpenDropdown(open ? null : l.key)}
                    className={`px-3 py-2 text-base font-medium rounded-md transition-colors ${
                      activePage === l.key || open ? "text-[#d4af37] bg-[#1e293b]" : "text-[#93a1b8] hover:text-[#e7ecf5]"
                    }`}
                  >
                    {l.label}
                  </button>
                  {open && (
                    <div className="absolute top-full mt-2 left-0 w-64 bg-[#1e293b] border border-[#2d3b53] rounded-xl shadow-2xl p-2 z-40">
                      {l.items.map((it) => (
                        <Link
                          key={it}
                          to={pathFor(l.key)}
                          onClick={() => setOpenDropdown(null)}
                          className="block w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a] hover:text-[#34d399] transition-colors"
                        >
                          {it}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Practice is intentionally outside the collapsible nav — always
                reachable as a standalone icon, even on mobile with the
                hamburger collapsed. */}
            <Link
              to="/practice"
              aria-label="Practice vs Engine"
              aria-current={activePage === "practice" ? "page" : undefined}
              title="Practice vs Engine"
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-md border transition-colors shrink-0 ${
                activePage === "practice"
                  ? "border-[#d4af37] text-[#d4af37] bg-[#1e293b]"
                  : "border-[#2d3b53] text-[#93a1b8] hover:text-[#e7ecf5] hover:border-[#d4af37]/50"
              }`}
            >
              <span className="text-lg leading-none">♞</span>
              <span className="hidden sm:inline text-sm font-medium">Practice</span>
            </Link>

            <div className="relative">
              {!user ? (
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="px-3 sm:px-4 py-2 rounded-md bg-[#d4af37] text-[#0f172a] font-semibold text-sm sm:text-base hover:bg-[#f0d98c] transition-colors"
                >
                  Login
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    aria-expanded={profileOpen}
                    aria-haspopup="true"
                    aria-label={`Account menu for ${displayName}`}
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-[#1e293b] border border-[#2d3b53] hover:border-[#d4af37]/50 transition-colors"
                  >
                    <span className="w-7 h-7 rounded-full bg-[#d4af37] text-[#0f172a] flex items-center justify-center font-display text-base shrink-0">
                      {initial}
                    </span>
                    <span className="text-base text-[#e7ecf5] hidden sm:inline">{displayName}</span>
                  </button>
                  {profileOpen && (
                    <div className="absolute top-full mt-2 right-0 w-48 bg-[#1e293b] border border-[#2d3b53] rounded-xl shadow-2xl p-2 z-40">
                      <p className="px-3 py-1 text-xs font-mono text-[#93a1b8] uppercase tracking-wide truncate">
                        {displayName}
                      </p>
                      <Link
                        to="/dashboard"
                        onClick={() => setProfileOpen(false)}
                        className="block w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a]"
                      >
                        Dashboard
                      </Link>
                      <Link
                        to="/mylearning"
                        onClick={() => setProfileOpen(false)}
                        className="block w-full text-left px-3 py-2 text-base rounded-lg text-[#e7ecf5] hover:bg-[#0f172a]"
                      >
                        My Learning
                      </Link>
                      {isAdmin && (
                        <Link
                          to="/admin"
                          onClick={() => setProfileOpen(false)}
                          className="block w-full text-left px-3 py-2 text-base rounded-lg text-[#d4af37] hover:bg-[#0f172a]"
                        >
                          Admin Panel
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          signOut();
                          setProfileOpen(false);
                        }}
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
              type="button"
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

        {/* Mobile menu panel — absolutely positioned so it floats over the page */}
        {mobileMenuOpen && (
          <div
            ref={mobilePanelRef}
            className="lg:hidden absolute top-full inset-x-0 z-40 border-b border-[#d4af37]/25 bg-[#151f36] shadow-2xl px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto scrollbar-thin"
          >
            {NAV_LINKS.map((l) => {
              if (l.key === "courses") {
                const subOpen = mobileSubOpen === "courses";
                return (
                  <div key={l.key}>
                    <div className="flex items-center justify-between">
                      <Link to="/courses" onClick={closeMobile} className={`flex-1 ${mobileLinkClass("courses")}`}>
                        {l.label}
                      </Link>
                      <button
                        type="button"
                        aria-label="Toggle courses submenu"
                        aria-expanded={subOpen}
                        onClick={() => setMobileSubOpen(subOpen ? null : "courses")}
                        className="px-3 py-2.5 text-[#93a1b8]"
                      >
                        <span className={`inline-block transition-transform ${subOpen ? "rotate-180" : ""}`}>▾</span>
                      </button>
                    </div>
                    {subOpen && (
                      <div className="pl-3 pb-1 space-y-1">
                        {COURSES_DROPDOWN.map((c) => (
                          <Link
                            key={c.key}
                            to={pathFor("courses", c.key)}
                            onClick={closeMobile}
                            className="block w-full text-left px-3 py-2 text-sm rounded-lg text-[#e7ecf5] hover:bg-[#1e293b] hover:text-[#34d399] transition-colors"
                          >
                            {c.label} <span className="text-[#93a1b8] text-xs">({c.tag})</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              if (["about", "workshops", "puzzles", "tournaments"].includes(l.key)) {
                return (
                  <Link key={l.key} to={pathFor(l.key)} onClick={closeMobile} className={mobileLinkClass(l.key)}>
                    {l.label}
                  </Link>
                );
              }

              const subOpen = mobileSubOpen === l.key;
              return (
                <div key={l.key}>
                  <div className="flex items-center justify-between">
                    <Link to={pathFor(l.key)} onClick={closeMobile} className={`flex-1 ${mobileLinkClass(l.key)}`}>
                      {l.label}
                    </Link>
                    <button
                      type="button"
                      aria-label={`Toggle ${l.label} submenu`}
                      aria-expanded={subOpen}
                      onClick={() => setMobileSubOpen(subOpen ? null : l.key)}
                      className="px-3 py-2.5 text-[#93a1b8]"
                    >
                      <span className={`inline-block transition-transform ${subOpen ? "rotate-180" : ""}`}>▾</span>
                    </button>
                  </div>
                  {subOpen && (
                    <div className="pl-3 pb-1 space-y-1">
                      {l.items.map((it) => (
                        <Link
                          key={it}
                          to={pathFor(l.key)}
                          onClick={closeMobile}
                          className="block w-full text-left px-3 py-2 text-sm rounded-lg text-[#e7ecf5] hover:bg-[#1e293b] hover:text-[#34d399] transition-colors"
                        >
                          {it}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={closeMobile}
                className="block w-full text-left px-3 py-2.5 text-base font-medium rounded-md text-[#d4af37] hover:bg-[#1e293b]"
              >
                Admin Panel
              </Link>
            )}
          </div>
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
