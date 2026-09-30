// Hand-written mirrors of the backend Pydantic models (backend/models/*.py).
// Nothing infers across the Python boundary — when a model changes, change its
// interface here in the same edit (TEMPLATE.md §4).

export interface Voter {
  id: string;
  full_name: string;
  email: string;
  mobile: string;
  date_of_birth: string;
  state: string;
  district: string;
  constituency_id: string | null;
  voter_ref_masked: string;
  status: string; // PENDING | APPROVED | SUSPENDED
  suspended: boolean;
  identity_verified: boolean;
  face_verified: boolean;
  liveness_verified: boolean;
  identity_masked: string | null;
  created_at: string;
  votes_cast?: number;
}

export interface Admin {
  id: string;
  email: string;
  full_name: string;
  role: string; // SUPER_ADMIN | ELECTION_ADMIN | AUDITOR | RESULTS_OFFICER | SECURITY_OFFICER
  status: string;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface AuthMe {
  authenticated: boolean;
  role_type: "voter" | "admin" | null;
  user: Voter | Admin | null;
}

export function isAdminUser(user: Voter | Admin | null): user is Admin {
  return !!user && "role" in user;
}

export interface EligibilityCheck {
  code: string;
  label: string;
  passed: boolean;
}

export interface Eligibility {
  allowed: boolean;
  reason: string;
  message: string;
  checks: EligibilityCheck[];
  has_voted?: boolean;
}

export interface Constituency {
  id: string;
  code: string;
  name: string;
  state: string;
  district: string;
  created_at: string;
}

export interface Candidate {
  id: string;
  election_id: string;
  constituency_id: string;
  name: string;
  party: string;
  symbol: string;
  description: string;
  photo_url: string | null;
  status: string;
  created_at: string;
  constituency_name?: string;
}

export interface Election {
  id: string;
  election_code: string;
  name: string;
  description: string;
  election_type: string;
  status: string;
  start_at: string;
  end_at: string;
  constituency_ids: string[];
  auto_closed: boolean;
  results_published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  votes_cast?: number;
  candidate_count?: number;
  eligibility?: Eligibility;
}

export interface VoterElectionDetail extends Election {
  candidates: Candidate[];
  voter_constituency: { id: string; code: string; name: string } | null;
  voting_open: boolean;
}

export interface PublicElection {
  id: string;
  election_code: string;
  name: string;
  description: string;
  election_type: string;
  status: string;
  start_at: string;
  end_at: string;
  constituencies: { id: string; code: string; name: string }[];
  candidate_count: number;
  results_published: boolean;
}

export interface Receipt {
  receipt_id: string;
  election_id: string;
  commitment: string;
  block_index: number | null;
  created_at: string;
}

export interface ReceiptVerification {
  status: string;
  receipt_id?: string;
  election_id?: string;
  commitment?: string;
  block_index?: number;
  block_hash?: string;
  recorded_at?: string;
  chain_valid?: boolean;
  detail?: string;
}

export interface IdentityInitiateOut {
  transaction_id: string;
  provider: string;
  status: string;
  masked_ref: string;
  expires_at: string;
  sandbox_otp: string | null;
  sandbox_notice: string | null;
}

export interface IdentityTxn {
  id: string;
  provider: string;
  status: string;
  purpose: string;
  masked_ref: string;
  created_at: string;
  verified_at: string | null;
}

export interface FaceSession {
  session_id: string;
  status: string;
  expires_at: string;
}

export interface FaceVerifyOut {
  status: string; // VERIFIED | FAILED | RETRY_REQUIRED | LOCKED
  confidence: number;
  reasons: string[];
  attempts_remaining: number;
  provider: string;
  sandbox: boolean;
}

export interface LivenessChallenge {
  code: string;
  label: string;
}

export interface LivenessStart {
  session_id: string;
  nonce: string;
  challenges: LivenessChallenge[];
  expires_at: string;
}

export interface LivenessVerifyOut {
  status: string;
  reasons: string[];
  attempts_remaining: number;
  sandbox: boolean;
}

export interface Block {
  index: number;
  timestamp: string;
  event_type: string;
  election_id: string | null;
  record_hash: string | null;
  previous_hash: string;
  current_hash: string;
  metadata: Record<string, unknown>;
}

export interface ChainVerification {
  valid: boolean;
  blocks_checked: number;
  first_invalid_index: number | null;
  checked_at: string;
  status: string;
}

export interface AuditEntry {
  id: string;
  seq: number;
  timestamp: string;
  actor_id: string;
  actor_role: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  result: string;
  metadata: Record<string, unknown>;
  previous_hash: string;
  current_hash: string;
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  severity: string;
  voter_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FraudFlag {
  id: string;
  subject_id: string;
  subject_type: string;
  event_type: string;
  risk_level: string; // LOW | MEDIUM | HIGH | CRITICAL
  reason: string;
  occurrences: number;
  status: string; // FLAG_FOR_REVIEW | DISMISSED | ACTION_TAKEN
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResultRow {
  candidate_id: string;
  name: string;
  party: string;
  symbol: string;
  votes: number;
  percentage: number;
}

export interface TurnoutRow {
  constituency_id: string;
  eligible_voters: number;
  votes_cast: number;
  turnout_pct: number;
}

export interface ElectionResult {
  election: {
    id: string;
    election_code: string;
    name: string;
    status: string;
    start_at: string;
    end_at: string;
    results_published_at: string | null;
  };
  snapshot_hash: string;
  snapshot_hash_intact: boolean;
  valid_votes: number;
  invalid_votes: number;
  votes_cast: number;
  turnout: TurnoutRow[];
  by_constituency: Record<string, Record<string, number>>;
  results: ResultRow[];
  ledger_block_index: number | null;
  ledger_block_hash: string | null;
}

export interface ResultIntegrity {
  valid: boolean;
  status: string;
  snapshot_hash: string;
  recomputed_hash: string;
  ledger_block_index: number | null;
  checked_at: string;
}

export interface VoterListResponse {
  total: number;
  page: number;
  page_size: number;
  items: Voter[];
}

export interface AuditListResponse {
  total: number;
  page: number;
  page_size: number;
  items: AuditEntry[];
}

export interface MonitorVote {
  receipt_id: string;
  election_id: string;
  constituency_id: string | null;
  voted_at: string;
  status: string;
}

export interface MonitorResponse {
  total_votes: number;
  active_sessions: number;
  recent_votes: MonitorVote[];
  votes_by_constituency: Record<string, number>;
  votes_by_hour: { hour: string; votes: number }[];
}

export interface TurnoutConstituency {
  constituency_id: string;
  constituency_name: string;
  eligible_voters: number;
  votes_cast: number;
  turnout_pct: number;
  mean_turnout_pct: number;
  gap_pct: number;
  alert_level: string | null; // CRITICAL | HIGH | MEDIUM | null
}

export interface TurnoutAlert extends TurnoutConstituency {
  election_id: string;
  election_name: string;
  election_code: string;
}

export interface TurnoutAlertsResponse {
  open_elections: {
    election_id: string;
    election_name: string;
    election_code: string;
    mean_turnout_pct: number;
    constituencies: TurnoutConstituency[];
  }[];
  alerts: TurnoutAlert[];
  alert_count: number;
}

export interface VoterActivityEntry {
  id: string;
  action: string;
  category: string;
  result: string;
  timestamp: string;
  ip_masked: string | null;
  user_agent: string | null;
  current_hash: string;
}

export interface VoterActivityResponse {
  activity: VoterActivityEntry[];
  security_events: { id: string; event_type: string; severity: string; created_at: string; ip_masked: string | null }[];
  sign_in_count: number;
  last_sign_in_at: string | null;
}

export interface DashboardData {
  cards: {
    total_elections: number;
    elections_by_status: Record<string, number>;
    active_elections: number;
    upcoming_elections: number;
    completed_elections: number;
    registered_voters: number;
    approved_voters: number;
    pending_voters: number;
    verified_voters: number;
    votes_cast: number;
    verification_failures: number;
    suspicious_attempts: number;
    open_fraud_flags: number;
    blockchain_records: number;
    system_health: string;
  };
  charts: {
    registrations: { day: string; count: number }[];
    votes_per_hour: { hour: string; votes: number }[];
    votes_per_constituency: { constituency: string; votes: number }[];
    auth_success_failure: { day: string; success: number; failure: number }[];
    turnout: { election: string; turnout_pct: number }[];
  };
  generated_at: string;
}

export interface HealthData {
  status: string;
  version: string;
  uptime_seconds: number;
  development_mode: boolean;
  checks: Record<string, { status: string; detail?: string; provider?: string; mode?: string; network?: string }>;
  ledger_verification?: ChainVerification;
  timestamp: string;
}

export interface AdminSettings {
  settings: Record<string, string>;
  env: Record<string, string>;
  roles: Record<string, string[]>;
}

export interface AdminElectionDetail extends Election {
  candidates: Candidate[];
  votes_cast: number;
  eligible_voters: number;
  votes_by_constituency: Record<string, number>;
  recent_votes: MonitorVote[];
}

export interface VoterDetail {
  voter: Voter;
  votes_cast: number;
  identity_transactions: IdentityTxn[];
  face: { verified: boolean; attempts: number };
  liveness: { verified: boolean; sessions: { id: string; status: string; created_at: string }[] };
  security_events: { id: string; event_type: string; severity: string; created_at: string }[];
  elections: { id: string; name: string; status: string; eligibility: Eligibility }[];
}
