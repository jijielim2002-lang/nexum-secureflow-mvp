// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | "Payment Pending"
  | "Deposit Confirmed"
  | "Fully Paid"
  | "Disputed"
  | "Refunded";

export type JobStatus =
  | "Awaiting Customer Acceptance"
  | "Awaiting Deposit"
  | "In Progress"
  | "Completed"
  | "Disputed"
  | "Cancelled";

export type ServiceType =
  | "Trucking"
  | "Customs Clearance"
  | "Cold Chain Delivery"
  | "Warehousing"
  | "Freight Forwarding"
  | "Project Cargo";

export type MilestoneStatus = "Pending" | "In Progress" | "Completed";

export type ActorRole = "admin" | "provider" | "customer" | "system";

export type PaymentRecordType =
  | "deposit"
  | "milestone_release"
  | "full_payment"
  | "refund";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ServiceProvider {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  trustScore: number;   // out of 5.0
  jobsCompleted: number;
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  trustScore: number;
  jobsTotal: number;
}

export interface SecuredJob {
  id: string;
  title: string;
  description: string;
  serviceType: ServiceType;
  providerId: string;
  customerId: string;
  route: string;
  valueRM: number;
  paymentTerms: string;
  paymentStatus: PaymentStatus;
  jobStatus: JobStatus;
  currentMilestone: string;  // human-readable label of the active milestone
  createdAt: string;
  updatedAt: string;
}

export interface JobMilestone {
  id: string;
  jobId: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  completedAt: string | null;
  /** Percentage of job value released to provider when confirmed */
  paymentReleasePercent: number;
}

export interface PaymentRecord {
  id: string;
  jobId: string;
  type: PaymentRecordType;
  amountRM: number;
  status: "Completed" | "Pending" | "Failed";
  date: string;
  notes: string;
}

export interface TrustScore {
  entityId: string;
  entityType: "provider" | "customer";
  score: number;
  totalJobs: number;
  onTimePercent: number;
  disputeRate: number;  // percentage
}

export interface AuditLog {
  id: string;
  jobId: string | null;
  actor: string;
  actorRole: ActorRole;
  action: string;
  timestamp: string;
}

// ─── Service Providers ────────────────────────────────────────────────────────

export const serviceProviders: ServiceProvider[] = [
  {
    id: "SP-001",
    name: "Utopia Valley Logistics",
    contact: "Ahmad Razif bin Ismail",
    email: "ahmad@utopiavl.com.my",
    phone: "+60 12-345 6789",
    trustScore: 4.8,
    jobsCompleted: 47,
  },
  {
    id: "SP-002",
    name: "ColdLink Transport Sdn Bhd",
    contact: "Tan Chee Keong",
    email: "cheekeong@coldlink.com.my",
    phone: "+60 11-234 5678",
    trustScore: 4.6,
    jobsCompleted: 31,
  },
];

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers: Customer[] = [
  {
    id: "CUST-001",
    name: "ABC Import Sdn Bhd",
    contact: "Lee Wei Ming",
    email: "leiwm@abcimport.com.my",
    phone: "+60 3-2712 3456",
    trustScore: 4.5,
    jobsTotal: 8,
  },
  {
    id: "CUST-002",
    name: "Global Food Trading",
    contact: "Nurul Ain binti Hassan",
    email: "nurul@globalfood.com.my",
    phone: "+60 3-5510 7890",
    trustScore: 4.2,
    jobsTotal: 5,
  },
  {
    id: "CUST-003",
    name: "FreshMart Singapore Pte Ltd",
    contact: "Priya Nair",
    email: "priya@freshmart.sg",
    phone: "+65 6123 4567",
    trustScore: 4.7,
    jobsTotal: 14,
  },
];

// ─── Secured Jobs ─────────────────────────────────────────────────────────────

