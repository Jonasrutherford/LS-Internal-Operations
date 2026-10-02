import type { Scope, Unit } from './types';

export interface SeedTaskType {
  code: string;
  name: string;
  scope: Scope;
  unit: Unit | null;
  parent_code: string | null;
  quick_start: boolean;
}

/** External categories, section 17 of the V1 spec.
 *  Service Fulfillment covers the actual delivery work: web design, SEO,
 *  paid ads, social media and other client service delivery. */
export const EXTERNAL_CATEGORIES: ReadonlyArray<[string, string]> = [
  ['sales_outreach', 'Sales & Outreach'],
  ['lead_generation', 'Lead Generation'],
  ['lead_qualification', 'Lead Qualification'],
  ['discovery_calls', 'Discovery Calls'],
  ['proposals_closing', 'Proposals & Closing'],
  ['client_onboarding', 'Client Onboarding'],
  ['client_communication', 'Client Communication'],
  ['account_management', 'Account Management'],
  ['client_strategy', 'Client Strategy'],
  ['service_fulfillment', 'Service Fulfillment'],
  ['content_creation_clients', 'Content Creation for Clients'],
  ['client_reporting', 'Client Reporting'],
  ['client_retention', 'Client Retention'],
  ['upsell_cross_sell', 'Upselling & Cross-Selling'],
  ['partnership_development', 'Partnership Development'],
  ['customer_support', 'Customer Support'],
  ['client_feedback', 'Client Feedback & Satisfaction'],
];

/** Internal categories, section 18. Internal Marketing means Lucid Studio's own marketing. */
export const INTERNAL_CATEGORIES: ReadonlyArray<[string, string]> = [
  ['hiring_recruiting', 'Hiring & Recruiting'],
  ['employee_onboarding', 'Employee Onboarding'],
  ['training_development', 'Training & Development'],
  ['internal_operations', 'Internal Operations'],
  ['sops_process_docs', 'SOPs & Process Documentation'],
  ['workflow_automation', 'Workflow Automation'],
  ['project_management', 'Project Management'],
  ['quality_assurance', 'Quality Assurance'],
  ['finance_accounting', 'Finance & Accounting'],
  ['legal_admin', 'Legal & Administration'],
  ['internal_meetings', 'Internal Meetings'],
  ['performance_management', 'Performance Management'],
  ['resource_allocation', 'Resource Allocation'],
  ['strategic_planning', 'Strategic Planning'],
  ['internal_marketing', 'Internal Marketing'],
  ['technology_infrastructure', 'Technology & Infrastructure'],
  ['team_management', 'Team Management'],
];

/** Discrete deliverables, section 26. These are the only task types that carry a
 *  unit, and the only ones offered in Quick Start, section 27. Units are derived
 *  from the task type and are never hand-editable.
 *
 *  Calls, website builds, strategy and general meetings are deliberately absent:
 *  they are not discrete, so they are never asked for a count.
 *
 *  TODO: the spec names these as examples rather than an exhaustive list. Admins can
 *  add more under System Admin, section 37. Seeded set kept deliberately small. */
export const DELIVERABLE_TYPES: ReadonlyArray<SeedTaskType> = [
  { code: 'email_outreach', name: 'Email Outreach', scope: 'external', unit: 'emails', parent_code: 'sales_outreach', quick_start: true },
  { code: 'social_post', name: 'Social Post', scope: 'external', unit: 'posts', parent_code: 'content_creation_clients', quick_start: true },
  { code: 'graphic_design', name: 'Graphic Design', scope: 'external', unit: 'graphics', parent_code: 'content_creation_clients', quick_start: true },
  { code: 'reel', name: 'Reel', scope: 'external', unit: 'reels', parent_code: 'content_creation_clients', quick_start: true },
  { code: 'client_report', name: 'Client Report', scope: 'external', unit: 'reports', parent_code: 'client_reporting', quick_start: true },
];

/** The sentinel code for Other. Selecting it reveals a single field for a new task
 *  name. The field never shows otherwise, section 19. */
export const OTHER_CODE = 'other';

export function seedTaskTypes(): SeedTaskType[] {
  const categories: SeedTaskType[] = [
    ...EXTERNAL_CATEGORIES.map(([code, name]) => ({
      code, name, scope: 'external' as Scope, unit: null, parent_code: null, quick_start: false,
    })),
    ...INTERNAL_CATEGORIES.map(([code, name]) => ({
      code, name, scope: 'internal' as Scope, unit: null, parent_code: null, quick_start: false,
    })),
  ];
  const other: SeedTaskType[] = (['external', 'internal'] as Scope[]).map((scope) => ({
    code: `${OTHER_CODE}_${scope}`,
    name: 'Other',
    scope,
    unit: null,
    parent_code: null,
    quick_start: false,
  }));
  return [...categories, ...DELIVERABLE_TYPES, ...other];
}
