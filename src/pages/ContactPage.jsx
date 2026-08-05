import React from "react";
import ContactForm from "../components/ContactForm";

/*
  The address / phone / hours cards that used to sit beside the form are gone:
  this route carries the footer, which states all of it already. Repeating them
  a screen apart just creates two places to keep in sync.
*/
export default function ContactPage() {
  return (
    <div className="w-full max-w-2xl mx-auto px-6 sm:px-10 lg:px-12 py-8 sm:py-10">
      <h1 className="font-display text-3xl sm:text-4xl mb-3 text-[#e7ecf5]">Contact Us</h1>
      <p className="text-base text-[#93a1b8] mb-8">
        Tell us about your child and we will get back to you within a day.
      </p>

      <div className="bg-[#1e293b] border border-[#2d3b53] rounded-2xl p-6 sm:p-8">
        <ContactForm />
      </div>
    </div>
  );
}
