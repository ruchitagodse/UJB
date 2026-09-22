const read = (obj, path) =>
  String(path || "")
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

const hasValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return String(value ?? "").trim() !== "";
};

const hasAnyValue = (...values) => values.some((value) => hasValue(value));

function addCheck(checks, key, label, passed) {
  checks.push({ key, label, passed: Boolean(passed) });
}

function addPathCheck(checks, key, label, source, path) {
  addCheck(checks, key, label, hasValue(read(source, path)));
}

function addAnyCheck(checks, key, label, values) {
  addCheck(checks, key, label, values.some((value) => hasValue(value)));
}

function buildServiceChecks(checks, profile) {
  const formData = profile?.formData || {};
  const services = Array.isArray(formData?.services) ? formData.services : [];

  if (!services.length) return;

  services.forEach((service, idx) => {
    const prefix = `Services ${idx + 1}`;
    [
      ["name", "Service Name"],
      ["deliveryTime", "Delivery Time"],
      ["description", "Description"],
      ["keywords", "Keywords"],
      ["targetAudience", "Target Audience"],
      ["industries", "Industries Served"],
      ["useCases", "Use Cases"],
      ["clientele", "Clientele Type"],
      ["experience", "Experience (Years)"],
      ["pastClients", "Past Clients"],
      ["proofPoints", "Proof Points"],
    ].forEach(([field, label]) => {
      addCheck(
        checks,
        `services.${idx}.${field}`,
        `${prefix}: ${label}`,
        hasValue(service?.[field])
      );
    });

    addCheck(
      checks,
      `services.${idx}.images`,
      `${prefix}: Images`,
      hasValue(service?.images) ||
        hasValue(service?.imageURL) ||
        hasValue(profile?.serviceImagesTemp?.[idx])
    );
  });
}

function buildProductChecks(checks, profile) {
  const formData = profile?.formData || {};
  const products = Array.isArray(formData?.products) ? formData.products : [];

  if (!products.length) return;

  products.forEach((product, idx) => {
    const prefix = `Products ${idx + 1}`;
    [
      ["name", "Product Name"],
      ["deliveryTime", "Delivery Time"],
      ["description", "Description"],
      ["keywords", "Keywords"],
      ["targetAudience", "Target Audience"],
      ["industries", "Industries Served"],
      ["useCases", "Use Cases"],
      ["clientele", "Clientele Type"],
      ["experience", "Experience (Years)"],
      ["pastClients", "Past Clients"],
      ["proofPoints", "Proof Points"],
    ].forEach(([field, label]) => {
      addCheck(
        checks,
        `products.${idx}.${field}`,
        `${prefix}: ${label}`,
        hasValue(product?.[field])
      );
    });

    addCheck(
      checks,
      `products.${idx}.images`,
      `${prefix}: Images`,
      hasValue(product?.images) ||
        hasValue(product?.imageURL) ||
        hasValue(profile?.productImagesTemp?.[idx])
    );
  });
}

function buildCloseConnectionChecks(checks, profile) {
  const formData = profile?.formData || {};
  const connections = Array.isArray(formData?.closeConnections)
    ? formData.closeConnections
    : [];

  if (!connections.length) {
    addCheck(
      checks,
      "closeConnections.any",
      "Close Connections: At least one connection",
      false
    );
    return;
  }

  connections.forEach((connection, index) => {
    const prefix = `Close Connections ${index + 1}`;
    [
      ["name", "Name"],
      ["phone", "Contact Number"],
      ["profession", "Profession"],
      ["relationship", "Relationship"],
      ["skills", "Skills"],
      ["notes", "Notes"],
    ].forEach(([field, label]) => {
      addCheck(
        checks,
        `closeConnections.${index}.${field}`,
        `${prefix}: ${label}`,
        hasValue(connection?.[field])
      );
    });
  });
}

