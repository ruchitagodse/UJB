import {
  BookOpen,
  Briefcase,
  CalendarDays,
  FileText,
  Handshake,
  Link as LinkIcon,
  Target,
  UserCheck,
  Users,
} from "lucide-react";

export const MONTHLY_MEETING_USER_TAB_SETTINGS_COLLECTION = "appSettings";
export const MONTHLY_MEETING_USER_TAB_SETTINGS_DOC = "monthlyMeetingUserTabs";

export const MONTHLY_MEETING_USER_TAB_DEFINITIONS = [
  { key: "agenda", label: "Agenda", icon: CalendarDays, enabledByDefault: true },
  { key: "documents", label: "Docs", icon: FileText, enabledByDefault: true },
  { key: "facilitators", label: "Facilitators", icon: UserCheck, enabledByDefault: true },
  { key: "knowledge", label: "Knowledge", icon: BookOpen, enabledByDefault: true },
  { key: "prospects", label: "Prospects", icon: Target, enabledByDefault: true },
  { key: "referrals", label: "Referrals", icon: LinkIcon, enabledByDefault: true },
  { key: "requirements", label: "Req.", icon: Briefcase, enabledByDefault: true },
  { key: "e2a", label: "E2A", icon: Handshake, enabledByDefault: true },
  { key: "121", label: "1-2-1", icon: Users, enabledByDefault: true },
  { key: "users", label: "Users", icon: Users, enabledByDefault: true },
];

export function getDefaultMonthlyMeetingUserTabsConfig() {
  return MONTHLY_MEETING_USER_TAB_DEFINITIONS.reduce((accumulator, tab) => {
    accumulator[tab.key] = tab.enabledByDefault;
    return accumulator;
  }, {});
}

export function normalizeMonthlyMeetingUserTabsConfig(value) {
  const defaults = getDefaultMonthlyMeetingUserTabsConfig();

  if (!value || typeof value !== "object") {
    return defaults;
  }

  return MONTHLY_MEETING_USER_TAB_DEFINITIONS.reduce((accumulator, tab) => {
    accumulator[tab.key] =
      typeof value[tab.key] === "boolean" ? value[tab.key] : defaults[tab.key];
    return accumulator;
  }, {});
}

export function getVisibleMonthlyMeetingUserTabs(config) {
  const normalizedConfig = normalizeMonthlyMeetingUserTabsConfig(config);
  return MONTHLY_MEETING_USER_TAB_DEFINITIONS.filter(
    (tab) => normalizedConfig[tab.key] !== false
  );
}
