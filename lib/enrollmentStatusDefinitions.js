export const ENROLLMENT_STATUS_DEFINITIONS = Object.freeze({
  "Enrollment Initiation": Object.freeze({
    "Initiation not started": "Enrollment kickoff has not begun yet.",
    "Initiation in progress": "Enrollment kickoff has started and is currently ongoing.",
    "Initiation completed": "Initial enrollment kickoff activities are completed.",
  }),
  "Enrollment documents mail": Object.freeze({
    "Documents pending": "Required enrollment document communication is still pending.",
    "Documents sent": "Enrollment document communication has been sent.",
    "Documents need revision": "Documents were shared but corrections are required.",
  }),
  "Enrollment Fees Mail Status": Object.freeze({
    "Fee mail pending": "Enrollment fee communication is not sent yet.",
    "Fee mail sent": "Enrollment fee communication has been sent.",
    "Fee follow-up required": "Fee mail was sent, but follow-up is still needed.",
  }),
  "Enrollment fees Option Opted for": Object.freeze({
    "Option pending": "Prospect has not selected a fee option yet.",
    "Upfront payment selected": "Prospect selected upfront payment for enrollment fee.",
    "Adjustment selected": "Prospect selected fee adjustment against referral reciprocation.",
    "No response - adjustment applied": "No response received in time; default adjustment is applied.",
    "Upfront payment confirmed": "Upfront enrollment fee payment has been received and confirmed.",
  }),
  "Enrollments Completion Status": Object.freeze({
    "Completion pending": "Final enrollment completion is still pending.",
    "Enrollment completed": "Prospect enrollment is fully completed.",
    "Enrollment withdrawn": "Prospect has withdrawn from enrollment.",
  }),
});

export function getEnrollmentStatusDefinition(stageLabel, statusValue) {
  const stageDefinitions = ENROLLMENT_STATUS_DEFINITIONS[stageLabel] || {};
  return stageDefinitions[statusValue] || "Select a status to view its meaning.";
}

