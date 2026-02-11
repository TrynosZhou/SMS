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

const routes: Routes = [
  { path: '', component: SplashComponent },
  { path: 'login', redirectTo: '', pathMatch: 'full' },
  { path: 'sign-in', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard] },
  { path: 'parent/dashboard', component: ParentDashboardComponent, canActivate: [AuthGuard] },
  { path: 'teacher/dashboard', component: TeacherDashboardComponent, canActivate: [AuthGuard] },
  { path: 'parent/inbox', component: ParentInboxComponent, canActivate: [AuthGuard] },
  { path: 'parent/link-students', component: LinkStudentsComponent, canActivate: [AuthGuard] },
  { path: 'parent/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'teacher/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'teacher/record-book', component: RecordBookComponent, canActivate: [AuthGuard] },
  { path: 'teacher/my-classes', component: MyClassesComponent, canActivate: [AuthGuard] },
  { path: 'admin/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'admin/manage-accounts', component: ManageAccountsComponent, canActivate: [AuthGuard] },
  { path: 'admin/parents', component: ParentManagementComponent, canActivate: [AuthGuard] },
  { path: 'admin/class-promotion', component: ClassPromotionComponent, canActivate: [AuthGuard] },
  { path: 'admin/teacher-record-book', component: TeacherRecordBookComponent, canActivate: [AuthGuard] },
  { path: 'students', component: StudentListComponent, canActivate: [AuthGuard] },
  { path: 'students/new', component: StudentFormComponent, canActivate: [AuthGuard] },
  { path: 'students/:id/edit', component: StudentFormComponent, canActivate: [AuthGuard] },
  { path: 'students/transfer', component: StudentTransferComponent, canActivate: [AuthGuard] },
  { path: 'teachers', component: TeacherListComponent, canActivate: [AuthGuard] },
  { path: 'teachers/new', component: TeacherFormComponent, canActivate: [AuthGuard] },
  { path: 'teachers/:id/edit', component: TeacherFormComponent, canActivate: [AuthGuard] },
  { path: 'exams', component: ExamListComponent, canActivate: [AuthGuard] },
  // { path: 'exams/new', component: ExamFormComponent, canActivate: [AuthGuard] }, // Disabled - exam creation removed
  { path: 'exams/:id/marks', component: MarksEntryComponent, canActivate: [AuthGuard] },
  { path: 'report-cards', component: ReportCardComponent, canActivate: [AuthGuard] },
  { path: 'mark-sheet', component: MarkSheetComponent, canActivate: [AuthGuard] },
  { path: 'rankings', component: RankingsComponent, canActivate: [AuthGuard] },
  { path: 'publish-results', component: PublishResultsComponent, canActivate: [AuthGuard] },
  { path: 'invoices', component: InvoiceListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/new', component: InvoiceFormComponent, canActivate: [AuthGuard, ModuleAccessGuard, SuperAdminGuard], data: { module: 'finance' } },
  { path: 'invoices/statements', component: InvoiceStatementsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'payments/record', component: RecordPaymentComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'outstanding-balance', component: OutstandingBalanceComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'classes', component: ClassListComponent, canActivate: [AuthGuard] },
  { path: 'classes/lists', component: ClassListsComponent, canActivate: [AuthGuard] },
  { path: 'classes/new', component: ClassFormComponent, canActivate: [AuthGuard] },
  { path: 'classes/:id/edit', component: ClassFormComponent, canActivate: [AuthGuard] },
  { path: 'subjects', component: SubjectListComponent, canActivate: [AuthGuard] },
  { path: 'subjects/new', component: SubjectFormComponent, canActivate: [AuthGuard] },
  { path: 'subjects/:id/edit', component: SubjectFormComponent, canActivate: [AuthGuard] },
  { path: 'subjects/assign', component: AssignSubjectComponent, canActivate: [AuthGuard] },
  { path: 'subjects/teaching-load', component: TeachingLoadComponent, canActivate: [AuthGuard] },
  { path: 'logistics/transport', component: StudentListComponent, canActivate: [AuthGuard], data: { logisticsMode: 'transport' } },
  { path: 'logistics/dining-hall', component: StudentListComponent, canActivate: [AuthGuard], data: { logisticsMode: 'diningHall' } },
  { path: 'schools', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'attendance/mark', component: MarkAttendanceComponent, canActivate: [AuthGuard] },
  { path: 'attendance/reports', component: AttendanceReportsComponent, canActivate: [AuthGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] },
  { path: 'timetable/config', component: TimetableConfigComponent, canActivate: [AuthGuard] },
  { path: 'timetable/generate', component: TimetableGenerateComponent, canActivate: [AuthGuard] },
  { path: 'student/report-card', component: StudentReportCardComponent, canActivate: [AuthGuard] },
  { path: 'student/invoice-statement', component: StudentInvoiceStatementComponent, canActivate: [AuthGuard] },
  { path: 'user-manual', component: UserManualComponent, canActivate: [AuthGuard] },
  { path: 'help', redirectTo: '/user-manual', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