export const securedJobs: SecuredJob[] = [
  {
    id: "NSF-1001",
    title: "Port Klang to KL Trucking",
    description:
      "Transport of 2× 20ft containers from Port Klang container terminal to client warehouse in Kuala Lumpur.",
    serviceType: "Trucking",
    providerId: "SP-001",
    customerId: "CUST-001",
    route: "Port Klang → Kuala Lumpur",
    valueRM: 2800,
    paymentTerms: "30% deposit secured on job acceptance. Remaining 70% released upon delivery confirmation and signed POD.",
    paymentStatus: "Deposit Confirmed",
    jobStatus: "In Progress",
    currentMilestone: "Pickup Completed",
    createdAt: "2025-05-01",
    updatedAt: "2025-05-05",
  },
  {
    id: "NSF-1002",
    title: "Port Klang Customs Clearance",
    description:
      "Import customs clearance for 1× 40ft container at Port Klang: HS classification, duties assessment, and port release.",
    serviceType: "Customs Clearance",
    providerId: "SP-001",
    customerId: "CUST-001",
    route: "Port Klang",
    valueRM: 4500,
    paymentTerms: "50% deposit required before customs clearance commences. Balance 50% released upon customs clearance approval and cargo release.",
    paymentStatus: "Payment Pending",
    jobStatus: "Awaiting Deposit",
    currentMilestone: "Job Accepted",
    createdAt: "2025-05-06",
    updatedAt: "2025-05-06",
  },
  {
    id: "NSF-1003",
    title: "Cold Chain Delivery KL to Singapore",
    description:
      "Refrigerated truck delivery of pharmaceutical goods from Kuala Lumpur to Singapore warehouse, maintaining 2–8°C throughout.",
    serviceType: "Cold Chain Delivery",
    providerId: "SP-002",
    customerId: "CUST-003",
    route: "Kuala Lumpur → Singapore",
    valueRM: 12000,
    paymentTerms: "100% full payment required upfront before service commencement. Funds held in escrow and released to provider upon signed POD and verified temperature log.",
    paymentStatus: "Fully Paid",
    jobStatus: "Completed",
    currentMilestone: "POD Uploaded",
    createdAt: "2025-04-20",
    updatedAt: "2025-04-28",
  },
];

// ─── Job Milestones ───────────────────────────────────────────────────────────

export const jobMilestones: JobMilestone[] = [
  // NSF-1001 — Port Klang to KL Trucking
  {
    id: "MS-1001-1",
    jobId: "NSF-1001",
    title: "Job Accepted",
    description: "Provider confirmed job terms. Awaiting customer deposit.",
    status: "Completed",
    completedAt: "2025-05-01",
    paymentReleasePercent: 0,
  },
  {
    id: "MS-1001-2",
    jobId: "NSF-1001",
    title: "Deposit Secured",
    description: "Customer deposit received and held in escrow.",
    status: "Completed",
    completedAt: "2025-05-02",
    paymentReleasePercent: 0,
  },
  {
    id: "MS-1001-3",
    jobId: "NSF-1001",
    title: "Pickup Completed",
    description: "Driver confirmed cargo pickup at Port Klang terminal. Containers loaded.",
    status: "Completed",
    completedAt: "2025-05-04",
    paymentReleasePercent: 30,
  },
  {
    id: "MS-1001-4",
    jobId: "NSF-1001",
    title: "Delivered to KL Warehouse",
    description: "Cargo delivered and POD signed by recipient.",
    status: "In Progress",
    completedAt: null,
    paymentReleasePercent: 70,
  },

  // NSF-1002 — Port Klang Customs Clearance
  {
    id: "MS-1002-1",
    jobId: "NSF-1002",
    title: "Job Accepted",
    description: "Provider submitted job terms. Awaiting customer deposit confirmation.",
    status: "In Progress",
    completedAt: null,
    paymentReleasePercent: 0,
  },
  {
    id: "MS-1002-2",
    jobId: "NSF-1002",
    title: "Documents Submitted to KASTAM",
    description: "All import documents filed for customs review.",
    status: "Pending",
    completedAt: null,
    paymentReleasePercent: 40,
  },
  {
    id: "MS-1002-3",
    jobId: "NSF-1002",
    title: "Customs Clearance Obtained",
    description: "K1 form approved, duties settled, container released.",
    status: "Pending",
    completedAt: null,
    paymentReleasePercent: 60,
  },

  // NSF-1003 — Cold Chain KL to Singapore
  {
    id: "MS-1003-1",
    jobId: "NSF-1003",
    title: "Job Accepted",
    description: "Job terms agreed. Full payment received upfront.",
    status: "Completed",
    completedAt: "2025-04-20",
    paymentReleasePercent: 0,
  },
  {
    id: "MS-1003-2",
    jobId: "NSF-1003",
    title: "Pickup Completed",
    description: "Cold chain verified at origin. Temperature logger activated at 2–8°C.",
    status: "Completed",
    completedAt: "2025-04-24",
    paymentReleasePercent: 30,
  },
  {
    id: "MS-1003-3",
    jobId: "NSF-1003",
    title: "JB Customs Cleared",
    description: "Malaysia exit customs declaration approved.",
    status: "Completed",
    completedAt: "2025-04-25",
    paymentReleasePercent: 20,
  },
  {
    id: "MS-1003-4",
    jobId: "NSF-1003",
    title: "POD Uploaded",
    description: "Delivered to Singapore warehouse. POD signed. Temp log confirmed 2–8°C. Payment released to provider.",
    status: "Completed",
    completedAt: "2025-04-28",
    paymentReleasePercent: 50,
  },
];

// ─── Payment Records ──────────────────────────────────────────────────────────

