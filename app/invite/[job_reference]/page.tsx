import { InviteClient } from "./InviteClient";

// ── Thin server wrapper — reads params + searchParams, passes to client ────────

export default async function InvitePage({
  params,
  searchParams,
}: {
  params:       Promise<{ job_reference: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { job_reference } = await params;
  const { token = "" }    = await searchParams;

  return <InviteClient jobReference={job_reference} token={token} />;
}
