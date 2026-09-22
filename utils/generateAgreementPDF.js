import jsPDF from "jspdf";

const PARTNER_AGREEMENT = `
This Partner Agreement is made between UJustBe and {{NAME}}, residing at {{ADDRESS}}.

By accepting this agreement, the Partner agrees to comply with all the rules,
policies, and operational standards set forth by UJustBe.

The Partner acknowledges that:
- All activities must follow ethical business practices.
- Platform misuse may result in termination.
- This agreement is legally binding.

The Partner agrees to represent the organization responsibly and uphold
the brand integrity at all times.
`;

const LISTED_PARTNER_AGREEMENT = `
This Listed Partner Agreement is entered into between UJustBe and {{NAME}},
located at {{ADDRESS}}.

As a CosmOrbiter (Listed Partner), you agree to:

- Maintain accurate service information.
- Deliver promised services professionally.
- Comply with platform operational guidelines.
- Accept that non-compliance may lead to delisting.

This agreement constitutes a legally binding contract.
`;

export const generateAgreementPDF = async ({
  name,
  address,
  city,
  category,
}) => {
  const doc = new jsPDF("p", "mm", "a4");

  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  const MARGIN_X = 20;
  const MARGIN_Y = 40;
  const FONT_SIZE = 11.5;
  const LINE_HEIGHT = 6.5;
  const TEXT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
  let cursorY = MARGIN_Y;

  const isCosmOrbiter = category === "CosmOrbiter";
  const agreementText = isCosmOrbiter
    ? LISTED_PARTNER_AGREEMENT
    : PARTNER_AGREEMENT;

  const finalText = agreementText
    .replace(/{{NAME}}/g, name)
    .replace(/{{ADDRESS}}/g, `${address}, ${city}`);

  const LOGO_WIDTH = 30;
  const LOGO_HEIGHT = 30;
  const LOGO_X = (PAGE_WIDTH - LOGO_WIDTH) / 2;

  doc.addImage("/ujustlogo.png", "PNG", LOGO_X, 10, LOGO_WIDTH, LOGO_HEIGHT);

  cursorY = 55;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(17);
  doc.text(
    isCosmOrbiter ? "LISTED PARTNER AGREEMENT" : "PARTNER AGREEMENT",
    PAGE_WIDTH / 2,
    cursorY,
    { align: "center" }
  );

  cursorY += 18;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(FONT_SIZE);

  finalText.split("\n").forEach((line) => {
    if (!line.trim()) {
      cursorY += LINE_HEIGHT;
      return;
    }

    const wrappedLines = doc.splitTextToSize(line, TEXT_WIDTH);
    wrappedLines.forEach((wrappedLine) => {
      if (cursorY > PAGE_HEIGHT - 30) {
        doc.addPage();
        cursorY = MARGIN_Y;
      }

      doc.text(wrappedLine, MARGIN_X, cursorY);
      cursorY += LINE_HEIGHT;
    });
  });

  doc.addPage();
  cursorY = 60;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(14);
  doc.text("ACCEPTANCE & CONFIRMATION", PAGE_WIDTH / 2, cursorY, {
    align: "center",
  });

  cursorY += 20;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Name: ${name}`, MARGIN_X, cursorY);
  cursorY += 12;
  doc.text(`Category: ${category}`, MARGIN_X, cursorY);
  cursorY += 12;
  doc.text(`Address: ${address}, ${city}`, MARGIN_X, cursorY);
  cursorY += 12;
  doc.text(`Date: ${new Date().toLocaleDateString()}`, MARGIN_X, cursorY);

  cursorY += 25;
  doc.text("Signature: Digitally Accepted", MARGIN_X, cursorY);

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(42);
    doc.setTextColor(235);
    doc.text("DIGITALLY ACCEPTED", PAGE_WIDTH / 2, PAGE_HEIGHT / 2, {
      align: "center",
      angle: 35,
    });

    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 12, {
      align: "center",
    });
  }

  const pdfBlob = doc.output("blob");
  const safeName = String(name || "User")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  const fileName = `${isCosmOrbiter ? "ListedPartner" : "Partner"}_Agreement_${safeName || "User"}.pdf`;

  return new File([pdfBlob], fileName, {
    type: "application/pdf",
  });
};
