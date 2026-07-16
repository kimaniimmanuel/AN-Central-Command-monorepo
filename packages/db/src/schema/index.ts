// Schema barrel — single import surface for the rest of the platform.
//
// All Drizzle schema tables and inferred types are re-exported from here.
// Consumers should `import { wards, communityLeaders } from '@an/db'` rather than
// reaching into specific schema files directly.
//
// Domain clusters (ARC §6 ERD):
//   audit       — append-only cross-cutting log (NFR-050)
//   geography   — constituency → ward → sub-location → village → polling station
//   identity    — people, auth_credentials, sessions (FR-001 to FR-004)
//   community   — community_leaders, community_sites, village_issues (FR-020 to FR-030)
//   activities  — activities, visits, meetings (FR-040 to FR-060)
//   supporters  — community_programs, committed_supporters, consent_log (FR-130 to FR-134) — RESTRICTED
//   election    — station_reports, incidents (FR-120 to FR-122)
//
// Tables defined: 20.
// Tables still pending v2.0+: opposition_candidates, opposition_assessments (FR-072
// strategic notes — deferred until the strategy.ts cluster is added).

export * from './audit';
export * from './geography';
export * from './identity';
export * from './community';
export * from './activities';
export * from './supporters';
export * from './election';
export * from './voters';
export * from './flames';
export * from './whatsapp';
