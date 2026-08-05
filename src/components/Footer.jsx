import React from "react";
import { Link } from "react-router-dom";
import { CORPORATE_DETAILS } from "../data/mockData";

/*
  Site footer.

  Rendered inside <main> rather than as a sibling of it: <main> is the app's
  scroll container, so a footer outside it would be pinned to the viewport on
  every page instead of sitting at the end of the content.

  Addresses come from CORPORATE_DETAILS so the two academies, the phone number
  and the hours are stated in exactly one place. Contact details that drift
  between the footer and the contact page are a real support cost.
*/
export default function Footer() {
  const year = new Date().getFullYear();
  const find = (label) => CORPORATE_DETAILS.find((c) => c.l === label)?.v;

  const academies = [
    { name: "Gajuwaka", address: find("HQ Location") },
    { name: "VUDA Colony", address: find("Second Academy") },
  ].filter((a) => a.address);

  return (
    <footer className="border-t border-[#2d3b53] bg-[#151f36]/60 mt-16">
      <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-10 sm:py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <img src="/educhess_title.png" alt="EduChess" className="h-9 w-auto object-contain" />
            <p className="text-sm text-[#93a1b8] mt-4 leading-relaxed max-w-xs">
              A chess academy in Visakhapatnam. Coaching for every level, from first moves to rated
              tournament play.
            </p>
          </div>

          <nav aria-label="Footer">
            <h2 className="font-mono text-xs text-[#d4af37] uppercase tracking-widest mb-4">Explore</h2>
            <ul className="space-y-2.5">
              {[
                { to: "/courses", label: "Courses" },
                { to: "/puzzles", label: "Puzzles" },
                { to: "/practice", label: "Practice vs Engine" },
                { to: "/tournaments", label: "Tournaments" },
                { to: "/workshops", label: "Workshops" },
              ].map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-[#93a1b8] hover:text-[#d4af37] transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="font-mono text-xs text-[#d4af37] uppercase tracking-widest mb-4">Academy</h2>
            <ul className="space-y-2.5">
              {[
                { to: "/about", label: "About us" },
                { to: "/contact", label: "Contact" },
                { to: "/mylearning", label: "My learning" },
              ].map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-[#93a1b8] hover:text-[#d4af37] transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-sm text-[#93a1b8] mt-4">{find("Hours of Operation")}</p>
          </div>

          <div>
            <h2 className="font-mono text-xs text-[#d4af37] uppercase tracking-widest mb-4">
              Our academies
            </h2>
            <ul className="space-y-4">
              {academies.map((a) => (
                <li key={a.name}>
                  <p className="text-sm font-semibold text-[#e7ecf5]">{a.name}</p>
                  <p className="text-sm text-[#93a1b8] leading-relaxed">{a.address}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-[#2d3b53] mt-10 pt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-[#93a1b8]">© {year} EduChess. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a
              href={`mailto:${find("Email")}`}
              className="text-sm text-[#93a1b8] hover:text-[#d4af37] transition-colors"
            >
              {find("Email")}
            </a>
            <a
              href={`tel:${(find("Primary Direct Hotline") || "").replace(/\s/g, "")}`}
              className="text-sm text-[#93a1b8] hover:text-[#d4af37] transition-colors"
            >
              {find("Primary Direct Hotline")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
