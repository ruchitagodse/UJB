# User Prospect Sync TODO

## Goal

Make `/user/prospects/add` work as a submission flow that stays in sync with the admin prospect lifecycle, with approval on the admin side and message triggering only after approval.

## Phase 1: Align Data Model

- [ ] Define a single canonical prospect payload shared by admin and user flows.
- [ ] Add approval fields to prospect records:
  - `approvalStatus`
  - `approvalSubmittedAt`
  - `approvedAt`
  - `approvedBy`
- [ ] Add message trigger tracking fields:
  - `messageTriggerStatus`
  - `messageTriggeredAt`
  - `messageTriggerError`
- [ ] Decide which fields are required at user submission time vs admin approval time.

## Phase 2: User Submission Flow

- [ ] Update [app/api/user/prospects/route.js](C:/KhizarShaikh/Project/UJB_Karma_CC/app/api/user/prospects/route.js) to create prospects in a pending state instead of as fully operationalized records.
- [ ] Map user-side fields into the canonical structure used by admin-side prospect records.
- [ ] Normalize phone/email/source values the same way admin flow does.
- [ ] Store mentor/orbiter identity consistently:
  - `mentorUjbCode`
  - `orbiterName`
  - `orbiterContact`
  - `orbiterEmail`
- [ ] Add an engagement note for initial user submission.
- [ ] Return enough metadata for the UI to show “submitted for approval”.

## Phase 3: Shared Backend Workflow

- [ ] Extract shared prospect creation/normalization logic into one backend helper/service.
- [ ] Move any reusable validation out of page components and into backend workflow code.
- [ ] Ensure both admin and user creation paths call the same workflow.
- [ ] Add idempotency protection for message triggering so approval retries do not resend.

## Phase 4: Admin Approval Flow

- [ ] Add an admin approve action in [app/api/admin/prospects/route.js](C:/KhizarShaikh/Project/UJB_Karma_CC/app/api/admin/prospects/route.js).
- [ ] Require OPS assignment before approval if that is still a business rule.
- [ ] On approval, update:
  - `approvalStatus = approved`
  - `approvedAt`
  - `approvedBy`
- [ ] Trigger assessment initiation only from this approval step.
- [ ] Add a reject path if needed:
  - `approvalStatus = rejected`
  - rejection note/reason

## Phase 5: Message Triggering

- [ ] Move assessment email logic out of [app/admin/prospect/add/page.js](C:/KhizarShaikh/Project/UJB_Karma_CC/app/admin/prospect/add/page.js) into a server-side workflow.
- [ ] Move WhatsApp trigger logic out of the admin page into the same server-side workflow.
- [ ] Reuse the same template loading logic for both admin-created and user-approved prospects.
- [ ] Save trigger result back to the prospect record.
- [ ] Handle partial failures cleanly:
  - email failed
  - WhatsApp failed
  - both failed

## Phase 6: Admin UI Updates

- [ ] Show `Pending`, `Approved`, and `Rejected` status in admin prospect management.
- [ ] Add filters for pending approval records.
- [ ] Show who submitted the prospect and when.
- [ ] Add approve/reject actions in the admin UI.
- [ ] Show message trigger status after approval.

## Phase 7: User UI Updates

- [ ] Update the success state in [components/prospect/SuccessModal.js](C:/KhizarShaikh/Project/UJB_Karma_CC/components/prospect/SuccessModal.js) to say “submitted for approval” instead of “added successfully”.
- [ ] Add a clearer user-facing note on [app/(user)/user/prospects/add/page.js](C:/KhizarShaikh/Project/UJB_Karma_CC/app/(user)/user/prospects/add/page.js) explaining that admin approval happens before next-step messaging.
- [ ] If useful, show approval state in the user prospects list page.

## Phase 8: Testing

- [ ] Test admin-created prospect still works end-to-end.
- [ ] Test user-created prospect appears in admin as pending.
- [ ] Test approval sends email once.
- [ ] Test approval sends WhatsApp once.
- [ ] Test repeated approval action does not duplicate messages.
- [ ] Test rejected prospects do not trigger messages.
- [ ] Test prospects list still loads correctly for the submitting user.

## Suggested Delivery Order

- [ ] Milestone 1: user flow saves pending approval records.
- [ ] Milestone 2: admin can approve pending records.
- [ ] Milestone 3: approval triggers email/WhatsApp on the backend.
- [ ] Milestone 4: UI polish and status visibility on both sides.
