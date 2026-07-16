import { isNull } from 'drizzle-orm';
import { db, villages, wards } from '@an/db';
import { getServerAuthOrRedirect } from '@/lib/server-auth';
import { AddHub } from '@/components/add-hub';

export const runtime = 'nodejs';

// /add — the layman "Add data" hub. One clear place for a non-technical field worker
// to add a Church, Mosque, Polling Station, or Team Member, with cascading Ward →
// Village dropdowns, required-field gating, and a live list of what they just added.
// Reference data (wards + villages) is read directly — it is non-sensitive lookup
// data used only to populate dropdowns (same posture as the Team directory).

// Roles that may add polling stations (RLS: leadership) and team members
// (/api/team/create). Field workers still get the Church/Mosque tiles.
const PRIVILEGED = new Set([
  'candidate', 'campaign_manager', 'chief_strategist', 'constituency_coordinator', 'tech_lead',
]);

export default async function AddPage() {
  const claims = await getServerAuthOrRedirect();

  const [wardRows, villageRows] = await Promise.all([
    db.select({ id: wards.id, name: wards.name }).from(wards).orderBy(wards.name),
    db
      .select({ id: villages.id, name: villages.name, wardId: villages.wardId })
      .from(villages)
      .where(isNull(villages.deletedAt))
      .orderBy(villages.name),
  ]);

  const villagesByWard: Record<string, { id: string; name: string }[]> = {};
  for (const v of villageRows) {
    (villagesByWard[v.wardId] ??= []).push({ id: v.id, name: v.name });
  }

  const privileged = PRIVILEGED.has(claims.role);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-brand-textActive">Add to the map</h1>
        <p className="text-sm text-brand-textMuted">
          Pick a type, fill the required boxes, tap Save.
        </p>
      </header>

      <AddHub
        wards={wardRows}
        villagesByWard={villagesByWard}
        canAddTeam={privileged}
        canAddPolling={privileged}
        defaultWardId={claims.wardId ?? null}
      />
    </div>
  );
}
