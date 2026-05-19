const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ImageRun } = require('docx');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment || AlignmentType.LEFT,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: text,
        bold: !!opts.bold,
        italics: !!opts.italics,
        break: 0,
      }),
    ],
  });
}

function bullet(text) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}

async function run() {
  const brandingDir = path.join(process.cwd(), "docs", "branding");
  const brandingJson = path.join(brandingDir, "branding.json");
  const branding = fs.existsSync(brandingJson) ? JSON.parse(fs.readFileSync(brandingJson, "utf8")) : {};
  const schoolName = branding.schoolName || "School Name";
  const schoolMotto = branding.schoolMotto || "";
  const schoolAddress = branding.schoolAddress || "";
  const schoolPhones = branding.schoolPhones || "";
  const schoolEmail = branding.schoolEmail || "";
  const logoLeftPath = branding.logoLeftPath ? path.join(process.cwd(), branding.logoLeftPath) : path.join(brandingDir, "logo-left.png");
  const logoRightPath = branding.logoRightPath ? path.join(process.cwd(), branding.logoRightPath) : path.join(brandingDir, "logo-right.png");

  const signInPng = path.join(brandingDir, "screenshot-signin.png");
  const signUpPng = path.join(brandingDir, "screenshot-signup.png");
  const linkStudentPng = path.join(brandingDir, "screenshot-link-student.png");
  const reportCardPng = path.join(brandingDir, "screenshot-report-card.png");
  const statementPng = path.join(brandingDir, "screenshot-statement.png");
  const messagesPng = path.join(brandingDir, "screenshot-messages.png");

  const doc = new Document({
    creator: "School Management System",
    title: "Parent Login & Onboarding Manual",
    description: "Step-by-step guide for parents to sign up, sign in, link students, and use the system",
    sections: [{
      properties: {},
      children: [
      // Branding header (logos + text)
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
                children: [
                  ...(fs.existsSync(logoLeftPath) ? [new Paragraph({ alignment: AlignmentType.LEFT, children: [new ImageRun({ data: fs.readFileSync(logoLeftPath), transformation: { width: 120, height: 120 } })] })] : [p("(Place left logo at docs/branding/logo-left.png)", { italics: true })]),
                ],
              }),
              new TableCell({
                width: { size: 60, type: WidthType.PERCENTAGE },
                borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: schoolName, bold: true, size: 56 })] }),
                  ...(schoolMotto ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: schoolMotto, italics: true, size: 28 })] })] : []),
                  ...(schoolAddress ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: schoolAddress, size: 24 })] })] : []),
                  ...(schoolPhones ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Telephones: ${schoolPhones}`, size: 22 })] })] : []),
                  ...(schoolEmail ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Email: ${schoolEmail}`, size: 22 })] })] : []),
                ],
              }),
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
                children: [
                  ...(fs.existsSync(logoRightPath) ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ data: fs.readFileSync(logoRightPath), transformation: { width: 120, height: 120 } })] })] : [p("(Place right logo at docs/branding/logo-right.png)", { italics: true, alignment: AlignmentType.RIGHT })]),
                ],
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "", spacing: { after: 200 } }),
      new Paragraph({
        text: "Parent Login & Onboarding Manual",
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      }),
      p("Purpose", { bold: true }),
      p("This guide helps parents create an account, sign in, link their child, and access report cards, statements, and notifications."),

      p("Prerequisites", { bold: true }),
      bullet("A valid email address and mobile number"),
      bullet("Your child’s Student ID and Date of Birth"),
      bullet("The school portal URL provided by the school"),

      p("Sign Up", { bold: true }),
      bullet("Open the school portal in your web browser"),
      bullet("On the sign‑in page, select “Create Account” or “Sign Up”"),
      bullet("Choose the Parent role if prompted"),
      bullet("Enter your name, email, mobile number, username (if requested) and password"),
      bullet("Submit the form"),
      bullet("If email verification is required, open the link sent to your inbox to complete verification"),
      ...(fs.existsSync(signUpPng) ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: fs.readFileSync(signUpPng), transformation: { width: 540, height: 300 } })] })] : [p("(Insert screenshot: Sign Up page)", { italics: true })]),

      p("Sign In", { bold: true }),
      bullet("Go to the sign‑in page"),
      bullet("Enter your username or email and your password"),
      bullet("Select “Sign In”"),
      bullet("Forgot your password? Use “Forgot Password”, enter your email, open the reset link, and set a new password"),
      ...(fs.existsSync(signInPng) ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: fs.readFileSync(signInPng), transformation: { width: 540, height: 300 } })] })] : [p("(Insert screenshot: Sign In page)", { italics: true })]),

      p("Link Your Child", { bold: true }),
      bullet("Navigate to the Parent area (e.g., “My Students” or “Link Student”)"),
      bullet("Option 1 – Link with Student ID + Date of Birth: Enter both and submit"),
      bullet("Option 2 – Link with Student ID only (if enabled): Enter Student ID and submit"),
      bullet("After linking, your child appears under “My Students”. You can unlink if needed."),
      ...(fs.existsSync(linkStudentPng) ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: fs.readFileSync(linkStudentPng), transformation: { width: 540, height: 300 } })] })] : [p("(Insert screenshot: Link Student)", { italics: true })]),

      p("Report Cards", { bold: true }),
      bullet("Open the Student Report Card section"),
      bullet("Select your child and the term/period"),
      bullet("View results and remarks"),
      bullet("Download or print the report (if available)"),
      ...(fs.existsSync(reportCardPng) ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: fs.readFileSync(reportCardPng), transformation: { width: 540, height: 300 } })] })] : [p("(Insert screenshot: Report Card view)", { italics: true })]),

      p("Invoices and Statements", { bold: true }),
      bullet("Open the Student Invoice Statement section"),
      bullet("Select your child and a date range/term if prompted"),
      bullet("Review outstanding balance and transaction history"),
      bullet("Download a PDF copy for your records"),
      ...(fs.existsSync(statementPng) ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: fs.readFileSync(statementPng), transformation: { width: 540, height: 300 } })] })] : [p("(Insert screenshot: Invoice/Statement view)", { italics: true })]),

      p("Notifications and Messages", { bold: true }),
      bullet("Open Messages/Inbox for announcements or direct messages from the school"),
      bullet("Reply where applicable or use the provided contact channels"),
      ...(fs.existsSync(messagesPng) ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: fs.readFileSync(messagesPng), transformation: { width: 540, height: 300 } })] })] : [p("(Insert screenshot: Messages/Inbox)", { italics: true })]),

      p("Profile and Security", { bold: true }),
      bullet("Update your name, email, or contact details in “Profile” or “Account”"),
      bullet("Change your password regularly"),
      bullet("Sign out on shared devices"),
      bullet("The system may sign you out after inactivity; sign in again to continue"),

      p("Troubleshooting", { bold: true }),
      bullet("Can’t sign in: verify credentials, use “Forgot Password”, or try a different browser"),
      bullet("No verification or reset email: check Spam/Junk and confirm your email with the school"),
      bullet("Student not found/can’t link: confirm Student ID and Date of Birth; contact the school if recently enrolled/transferred"),
      bullet("Page errors: check internet connection; try again later (maintenance may be in progress)"),

      p("Good Practices", { bold: true }),
      bullet("Keep your login details private"),
      bullet("Review report cards and statements regularly"),
      bullet("Keep contact details up to date to receive important notifications"),

      p("Support", { bold: true }),
      p("For account issues, contact the school office or portal administrator. Provide your full name, registered email, and (if relevant) your child’s Student ID."),
      ],
    }],
  });

  const outDir = path.join(process.cwd(), "docs");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, "Parent_Login_Manual.docx");
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  console.log("Generated:", outPath);

  const pdfPath = path.join(outDir, "Parent_Login_Manual.pdf");
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageMargin = 48;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - pageMargin;

  function sanitize(str) {
    return String(str)
      .replace(/\u2011|\u2012|\u2013|\u2014|\u2212/g, "-")
      .replace(/\u2018|\u2019/g, "'")
      .replace(/\u201C|\u201D/g, '"')
      .replace(/\u00A0/g, " ");
  }

  function addTextLine(text, size = 12, bold = false, color = rgb(0, 0, 0)) {
    text = sanitize(text);
    const font = bold ? helveticaBold : helvetica;
    const wrapped = wrapText(text, font, size, pageWidth - pageMargin * 2);
    wrapped.forEach((line) => {
      if (y < pageMargin + size + 10) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - pageMargin;
      }
      page.drawText(line, { x: pageMargin, y: y - size, size, font, color });
      y -= size + 6;
    });
    y -= 4;
  }

  function wrapText(text, font, size, maxWidth) {
    text = sanitize(text);
    const words = text.split(' ');
    const lines = [];
    let current = '';
    words.forEach((w) => {
      const test = current ? current + ' ' + w : w;
      const width = font.widthOfTextAtSize(test, size);
      if (width > maxWidth) {
        if (current) lines.push(current);
        current = w;
      } else {
        current = test;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  async function addImageIfExists(imgPath, maxW, maxH, align = 'center') {
    if (!fs.existsSync(imgPath)) return;
    const bytes = fs.readFileSync(imgPath);
    const ext = path.extname(imgPath).toLowerCase();
    let img;
    if (ext === '.jpg' || ext === '.jpeg') {
      img = await pdfDoc.embedJpg(bytes);
    } else {
      img = await pdfDoc.embedPng(bytes);
    }
    let w = img.width;
    let h = img.height;
    const scale = Math.min(maxW / w, maxH / h, 1);
    w *= scale;
    h *= scale;
    if (y - h < pageMargin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - pageMargin;
    }
    const x =
      align === 'center'
        ? (pageWidth - w) / 2
        : align === 'right'
        ? pageWidth - pageMargin - w
        : pageMargin;
    page.drawImage(img, { x, y: y - h, width: w, height: h });
    y -= h + 12;
  }

  await addImageIfExists(logoLeftPath, 120, 120, 'left');
  await addImageIfExists(logoRightPath, 120, 120, 'right');
  addTextLine(schoolName, 18, true);
  if (schoolMotto) addTextLine(schoolMotto, 12, false);
  if (schoolAddress) addTextLine(schoolAddress, 11, false);
  if (schoolPhones) addTextLine(`Telephones: ${schoolPhones}`, 10, false);
  if (schoolEmail) addTextLine(`Email: ${schoolEmail}`, 10, false);
  y -= 8;

  addTextLine("Parent Login & Onboarding Manual", 16, true);

  addTextLine("Purpose", 14, true);
  addTextLine("This guide helps parents create an account, sign in, link their child, and access report cards, statements, and notifications.", 12);

  addTextLine("Prerequisites", 14, true);
  ["A valid email address and mobile number",
   "Your child’s Student ID and Date of Birth",
   "The school portal URL provided by the school"].forEach(t => addTextLine("• " + t));

  addTextLine("Sign Up", 14, true);
  ["Open the school portal in your web browser",
   "On the sign‑in page, select “Create Account” or “Sign Up”",
   "Choose the Parent role if prompted",
   "Enter your name, email, mobile number, username (if requested) and password",
   "Submit the form",
   "If email verification is required, open the link sent to your inbox to complete verification"].forEach(t => addTextLine("• " + t));
  await addImageIfExists(signUpPng, pageWidth - pageMargin * 2, 280);

  addTextLine("Sign In", 14, true);
  ["Go to the sign‑in page",
   "Enter your username or email and your password",
   "Select “Sign In”",
   "Forgot your password? Use “Forgot Password”, enter your email, open the reset link, and set a new password"].forEach(t => addTextLine("• " + t));
  await addImageIfExists(signInPng, pageWidth - pageMargin * 2, 280);

  addTextLine("Link Your Child", 14, true);
  ["Navigate to the Parent area (e.g., “My Students” or “Link Student”)",
   "Option 1 – Link with Student ID + Date of Birth: Enter both and submit",
   "Option 2 – Link with Student ID only (if enabled): Enter Student ID and submit",
   "After linking, your child appears under “My Students”. You can unlink if needed."].forEach(t => addTextLine("• " + t));
  await addImageIfExists(linkStudentPng, pageWidth - pageMargin * 2, 280);

  addTextLine("Report Cards", 14, true);
  ["Open the Student Report Card section",
   "Select your child and the term/period",
   "View results and remarks",
   "Download or print the report (if available)"].forEach(t => addTextLine("• " + t));
  await addImageIfExists(reportCardPng, pageWidth - pageMargin * 2, 280);

  addTextLine("Invoices and Statements", 14, true);
  ["Open the Student Invoice Statement section",
   "Select your child and a date range/term if prompted",
   "Review outstanding balance and transaction history",
   "Download a PDF copy for your records"].forEach(t => addTextLine("• " + t));
  await addImageIfExists(statementPng, pageWidth - pageMargin * 2, 280);

  addTextLine("Notifications and Messages", 14, true);
  ["Open Messages/Inbox for announcements or direct messages from the school",
   "Reply where applicable or use the provided contact channels"].forEach(t => addTextLine("• " + t));
  await addImageIfExists(messagesPng, pageWidth - pageMargin * 2, 280);

  addTextLine("Profile and Security", 14, true);
  ["Update your name, email, or contact details in “Profile” or “Account”",
   "Change your password regularly",
   "Sign out on shared devices",
   "The system may sign you out after inactivity; sign in again to continue"].forEach(t => addTextLine("• " + t));

  addTextLine("Troubleshooting", 14, true);
  ["Can’t sign in: verify credentials, use “Forgot Password”, or try a different browser",
   "No verification or reset email: check Spam/Junk and confirm your email with the school",
   "Student not found/can’t link: confirm Student ID and Date of Birth; contact the school if recently enrolled/transferred",
   "Page errors: check internet connection; try again later (maintenance may be in progress)"].forEach(t => addTextLine("• " + t));

  addTextLine("Good Practices", 14, true);
  ["Keep your login details private",
   "Review report cards and statements regularly",
   "Keep contact details up to date to receive important notifications"].forEach(t => addTextLine("• " + t));

  addTextLine("Support", 14, true);
  addTextLine("For account issues, contact the school office or portal administrator. Provide your full name, registered email, and (if relevant) your child’s Student ID.");

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(pdfPath, pdfBytes);
  console.log("Generated:", pdfPath);
}

run().catch((err) => {
  console.error("Failed to generate manual:", err);
  process.exit(1);
});
