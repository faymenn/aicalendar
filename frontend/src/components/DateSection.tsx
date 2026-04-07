"use client";

import { useState } from "react";

type DateSectionProps = {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  muted?: boolean;
  suppressBottomDivider?: boolean;
};

export default function DateSection({
  label,
  children,
  defaultOpen = true,
  muted = false,
  suppressBottomDivider = false,
}: DateSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const superscriptLabel = formatLabelWithSuperscript(label);

  return (
    <section className={suppressBottomDivider ? "dateSection noDivider" : "dateSection"}>
      <button
        type="button"
        className={muted ? "dateBanner muted" : "dateBanner"}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className={muted ? "dateLabel muted" : "dateLabel"}>
          {superscriptLabel}
        </span>
      </button>

      {isOpen && <div className="dateTasks">{children}</div>}
    </section>
  );
}

function formatLabelWithSuperscript(label: string) {
  const match = label.match(/^(\d+)(st|nd|rd|th)\s+(.*)$/i);
  if (!match) {
    return label;
  }
  const [, day, suffix, remainder] = match;
  return (
    <>
      {day}
      <sup>{suffix}</sup> {remainder}
    </>
  );
}
