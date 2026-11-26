"use client";

import { useEffect, useRef, useState } from "react";

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="kpi">
      <b className="block text-xl tabular-nums">{value}</b>
      <span className="text-xs text-mut">{label}</span>
    </div>
  );
}

export function Big({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="big">
      <small className="opacity-85">{label}</small>
      <b className="my-1 block text-2xl sm:text-3xl">{children}</b>
      {sub && <small className="opacity-85">{sub}</small>}
    </div>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-mut">{children}</p>;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "default"; small?: boolean };
export function Button({ variant = "default", small, className = "", ...p }: BtnProps) {
  return <button type="button" {...p} className={`btn ${variant === "primary" ? "btn-p" : variant === "danger" ? "btn-d" : ""} ${small ? "btn-s" : ""} ${className}`} />;
}

/** Tableau défilable horizontalement à l'intérieur de sa carte (jamais la page). */
export function Table({ heads, nums = [], children }: { heads: string[]; nums?: number[]; children: React.ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="tbl">
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i} className={nums.includes(i) ? "n" : ""}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="dlg" aria-label={title}>
      {open && (
        <>
          <h2 className="mb-2 text-lg font-bold">{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

export function FormActions({ onCancel, busy, extra }: { onCancel: () => void; busy?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      {extra}
      <Button onClick={onCancel}>Annuler</Button>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </div>
  );
}

export function ErrorMsg({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-3 rounded-lg bg-bad/10 px-3 py-2 text-sm font-semibold text-bad">
      {children}
    </p>
  );
}

/** Demande de confirmation avant une action destructive. */
export function useConfirm() {
  const [state, setState] = useState<{ msg: string; ok: () => Promise<void> | void } | null>(null);
  const [busy, setBusy] = useState(false);
  const node = (
    <Modal open={!!state} onClose={() => setState(null)} title="Confirmer">
      <p>{state?.msg}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={() => setState(null)}>Annuler</Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await state?.ok();
            } finally {
              setBusy(false);
              setState(null);
            }
          }}
        >
          Confirmer
        </Button>
      </div>
    </Modal>
  );
  return { ask: (msg: string, ok: () => Promise<void> | void) => setState({ msg, ok }), node };
}

/** Lien de téléchargement d'un export CSV (fichier, pas une page : pas de <Link>). */
export function ExportLink({ table, children, small }: { table: string; children: React.ReactNode; small?: boolean }) {
  return (
    <a className={`btn ${small ? "btn-s" : ""} inline-flex items-center`} href={`/export/${table}`} download>
      {children}
    </a>
  );
}
