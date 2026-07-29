import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import CountUp from "../components/CountUp";
import { supabase } from "../lib/supabaseClient";
import { getPublicStorageUrl, GALLERY_BUCKET } from "../lib/media";
import { CORPORATE_DETAILS, PRICING_TIERS } from "../data/mockData";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const VALUES = [
  {
    icon: "♚",
    title: "Discipline, on and off the board",
    desc: "Every quest, tournament, and homework drill reinforces the same habit: think before you move.",
  },
  {
    icon: "♞",
    title: "Local roots, global standard",
    desc: "Based in Gajuwaka, Visakhapatnam, coached to FIDE-aligned curricula and international tournament prep.",
  },
  {
    icon: "♟",
    title: "Chess-first, always",
    desc: "Chess is our primary course. Maths and English are separate courses we also teach — not a chess add-on.",
  },
];

const MILESTONES = [
  { year: "Est.", label: "Champion Chess Academy founded in Gajuwaka" },
  { year: "5000+", label: "Students actively coached across all levels" },
  { year: "3", label: "Courses offered: Chess, Maths, English" },
  { year: "1000s", label: "Quests and puzzles cleared on the platform" },
];

export default function AboutPage() {
  const navigate = useNavigate();
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("gallery_images")
      .select("*")
      .eq("published", true)
      .eq("category", "about")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setGalleryImages(data || []);
          setGalleryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.5 }}>
        <span className="font-mono text-sm tracking-[0.3em] text-brand-emerald uppercase">Our Story</span>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl mt-3 mb-5 text-ink leading-tight">
          Champion Chess Academy
        </h1>
        <p className="text-base sm:text-lg text-ink-dim max-w-3xl leading-relaxed">
          Founded in Gajuwaka, Visakhapatnam, Champion Chess Academy exists for one reason: chess taught
          well makes better thinkers, and better thinkers make better students. Chess is our primary
          course — tournament-ready strategy coaching for every level — and alongside it we run separate
          Maths and English courses for families who want more, all under one roof.
        </p>
      </motion.div>

      <motion.div
        className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 bg-panel/40 border border-line rounded-2xl p-6 sm:p-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={fadeUp}
        transition={{ duration: 0.5 }}
      >
        {MILESTONES.map((m) => (
          <div key={m.label} className="text-center">
            <p className="font-display text-2xl sm:text-3xl text-gold">{m.year}</p>
            <p className="text-sm text-ink-dim mt-1">{m.label}</p>
          </div>
        ))}
      </motion.div>

      <div className="mt-14">
        <motion.h2
          className="font-display text-2xl sm:text-3xl text-ink mb-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          variants={fadeUp}
          transition={{ duration: 0.5 }}
        >
          What we stand for
        </motion.h2>
        <div className="grid md:grid-cols-3 gap-5">
          {VALUES.map((v, i) => (
            <motion.div
              key={v.title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.4 }}
              variants={fadeUp}
              transition={{ duration: 0.45, delay: i * 0.1 }}
            >
              <Card className="h-full">
                <CardContent>
                  <span className="text-4xl text-gold block mb-4">{v.icon}</span>
                  <h3 className="font-display text-lg text-ink mb-2">{v.title}</h3>
                  <p className="text-sm text-ink-dim leading-relaxed">{v.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div
        className="mt-14 grid sm:grid-cols-3 gap-4 sm:gap-6 bg-panel/40 border border-line rounded-2xl p-6 sm:p-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={fadeUp}
        transition={{ duration: 0.5 }}
      >
        {[
          { to: 4870, suffix: "+", label: "Students ranked up" },
          { to: 96, suffix: "%", label: "Parent satisfaction" },
          { to: 58, suffix: "", label: "Cognitive Arenas run" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-display text-3xl sm:text-4xl text-gold">
              <CountUp to={s.to} suffix={s.suffix} />
            </p>
            <p className="text-sm text-ink-dim mt-1">{s.label}</p>
          </div>
        ))}
      </motion.div>

      {!galleryLoading && galleryImages.length > 0 && (
        <div className="mt-14">
          <motion.h2
            className="font-display text-2xl sm:text-3xl text-ink mb-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            variants={fadeUp}
            transition={{ duration: 0.5 }}
          >
            Life at the Academy
          </motion.h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {galleryImages.map((img) => (
              <div key={img.id} className="rounded-2xl overflow-hidden border border-line bg-panel">
                <img
                  src={getPublicStorageUrl(GALLERY_BUCKET, img.storage_path)}
                  alt={img.caption || "Champion Chess Academy"}
                  className="w-full aspect-video object-cover"
                />
                {img.caption && <p className="text-sm text-ink-dim p-4">{img.caption}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-14">
        <motion.h2
          className="font-display text-2xl sm:text-3xl text-ink mb-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          variants={fadeUp}
          transition={{ duration: 0.5 }}
        >
          Programs &amp; Pricing
        </motion.h2>
        <div className="grid md:grid-cols-3 gap-6">
          {PRICING_TIERS.map((t, i) => (
            <motion.div
              key={t.name}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeUp}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className={`rounded-2xl p-6 border flex flex-col ${
                t.highlight ? "bg-panel border-gold shadow-2xl scale-[1.02]" : "bg-panel/70 border-line"
              }`}
            >
              <span className="font-mono text-sm uppercase tracking-widest text-brand-emerald">{t.tag}</span>
              <h3 className="font-display text-2xl mt-2 text-ink">{t.medal} {t.name}</h3>
              <p className="font-mono text-3xl text-gold mt-3">{t.price}</p>
              <p className="text-base text-ink-dim mt-3 flex-1">{t.desc}</p>
              <ul className="mt-4 space-y-2">
                {t.features.map((f) => (
                  <li key={f} className="text-base text-ink flex gap-2"><span className="text-gold">♟</span>{f}</li>
                ))}
              </ul>
              <Button
                variant={t.highlight ? "default" : "outline"}
                className="mt-6 w-full"
                onClick={() => navigate("/contact")}
              >
                Enquire About This Tier
              </Button>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div
        className="mt-14 bg-panel border border-line rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.4 }}
        variants={fadeUp}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h2 className="font-display text-xl sm:text-2xl text-ink mb-2">Come see the academy in person</h2>
          <p className="text-sm text-ink-dim">{CORPORATE_DETAILS.find((c) => c.l === "HQ Location")?.v}</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <Button variant="outline" onClick={() => navigate("/courses")}>
            Explore Programs
          </Button>
          <Button onClick={() => navigate("/contact")}>Talk to Us</Button>
        </div>
      </motion.div>
    </div>
  );
}
