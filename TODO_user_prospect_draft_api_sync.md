# TODO: User Prospect Draft API + Form Sync

## Goal

Create a new user-side API for adding prospects that:

- syncs the initial register form fields with the admin add prospect form
- saves the record as `draft`
- triggers the same assessment messaging flow
- leaves OPS fields empty for now
- treats the logged-in user creating the prospect as the mentor orbiter for that prospect

## Functional Rules

- [ ] User-side add prospect must use a new API route, not the current lightweight `/api/user/prospects` create flow.
- [ ] New user-created prospect records must be saved with draft status.
- [ ] OPS-related fields must be saved as empty values for draft records:
  - `assignedOpsUserId`
  - `assignedOpsName`
  - `assignedOpsEmail`
- [ ] Draft prospects must still support message triggering if that is part of this new flow.
- [ ] Draft prospects must be clearly distinguishable from admin-approved/live prospects.

## Phase 1: Sync User Form With Admin Register Form

- [ ] Treat [app/admin/prospect/add/page.js](C:/KhizarShaikh/Project/UJB_Karma_CC/app/admin/prospect/add/page.js) as the source of truth for the user add form.
- [ ] Compare [app/admin/prospect/add/page.js](C:/KhizarShaikh/Project/UJB_Karma_CC/app/admin/prospect/add/page.js) and [app/(user)/user/prospects/add/page.js](C:/KhizarShaikh/Project/UJB_Karma_CC/app/(user)/user/prospects/add/page.js) field by field.
- [ ] Update the user form to include the same initial admin add-form fields except OPS.
- [ ] Sync these fields to user side:
  - `prospectName`
  - `prospectPhone`
  - `email`
  - `dob`
  - `occupation`
  - `hobbies`
  - `source`
  - `type`
- [ ] Match the admin add-form behavior for `source` and `type` exactly:
  - `source` uses the shared prospect source options
  - `type` uses the source-driven detail options from the add form
  - the second field label should follow the same add-form wording/behavior
- [ ] Keep these auto-filled from logged-in user profile:
  - `orbiterName`
  - `orbiterContact`
  - `orbiterEmail`
  - `mentorUjbCode`
- [ ] Enforce mapping rule: user creating the prospect is the MentOrbiter, so orbiter fields must always map from the creator's profile/session.
- [ ] Keep user-facing wording consistent with the clarified meaning:
  - `orbiterName` means `MentOrbiter Name`
  - `orbiterContact` means `MentOrbiter Phone`
  - `orbiterEmail` means `MentOrbiter Email`
- [ ] Rename user-side `prospectEmail` usage to `email` so it matches admin data shape.
- [ ] Replace the current flat source model on user side with the admin-style `source + type` structure.
- [ ] Reuse admin option sets from [lib/prospectFormOptions.js](C:/KhizarShaikh/Project/UJB_Karma_CC/lib/prospectFormOptions.js) where possible.

## Phase 1A: Admin Form Baseline

- [x] Sync admin add and edit forms so they use the same source/type behavior.
- [x] Clarify admin edit-side `Orbiter` wording to `MentOrbiter` where that field refers to the mentor.
- [ ] Do not use admin edit form as the source of truth for user sync; user sync should follow admin add form behavior.

## Phase 2: User Form Validation

- [ ] Apply the same core validation rules used by admin for initial prospect creation.
- [ ] Validate Indian mobile number format consistently.
- [ ] Validate email format consistently.
- [ ] Add DOB validation with 18+ rule.
- [ ] Make `source` required.
- [ ] Make `type` required.
- [ ] Keep OPS validation excluded from the user flow.

## Phase 3: Create New User Draft API

- [ ] Add a new user-side prospect create route for the synced form flow.
- [ ] Decide route name and keep it explicit, for example:
  - `/api/user/prospects/draft`
  - or `/api/user/prospects/register`
