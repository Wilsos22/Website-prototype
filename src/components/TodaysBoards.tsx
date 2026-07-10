"use client";

// Shows the board snapshots the teacher exported for a given date, so absent
// students can see the worked solutions. Reads the public "boards" Supabase
// Storage bucket (boards/<date>/<timestamp>.png). Renders nothing if empty.

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export default function TodaysBoards({ date }: { date: string | null }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !date) return;
    let stop = false;
    const load = async () => {
      const { data, error } = await supabase.storage
        .from("boards")
        .list(date, { sortBy: { column: "created_at", order: "asc" } });
      if (error || !data) return;
      const next = data
        .filter((f) => f.name.toLowerCase().endsWith(".png"))
        .map((f) => supabase.storage.from("boards").getPublicUrl(`${date}/${f.name}`).data.publicUrl);
      if (!stop) setUrls(next);
    };
    void load();
    const id = window.setInterval(load, 15000); // pick up new saves during class
    return () => { stop = true; window.clearInterval(id); };
  }, [date]);

  if (urls.length === 0) return null;

  return (
    <section className="ls-section ls-boards">
      <div className="ls-section-head">
        <div>
          <p className="ls-eyebrow">Worked solutions</p>
          <h2 className="ls-h2">What was shown on the board</h2>
          <p className="ls-section-copy">Use these if you were absent or need to check the model from class.</p>
        </div>
      </div>
      <div className="ls-board-list">
        {urls.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="ls-board-link">
            <img
              src={u}
              alt={`Board ${i + 1}`}
              className="ls-board-image"
            />
          </a>
        ))}
      </div>
    </section>
  );
}
