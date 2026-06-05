import { useState, type ReactNode } from "react";

/**
 * Collapsible analysis card. The header always shows a compact status (mini)
 * so a collapsed card still communicates its overall state; open/closed
 * persists per card.
 */
export function VizCard({
  id,
  title,
  mini,
  headExtra,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: ReactNode;
  /** Always-visible compact status, the whole card's content when collapsed. */
  mini?: ReactNode;
  /** Extra header content (legends, info dots) shown only while open. */
  headExtra?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const KEY = `fta.viz.${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    const v = localStorage.getItem(KEY);
    return v == null ? defaultOpen : v === "1";
  });
  const toggle = () =>
    setOpen((o) => {
      localStorage.setItem(KEY, o ? "0" : "1");
      return !o;
    });

  return (
    <section className={`viz-card ${open ? "" : "viz-closed"}`}>
      <button className="viz-toggle" onClick={toggle} aria-expanded={open}>
        <h3>{title}</h3>
        {open && headExtra}
        {mini != null && <span className="viz-mini">{mini}</span>}
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="viz-body">{children}</div>}
    </section>
  );
}
