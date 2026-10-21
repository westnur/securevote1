import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AuditEventRow,
  AuditReport,
  Candidate,
  Election,
  Eligibility,
  Health,
  OrgDetails,
  PublicConfig,
  Results,
  VoterRow,
} from "./types";

export const qk = {
  me: ["me"] as const,
  config: ["config"] as const,
  health: ["health"] as const,
  elections: ["elections"] as const,
  election: (id: string) => ["elections", id] as const,
  eligibility: (id: string) => ["elections", id, "eligibility"] as const,
  voters: (id: string) => ["elections", id, "voters"] as const,
  results: (id: string) => ["elections", id, "results"] as const,
  audit: (id: string) => ["elections", id, "audit"] as const,
  recentAudit: ["audit", "recent"] as const,
  org: (id: string) => ["org", id] as const,
  system: ["admin", "system"] as const,
};

export const useConfig = () =>
  useQuery({ queryKey: qk.config, queryFn: () => api.get<PublicConfig>("/api/config"), staleTime: 30_000 });

export const useHealth = () =>
  useQuery({ queryKey: qk.health, queryFn: () => api.get<Health>("/api/health"), refetchInterval: 15_000, retry: false });

export const useElections = () =>
  useQuery({
    queryKey: qk.elections,
    queryFn: () => api.get<{ elections: Election[] }>("/api/elections").then((r) => r.elections),
    refetchInterval: 20_000,
  });

export const useElection = (id: string) =>
  useQuery({
    queryKey: qk.election(id),
    queryFn: () => api.get<{ election: Election }>(`/api/elections/${id}`).then((r) => r.election),
  });

export const useEligibility = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.eligibility(id),
    queryFn: () => api.get<Eligibility>(`/api/elections/${id}/eligibility`),
    enabled,
  });

export const useVoters = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.voters(id),
    queryFn: () => api.get<{ voters: VoterRow[]; candidates: Candidate[] }>(`/api/elections/${id}/voters`),
    enabled,
  });

export const useResults = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.results(id),
    queryFn: () => api.get<Results>(`/api/elections/${id}/results`),
    enabled,
    retry: false,
  });

export const useAuditReport = (id: string) =>
  useQuery({ queryKey: qk.audit(id), queryFn: () => api.get<AuditReport>(`/api/elections/${id}/audit`), retry: false });

export const useRecentAudit = (limit = 10) =>
  useQuery({
    queryKey: [...qk.recentAudit, limit],
    queryFn: () => api.get<{ events: AuditEventRow[] }>(`/api/audit/recent?limit=${limit}`).then((r) => r.events),
    refetchInterval: 20_000,
  });

export const useOrg = (id: string | undefined) =>
  useQuery({ queryKey: qk.org(id ?? ""), queryFn: () => api.get<OrgDetails>(`/api/organizations/${id}`), enabled: !!id });
