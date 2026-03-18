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
import { RankingsComponent } from './components/exams/rankings/rankings.component';
import { MarkSheetComponent } from './components/exams/mark-sheet/mark-sheet.component';
import { PublishResultsComponent } from './components/exams/publish-results/publish-results.component';
import { InvoiceListComponent } from './components/finance/invoice-list/invoice-list.component';
import { InvoiceFormComponent } from './components/finance/invoice-form/invoice-form.component';
import { InvoiceStatementsComponent } from './components/finance/invoice-statements/invoice-statements.component';
import { RecordPaymentComponent } from './components/finance/record-payment/record-payment.component';
import { OutstandingBalanceComponent } from './components/finance/outstanding-balance/outstanding-balance.component';
import { BalanceEnquiryComponent } from './components/finance/balance-enquiry/balance-enquiry.component';
import { AuditComponent } from './components/finance/audit/audit.component';
import { ClassListComponent } from './components/classes/class-list/class-list.component';
import { ClassFormComponent } from './components/classes/class-form/class-form.component';
import { ClassListsComponent } from './components/classes/class-lists/class-lists.component';
import { SubjectListComponent } from './components/subjects/subject-list/subject-list.component';
import { SubjectFormComponent } from './components/subjects/subject-form/subject-form.component';
import { TeachingLoadComponent } from './components/subjects/teaching-load/teaching-load.component';
import { AssignSubjectComponent } from './components/subjects/assign-subject/assign-subject.component';
import { SettingsComponent } from './components/settings/settings.component';
import { ParentDashboardComponent } from './components/parent/parent-dashboard/parent-dashboard.component';
import { LinkStudentsComponent } from './components/parent/link-students/link-students.component';
import { ParentInboxComponent } from './components/parent/parent-inbox/parent-inbox.component';
import { ManageAccountComponent } from './components/teachers/manage-account/manage-account.component';
import { ManageAccountsComponent } from './components/admin/manage-accounts/manage-accounts.component';
import { ParentManagementComponent } from './components/admin/parent-management/parent-management.component';
import { ClassPromotionComponent } from './components/admin/class-promotion/class-promotion.component';
import { MarkAttendanceComponent } from './components/attendance/mark-attendance/mark-attendance.component';
import { AttendanceReportsComponent } from './components/attendance/attendance-reports/attendance-reports.component';
import { RecordBookComponent } from './components/teacher/record-book/record-book.component';
import { MyClassesComponent } from './components/teacher/my-classes/my-classes.component';
import { TeacherRecordBookComponent } from './components/admin/teacher-record-book/teacher-record-book.component';
import { TeacherDashboardComponent } from './components/teacher/teacher-dashboard/teacher-dashboard.component';
import { TimetableGenerateComponent } from './components/timetable/timetable-generate.component';
import { TimetableConfigComponent } from './components/timetable/timetable-config.component';
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
import { NewsListComponent } from './components/news/news-list/news-list.component';
import { NewsFeedComponent } from './components/news/news-feed/news-feed.component';
import { NewsFormComponent } from './components/news/news-form/news-form.component';
import { NewsDetailComponent } from './components/news/news-detail/news-detail.component';
import { PaymentReceiptManagerComponent } from './components/settings/payment-receipt-manager/payment-receipt-manager.component';
import { ElearningComponent } from './components/admin/elearning/elearning.component';
import { EservicesComponent } from './components/teacher/eservices/eservices.component';
import { StudentResponsesComponent } from './components/teacher/student-responses/student-responses.component';
import { MarkResponseComponent } from './components/teacher/mark-response/mark-response.component';
import { EwebComponent } from './components/student/eweb/eweb.component';
import { EsubmitComponent } from './components/student/esubmit/esubmit.component';
import { BlankPageComponent } from './components/student/blank-page/blank-page.component';
import { ParentInvoiceStatementComponent } from './components/parent/parent-invoice-statement/parent-invoice-statement.component';
import { PayrollDashboardComponent } from './components/payroll/payroll-dashboard/payroll-dashboard.component';
import { AncillaryStaffListComponent } from './components/payroll/ancillary-staff-list/ancillary-staff-list.component';
import { AncillaryStaffFormComponent } from './components/payroll/ancillary-staff-form/ancillary-staff-form.component';
import { SalaryStructureListComponent } from './components/payroll/salary-structure-list/salary-structure-list.component';
import { SalaryStructureFormComponent } from './components/payroll/salary-structure-form/salary-structure-form.component';
import { SalaryAssignmentComponent } from './components/payroll/salary-assignment/salary-assignment.component';
import { PayrollProcessComponent } from './components/payroll/payroll-process/payroll-process.component';
import { PayrollEntriesComponent } from './components/payroll/payroll-entries/payroll-entries.component';
import { PayrollReportsComponent } from './components/payroll/payroll-reports/payroll-reports.component';
import { LoanOverviewComponent } from './components/payroll/loan-overview/loan-overview.component';
import { StudentPortalComponent } from './components/parent/student-portal/student-portal.component';
import { ParentPortalComponent } from './components/student/parent-portal/parent-portal.component';

