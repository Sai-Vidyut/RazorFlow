"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { Button, Input, Panel } from "@/components/ui/design-system";

type StaffMember = {
  id: string;
  email: string;
  createdAt: string;
  accountVerified: boolean;
  accountEmail: string | null;
};

export function AdminStaffClient() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const loadStaff = useCallback(async () => {
    const response = await fetch("/api/admin/staff", { credentials: "include" });
    if (response.status === 403) {
      setForbidden(true);
      return;
    }
    if (!response.ok) {
      setError("Could not load staff list");
      return;
    }
    const payload = (await response.json()) as { staff: StaffMember[] };
    setStaff(payload.staff);
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not add staff email");
      }
      setEmail("");
      await loadStaff();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add staff email");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/staff", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not remove staff email");
      }
      await loadStaff();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove staff email");
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <AdminLayoutClient>
        <Panel title="Staff access" step="—">
          <p className="text-sm text-muted">Administrator access is required to manage staff.</p>
        </Panel>
      </AdminLayoutClient>
    );
  }

  return (
    <AdminLayoutClient>
      <Panel title="Staff allowlist" step="01">
        <p className="mb-4 text-sm text-muted">
          Add email addresses that may receive staff access after the user registers and verifies
          ownership. Adding an email does not create an account.
        </p>
        <form className="mb-6 flex flex-wrap gap-2" onSubmit={onAdd}>
          <Input
            type="email"
            placeholder="staff@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="min-w-[16rem] flex-1"
          />
          <Button type="submit" loading={busy}>
            Add staff email
          </Button>
        </form>
        {error ? (
          <p className="mb-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line/70 text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Verified account</th>
                <th className="py-2 pr-4 font-medium">Added</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-b border-line/40">
                  <td className="py-3 pr-4 font-medium">{member.email}</td>
                  <td className="py-3 pr-4 text-muted">
                    {member.accountVerified ? "Yes" : "No account yet"}
                  </td>
                  <td className="py-3 pr-4 text-muted">
                    {new Date(member.createdAt).toLocaleDateString("en-IN")}
                  </td>
                  <td className="py-3">
                    <Button
                      type="button"
                      variant="secondary"
                      loading={busy}
                      onClick={() => void onRemove(member.id)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AdminLayoutClient>
  );
}
