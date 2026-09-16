import { requireOwner } from "@/lib/auth/session";
import { WorkerForm } from "@/components/workers/worker-form";
import { createWorker } from "@/app/(app)/workers/actions";
import { BackButton } from "@/components/shared/back-button";

export default async function NewWorkerPage() {
  await requireOwner();

  return (
    <div className="mx-auto max-w-lg">
      <BackButton href="/workers" />
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Add Worker</h1>
      <WorkerForm onSubmit={createWorker} submitLabel="Create Worker" />
    </div>
  );
}
