export const JOURNEY_WHATSAPP_TEMPLATES = Object.freeze({
  meeting_logs: Object.freeze({
    enabled: true,
    variants: Object.freeze({
      schedule: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "schedule_message_otc",
            body: "",
            variableKeys: Object.freeze(["name", "date", "location_details"]),
          }),
          orbiter: Object.freeze({
            templateName: "schedule_message_otc",
            body: "",
            variableKeys: Object.freeze(["name", "date", "location_details"]),
          }),
        }),
      }),
      reschedule: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "reschedule_meeting_otc",
            body: "",
            variableKeys: Object.freeze(["name", "reason", "date"]),
          }),
          orbiter: Object.freeze({
            templateName: "reschedule_meeting_otc",
            body: "",
            variableKeys: Object.freeze(["name", "reason", "date"]),
          }),
        }),
      }),
      thank_you: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "meeeting_done_thankyou_otc",
            body: "",
            variableKeys: Object.freeze(["name"]),
          }),
          orbiter: Object.freeze({
            templateName: "meeeting_done_thankyou_otc",
            body: "",
            variableKeys: Object.freeze(["name"]),
          }),
        }),
      }),
    }),
  }),
  pre_enrollment_form: Object.freeze({
    enabled: true,
    variants: Object.freeze({
      default: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
          orbiter: Object.freeze({
            templateName: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
    }),
  }),
  authentic_choice: Object.freeze({
    enabled: true,
    variants: Object.freeze({
      choose_to_enroll: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Congratulations {{prospect_name}}! We are happy to inform you that your enrollment into UJustBe has been approved. Kindly reply Yes if you would like to proceed.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({
            templateName: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
      decline_by_ujussbe: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hello {{prospect_name}}, thank you for your interest in UJustBe. Enrollment is not approved at this time due to non-alignment. Reason: {{note}}",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({
            templateName: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
      decline_by_prospect: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hello {{prospect_name}}, thank you for your honest response. We respect your decision not to move forward at this time. {{note}}",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({
            templateName: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
      need_some_time: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hello {{prospect_name}}, thank you for your honest response. Please share your final decision within 5 working days. {{note}}",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({
            templateName: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
      awaiting_response: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hello {{prospect_name}}, your enrollment is approved and we are awaiting your response. Please reply within 2 working days. {{note}}",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({
            templateName: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
    }),
  }),
  enrollment_status: Object.freeze({
    enabled: true,
    variants: Object.freeze({
      enrollment_initiation_initiation_not_started: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, You're successfully enrolled in our program as of {{date}}. Stay tuned for the next steps.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_initiation_initiation_in_progress: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, You're successfully enrolled in our program as of {{date}}. Stay tuned for the next steps.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_initiation_initiation_completed: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, You're successfully enrolled in our program as of {{date}}. Stay tuned for the next steps.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_documents_mail_documents_pending: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, You are just one step away from becoming an Orbiter in the UJustBe Universe! Some enrollment documents are still pending-feel free to reach out to your MentOrbiter or connect with the UJustBe Support Team to complete the process. We are here to support you and can't wait to see your journey unfold!",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_documents_mail_documents_sent: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hello {{prospect_name}}, It was a pleasure connecting with you! As discussed, we are happy to invite you to join UJustBe as an Orbiter. We have shared an email with the details and next steps. Kindly check it and share requested documents at your earliest convenience. Looking forward to welcoming you into the UJustBe Universe!",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_documents_mail_documents_need_revision: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, As there is no response from your end we are going ahead with default option as adjustment of Enrollment fees against the referral reciprocation. We've shared an email with the details with the process.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_mail_status_fee_mail_pending: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hello {{prospect_name}}, Update regarding Enrollment Fees Mail Status on {{date}}. Status: Fee mail pending",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_mail_status_fee_mail_sent: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, Thank you for making an authentic choice to become an Orbiter in the UJustBe Universe. We have shared an email with the details of the one-time Orbiter Enrollment Fee (Rs. 1,000) and the available payment options. Kindly check your email and confirm your preferred option by replying there. Once we receive your confirmation, we will guide you through the next steps.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_mail_status_fee_follow_up_required: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, Just checking in to follow up on your decision regarding the enrollment fees for joining the UJustBe Universe. If you have any questions or need support, please connect with your MentOrbiter or our UJustBe Support Team. We are here to walk this journey with you!",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_option_pending: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, Your status is Option pending. If any change is needed, please let us know.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_upfront_payment_selected: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, Thank you for confirming with your option of paying Enrollment fees upfront. We've shared an email with the details for the payment. Kindly check your email and confirm once you make the payment. Once we receive your confirmation, we'll share the invoice and guide you through the next steps. Let us know if you need any help!",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_adjustment_selected: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, Thank you for confirming with your option of Adjustment of your one time enrolment fees against the referral reciprocation. Kindly check your email and allow us to guide you through the next steps. Let us know if you need any help!",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_no_response_adjustment_applied: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, As there is no response from your end we are going ahead with default option as adjustment of Enrollment fees against the referral reciprocation. We've shared an email with the details with the process.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_upfront_payment_confirmed: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, Thank you for making the payment towards the One time Enrollment fees - Upfront. We've shared an email with the details with the process.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollments_completion_status_completion_pending: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hello {{prospect_name}}, Update regarding Enrollments Completion Status on {{date}}. Status: Completion pending",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollments_completion_status_enrollment_completed: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Dear {{prospect_name}}, Welcome to the UJustBe Universe! We are happy to welcome you as an Orbiter in the UJustBe Universe! Your journey here is about building meaningful relationships, nurturing holistic health, and creating wealth through shared growth. Start with Monthly Meetings, identifying authentic referrals, engaging actively in the community, and growing into roles like CosmOrbiter, Accelerated Orbiter, MentOrbiter and more. You'll be supported by your MentOrbiter and our Support and Nucleus Team throughout the way. Please check your mail for more details.",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollments_completion_status_enrollment_withdrawn: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            templateName: "enrollment_journey",
            body:
              "Hi {{prospect_name}}, We have noted that you have decided to withdraw from the enrollment process for now. If you ever choose to reconsider or need more details, we're here to support you whenever you're ready. Thank you for considering UJustBe, and we hope to reconnect in the future!",
            variableKeys: Object.freeze(["body_text", "orbiter_name"]),
          }),
          orbiter: Object.freeze({ templateName: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
    }),
  }),
});

function cloneRecipient(recipient) {
  return {
    ...recipient,
    variableKeys: Array.isArray(recipient?.variableKeys)
      ? [...recipient.variableKeys]
      : [],
  };
}

function cloneVariant(variant) {
  return {
    ...variant,
    recipients: Object.fromEntries(
      Object.entries(variant?.recipients || {}).map(([key, recipient]) => [
        key,
        cloneRecipient(recipient),
      ])
    ),
  };
}

export function getFallbackJourneyWhatsAppTemplate(templateId) {
  const template = JOURNEY_WHATSAPP_TEMPLATES[templateId];

  if (!template) {
    return null;
  }

  return {
    ...template,
    variants: Object.fromEntries(
      Object.entries(template.variants || {}).map(([key, variant]) => [
        key,
        cloneVariant(variant),
      ])
    ),
  };
}
