export type NormalizedRole =
  | "special_events"
  | "parks_recreation"
  | "economic_development"
  | "community_engagement"
  | "tourism"
  | "city_management"
  | "public_affairs"
  | "community_development"
  | "cultural_affairs"
  | "downtown_development"
  | "other_relevant";

export type ContactCategory = "event_operations" | "budget_approval" | "promotion_attendance";

const rolePatterns: { role: NormalizedRole; patterns: RegExp[] }[] = [
  {
    role: "special_events",
    patterns: [
      /special events?/i,
      /event coordinator/i,
      /event manager/i,
      /festival coordinator/i,
      /event director/i,
    ],
  },
  {
    role: "parks_recreation",
    patterns: [
      /parks? (and|&) recreation/i,
      /recreation director/i,
      /parks? director/i,
      /parks? manager/i,
    ],
  },
  {
    role: "economic_development",
    patterns: [
      /economic development/i,
      /business development/i,
    ],
  },
  {
    role: "tourism",
    patterns: [
      /tourism/i,
      /destination marketing/i,
      /visitors? bureau/i,
      /\bCVB\b/i,
      /convention (and|&) visitor/i,
    ],
  },
  {
    role: "city_management",
    patterns: [
      /assistant city manager/i,
      /city manager/i,
      /city administrator/i,
      /town manager/i,
      /town administrator/i,
    ],
  },
  {
    role: "public_affairs",
    patterns: [
      /public affairs/i,
      /communications? director/i,
      /public information officer/i,
      /\bPIO\b/i,
      /media relations/i,
    ],
  },
  {
    role: "community_development",
    patterns: [
      /community development/i,
    ],
  },
  {
    role: "community_engagement",
    patterns: [
      /community engagement/i,
      /community relations/i,
      /neighborhood services/i,
    ],
  },
  {
    role: "cultural_affairs",
    patterns: [
      /cultural affairs/i,
      /arts (and|&) culture/i,
      /cultural services/i,
    ],
  },
  {
    role: "downtown_development",
    patterns: [
      /downtown development/i,
      /main street director/i,
      /downtown manager/i,
    ],
  },
];

export function normalizeRole(title: string): NormalizedRole | null {
  for (const { role, patterns } of rolePatterns) {
    if (patterns.some((p) => p.test(title))) {
      return role;
    }
  }
  return null;
}

export function getContactCategory(role: NormalizedRole): ContactCategory {
  const eventOps: NormalizedRole[] = ["special_events", "parks_recreation", "cultural_affairs"];
  const budgetApproval: NormalizedRole[] = ["city_management", "economic_development", "community_development", "downtown_development"];
  const promotion: NormalizedRole[] = ["tourism", "public_affairs", "community_engagement"];

  if (eventOps.includes(role)) return "event_operations";
  if (budgetApproval.includes(role)) return "budget_approval";
  if (promotion.includes(role)) return "promotion_attendance";
  return "event_operations";
}

// Ranking for contact selection (lower = higher priority)
export const roleRanking: Record<NormalizedRole, number> = {
  special_events: 1,
  parks_recreation: 2,
  tourism: 3,
  economic_development: 4,
  community_development: 5,
  city_management: 6,
  public_affairs: 7,
  community_engagement: 8,
  cultural_affairs: 9,
  downtown_development: 10,
  other_relevant: 11,
};
