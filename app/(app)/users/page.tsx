import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm } from "@/components/users/create-user-form";
import { UserRow } from "@/components/users/user-row";

export default async function UsersPage() {
  const profile = await requireOwner();
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .order("full_name");

  return (
    <div className="mx-auto grid max-w-3xl gap-8 md:grid-cols-2">
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-foreground">Users</h1>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(profiles ?? []).map((p) => (
            <UserRow
              key={p.id}
              id={p.id}
              fullName={p.full_name}
              role={p.role}
              active={p.active}
              isSelf={p.id === profile.id}
            />
          ))}
        </ul>
      </div>
      <div>
        <h2 className="mb-4 text-lg font-medium text-foreground">Add User</h2>
        <CreateUserForm />
      </div>
    </div>
  );
}
