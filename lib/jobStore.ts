// Client-side localStorage-backed store for mock demo jobs.
// SSR-safe: all localStorage access is guarded by typeof window check.
// On the server, functions return mockData only. On the client, they merge
// mockData with any extra jobs saved via addJobToStorage().

import {
  securedJobs,
  jobMilestones,
  auditLogs,
  customers,
  type SecuredJob,
  type JobMilestone,
  type AuditLog,
  type Customer,
} from "./mockData";

const STORAGE_KEY = "nexum_extra_jobs";

interface StoredData {
  jobs:      SecuredJob[];
  milestones: JobMilestone[];
  logs:      AuditLog[];
  customers: Customer[];
}

const EMPTY: StoredData = { jobs: [], milestones: [], logs: [], customers: [] };

function readStorage(): StoredData {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredData) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeStorage(data: StoredData): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getAllJobs(): SecuredJob[] {
  const { jobs } = readStorage();
  const storedIds = new Set(jobs.map((j) => j.id));
  return [...securedJobs.filter((j) => !storedIds.has(j.id)), ...jobs];
}

export function getAllMilestones(): JobMilestone[] {
  const { milestones } = readStorage();
  return [...jobMilestones, ...milestones];
}

export function getAllLogs(): AuditLog[] {
  const { logs } = readStorage();
  return [...auditLogs, ...logs];
}

export function getCustomerFromStore(id: string): Customer | undefined {
  const { customers: storedCustomers } = readStorage();
  return [...customers, ...storedCustomers].find((c) => c.id === id);
}

export function addJobToStorage(
  job:        SecuredJob,
  milestones: JobMilestone[],
  logs:       AuditLog[],
  customer?:  Customer,
): void {
  const data = readStorage();
  data.jobs.push(job);
  data.milestones.push(...milestones);
  data.logs.push(...logs);
  if (customer) data.customers.push(customer);
  writeStorage(data);
}

export function clearStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function nextJobId(): string {
  const nums = getAllJobs()
    .map((j) => parseInt(j.id.replace("NSF-", ""), 10))
    .filter((n) => !isNaN(n));
  return `NSF-${(nums.length ? Math.max(...nums) : 1003) + 1}`;
}
