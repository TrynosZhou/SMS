import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { StudentListComponent } from './components/students/student-list/student-list.component';
import { StudentFormComponent } from './components/students/student-form/student-form.component';
import { StudentTransferComponent } from './components/students/student-transfer/student-transfer.component';
import { TeacherListComponent } from './components/teachers/teacher-list/teacher-list.component';
import { TeacherFormComponent } from './components/teachers/teacher-form/teacher-form.component';
import { ExamListComponent } from './components/exams/exam-list/exam-list.component';
import { ExamFormComponent } from './components/exams/exam-form/exam-form.component';
import { MarksEntryComponent } from './components/exams/marks-entry/marks-entry.component';
import { ReportCardComponent } from './components/exams/report-card/report-card.component';
import { MarkSheetComponent } from './components/exams/mark-sheet/mark-sheet.component';
import { ResultsAnalysisComponent } from './components/exams/results-analysis/results-analysis.component';
import { PublishResultsComponent } from './components/exams/publish-results/publish-results.component';
import { InvoiceListComponent } from './components/finance/invoice-list/invoice-list.component';
import { InvoiceNotePageComponent } from './components/finance/invoice-note-page/invoice-note-page.component';
import { InvoiceSyncRemediationComponent } from './components/finance/invoice-sync-remediation/invoice-sync-remediation.component';
import { InvoiceFormComponent } from './components/finance/invoice-form/invoice-form.component';
import { InvoiceStatementsComponent } from './components/finance/invoice-statements/invoice-statements.component';
import { RecordPaymentComponent } from './components/finance/record-payment/record-payment.component';
import { OutstandingBalanceComponent } from './components/finance/outstanding-balance/outstanding-balance.component';
import { BalanceEnquiryComponent } from './components/finance/balance-enquiry/balance-enquiry.component';
import { CashLogisticsComponent } from './components/finance/cash-logistics/cash-logistics.component';
import { AuditComponent } from './components/finance/audit/audit.component';
import { FinancialBooksComponent } from './components/finance/financial-books/financial-books.component';
import { ExemptionsManagementComponent } from './components/finance/exemptions-management/exemptions-management.component';
import { ExemptionReportComponent } from './components/finance/exemption-report/exemption-report.component';
import { FinancialReportComponent } from './components/finance/financial-reports/financial-report.component';
import { FeesCollectionReportComponent } from './components/finance/financial-reports/fees-collection-report.component';
import { StudentLedgerReportComponent } from './components/finance/financial-reports/student-ledger-report.component';
import { AgedDebtorsReportComponent } from './components/finance/financial-reports/aged-debtors-report.component';
import { ClassListComponent } from './components/classes/class-list/class-list.component';
import { ClassFormComponent } from './components/classes/class-form/class-form.component';
import { ClassListsComponent } from './components/classes/class-lists/class-lists.component';
import { SubjectListComponent } from './components/subjects/subject-list/subject-list.component';
import { SubjectFormComponent } from './components/subjects/subject-form/subject-form.component';
import { TeachingLoadComponent } from './components/subjects/teaching-load/teaching-load.component';
import { AssignSubjectComponent } from './components/subjects/assign-subject/assign-subject.component';
import { SettingsComponent } from './components/settings/settings.component';
import { AcademicSettingsComponent } from './components/academic-settings/academic-settings.component';
import { ParentDashboardComponent } from './components/parent/parent-dashboard/parent-dashboard.component';
import { LinkStudentsComponent } from './components/parent/link-students/link-students.component';
import { ParentInboxComponent } from './components/parent/parent-inbox/parent-inbox.component';
import { ManageAccountComponent } from './components/teachers/manage-account/manage-account.component';
import { ManageAccountsComponent } from './components/admin/manage-accounts/manage-accounts.component';
import { UserManagementComponent } from './components/admin/user-management/user-management.component';
import { ParentManagementComponent } from './components/admin/parent-management/parent-management.component';
import { ClassPromotionComponent } from './components/admin/class-promotion/class-promotion.component';
import { MarkAttendanceComponent } from './components/attendance/mark-attendance/mark-attendance.component';
import { AttendanceReportsComponent } from './components/attendance/attendance-reports/attendance-reports.component';
import { RecordBookComponent } from './components/teacher/record-book/record-book.component';
import { MyClassesComponent } from './components/teacher/my-classes/my-classes.component';
import { TeacherRecordBookComponent } from './components/admin/teacher-record-book/teacher-record-book.component';
import { TeacherDashboardComponent } from './components/teacher/teacher-dashboard/teacher-dashboard.component';
import { StudentReportCardComponent } from './components/student/student-report-card/student-report-card.component';
import { StudentInvoiceStatementComponent } from './components/student/student-invoice-statement/student-invoice-statement.component';
import { UserManualComponent } from './components/user-manual/user-manual.component';
import { AuthGuard } from './guards/auth.guard';
import { ModuleAccessGuard } from './guards/module-access.guard';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { SplashComponent } from './components/splash/splash.component';
import { MarksProgressComponent } from './components/exams/marks-progress/marks-progress.component';
import { SendMessageComponent } from './components/messages/send-message/send-message.component';
import { AccountantInboxComponent } from './components/messages/accountant-inbox/accountant-inbox.component';
import { ParentSendMessageComponent } from './components/parent/parent-send-message/parent-send-message.component';
import { ParentOutboxComponent } from './components/parent/parent-outbox/parent-outbox.component';
import { IncomingFromParentsComponent } from './components/messages/incoming-from-parents/incoming-from-parents.component';
import { OutgoingMessagesComponent } from './components/messages/outgoing-messages/outgoing-messages.component';
import { DraftMessagesComponent } from './components/messages/draft-messages/draft-messages.component';
import { EnrollStudentComponent } from './components/students/enroll-student/enroll-student.component';
import { AllocateClassesComponent } from './components/teachers/allocate-classes/allocate-classes.component';
import { UserLogComponent } from './components/admin/user-log/user-log.component';
import { AdminGuard } from './guards/admin.guard';
import { IntegrationsComponent } from './components/admin/integrations/integrations.component';
import { LicenseConfigComponent } from './components/admin/license-config/license-config.component';
import { AccessDeniedComponent } from './components/access-denied/access-denied.component';
import { ParentInvoiceStatementComponent } from './components/parent/parent-invoice-statement/parent-invoice-statement.component';
import { StudentPortalComponent } from './components/parent/student-portal/student-portal.component';
import { ParentPortalComponent } from './components/student/parent-portal/parent-portal.component';

