export const ORBITER_PROFESSION_TYPE_OPTIONS = [
  { label: "Select an option", value: "" },
  { label: "Entrepreneur", value: "Entrepreneur" },
  { label: "Salaried", value: "Salaried" },
  { label: "Freelancer", value: "Freelancer" },
  { label: "Student", value: "Student" },
  { label: "Home Maker", value: "Home Maker" },
  { label: "Retired", value: "Retired" },
];

export const PROSPECT_OCCUPATION_OPTIONS = ORBITER_PROFESSION_TYPE_OPTIONS;

export const PROSPECT_OCCASION_OPTIONS = [
  { label: "Select an option", value: "" },
  { label: "Support Team Call", value: "support_call" },
  { label: "Orbiter Connect", value: "orbiter_connection" },
  { label: "Doorstep Service", value: "doorstep_service" },
  { label: "Monthly Meeting", value: "monthly_meeting" },
  { label: "E2A Interaction", value: "e2a_interactions" },
  { label: "Unniversary Interaction", value: "unniversary_interactions" },
  { label: "Support", value: "support" },
  { label: "NT", value: "nt" },
  { label: "Management", value: "management" },
];

export const PROSPECT_SOURCE_OPTIONS = [
  { label: "Select a source", value: "" },
  { label: "Social Media", value: "Social Media" },
  { label: "Website", value: "Website" },
  { label: "Orbiter", value: "Orbiter" },
];

export const PROSPECT_SOURCE_DETAIL_OPTIONS = {
  Orbiter: PROSPECT_OCCASION_OPTIONS,
  Website: [
    { label: "Select an option", value: "" },
    { label: "UJustBe", value: "UJustBe" },
  ],
  "Social Media": [
    { label: "Select an option", value: "" },
    { label: "Instagram", value: "Instagram" },
    { label: "Facebook", value: "Facebook" },
    { label: "YouTube", value: "YouTube" },
  ],
};

export function getProspectSourceDetailLabel(source) {
  if (source === "Orbiter") {
    return "Occasion for Intimation";
  }

  if (source === "Website") {
    return "Website Source";
  }

  if (source === "Social Media") {
    return "Social Media Source";
  }

  return "Source Detail";
}