const routes: Routes = [
  { path: '', component: SplashComponent, data: { title: 'Junior Primary School Management System | Smart Edu System', description: 'Junior Primary School Management System - Manage students, teachers, classes, exams and attendance. School management for administrators, teachers and parents.', robots: 'index,follow' } },
  { path: 'login', component: LoginComponent, data: { title: 'Login - Junior Primary School Management System', description: 'Sign in to Junior Primary School Management System to access your school dashboard.', robots: 'noindex,nofollow' } },
  { path: 'reset-password', component: LoginComponent, data: { title: 'Reset Password - Junior Primary School Management System', description: 'Reset your password for Junior Primary School Management System.', robots: 'noindex,nofollow' } },
  { path: 'sign-in', redirectTo: '/login', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard] },
  { path: 'parent/dashboard', component: ParentDashboardComponent, canActivate: [AuthGuard] },
  { path: 'teacher/dashboard', component: TeacherDashboardComponent, canActivate: [AuthGuard] },
  { path: 'parent/inbox', component: ParentInboxComponent, canActivate: [AuthGuard] },
  { path: 'parent/send-message', component: ParentSendMessageComponent, canActivate: [AuthGuard] },
  { path: 'parent/outbox', component: ParentOutboxComponent, canActivate: [AuthGuard] },
  { path: 'parent/link-students', component: LinkStudentsComponent, canActivate: [AuthGuard] },
  { path: 'parent/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'parent/invoice-statement', component: ParentInvoiceStatementComponent, canActivate: [AuthGuard] },
  { path: 'parent/student-portal', component: StudentPortalComponent, canActivate: [AuthGuard] },
  { path: 'teacher/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'accountant/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'accountant/change_password', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'messages/send', component: SendMessageComponent, canActivate: [AuthGuard] },
  { path: 'messages/inbox', component: AccountantInboxComponent, canActivate: [AuthGuard] },
  { path: 'messages/incoming', component: IncomingFromParentsComponent, canActivate: [AuthGuard] },
  { path: 'messages/outgoing', component: OutgoingMessagesComponent, canActivate: [AuthGuard] },
  { path: 'messages/drafts', component: DraftMessagesComponent, canActivate: [AuthGuard] },
  { path: 'teacher/record-book', component: RecordBookComponent, canActivate: [AuthGuard] },
  { path: 'teacher/my-classes', component: MyClassesComponent, canActivate: [AuthGuard] },
  { path: 'teacher/eservices', component: EservicesComponent, canActivate: [AuthGuard] },
  { path: 'teacher/student-responses', component: StudentResponsesComponent, canActivate: [AuthGuard] },
  { path: 'teacher/mark-response/:responseId', component: MarkResponseComponent, canActivate: [AuthGuard] },
  { path: 'admin/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'admin/manage-accounts', component: ManageAccountsComponent, canActivate: [AuthGuard] },
  { path: 'admin/parents', component: ParentManagementComponent, canActivate: [AuthGuard] },
  { path: 'admin/class-promotion', component: ClassPromotionComponent, canActivate: [AuthGuard] },
  { path: 'admin/teacher-record-book', component: TeacherRecordBookComponent, canActivate: [AuthGuard] },
  { path: 'students', component: StudentListComponent, canActivate: [AuthGuard] },
  { path: 'students/new', component: StudentFormComponent, canActivate: [AuthGuard] },
  { path: 'students/enroll_student', component: EnrollStudentComponent, canActivate: [AuthGuard] },
  { path: 'students/:id/edit', component: StudentFormComponent, canActivate: [AuthGuard] },
  { path: 'students/transfer', component: StudentTransferComponent, canActivate: [AuthGuard] },
  { path: 'teachers', component: TeacherListComponent, canActivate: [AuthGuard] },
  { path: 'teachers/new', component: TeacherFormComponent, canActivate: [AuthGuard] },
  { path: 'teachers/allocate_class', component: AllocateClassesComponent, canActivate: [AuthGuard] },
  { path: 'teachers/:id/edit', component: TeacherFormComponent, canActivate: [AuthGuard] },
  { path: 'exams', component: ExamListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams' } },
  // { path: 'exams/new', component: ExamFormComponent, canActivate: [AuthGuard] }, // Disabled - exam creation removed
  { path: 'exams/:id/marks', component: MarksEntryComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams' } },
  { path: 'report-cards', component: ReportCardComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'reportCards' } },
  { path: 'mark-sheet', component: MarkSheetComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams' } },
  { path: 'rankings', component: RankingsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams' } },
  { path: 'check_mark_progess', component: MarksProgressComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams' } },
  { path: 'publish-results', component: PublishResultsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'exams' } },
  { path: 'invoices', component: InvoiceListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/new', component: InvoiceFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/statements', component: InvoiceStatementsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'payments/record', component: RecordPaymentComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'outstanding-balance', component: OutstandingBalanceComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'finance/balance-enquiry', component: BalanceEnquiryComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'finance/audit', component: AuditComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  // Payroll routes
  { path: 'payroll', component: PayrollDashboardComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/employees', component: AncillaryStaffListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/employees/new', component: AncillaryStaffFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/employees/:id/edit', component: AncillaryStaffFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/salary-structures', component: SalaryStructureListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/salary-structures/new', component: SalaryStructureFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/salary-structures/:id/edit', component: SalaryStructureFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/assignments', component: SalaryAssignmentComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/process', component: PayrollProcessComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/runs/:runId/entries', component: PayrollEntriesComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/reports', component: PayrollReportsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'payroll/loan-overview', component: LoanOverviewComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'payroll' } },
  { path: 'settings/payment-receipt-manager', component: PaymentReceiptManagerComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'admin/elearning', component: ElearningComponent, canActivate: [AuthGuard, AdminGuard] },
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
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] },
  { path: 'timetable/config', component: TimetableConfigComponent, canActivate: [AuthGuard] },
  { path: 'timetable/generate', component: TimetableGenerateComponent, canActivate: [AuthGuard] },
  { path: 'student/report-card', component: StudentReportCardComponent, canActivate: [AuthGuard] },
  { path: 'student/invoice-statement', component: StudentInvoiceStatementComponent, canActivate: [AuthGuard] },
  { path: 'student/parent-portal', component: ParentPortalComponent, canActivate: [AuthGuard] },
  { path: 'eweb', component: EwebComponent, canActivate: [AuthGuard] },
  { path: 'student/esubmit', component: EsubmitComponent, canActivate: [AuthGuard] },
  { path: 'student/blank_page/:taskId', component: BlankPageComponent, canActivate: [AuthGuard] },
  { path: 'user-manual', component: UserManualComponent, canActivate: [AuthGuard] },
  { path: 'user-log', component: UserLogComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'help', redirectTo: '/user-manual', pathMatch: 'full' },
  // News & Announcements Routes
  { path: 'news', component: NewsListComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'news/create', component: NewsFormComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'news/edit/:id', component: NewsFormComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'news/:id', component: NewsDetailComponent, canActivate: [AuthGuard] },
  { path: 'news-feed', component: NewsFeedComponent, canActivate: [AuthGuard] },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

