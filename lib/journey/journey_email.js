import {
  GLOBAL_EMAILJS_PUBLIC_KEY,
  GLOBAL_EMAILJS_SERVICE_ID,
  GLOBAL_EMAILJS_TEMPLATE_ID,
} from "@/lib/emailjs/config";

export const JOURNEY_EMAIL_TEMPLATES = Object.freeze({
  meeting_logs: Object.freeze({
    enabled: true,
    provider: "emailjs",
    serviceId: GLOBAL_EMAILJS_SERVICE_ID,
    templateId: GLOBAL_EMAILJS_TEMPLATE_ID,
    publicKey: GLOBAL_EMAILJS_PUBLIC_KEY,
    variants: Object.freeze({
      schedule: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Meeting Scheduled with {{recipient_name}} on {{date}}",
            body:
              "Thank you for confirming your availability. We look forward to connecting with you and sharing insights about UJustBe.\n\nSchedule details:\n\nDate: {{date}}\n{{schedule_details}}",
            variableKeys: Object.freeze(["recipient_name", "date", "schedule_details"]),
          }),
          orbiter: Object.freeze({
            subject: "Meeting Scheduled with {{recipient_name}} on {{date}}",
            body:
              "Thank you for confirming your availability. We look forward to connecting with you and sharing insights about UJustBe.\n\nSchedule details:\n\nDate: {{date}}\n{{schedule_details}}",
            variableKeys: Object.freeze(["recipient_name", "date", "schedule_details"]),
          }),
        }),
      }),
      reschedule: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Meeting Rescheduled with {{recipient_name}} to {{date}}",
            body:
              "Dear {{recipient_name}},\n\nAs you are aware, due to {{reason}}, we need to reschedule our upcoming call.\n\nWe are available for the call on {{date}}. Please confirm if this works for you, or let us know a convenient time within the next two working days so we can align accordingly.\n\n{{schedule_details}}",
            variableKeys: Object.freeze([
              "recipient_name",
              "reason",
              "date",
              "schedule_details",
            ]),
          }),
          orbiter: Object.freeze({
            subject: "Meeting Rescheduled with {{recipient_name}} to {{date}}",
            body:
              "Dear {{recipient_name}},\n\nAs you are aware, due to {{reason}}, we need to reschedule our upcoming call.\n\nWe are available for the call on {{date}}. Please confirm if this works for you, or let us know a convenient time within the next two working days so we can align accordingly.\n\n{{schedule_details}}",
            variableKeys: Object.freeze([
              "recipient_name",
              "reason",
              "date",
              "schedule_details",
            ]),
          }),
        }),
      }),
      thank_you: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Thank You {{recipient_name}}",
            body:
              "Dear {{recipient_name}},\n\nThank you for taking the time to connect with us. We truly value the time and energy you invested in this conversation.",
            variableKeys: Object.freeze(["recipient_name"]),
          }),
          orbiter: Object.freeze({
            subject: "Thank You {{recipient_name}}",
            body:
              "Dear {{recipient_name}},\n\nThank you for taking the time to connect with us. We truly value the time and energy you invested in this conversation.",
            variableKeys: Object.freeze(["recipient_name"]),
          }),
        }),
      }),
    }),
  }),
  pre_enrollment_form: Object.freeze({
    enabled: true,
    provider: "emailjs",
    serviceId: GLOBAL_EMAILJS_SERVICE_ID,
    templateId: GLOBAL_EMAILJS_TEMPLATE_ID,
    publicKey: GLOBAL_EMAILJS_PUBLIC_KEY,
    variants: Object.freeze({
      default: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Please Complete Your Pre Enrollment Feedback Form",
            body: "Please fill the prospect feedback form {{form_link}}",
            variableKeys: Object.freeze(["form_link"]),
          }),
          orbiter: Object.freeze({
            subject: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
    }),
  }),
  authentic_choice: Object.freeze({
    enabled: true,
    provider: "emailjs",
    serviceId: GLOBAL_EMAILJS_SERVICE_ID,
    templateId: GLOBAL_EMAILJS_TEMPLATE_ID,
    publicKey: GLOBAL_EMAILJS_PUBLIC_KEY,
    variants: Object.freeze({
      choose_to_enroll: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Welcome to UJustBe Universe - Make Your Authentic Choice",
            body:
              "Dear {{prospect_name}},\n\nSubject: Welcome to UJustBe Universe - Ready to Make Your Authentic Choice?\n\nWe are happy to inform you that your enrollment into UJustBe has been approved because we find you aligned with the basic contributor criteria of the UJustBe Universe.\n\nNow, we invite you to make your authentic choice:\nTo say Yes to this journey.\nTo say Yes to discovering, contributing, and growing.\nTo say Yes to being part of a community where you just be - and that is more than enough.\n\nPlease use the action links shared below in this email to select one of the two options:\n1) Yes to This Journey: {{yes_journey_url}}\n2) Need Some Time: {{need_time_url}}\n\nOnce we receive your choice, we will guide you with the next steps.",
            variableKeys: Object.freeze([
              "prospect_name",
              "yes_journey_url",
              "need_time_url",
            ]),
          }),
          orbiter: Object.freeze({
            subject: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
      decline_by_ujussbe: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Update on Your UJustBe Enrollment Request",
            body:
              "Dear {{prospect_name}},\n\nThank you for your interest in becoming a part of the UJustBe Universe.\n\nAt this time, enrollment is not approved because we do not find the required alignment with the culture and values of UJustBe.\n\nReason: {{note}}\n\nWe appreciate your understanding and wish you all the best on your path ahead.",
            variableKeys: Object.freeze(["prospect_name", "note"]),
          }),
          orbiter: Object.freeze({
            subject: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
      decline_by_prospect: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Your Authentic Choice Has Been Recorded",
            body:
              "Dear {{prospect_name}},\n\nThank you for taking the time to consider being part of the UJustBe Universe.\n\nWe truly value your honesty and respect your decision to not move forward at this time.\n\nReason shared: {{note}}\n\nYour No is respected, and the door remains open for future consideration whenever you feel ready to re-explore this journey.",
            variableKeys: Object.freeze(["prospect_name", "note"]),
          }),
          orbiter: Object.freeze({
            subject: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
      need_some_time: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Take Your Time - Share Your Decision Within 5 Working Days",
            body:
              "Dear {{prospect_name}},\n\nThank you for your honest response and we respect that you need some time before making a decision.\n\nPlease share your final decision within 5 working days so we can plan the next steps accordingly.\n\n{{note}}",
            variableKeys: Object.freeze(["prospect_name", "note"]),
          }),
          orbiter: Object.freeze({
            subject: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
      awaiting_response: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Reminder: Your UJustBe Enrollment Decision Is Pending",
            body:
              "Dear {{prospect_name}},\n\nYour enrollment into the UJustBe Universe has been approved, and the only pending part is your reply.\n\nPlease respond with your decision, including confirming Yes if you want to proceed, within 2 working days.\n\n{{note}}",
            variableKeys: Object.freeze(["prospect_name", "note"]),
          }),
          orbiter: Object.freeze({
            subject: "",
            body: "",
            variableKeys: Object.freeze([]),
          }),
        }),
      }),
    }),
  }),
  enrollment_status: Object.freeze({
    enabled: true,
    provider: "emailjs",
    serviceId: GLOBAL_EMAILJS_SERVICE_ID,
    templateId: GLOBAL_EMAILJS_TEMPLATE_ID,
    publicKey: GLOBAL_EMAILJS_PUBLIC_KEY,
    variants: Object.freeze({
      enrollment_initiation_initiation_not_started: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Initiated - Next Steps Ahead",
            body:
              "Hi {{prospect_name}},\n\nYou're successfully enrolled in our program as of {{date}}. Stay tuned for the next steps.",
            variableKeys: Object.freeze(["prospect_name", "date"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_initiation_initiation_in_progress: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Your Enrollment Is In Progress",
            body:
              "Hi {{prospect_name}},\n\nYou're successfully enrolled in our program as of {{date}}. Stay tuned for the next steps.",
            variableKeys: Object.freeze(["prospect_name", "date"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_initiation_initiation_completed: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Initiation Completed",
            body:
              "Hi {{prospect_name}},\n\nYou're successfully enrolled in our program as of {{date}}. Stay tuned for the next steps.",
            variableKeys: Object.freeze(["prospect_name", "date"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_documents_mail_documents_pending: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Action Required: Complete Your Enrollment Documents",
            body:
              "Hi {{prospect_name}},\n\nYou are just one step away from fully stepping into the UJustBe Universe and unlocking a world of possibilities, collaborations, and meaningful connections!\n\nWe noticed your enrollment documents are yet to be completed. To move forward and activate your journey, we invite you to connect with your MentOrbiter or speak with our UJustBe Support Team. They're here to walk with you and support you every step of the way.\n\nWe are excited to witness the contribution and value you’ll bring to the community. Let’s get you fully onboarded!",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_documents_mail_documents_sent: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Documents Required to Proceed",
            body:
              "Hello {{prospect_name}},\n\nIt was a pleasure connecting with you. Following our discussion, we are delighted to invite you to join UJustBe as an Orbiter.\n\nAs we discussed, we would like this enrollment to be an authentic choice you make to become a part of the UJustBe Universe.\n\nTo proceed, we kindly request you to reply to this email with your approval along with the following documents:\n\n1) Professional Photo (For KYC purposes)\n2) PAN Card (For KYC purposes)\n3) Aadhar Card (For KYC purposes)\n4) Cancelled Cheque Copy (For KYC purposes and to facilitate transfer of UJustBe referral rewards)\n\nUpon receiving the required documents, the UJustBe team will guide you through the next steps of the process.",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_documents_mail_documents_need_revision: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Your Enrollment Documents Need Revision",
            body:
              "Hi {{prospect_name}},\n\nYou are just one step away from completing your enrolment in UJustBe Universe and exploring a space filled with possibilities, collaboration, and contribution!\n\nWe have noticed that your enrollment documents require a few revisions. To move forward and complete your onboarding, we invite you to connect with your MentOrbiter or the UJustBe Support Team. They are here to guide you and ensure you have everything you need to take this next step confidently.\n\nWe are excited for the unique value you’ll bring into the community. Let’s get your journey officially started!",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_mail_status_fee_mail_pending: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Fee Update - Pending",
            body:
              "Hello {{prospect_name}},\n\nUpdate regarding: Enrollment Fees Mail Status on {{date}}. Status: Fee mail pending",
            variableKeys: Object.freeze(["prospect_name", "date"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_mail_status_fee_mail_sent: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Fee Details and Next Steps",
            body:
              "Hi {{prospect_name}},\n\nThank you for making an authentic choice in becoming an Orbiter in the UJustBe Universe.\n\nBelow are the details regarding the one-time Orbiter Enrollment Fee:\n\nOrbiter Enrollment Fee\nAmount: Rs. 1,000 (Lifetime)\n\nYou are invited to choose one of the following payment methods:\n\nDirect Payment to UJustBe's Account:\nYou can directly transfer the enrollment fee to UJustBe’s account. Once your referral is closed, the reciprocation amount will be credited directly to your account registered with UJustBe.\n\nAdjustment from Referral Reciprocation:\nThe enrollment fee will be adjusted against your referral reciprocation. Once the adjustment is completed, subsequent referral reciprocation fees will be transferred to your account.\n\nNext Steps:\nPlease confirm your choice by replying to this email with one of the options below:\n\nOption 1: I would like to pay the Orbiter Registration Fee of Rs. 1000/- directly to UJustBe.\nOption 2: Kindly adjust the Orbiter Registration Fee from the referral reciprocation.\n\nOnce we receive your confirmation, we will send you an invoice and guide you through the next steps to complete the process.\n\nIf you have any questions or need further assistance, please feel free to reach out. We look forward to your confirmation.",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_mail_status_fee_follow_up_required: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Follow-up: Pending Enrollment Fee Decision",
            body:
              "Hi {{prospect_name}},\n\nJust following up to check in on your decision regarding the enrollment fees for joining the UJustBe Universe. This step will help activate your onboarding and open the door to powerful connections, collaborations, and opportunities aligned with your growth journey.\n\nIf you have any questions or need clarity, please feel free to speak with your MentOrbiter or connect with our UJustBe Support Team.\n\nWe are here to support you in making an empowered decision.\n\nLooking forward to welcoming you fully into the Universe!",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_option_pending: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Fee Payment Option Pending",
            body:
              "Hi {{prospect_name}},\n\nYou've opted for Option pending as your payment method. If any change is needed, please let us know.",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_upfront_payment_selected: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Action Needed: Submit Upfront Payment Proof",
            body:
              "Hi {{prospect_name}},\n\nThank you for confirming your choice to pay the Orbiter Registration Fee of Rs. 1,000/- directly to UJustBe.\n\nWe kindly request you to complete the payment and submit the payment screenshot to us within 2 working days. Please ensure the screenshot clearly mentions the transaction ID and amount for reference. You may reply to this email with the attachment or send it to support@ujustbe.com.\n\nPayment Details for Direct Transfer\nAccount Name: UJustBe Enterprise\nAccount Number: [Insert Account Number]\nBank Name: [Insert Bank Name]\nIFSC Code: [Insert IFSC Code]\n\nIf we do not receive the payment details within the stipulated time, we will automatically proceed with Option 2 (adjustment from referral reciprocation) and initiate your Orbiter journey accordingly.\n\nA separate email will be sent to confirm the adjustment and the next steps.\n\nWe look forward to your prompt response. Should you have any questions or need assistance, please do not hesitate to reach out to us.",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_adjustment_selected: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Fee Adjustment Confirmed",
            body:
              "Hi {{prospect_name}},\n\nThank you for confirming your choice to adjust the Orbiter Registration Fee of Rs. 1,000/- from your referral reciprocation.\n\nWe have noted your preference and will proceed accordingly. The enrollment fee will be deducted from the referral reciprocation, and the remaining balance will be transferred to your registered account as per the standard timelines.\n\nYour Orbiter journey in the UJustBe Universe has now officially begun. We are happy to have you as part of UJustBe Universe and look forward to your active participation.\n\nShould you have any questions or need further assistance, please feel free to reach out to us. We are here to support you in every step of your journey.",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_no_response_adjustment_applied: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Fee Adjusted Due to No Response",
            body:
              "Hi {{prospect_name}},\n\nWe hope this email finds you well.\n\nSince we have not received the payment screenshot for the Orbiter Registration Fee of Rs. 1,000/- within the stipulated 2 working days, we have proceeded with Option 2: adjustment of the enrollment fee from your referral reciprocation.\n\nYour Orbiter journey in the UJustBe Universe has now been initiated. The enrollment fee will be deducted from your referral reciprocation, and any subsequent referral reciprocation amounts will be credited directly to your registered account as per standard timelines.\n\nIf you have any questions or require further assistance, please feel free to reach out to us. We are excited to have you as part of the UJustBe Universe and look forward to your active participation in our community.",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollment_fees_option_opted_for_upfront_payment_confirmed: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Upfront Enrollment Fee Payment Confirmed",
            body:
              "Hi {{prospect_name}},\n\nWe are pleased to confirm that we have received your payment of Rs. 1,000/- towards the Orbiter Enrollment Fee. Thank you for completing this step to officially begin your journey in the UJustBe Universe.\n\nYour payment has been successfully processed, and we are excited to have you as an active Orbiter in our community. You will soon receive further communication regarding the next steps and how you can start contributing, connecting, and growing with the UJustBe Universe.\n\nShould you have any questions or need assistance, please feel free to reach out to us. Once again, welcome aboard!",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollments_completion_status_completion_pending: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Completion Status - Pending",
            body:
              "Hello {{prospect_name}},\n\nUpdate regarding: Enrollments Completion Status on {{date}}. Status: Completion pending",
            variableKeys: Object.freeze(["prospect_name", "date"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollments_completion_status_enrollment_completed: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Welcome to UJustBe Universe - Enrollment Completed",
            body:
              "Dear {{prospect_name}},\n\nWelcome to the UJustBe Universe!\n\nThank you for making the authentic choice to become an Orbiter in this thriving community. We are delighted to have you join us on this exciting journey. Below is an overview of your journey path within the UJustBe Universe:\n\n- Orbiter – Your initiation into the UJustBe Universe, where meaningful relationships begin to form, holistic health is nurtured, and the foundation of wealth is laid through connections and growth.\n\n- Monthly Meeting Journey – Participate in interactive monthly meetings designed to strengthen relationships, enhance emotional and mental well-being, and provide insights for personal and professional wealth-building.\n\n- Referral Journey – Share genuine referrals with CosmOrbiters to expand opportunities, build trust within the Universe, and cultivate mutual growth.\n\n- Active Orbiter – Take an active role in the Universe through consistent engagement, nurturing deeper relationships, maintaining personal well-being, and creating pathways for sustainable wealth.\n\n- CosmOrbiter – Elevate your journey by listing your business or profession, leveraging the UJustBe network to expand opportunities and build professional relationships.\n\n- Accelerated Orbiter – Blend the power of authentic referrals and active participation in UJustBe events to accelerate your journey, unlock new opportunities, and strengthen community bonds.\n\n- CCAO (Consistent Contributing Active Orbiter) – Achieve this status through regular contributions that enrich relationships, foster a balanced lifestyle, and drive meaningful impact.\n\n- MentOrbiter – Lead by inviting and enrolling your network. Empower them to build fulfilling relationships, nurture well-being, and create wealth through the UJustBe Universe.\n\nThis journey invites you to embrace a balanced approach to life, uniting Relationship, Health, and Wealth to create a fulfilling experience within the UJustBe Universe.\n\nTo support you, our dedicated Support Team, Nucleus Team, and your MentOrbiter ([Name of MentOrbiter]) will guide and assist you every step of the way.\n\nWe are excited to see your growth and contributions. Let's create meaningful connections and experiences together!\n\nIf you have any questions or need assistance, please feel free to reach out to us.",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      enrollments_completion_status_enrollment_withdrawn: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Enrollment Withdrawal Confirmation",
            body:
              "Hi {{prospect_name}},\n\nWe wanted to let you know that we have received your decision to withdraw from the UJustBe enrollment process at this time.\n\nWhile we understand and respect your decision, please know that we are always here for you. If you ever choose to reconsider or would like to explore the benefits of rejoining, feel free to reach out. Your journey with us is important, and we're always ready to support your growth when the time is right.\n\nThank you for considering UJustBe, and we hope to have the opportunity to welcome you back in the future.",
            variableKeys: Object.freeze(["prospect_name"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
        }),
      }),
      pre_enrollment_form_feedback_form_triggered: Object.freeze({
        recipients: Object.freeze({
          prospect: Object.freeze({
            subject: "Please Complete Your Pre Enrollment Feedback Form",
            body:
              "Hi {{prospect_name}},\n\nThank you for submitting your Pre Enrollment Form.\n\nPlease complete the Feedback Form using this link:\n{{form_link}}\n\nIf you need any support, please connect with your MentOrbiter or the UJustBe team.",
            variableKeys: Object.freeze(["prospect_name", "form_link"]),
          }),
          orbiter: Object.freeze({ subject: "", body: "", variableKeys: Object.freeze([]) }),
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

export function getFallbackJourneyEmailTemplate(templateId) {
  const template = JOURNEY_EMAIL_TEMPLATES[templateId];

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
