import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { supabase } from "../lib/supabaseClient";
import { getPublicStorageUrl, GALLERY_BUCKET } from "../lib/media";
import { CORPORATE_DETAILS } from "../data/mockData";
import PlanCard, { usePlanCheckout } from "../components/PlanCard";
import { TIER_LIST } from "../lib/tiers";

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
    desc: "Chess is the whole programme, not an add-on to something else. Every lesson is built around the board.",
  },
];

const MILESTONES = [
  { year: "2016", label: "EduChess founded in Gajuwaka" },
  { year: "5000+", label: "Students actively coached across all levels" },
  { year: "2", label: "Offline academies across Visakhapatnam" },
  { year: "100k+", label: "Tactics puzzles available to practise" },
];

export default function AboutPage() {
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState("");
  const checkout = usePlanCheckout();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("gallery_images")
      .select("*")
      .eq("published", true)
      .eq("category", "about")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setGalleryError("The gallery couldn't load right now. Please refresh the page.");
        } else {
          setGalleryImages(data || []);
        }
        setGalleryLoading(false);
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
          EduChess
        </h1>
        <p className="text-base sm:text-lg text-ink-dim max-w-3xl leading-relaxed">
          Founded in Gajuwaka, Visakhapatnam, EduChess exists for one reason: chess taught well makes
          better thinkers. We coach every level, from a child learning how the pieces move to a player
          preparing for rated tournaments.
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

      {!galleryLoading && galleryError && (
        <p className="mt-14 text-sm text-[#f87171]">{galleryError}</p>
      )}

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
                {/* object-contain: show the whole photo whatever its shape. */}
                <img
                  src={getPublicStorageUrl(GALLERY_BUCKET, img.storage_path)}
                  alt={img.caption || "EduChess"}
                  className="w-full aspect-video object-contain bg-void"
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
        {/* The same cards and the same checkout as /upgrade. This block used
            to end in "Enquire About This Tier" pointing at the contact form,
            which was two different answers to one question once /upgrade
            could actually take the money. The motion wrapper carries only the
            animation now; the card brings its own styling. */}
        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {TIER_LIST.map((t, i) => (
            <motion.div
              key={t.key}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeUp}
              transition={{ duration: 0.45, delay: i * 0.1 }}
            >
              <PlanCard tier={t} checkout={checkout} />
            </motion.div>
          ))}
        </div>
        <p className="text-sm text-ink-dim mt-6">
          Plans cover what your child uses on the site. Coaching at either academy is arranged in
          person and billed separately —{" "}
          <Link to="/contact" className="text-brand-emerald hover:text-[#6ee7b7]">
            talk to us about coaching
          </Link>
          .
        </p>
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
          <Button asChild variant="outline">
            <Link to="/courses">Explore Programs</Link>
          </Button>
          <Button asChild>
            <Link to="/contact">Talk to Us</Link>
          </Button>
        </div>
      </motion.div>

      {/* A signed-out visitor who clicks "Get Pro" needs an account before
          there is anyone to sell a membership to. */}
      {checkout.authModal}
    </div>
  );
}