const routes: Routes = [
  { path: '', component: SplashComponent, data: { title: 'Junior Primary School Management System | Smart Edu System', description: 'Junior Primary School Management System - Manage students, teachers, classes, exams and attendance. School management for administrators, teachers and parents.', robots: 'index,follow' } },
  { path: 'access-denied', component: AccessDeniedComponent, canActivate: [AuthGuard], data: { title: 'Access Denied', robots: 'noindex,nofollow' } },
  { path: 'login', component: LoginComponent, data: { title: 'Login - Junior Primary School Management System', description: 'Sign in to Junior Primary School Management System to access your school dashboard.', robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' } },
  { path: 'reset-password', component: LoginComponent, data: { title: 'Reset Password - Junior Primary School Management System', description: 'Reset your password for Junior Primary School Management System.', robots: 'noindex,nofollow' } },
  { path: 'sign-in', redirectTo: '/login', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard], data: { title: 'Dashboard', pageTitle: 'Dashboard' } },
  { path: 'account/change-password', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'parent/dashboard', component: ParentDashboardComponent, canActivate: [AuthGuard] },
  { path: 'teacher/dashboard', component: TeacherDashboardComponent, canActivate: [AuthGuard], data: { title: 'Teacher Dashboard', pageTitle: 'Teacher Dashboard' } },
  { path: 'parent/inbox', component: ParentInboxComponent, canActivate: [AuthGuard] },
  { path: 'parent/send-message', component: ParentSendMessageComponent, canActivate: [AuthGuard] },
  { path: 'parent/outbox', component: ParentOutboxComponent, canActivate: [AuthGuard] },
  { path: 'parent/link-students', component: LinkStudentsComponent, canActivate: [AuthGuard] },
  { path: 'parent/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'parent/invoice-statement', component: ParentInvoiceStatementComponent, canActivate: [AuthGuard] },
  { path: 'parent/student-portal', component: StudentPortalComponent, canActivate: [AuthGuard] },
  { path: 'teacher/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard], data: { title: 'My Account', pageTitle: 'My Account' } },
  { path: 'accountant/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'accountant/change_password', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'messages/send', component: SendMessageComponent, canActivate: [AuthGuard] },
  { path: 'messages/inbox', component: AccountantInboxComponent, canActivate: [AuthGuard] },
  { path: 'messages/incoming', component: IncomingFromParentsComponent, canActivate: [AuthGuard] },
  { path: 'messages/outgoing', component: OutgoingMessagesComponent, canActivate: [AuthGuard] },
  { path: 'messages/drafts', component: DraftMessagesComponent, canActivate: [AuthGuard] },
  { path: 'teacher/record-book', component: RecordBookComponent, canActivate: [AuthGuard] },
  { path: 'teacher/my-classes', component: MyClassesComponent, canActivate: [AuthGuard] },
  { path: 'teacher/eservices', redirectTo: '/teacher/dashboard', pathMatch: 'full' },
  { path: 'teacher/student-responses', redirectTo: '/teacher/dashboard', pathMatch: 'full' },
  { path: 'teacher/mark-response/:responseId', redirectTo: '/teacher/dashboard', pathMatch: 'full' },
  { path: 'admin/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'user-management', component: UserManagementComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'admin/manage-accounts', component: ManageAccountsComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'admin/parents', component: ParentManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'parents' } },
  { path: 'admin/class-promotion', component: ClassPromotionComponent, canActivate: [AuthGuard] },
  { path: 'admin/teacher-record-book', component: TeacherRecordBookComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'students', component: StudentListComponent, canActivate: [AuthGuard] },
  { path: 'students/new', component: StudentFormComponent, canActivate: [AuthGuard] },
  { path: 'students/enroll_student', component: EnrollStudentComponent, canActivate: [AuthGuard] },
  { path: 'students/:id/edit', component: StudentFormComponent, canActivate: [AuthGuard] },
  { path: 'students/transfer', component: StudentTransferComponent, canActivate: [AuthGuard] },
  { path: 'teachers', component: TeacherListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'teachers' } },
  { path: 'teachers/new', component: TeacherFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'teachers' } },
  { path: 'teachers/allocate_class', component: AllocateClassesComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'teachers' } },
  { path: 'class_allocation', component: AllocateClassesComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'teachers' } },
  { path: 'teachers/:id/edit', component: TeacherFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'teachers' } },
  { path: 'exams', component: ExamListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams', title: 'Enter Marks', pageTitle: 'Enter Marks' } },
  // { path: 'exams/new', component: ExamFormComponent, canActivate: [AuthGuard] }, // Disabled - exam creation removed
  { path: 'exams/:id/marks', component: MarksEntryComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams' } },
  { path: 'report-cards', component: ReportCardComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'reportCards', title: 'Report Cards', pageTitle: 'Report Cards' } },
  { path: 'results-analysis', component: ResultsAnalysisComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams', title: 'Results Analysis', pageTitle: 'Results Analysis' } },
  { path: 'mark-sheet', component: MarkSheetComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams', title: 'Mark Sheet', pageTitle: 'Mark Sheet' } },
  { path: 'check_mark_progess', component: MarksProgressComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams' } },
  { path: 'publish-results', component: PublishResultsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams' } },
  { path: 'invoices', component: InvoiceListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'billing' } },
  { path: 'invoices/credit-note', component: InvoiceNotePageComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'creditNotes' } },
  { path: 'invoices/debit-note', component: InvoiceNotePageComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'debitNotes' } },
  { path: 'finance/admin/invoice-sync-remediation', component: InvoiceSyncRemediationComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'invoiceSyncRemediation' } },
  { path: 'invoices/new', component: InvoiceFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'billing' } },
  { path: 'invoices/statements', component: InvoiceStatementsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportStudentLedgers' } },
  { path: 'payments/record', component: RecordPaymentComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'recordPayment' } },
  { path: 'outstanding-balance', component: OutstandingBalanceComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportUnpaidInvoices' } },
  { path: 'finance/exemptions', component: ExemptionsManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'exemptions' } },
  { path: 'balance-enquiry', component: BalanceEnquiryComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'balanceEnquiry' } },
  { path: 'finance/balance-enquiry', redirectTo: 'balance-enquiry', pathMatch: 'full' },
  { path: 'finance/cash-logistics', component: CashLogisticsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'cashLogistics' } },
  { path: 'finance/audit', component: AuditComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'audit' } },
  { path: 'finance/financial-books', component: FinancialBooksComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'financialBooks', pageTitle: 'Financial Management' } },
  { path: 'admin/finance', redirectTo: 'finance/financial-books', pathMatch: 'full' },
  { path: 'financial-reports/student-ledger', component: StudentLedgerReportComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportStudentLedger', pageTitle: 'Student Ledger' } },
  { path: 'admin/fin-reports/student-ledger', redirectTo: 'financial-reports/student-ledger', pathMatch: 'full' },
  { path: 'financial-reports/student-ledgers', component: InvoiceStatementsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportStudentLedgers', hideInvoiceActions: true, pageTitle: 'Student Ledgers' } },
  { path: 'financial-reports/fees-collection', component: FeesCollectionReportComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportFeesCollection' } },
  { path: 'financial-reports/outstanding-fees', component: OutstandingBalanceComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportUnpaidInvoices' } },
  { path: 'financial-reports/exemption-report', component: ExemptionReportComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportExemption' } },
  { path: 'financial-reports/exemptions', redirectTo: 'financial-reports/exemption-report', pathMatch: 'full' },
  { path: 'financial-reports/aged-debtors', component: AgedDebtorsReportComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportAgedDebtors' } },
  { path: 'financial-reports/enrolment-vs-billing', component: FinancialReportComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportEnrolmentBilling', report: 'enrolment-vs-billing' } },
  { path: 'financial-reports/revenue-recognition', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'financial-reports/student-reconciliation', component: FinancialReportComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'reportStudentReconciliation', report: 'student-reconciliation', pageTitle: 'Student Reconciliation' } },
  { path: 'admin/fin-reports/student-reconciliation', redirectTo: 'financial-reports/student-reconciliation', pathMatch: 'full' },
  { path: 'admin/fin-reports/record-payment/:studentId', component: RecordPaymentComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', financePage: 'recordPayment' } },
  { path: 'financial-reports/analytics-forecasts', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'financial-reports/class-reconciliation', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'financial-reports/dining-hall', component: StudentListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { logisticsMode: 'diningHall', module: 'logistics', financePage: 'reportDiningHall' } },
  { path: 'financial-reports/transport', component: StudentListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { logisticsMode: 'transport', module: 'logistics', financePage: 'reportTransport' } },
  // Payroll routes (removed — redirect to dashboard)
  { path: 'payroll', redirectTo: '/dashboard', pathMatch: 'prefix' },
  { path: 'settings/payment-receipt-manager', redirectTo: 'system-settings', pathMatch: 'full' },
  { path: 'admin/elearning', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'system/integrations', component: IntegrationsComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'admin/license-config', component: LicenseConfigComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'classes', component: ClassListComponent, canActivate: [AuthGuard] },
  { path: 'classes/lists', component: ClassListsComponent, canActivate: [AuthGuard] },
  { path: 'classes/new', component: ClassFormComponent, canActivate: [AuthGuard] },
  { path: 'classes/:id/edit', component: ClassFormComponent, canActivate: [AuthGuard] },
  { path: 'subjects', component: SubjectListComponent, canActivate: [AuthGuard] },
  { path: 'subjects/new', component: SubjectFormComponent, canActivate: [AuthGuard] },
  { path: 'subjects/:id/edit', component: SubjectFormComponent, canActivate: [AuthGuard] },
  { path: 'subjects/assign', component: AssignSubjectComponent, canActivate: [AuthGuard] },
  { path: 'subjects/teaching-load', component: TeachingLoadComponent, canActivate: [AuthGuard] },
  { path: 'logistics/transport', component: StudentListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { logisticsMode: 'transport', module: 'logistics' } },
  { path: 'logistics/dining-hall', component: StudentListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { logisticsMode: 'diningHall', module: 'logistics' } },
  { path: 'schools', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'attendance/mark', component: MarkAttendanceComponent, canActivate: [AuthGuard] },
  { path: 'attendance/reports', component: AttendanceReportsComponent, canActivate: [AuthGuard] },
  { path: 'academic-settings', redirectTo: 'academic-settings/terms', pathMatch: 'full' },
  { path: 'academic-settings/grading', redirectTo: 'academic-settings/grading-system', pathMatch: 'full' },
  { path: 'academic-settings/:tab', component: AcademicSettingsComponent, canActivate: [AuthGuard] },
  { path: 'settings/academic', redirectTo: 'academic-settings/terms', pathMatch: 'full' },
  { path: 'system-settings', component: SettingsComponent, canActivate: [AuthGuard], data: { settingsView: 'school', title: 'System Settings' } },
  { path: 'settings', redirectTo: 'system-settings', pathMatch: 'full' },
  { path: 'timetable/config', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'timetable/generate', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'timetable/view', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'timetable', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'student/inventory', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'inventory', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'teacher/inventory-record', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'news', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'news/create', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'news/edit/:id', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'news/:id', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'news-feed', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'student/report-card', component: StudentReportCardComponent, canActivate: [AuthGuard] },
  { path: 'student/invoice-statement', component: StudentInvoiceStatementComponent, canActivate: [AuthGuard] },
  { path: 'student/parent-portal', component: ParentPortalComponent, canActivate: [AuthGuard] },
  { path: 'eweb', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'student/esubmit', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'student/blank_page/:taskId', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'user-manual', component: UserManualComponent, canActivate: [AuthGuard] },
  { path: 'user-log', component: UserLogComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'help', redirectTo: '/user-manual', pathMatch: 'full' },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

