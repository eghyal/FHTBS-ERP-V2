export type PotentialCustomerStatus = "NEW_INTENT" | "SCOUTED" | "CONTACTED" | "CONVERTED" | "DROPPED";

export interface CartItemSnapshot {
  item_id: string;
  item_code: string;
  name: string;
  qty: number;
  uom: string;
  price: number;
  total: number;
  image_url?: string;
}

export interface ActivityEvent {
  id: string;
  module: "PUBLIC" | "SHOP" | "CAREERS" | string;
  activity_type: string;
  title: string;
  details?: any;
  page_url?: string;
  created_at: string;
}

export interface ConsentRecord {
  id: string;
  consent_type: string;
  granted: number;
  granted_at: string;
  withdrawn_at?: string;
}

export interface OutreachRecord {
  id: string;
  channel: string;
  template_id: string;
  custom_note: string;
  sent_by: string;
  sent_at: string;
}

export interface VerifiedSource {
  title: string;
  url: string;
  claim: string;
}

export interface DeepSocialPresence {
  platform: string; // "LinkedIn" | "X / Twitter" | "Instagram" | "Press / Media" | "Corporate Registry" | "Public Portfolio"
  identifier_or_url?: string;
  summary: string;
}

export interface DeepCareerBackground {
  position: string;
  organization: string;
  scope_notes: string;
}

export interface DeepOSINTDossier {
  social_presence?: DeepSocialPresence[];
  career_background?: DeepCareerBackground[];
  relations_and_affiliations?: string[];
  digital_reputation_notes?: string;
  authority_level?: "DECISION_MAKER" | "INFLUENCER" | "BUYER" | "EVALUATOR";
}

export interface LeadScoreBreakdown {
  dimensions?: {
    behavioral_intent: number;
    engagement: number;
    profile_fit: number;
    freshness: number;
  };
  explanation?: string[];
  deep_osint?: DeepOSINTDossier;
}

export interface PotentialCustomer {
  id: string;
  customer_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  auth_provider: string;
  avatar_url: string | null;
  cart_snapshot: CartItemSnapshot[];
  cart_total_value: number;
  cart_total_items: number;
  status: PotentialCustomerStatus;
  potential_score: number;
  lead_grade?: "A" | "B" | "C" | "D";
  customer_segment?: string;
  lifecycle_stage?: string;
  fit_score?: number;
  intent_score?: number;
  reachability_score?: number;
  persona_tag: string;
  buying_power_est: string | null;
  scout_company: string | null;
  scout_role: string | null;
  scout_summary: string | null;
  scout_sources: string[];
  sources_json?: VerifiedSource[];
  scout_recommendations: string | null;
  key_talking_points?: string[];
  recommended_products?: string[];
  risk_flags?: string[];
  scout_confidence?: "HIGH" | "MEDIUM" | "LOW";
  scout_status?: string;
  profiling_consent?: number;
  marketing_consent?: number;
  lead_score_breakdown?: LeadScoreBreakdown;
  scouted_at: string | null;
  sales_notes: string | null;
  assigned_to: string | null;
  created_at: string;
  last_active_at: string;
  activity_count?: number;
  activities?: ActivityEvent[];
  consents?: ConsentRecord[];
  outreach?: OutreachRecord[];
}

export interface StatsSummary {
  total_leads: number;
  grade_a_count: number;
  grade_b_count: number;
  grade_c_count: number;
  grade_d_count: number;
  scouted_count: number;
  consented_count: number;
  total_cart_pipeline_value: number;
  converted_count: number;
  contacted_count: number;
}

export interface ICPConfig {
  id: string;
  company_name: string;
  target_industries: string[];
  target_buyer_personas: string[];
  minimum_project_sqm?: number;
  priority_products?: string[];
  preferred_products?: string[];
  scoring_weights: {
    behavioral_intent: number;
    profile_fit: number;
    engagement: number;
    freshness: number;
  };
  updated_at: string;
}