- [ ] Make the new route require authenticated user session.
- [ ] Normalize the request payload into admin-compatible field names and formats.
- [ ] Save the same initial field structure admin add form uses, except OPS fields remain empty.
- [ ] Persist a draft marker on creation:
  - `approvalStatus: "draft"` or
  - `status: "draft"` or
  - `isDraft: true`
- [ ] Add `recordStatus` only if existing admin views depend on it.
- [ ] Add timestamps such as:
  - `registeredAt`
  - `createdAt`
  - `updatedAt`

## Phase 4: Message Triggering

- [ ] Identify the exact email and WhatsApp trigger logic currently used in [app/admin/prospect/add/page.js](C:/KhizarShaikh/Project/UJB_Karma_CC/app/admin/prospect/add/page.js).
- [ ] Extract the message triggering logic out of the admin page into a shared reusable helper/service.
- [ ] Make the new user draft API call that shared trigger logic after successful record creation.
- [ ] Keep message triggering idempotent so repeated submits or retries do not send duplicates.
- [ ] Preserve the same template variable mapping used by admin add flow, including MentOrbiter-derived values.
- [ ] Store message trigger result on the draft record:
  - success state
  - failure state
  - trigger timestamp
  - error details if needed

## Phase 5: Draft State Rules

- [ ] Define exactly how draft records should appear on admin side.
- [ ] Ensure draft records can exist with empty OPS values without breaking downstream logic.
- [ ] Verify automations or TODO generation do not assume OPS is present for every draft record.
- [ ] Prevent draft records from being treated as fully approved operational prospects.
- [ ] Decide whether admin manage screen needs a draft filter or badge.

## Phase 6: Update User-Side Service Layer

- [ ] Update [services/prospectService.js](C:/KhizarShaikh/Project/UJB_Karma_CC/services/prospectService.js) to call the new draft API for the user add flow.
- [ ] Keep existing list/fetch logic untouched unless draft records need special handling.
- [ ] Return a useful success payload for UI confirmation and future debugging.

## Phase 7: Update User UI

- [ ] Update [components/prospect/ProspectForm.js](C:/KhizarShaikh/Project/UJB_Karma_CC/components/prospect/ProspectForm.js) to match the synced admin-style initial fields.
- [ ] Update [app/(user)/user/prospects/add/page.js](C:/KhizarShaikh/Project/UJB_Karma_CC/app/(user)/user/prospects/add/page.js) form state to match the new payload shape.
- [ ] Update user form labels/placeholders so the mentor-related fields are consistently described as `MentOrbiter` where shown.
- [ ] Update [components/prospect/SuccessModal.js](C:/KhizarShaikh/Project/UJB_Karma_CC/components/prospect/SuccessModal.js) copy to reflect draft creation and message triggering.
- [ ] Show clearer user feedback if prospect was saved but message triggering failed.

## Phase 8: Testing Checklist

- [ ] Test user can submit all synced initial fields.
- [ ] Test saved draft document matches admin field structure except OPS fields.
- [ ] Test `email`, `dob`, `source`, and `type` persist correctly.
- [ ] Test orbiter fields are auto-filled from logged-in user profile.
- [ ] Test orbiter fields always reflect the logged-in creator (MentOrbiter), not prospect-entered values.
- [ ] Test user form `source` and `type` behavior matches admin add form exactly.
- [ ] Test email trigger fires after draft creation.
- [ ] Test WhatsApp trigger fires after draft creation.
- [ ] Test retry behavior does not duplicate messages.
- [ ] Test draft records still show correctly in admin prospect views.
- [ ] Test empty OPS values do not break admin listing/detail pages.

## Suggested Execution Order

- [ ] Step 1: sync user form fields with admin form
- [ ] Step 2: add validation for the new fields
- [ ] Step 3: create the new user draft API
- [ ] Step 4: extract and reuse message triggering logic
- [ ] Step 5: wire user form to the new API
- [ ] Step 6: test draft records in admin and user views