function buildProfessionalChecks(checks, profile) {
  const formData = profile?.formData || {};
  const professionType = formData?.ProfessionType;

  addCheck(
    checks,
    "professional.type",
    "Professional: Profession Type",
    hasValue(professionType)
  );

  if (professionType === "Entrepreneur") {
    [
      ["BusinessHistory", "Business History"],
      ["USP", "USP"],
      ["AreaOfServices", "Area Of Services"],
      ["ClienteleBase", "Clientele Base"],
      ["TagLine", "Tag Line"],
      ["Aspirations", "Aspirations"],
      ["ImmediateDesire", "Immediate Desire"],
      ["Mastery", "Mastery Areas"],
    ].forEach(([field, label]) => {
      addCheck(
        checks,
        `professional.entrepreneur.${field}`,
        `Professional: ${label}`,
        hasValue(formData?.[field])
      );
    });
  }

  if (professionType === "Salaried") {
    [
      ["CompanyName", "Company Name"],
      ["JobTitle", "Job Title"],
      ["Department", "Department"],
      ["Industry", "Industry"],
      ["ExperienceYears", "Years of Experience"],
      ["Skills", "Skills"],
      ["Expertise", "Expertise"],
      ["CareerAspirations", "Career Aspirations"],
    ].forEach(([field, label]) => {
      addCheck(
        checks,
        `professional.salaried.${field}`,
        `Professional: ${label}`,
        hasValue(formData?.[field])
      );
    });
  }

  if (professionType === "Freelancer") {
    [
      ["FreelanceServices", "Services Offered"],
      ["Platforms", "Platforms"],
      ["PortfolioURL", "Portfolio URL"],
      ["FreelanceExperience", "Experience Years"],
    ].forEach(([field, label]) => {
      addCheck(
        checks,
        `professional.freelancer.${field}`,
        `Professional: ${label}`,
        hasValue(formData?.[field])
      );
    });
  }

  if (professionType === "Student") {
    [
      ["CollegeName", "College Name"],
      ["Course", "Course"],
      ["Specialization", "Specialization"],
      ["Skills", "Skills"],
      ["CareerInterests", "Career Interests"],
    ].forEach(([field, label]) => {
      addCheck(
        checks,
        `professional.student.${field}`,
        `Professional: ${label}`,
        hasValue(formData?.[field])
      );
    });
  }

  if (professionType === "Home Maker") {
    [
      ["PrimaryRole", "Primary Role"],
      ["FamilyType", "Family Type"],
      ["Skills", "Skills"],
      ["Hobbies", "Hobbies"],
      ["InterestArea", "Interest Areas"],
      ["ContributionAreainUJustBe", "Contribution Areas"],
      ["Aspirations", "Aspirations"],
      ["ImmediateDesire", "Immediate Desire"],
    ].forEach(([field, label]) => {
      addCheck(
        checks,
        `professional.homeMaker.${field}`,
        `Professional: ${label}`,
        hasValue(formData?.[field])
      );
    });
  }

  if (professionType === "Retired") {
    [
      ["PreviousProfession", "Previous Profession"],
      ["PreviousIndustry", "Industry"],
      ["LastOrganization", "Last Organization"],
      ["TotalExperience", "Total Experience"],
      ["Mastery", "Mastery Areas"],
      ["Skills", "Skills"],
      ["MentorshipInterest", "Mentorship Interest"],
      ["SupportAreas", "Can Support In"],
    ].forEach(([field, label]) => {
      addCheck(
        checks,
        `professional.retired.${field}`,
        `Professional: ${label}`,
        hasValue(formData?.[field])
      );
    });
  }
}

