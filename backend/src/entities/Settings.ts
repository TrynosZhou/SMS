import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('settings')
export class Settings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Student ID Settings
  @Column({ type: 'varchar', default: 'JPS' })
  studentIdPrefix: string;

  // Fees Settings (JSON)
  @Column({ type: 'json', nullable: true })
  feesSettings: {
    dayScholarTuitionFee?: number;
    boarderTuitionFee?: number;
    registrationFee?: number;
    deskFee?: number;
    libraryFee?: number;
    sportsFee?: number;
    transportCost?: number; // School transport cost for day scholars
    diningHallCost?: number; // Dining hall (DH) cost for day scholars
    otherFees?: { name: string; amount: number }[];
    /** Shown on invoice statement & payment receipt PDFs for bank transfer guidance */
    paymentBanking?: {
      accountName?: string;
      bankName?: string;
      branch?: string;
      accountNumber?: string;
      paymentReferenceHint?: string;
    };
  } | null;

  // Grade Thresholds (JSON)
  @Column({ type: 'json', nullable: true })
  gradeThresholds: {
    excellent?: number; // e.g., 90
    veryGood?: number;  // e.g., 80
    good?: number;      // e.g., 60
    satisfactory?: number; // e.g., 40
    needsImprovement?: number; // e.g., 20
    basic?: number; // e.g., 1
  } | null;

  // Grade Labels/Remarks (JSON) - Custom names for each grade level
  @Column({ type: 'json', nullable: true })
  gradeLabels: {
    excellent?: string; // e.g., "Outstanding"
    veryGood?: string;  // e.g., "Very High"
    good?: string;      // e.g., "High"
    satisfactory?: string; // e.g., "Good"
    needsImprovement?: string; // e.g., "Aspiring"
    basic?: string; // e.g., "Basic"
    fail?: string; // e.g., "Unclassified"
  } | null;

  // School Information
  @Column({ type: 'text', nullable: true })
  schoolLogo: string | null; // Base64 encoded image or URL

  @Column({ type: 'text', nullable: true })
  schoolLogo2: string | null; // Second school logo - Base64 encoded image or URL

  @Column({ type: 'text', nullable: true })
  schoolName: string | null;

  @Column({ type: 'text', nullable: true })
  schoolAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  schoolPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  schoolEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  schoolWebsite: string | null;

  @Column({ type: 'varchar', nullable: true })
  schoolFacebookUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  headmasterName: string | null;

  @Column({ type: 'text', nullable: true })
  schoolMotto: string | null; // School motto or tagline
  
  // School-wide class teacher remark phrases
  @Column({ type: 'json', nullable: true })
  classTeacherPhrases: string[] | null;

  // Academic Year
  @Column({ type: 'varchar', nullable: true })
  academicYear: string | null; // e.g., "2024/2025"

  // Current Term
  @Column({ type: 'varchar', nullable: true })
  currentTerm: string | null; // e.g., "Term 1 2024"

  // Active Term (for fetching across all pages)
  @Column({ type: 'varchar', nullable: true })
  activeTerm: string | null; // e.g., "Term 1 2024"

  // Term Dates
  @Column({ type: 'date', nullable: true })
  termStartDate: Date | null; // Opening day of the term

  @Column({ type: 'date', nullable: true })
  termEndDate: Date | null; // Closing day of the term

  /** School grade / form levels (e.g. ECD, Stage 1A) — Academic Settings → Grades tab */
  @Column({ type: 'json', nullable: true })
  classLevels: string[] | null;

  /** Managed academic terms (Terms tab in Academic Settings) */
  @Column({ type: 'json', nullable: true })
  academicTerms: Array<{
    id: string;
    type: string;
    label: string;
    term: string;
    year: string;
    startDate: string;
    endDate: string;
  }> | null;

  // Currency Symbol
  @Column({ type: 'varchar', default: '$' })
  currencySymbol: string; // e.g., "KES", "$", "€", "£"

  /** When true, Head Teacher (universal teacher) account can be created and used; access controlled by moduleAccess.universalTeacher */
  @Column({ type: 'boolean', default: false })
  universalTeacherEnabled: boolean;

  // Module Access Control (JSON)
  @Column({ type: 'json', nullable: true })
  moduleAccess: {
    /** Access for the shared universal teacher account (when universalTeacherEnabled) */
    universalTeacher?: {
      students?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      settings?: boolean;
      payroll?: boolean;
      // Fine-grained module manager toggles for the Universal Teacher account
      subjectManager?: boolean;
      studentManager?: boolean;
      examManager?: boolean;
      logisticsManager?: boolean;
      classManager?: boolean;
      teacherManager?: boolean;
      inventory?: boolean;
    };
    teachers?: {
      students?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      settings?: boolean;
      payroll?: boolean;
      /** Librarian / stock management */
      inventory?: boolean;
    };
    parents?: {
      reportCards?: boolean;
      invoices?: boolean;
      dashboard?: boolean;
      payroll?: boolean;
    };
    accountant?: {
      students?: boolean;
      invoices?: boolean;
      finance?: boolean;
      dashboard?: boolean;
      settings?: boolean;
      payroll?: boolean;
      inventory?: boolean;
    };
    admin?: {
      students?: boolean;
      teachers?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      attendance?: boolean;
      settings?: boolean;
      dashboard?: boolean;
      payroll?: boolean;
      inventory?: boolean;
    };
    director?: {
      students?: boolean;
      teachers?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      attendance?: boolean;
      settings?: boolean;
      dashboard?: boolean;
      payroll?: boolean;
      inventory?: boolean;
    };
    headmaster?: {
      students?: boolean;
      teachers?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      attendance?: boolean;
      settings?: boolean;
      dashboard?: boolean;
      payroll?: boolean;
      inventory?: boolean;
    };
    deputy_headmaster?: {
      students?: boolean;
      teachers?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      attendance?: boolean;
      settings?: boolean;
      dashboard?: boolean;
      payroll?: boolean;
      inventory?: boolean;
    };
    students?: {
      dashboard?: boolean;
      subjects?: boolean;
      assignments?: boolean;
      reportCards?: boolean;
      finance?: boolean;
      payroll?: boolean;
      /** View own textbooks / furniture / fines */
      inventory?: boolean;
    };
    demoAccount?: {
      dashboard?: boolean;
      students?: boolean;
      teachers?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      attendance?: boolean;
      assignments?: boolean;
      messages?: boolean;
      accounts?: boolean;
      settings?: boolean;
      payroll?: boolean;
    };
  } | null;

  // Promotion Rules (JSON) - Maps current class to next class
  @Column({ type: 'json', nullable: true })
  promotionRules: {
    [currentClass: string]: string; // e.g., "ECD A": "ECD B", "Grade 1": "Grade 2"
  } | null;

  // Payroll: loan interest rates (% per repayment period) and banks for salary deposit
  @Column({ type: 'json', nullable: true })
  inventorySettings: {
    /** Default loan period in days for library borrows */
    loanDaysDefault?: number;
    /** Currency units charged per calendar day overdue */
    overdueFinePerDay?: number;
    /** After due date + grace, item may be flagged lost / accountability */
    lossGraceDaysAfterDue?: number;
  } | null;

  /** SMS / WhatsApp and push notification toggles (System Settings → Notifications) */
  @Column({ type: 'json', nullable: true })
  notificationSettings: {
    sms?: {
      feePaymentReceived?: boolean;
      studentAbsence?: boolean;
      reportCardReady?: boolean;
    };
    whatsapp?: {
      /** Admin / leadership WhatsApp numbers for results-published alerts */
      adminPhones?: string[];
    };
    push?: {
      enabled?: boolean;
    };
  } | null;

  /** Password policy and login limits (System Settings → Security) */
  @Column({ type: 'json', nullable: true })
  securitySettings: {
    minPasswordLength?: number;
    maxLoginAttempts?: number;
    requireUppercase?: boolean;
    requireNumber?: boolean;
    requireSpecialChar?: boolean;
    sessionTimeoutMinutes?: number;
    enableTwoFactorAuth?: boolean;
  } | null;

  /** SMTP / outbound email (System Settings → Email Settings) */
  @Column({ type: 'json', nullable: true })
  emailSettings: {
    smtpHost?: string;
    smtpPort?: number;
    smtpUsername?: string;
    smtpPassword?: string;
    fromName?: string;
    fromAddress?: string;
  } | null;

  @Column({ type: 'json', nullable: true })
  payrollSettings: {
    /** Interest rate (%) when loan is repaid in 1 month */
    loanInterestRate1Month?: number;
    /** Interest rate (%) when loan is repaid in 2 months */
    loanInterestRate2Months?: number;
    /** Interest rate (%) when loan is repaid in 3 months */
    loanInterestRate3Months?: number;
    /** Banks available for salary deposit (admin-configured) */
    banks?: Array<{ id: string; name: string }>;
  } | null;

  // Timetable Settings
  @Column({ type: 'time', nullable: true })
  schoolStartTime: string | null; // e.g., "07:30:00"

  @Column({ type: 'time', nullable: true })
  schoolEndTime: string | null; // e.g., "16:10:00"

  @Column({ type: 'json', nullable: true })
  breakTimes: Array<{
    name: string;
    startTime: string;
    endTime: string;
  }> | null; // e.g., [{ name: "Tea Break", startTime: "10:00", endTime: "10:20" }]

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

