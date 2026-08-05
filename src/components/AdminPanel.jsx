import React, { useState } from "react";
import AdminVideos from "./admin/AdminVideos";
import AdminCarousels from "./admin/AdminCarousels";
import AdminTestimonials from "./admin/AdminTestimonials";
import AdminGallery from "./admin/AdminGallery";
import AdminTournaments from "./admin/AdminTournaments";
import AdminWorkshops from "./admin/AdminWorkshops";
import AdminMembers from "./admin/AdminMembers";
import EnquiriesInbox from "./admin/EnquiriesInbox";

const TABS = [
  { key: "videos", label: "Videos", Component: AdminVideos },
  { key: "carousels", label: "Carousels", Component: AdminCarousels },
  { key: "testimonials", label: "Testimonials", Component: AdminTestimonials },
  { key: "gallery", label: "Gallery", Component: AdminGallery },
  { key: "tournaments", label: "Tournaments", Component: AdminTournaments },
  { key: "workshops", label: "Workshops", Component: AdminWorkshops },
  { key: "members", label: "Members", Component: AdminMembers },
  { key: "enquiries", label: "Enquiries", Component: EnquiriesInbox },
];

export default function AdminPanel() {
  const [tab, setTab] = useState(TABS[0].key);
  const Active = TABS.find((t) => t.key === tab)?.Component || AdminVideos;

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-[#2d3b53] mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 font-display text-base border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-[#d4af37] text-[#d4af37]" : "border-transparent text-[#93a1b8] hover:text-[#e7ecf5]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}