function buildCompletionChecks(profile) {
  const checks = [];
  const formData = profile?.formData || {};
  const personalKyc = formData?.personalKYC || {};
  const businessKyc = formData?.businessKYC || {};
  const bank = formData?.bankDetails || {};

  [
    ["personal.name", "Personal: Name", formData?.Name],
    ["personal.email", "Personal: Email", formData?.Email],
    ["personal.category", "Personal: Category", formData?.Category],
    ["personal.dob", "Personal: Date of Birth", formData?.DOB],
    ["personal.idType", "Personal: ID Type", formData?.IDType],
    ["personal.idNumber", "Personal: ID Number", formData?.IDNumber],
    ["personal.country", "Personal: Country", formData?.Country],
    ["personal.pincode", "Personal: Pincode", formData?.Pincode],
    ["personal.city", "Personal: City", formData?.City],
    ["personal.state", "Personal: State", formData?.State],
    ["personal.location", "Personal: Location", formData?.Location],
    ["personal.industry", "Personal: Industry", formData?.Industry],
  ].forEach(([key, label, value]) => addCheck(checks, key, label, hasValue(value)));

  addAnyCheck(checks, "personal.mobile", "Personal: Mobile", [
    formData?.MobileNo,
    formData?.Mobile,
  ]);
  addAnyCheck(checks, "personal.residentStatus", "Personal: Resident Status", [
    profile?.residentStatus,
    formData?.residentStatus,
  ]);
  addAnyCheck(checks, "personal.taxSlab", "Personal: Applicable Tax Slab", [
    profile?.taxSlab,
    formData?.taxSlab,
  ]);
  addAnyCheck(checks, "personal.profilePhoto", "Personal: Profile Photo", [
    profile?.profilePreview,
    formData?.ProfilePhotoURL,
  ]);
  addAnyCheck(
    checks,
    "personal.preferredCommunication",
    "Personal: Preferred Communication",
    [formData?.PreferredCommunication]
  );

  const hasServices = Array.isArray(formData?.services) && formData.services.length > 0;
  const hasProducts = Array.isArray(formData?.products) && formData.products.length > 0;
  addCheck(
    checks,
    "offerings.any",
    "Offerings: At least one service or product",
    hasServices || hasProducts
  );

  const links = Array.isArray(formData?.BusinessSocialMediaPages)
    ? formData.BusinessSocialMediaPages
    : [];

  if (!links.length) {
    addCheck(
      checks,
      "personal.socialLinks",
      "Personal: At least one social media link",
      false
    );
  } else {
    links.forEach((link, index) => {
      const valid =
        hasValue(link?.platform) &&
        hasValue(link?.url) &&
        (String(link?.platform || "").trim() !== "Other" ||
          hasValue(link?.customPlatform));
      addCheck(
        checks,
        `personal.socialLinks.${index}`,
        `Personal: Social media link ${index + 1}`,
        valid
      );
    });
  }

  addAnyCheck(checks, "kyc.pan", "Personal KYC: PAN Number", [
    formData?.panNumber,
    formData?.IDNumber,
  ]);
  addAnyCheck(checks, "kyc.aadhaar", "Personal KYC: Aadhaar Number", [
    formData?.aadhaarNumber,
  ]);
  addAnyCheck(checks, "kyc.panCard", "Personal KYC: Upload PAN Card", [
    profile?.personalKYCPreview?.panCard,
    personalKyc?.panCard?.url,
  ]);
  addAnyCheck(checks, "kyc.aadhaarFront", "Personal KYC: Upload Aadhaar Front", [
    profile?.personalKYCPreview?.aadhaarFront,
    personalKyc?.aadhaarFront?.url,
  ]);
  addAnyCheck(checks, "kyc.aadhaarBack", "Personal KYC: Upload Aadhaar Back", [
    profile?.personalKYCPreview?.aadhaarBack,
    personalKyc?.aadhaarBack?.url,
  ]);
  addAnyCheck(checks, "kyc.addressProof", "Personal KYC: Upload Address Proof", [
    profile?.personalKYCPreview?.addressProof,
    personalKyc?.addressProof?.url,
  ]);

  [
    ["bank.accountHolderName", "Bank: Account Holder Name", bank?.accountHolderName],
    ["bank.bankName", "Bank: Bank Name", bank?.bankName],
    ["bank.accountNumber", "Bank: Account Number", bank?.accountNumber],
    ["bank.ifscCode", "Bank: IFSC Code", bank?.ifscCode],
    ["bank.proofType", "Bank: Bank Proof Type", bank?.proofType],
  ].forEach(([key, label, value]) => addCheck(checks, key, label, hasValue(value)));

  addAnyCheck(checks, "bank.proof", "Bank: Upload Bank Proof", [
    profile?.bankProofPreview,
    bank?.proofFile?.url,
    bank?.proofUrl,
  ]);

  [
    ["businessKyc.gst", "Business KYC: GST Certificate", businessKyc?.gst?.url],
    ["businessKyc.shopAct", "Business KYC: Shop Act / License", businessKyc?.shopAct?.url],
    ["businessKyc.businessPan", "Business KYC: Business PAN Card", businessKyc?.businessPan?.url],
    ["businessKyc.cheque", "Business KYC: Cancelled Cheque", businessKyc?.cheque?.url],
    ["businessKyc.addressProof", "Business KYC: Business Address Proof", businessKyc?.addressProof?.url],
  ].forEach(([key, label, value]) =>
    addAnyCheck(checks, key, label, [profile?.businessKYCPreview?.[key.split(".").pop()], value])
  );

  [
    ["business.name", "Business Info: Business Name", formData?.BusinessName],
    ["business.stage", "Business Info: Business Stage", formData?.BusinessStage],
    ["business.establishedAt", "Business Info: Established Year", formData?.EstablishedAt],
    ["business.email", "Business Info: Business Email", formData?.BusinessEmailID],
    ["business.tagLine", "Business Info: Tag Line", formData?.TagLine],
    ["business.details", "Business Info: Business Type", formData?.BusinessDetails],
    ["business.locality", "Business Info: Locality", formData?.Locality],
    ["business.history", "Business Info: Business History", formData?.BusinessHistory],
    [
      "business.noteworthyAchievements",
      "Business Info: Noteworthy Achievements",
      formData?.NoteworthyAchievements,
    ],
    ["business.usp", "Business Info: USP", formData?.USP],
    ["business.clienteleBase", "Business Info: Clientele Base", formData?.ClienteleBase],
    ["business.category1", "Business Info: Primary Category", formData?.Category1],
    ["business.category2", "Business Info: Secondary Category", formData?.Category2],
    ["business.areaOfServices", "Business Info: Area Of Services", formData?.AreaOfServices],
    ["business.website", "Business Info: Website", formData?.Website],
  ].forEach(([key, label, value]) => addCheck(checks, key, label, hasValue(value)));

  buildServiceChecks(checks, profile);
  buildProductChecks(checks, profile);

  addCheck(
    checks,
    "payment.orbiter.feeType",
    "Payment: Orbiter Fee Type",
    hasValue(formData?.payment?.orbiter?.feeType)
  );
  if (formData?.payment?.orbiter?.feeType === "upfront") {
    [
      ["payment.orbiter.status", "Payment: Orbiter Fee Paid Status", formData?.payment?.orbiter?.status === "paid"],
      ["payment.orbiter.paidDate", "Payment: Orbiter Paid Date", formData?.payment?.orbiter?.paidDate],
      ["payment.orbiter.paymentMode", "Payment: Orbiter Payment Mode", formData?.payment?.orbiter?.paymentMode],
      ["payment.orbiter.paymentId", "Payment: Orbiter Transaction ID", formData?.payment?.orbiter?.paymentId],
    ].forEach(([key, label, value]) => addCheck(checks, key, label, hasValue(value)));
    addAnyCheck(checks, "payment.orbiter.screenshot", "Payment: Orbiter Screenshot", [
      formData?.payment?.orbiter?.screenshotPreview,
      formData?.payment?.orbiter?.screenshotURL,
    ]);
  }

  if (String(formData?.Category || "").trim() === "CosmOrbiter") {
    [
      ["payment.cosmo.status", "Payment: CosmOrbiter Fee Paid Status", formData?.payment?.cosmo?.status === "paid"],
      ["payment.cosmo.paidDate", "Payment: CosmOrbiter Paid Date", formData?.payment?.cosmo?.paidDate],
      ["payment.cosmo.paymentMode", "Payment: CosmOrbiter Payment Mode", formData?.payment?.cosmo?.paymentMode],
      ["payment.cosmo.paymentId", "Payment: CosmOrbiter Transaction ID", formData?.payment?.cosmo?.paymentId],
    ].forEach(([key, label, value]) => addCheck(checks, key, label, hasValue(value)));
    addAnyCheck(checks, "payment.cosmo.screenshot", "Payment: CosmOrbiter Screenshot", [
      formData?.payment?.cosmo?.screenshotPreview,
      formData?.payment?.cosmo?.screenshotURL,
    ]);
  }

  [
    ["health.currentCondition", "Health: Current Health Condition", formData?.CurrentHealthCondition],
    ["health.bloodGroup", "Health: Blood Group", formData?.BloodGroup],
    ["health.fitnessLevel", "Health: Fitness Level", formData?.FitnessLevel],
    ["health.smokingHabit", "Health: Smoking Habit", formData?.SmokingHabit],
    ["health.alcoholConsumption", "Health: Alcohol Consumption", formData?.AlcoholConsumption],
    ["health.parameters", "Health: Health Parameters", formData?.HealthParameters],
    ["health.notes", "Health: Lifestyle Notes", formData?.HealthNotes],
    ["health.familyHistorySummary", "Health: Family Health History", formData?.FamilyHistorySummary],
  ].forEach(([key, label, value]) => addCheck(checks, key, label, hasValue(value)));

  [
    ["education.highestQualification", "Education: Highest Qualification", formData?.HighestQualification],
    ["education.passingYear", "Education: Passing Year", formData?.PassingYear],
    ["education.degree", "Education: Degree", formData?.Degree],
    ["education.collegeName", "Education: College / Institute", formData?.CollegeName],
    ["education.specialization", "Education: Specialization", formData?.Specialization],
    ["education.certifications", "Education: Certifications", formData?.Certifications],
    ["education.background", "Education: Educational Background", formData?.EducationalBackground],
    ["education.languagesKnown", "Education: Languages Known", formData?.LanguagesKnown],
    ["education.mastery", "Education: Mastery", formData?.Mastery],
    ["education.exclusiveKnowledge", "Education: Exclusive Knowledge", formData?.ExclusiveKnowledge],
  ].forEach(([key, label, value]) => addCheck(checks, key, label, hasValue(value)));

  buildProfessionalChecks(checks, profile);

  [
    ["addinfo.aspirations", "Additional Info: Aspirations", formData?.Aspirations],
    ["addinfo.immediateDesire", "Additional Info: Immediate Desire", formData?.ImmediateDesire],
    ["addinfo.mastery", "Additional Info: Mastery", formData?.Mastery],
    [
      "addinfo.exclusiveKnowledge",
      "Additional Info: Exclusive Knowledge",
      formData?.ExclusiveKnowledge,
    ],
    [
      "addinfo.familyHistorySummary",
      "Additional Info: Family History Summary",
      formData?.FamilyHistorySummary,
    ],
    ["addinfo.hobbies", "Additional Info: Hobbies", formData?.Hobbies],
    ["addinfo.interestArea", "Additional Info: Interest Areas", formData?.InterestArea],
    [
      "addinfo.contribution",
      "Additional Info: Contribution ways (UJustBe)",
      formData?.ContributionAreainUJustBe,
    ],
    ["addinfo.skills", "Additional Info: Skills", formData?.Skills],
  ].forEach(([key, label, value]) => addCheck(checks, key, label, hasValue(value)));

  addCheck(
    checks,
    "addinfo.achievements",
    "Additional Info: Upload Certificates / Awards",
    hasValue(profile?.achievementPreviews)
  );

  buildCloseConnectionChecks(checks, profile);

  return checks;
}

export function getOrbiterProfileCompletionSummary(profile) {
  const checks = buildCompletionChecks(profile);
  const missingFields = checks.filter((check) => !check.passed).map((check) => check.label);
  const totalChecks = checks.length;
  const completedChecks = totalChecks - missingFields.length;
  const percent = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

  return {
    checks,
    completedChecks,
    missingFields,
    percent,
    totalChecks,
    isComplete: missingFields.length === 0,
  };
}