export const paymentRecords: PaymentRecord[] = [
  {
    id: "PAY-001",
    jobId: "NSF-1001",
    type: "deposit",
    amountRM: 840,   // 30% deposit of RM2,800
    status: "Completed",
    date: "2025-05-02",
    notes: "Customer deposit (30%) secured in escrow.",
  },
  {
    id: "PAY-002",
    jobId: "NSF-1001",
    type: "milestone_release",
    amountRM: 840,
    status: "Completed",
    date: "2025-05-04",
    notes: "30% released to provider on Pickup Completed milestone.",
  },
  {
    id: "PAY-003",
    jobId: "NSF-1002",
    type: "deposit",
    amountRM: 1350,  // 30% deposit of RM4,500
    status: "Pending",
    date: "2025-05-06",
    notes: "Awaiting customer deposit confirmation.",
  },
  {
    id: "PAY-004",
    jobId: "NSF-1003",
    type: "full_payment",
    amountRM: 12000,
    status: "Completed",
    date: "2025-04-20",
    notes: "Full upfront payment received. Held in escrow until POD confirmation.",
  },
  {
    id: "PAY-005",
    jobId: "NSF-1003",
    type: "milestone_release",
    amountRM: 12000,
    status: "Completed",
    date: "2025-04-28",
    notes: "Full payment released to ColdLink Transport on delivery confirmation.",
  },
];

// ─── Trust Scores ─────────────────────────────────────────────────────────────

export const trustScores: TrustScore[] = [
  { entityId: "SP-001", entityType: "provider",  score: 4.8, totalJobs: 47, onTimePercent: 96, disputeRate: 2 },
  { entityId: "SP-002", entityType: "provider",  score: 4.6, totalJobs: 31, onTimePercent: 92, disputeRate: 2 },
  { entityId: "CUST-001", entityType: "customer", score: 4.5, totalJobs: 8,  onTimePercent: 88, disputeRate: 0 },
  { entityId: "CUST-002", entityType: "customer", score: 4.2, totalJobs: 5,  onTimePercent: 80, disputeRate: 4 },
  { entityId: "CUST-003", entityType: "customer", score: 4.7, totalJobs: 14, onTimePercent: 93, disputeRate: 1 },
];

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs: AuditLog[] = [
  {
    id: "LOG-001",
    jobId: "NSF-1001",
    actor: "System",
    actorRole: "system",
    action: "Job NSF-1001 created by Utopia Valley Logistics",
    timestamp: "2025-05-01 09:14",
  },
  {
    id: "LOG-002",
    jobId: "NSF-1001",
    actor: "ABC Import Sdn Bhd",
    actorRole: "customer",
    action: "Customer confirmed job terms and paid deposit for NSF-1001",
    timestamp: "2025-05-02 11:32",
  },
  {
    id: "LOG-003",
    jobId: "NSF-1001",
    actor: "Utopia Valley Logistics",
    actorRole: "provider",
    action: "Pickup completed — cargo loaded at Port Klang (NSF-1001)",
    timestamp: "2025-05-04 08:55",
  },
  {
    id: "LOG-004",
    jobId: "NSF-1002",
    actor: "System",
    actorRole: "system",
    action: "Job NSF-1002 created by Utopia Valley Logistics",
    timestamp: "2025-05-06 14:03",
  },
  {
    id: "LOG-005",
    jobId: "NSF-1002",
    actor: "System",
    actorRole: "system",
    action: "Job link sent to Global Food Trading for NSF-1002",
    timestamp: "2025-05-06 14:04",
  },
  {
    id: "LOG-006",
    jobId: "NSF-1003",
    actor: "ColdLink Transport Sdn Bhd",
    actorRole: "provider",
    action: "POD uploaded — delivery confirmed to FreshMart Singapore (NSF-1003)",
    timestamp: "2025-04-28 17:21",
  },
  {
    id: "LOG-007",
    jobId: "NSF-1003",
    actor: "System",
    actorRole: "system",
    action: "Full payment of RM12,000 released to ColdLink Transport (NSF-1003)",
    timestamp: "2025-04-28 17:22",
  },
  {
    id: "LOG-008",
    jobId: "NSF-1003",
    actor: "Admin",
    actorRole: "admin",
    action: "Job NSF-1003 marked Completed after POD and payment verification",
    timestamp: "2025-04-29 09:00",
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getProvider(id: string): ServiceProvider | undefined {
  return serviceProviders.find((p) => p.id === id);
}

export function getCustomer(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export function getJobMilestones(jobId: string): JobMilestone[] {
  return jobMilestones.filter((m) => m.jobId === jobId);
}

export function getTrustScore(entityId: string): TrustScore | undefined {
  return trustScores.find((t) => t.entityId === entityId);
}

export function getJobPayments(jobId: string): PaymentRecord[] {
  return paymentRecords.filter((p) => p.jobId === jobId);
}

export function formatRM(amount: number): string {
  return "RM " + new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
