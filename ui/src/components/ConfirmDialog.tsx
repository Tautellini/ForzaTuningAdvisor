import type { ReactNode } from "react";

export interface DialogAction {
  label: string;
  kind?: "primary" | "tonal" | "ghost" | "danger";
  onClick: () => void;
}

/** MD3-style modal dialog. Backdrop clicks do nothing — choices are explicit. */
export function ConfirmDialog({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions: DialogAction[];
}) {
  return (
    <div className="dlg-scrim">
      <div className="dlg" role="dialog" aria-modal="true" aria-label={title}>
        <h3 className="dlg-title">{title}</h3>
        {children && <div className="dlg-body">{children}</div>}
        <div className="dlg-actions">
          {actions.map((a) => (
            <button key={a.label} className={`dlg-btn ${a.kind ?? "ghost"}`} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
