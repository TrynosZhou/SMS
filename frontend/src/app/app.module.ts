import { NgModule, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import enGb from '@angular/common/locales/en-GB';
registerLocaleData(enGb);
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
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
import { ClassListComponent } from './components/classes/class-list/class-list.component';
import { ClassFormComponent } from './components/classes/class-form/class-form.component';
import { ClassListsComponent } from './components/classes/class-lists/class-lists.component';
import { SubjectListComponent } from './components/subjects/subject-list/subject-list.component';
import { SubjectFormComponent } from './components/subjects/subject-form/subject-form.component';
import { TeachingLoadComponent } from './components/subjects/teaching-load/teaching-load.component';
import { AssignSubjectComponent } from './components/subjects/assign-subject/assign-subject.component';
import { SettingsComponent } from './components/settings/settings.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ParentDashboardComponent } from './components/parent/parent-dashboard/parent-dashboard.component';
import { LinkStudentsComponent } from './components/parent/link-students/link-students.component';
import { ManageAccountComponent } from './components/teachers/manage-account/manage-account.component';
import { ManageAccountsComponent } from './components/admin/manage-accounts/manage-accounts.component';
import { ParentManagementComponent } from './components/admin/parent-management/parent-management.component';
import { ClassPromotionComponent } from './components/admin/class-promotion/class-promotion.component';
import { BulkMessageComponent } from './components/dashboard/bulk-message/bulk-message.component';
import { ParentInboxComponent } from './components/parent/parent-inbox/parent-inbox.component';
import { MarkAttendanceComponent } from './components/attendance/mark-attendance/mark-attendance.component';
import { AttendanceReportsComponent } from './components/attendance/attendance-reports/attendance-reports.component';
import { RecordBookComponent } from './components/teacher/record-book/record-book.component';
import { MyClassesComponent } from './components/teacher/my-classes/my-classes.component';
import { TeacherRecordBookComponent } from './components/admin/teacher-record-book/teacher-record-book.component';
import { TeacherDashboardComponent } from './components/teacher/teacher-dashboard/teacher-dashboard.component';
import { RecordPaymentComponent } from './components/finance/record-payment/record-payment.component';
import { OutstandingBalanceComponent } from './components/finance/outstanding-balance/outstanding-balance.component';
import { SplashComponent } from './components/splash/splash.component';
import { TimetableGenerateComponent } from './components/timetable/timetable-generate.component';
import { TimetableConfigComponent } from './components/timetable/timetable-config.component';
import { StudentReportCardComponent } from './components/student/student-report-card/student-report-card.component';
import { StudentInvoiceStatementComponent } from './components/student/student-invoice-statement/student-invoice-statement.component';
import { SafeArrayPipe } from './pipes/safe-array.pipe';
import { UserManualComponent } from './components/user-manual/user-manual.component';
import { MarksProgressComponent } from './components/exams/marks-progress/marks-progress.component';
import { BalanceEnquiryComponent } from './components/finance/balance-enquiry/balance-enquiry.component';
import { AuditComponent } from './components/finance/audit/audit.component';
import { SendMessageComponent } from './components/messages/send-message/send-message.component';
import { AccountantInboxComponent } from './components/messages/accountant-inbox/accountant-inbox.component';
import { ParentSendMessageComponent } from './components/parent/parent-send-message/parent-send-message.component';
import { ParentOutboxComponent } from './components/parent/parent-outbox/parent-outbox.component';
import { ParentInvoiceStatementComponent } from './components/parent/parent-invoice-statement/parent-invoice-statement.component';
import { IncomingFromParentsComponent } from './components/messages/incoming-from-parents/incoming-from-parents.component';
import { OutgoingMessagesComponent } from './components/messages/outgoing-messages/outgoing-messages.component';
import { EnrollStudentComponent } from './components/students/enroll-student/enroll-student.component';
import { AllocateClassesComponent } from './components/teachers/allocate-classes/allocate-classes.component';
import { UserLogComponent } from './components/admin/user-log/user-log.component';
import { DraftMessagesComponent } from './components/messages/draft-messages/draft-messages.component';
import { NewsListComponent } from './components/news/news-list/news-list.component';
import { NewsFeedComponent } from './components/news/news-feed/news-feed.component';
import { NewsFormComponent } from './components/news/news-form/news-form.component';
import { NewsDetailComponent } from './components/news/news-detail/news-detail.component';
import { PaymentReceiptManagerComponent } from './components/settings/payment-receipt-manager/payment-receipt-manager.component';
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
import { ElearningComponent } from './components/admin/elearning/elearning.component';
import { EservicesComponent } from './components/teacher/eservices/eservices.component';
import { StudentResponsesComponent } from './components/teacher/student-responses/student-responses.component';
import { MarkResponseComponent } from './components/teacher/mark-response/mark-response.component';
import { EwebComponent } from './components/student/eweb/eweb.component';
import { EsubmitComponent } from './components/student/esubmit/esubmit.component';
import { BlankPageComponent } from './components/student/blank-page/blank-page.component';
import { StudentPortalComponent } from './components/parent/student-portal/student-portal.component';
import { ParentPortalComponent } from './components/student/parent-portal/parent-portal.component';
import { DocEditorComponent } from './components/shared/doc-editor/doc-editor.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    DashboardComponent,
    StudentListComponent,
    StudentFormComponent,
    StudentTransferComponent,
    TeacherListComponent,
    TeacherFormComponent,
    ExamListComponent,
    ExamFormComponent,
    MarksEntryComponent,
    ReportCardComponent,
    MarkSheetComponent,
    RankingsComponent,
    PublishResultsComponent,
    InvoiceListComponent,
    InvoiceFormComponent,
    InvoiceStatementsComponent,
    ClassListComponent,
    ClassFormComponent,
    ClassListsComponent,
    SubjectListComponent,
    SubjectFormComponent,
    TeachingLoadComponent,
    AssignSubjectComponent,
    SettingsComponent,
    ParentDashboardComponent,
    LinkStudentsComponent,
    ManageAccountComponent,
    ManageAccountsComponent,
    ParentManagementComponent,
    ClassPromotionComponent,
    BulkMessageComponent,
    ParentInboxComponent,
    MarkAttendanceComponent,
    AttendanceReportsComponent,
    RecordBookComponent,
    MyClassesComponent,
    TeacherRecordBookComponent,
    TeacherDashboardComponent,
    RecordPaymentComponent,
    OutstandingBalanceComponent,
    SplashComponent,
    TimetableGenerateComponent,
    TimetableConfigComponent,
    StudentReportCardComponent,
    StudentInvoiceStatementComponent,
    SafeArrayPipe,
    UserManualComponent,
    MarksProgressComponent,
    BalanceEnquiryComponent,
    AuditComponent,
    SendMessageComponent,
    AccountantInboxComponent,
    ParentSendMessageComponent,
    ParentOutboxComponent,
    ParentInvoiceStatementComponent,
    IncomingFromParentsComponent,
    OutgoingMessagesComponent,
    DraftMessagesComponent,
    EnrollStudentComponent,
    AllocateClassesComponent,
    UserLogComponent,
    NewsListComponent,
    NewsFeedComponent,
    NewsFormComponent,
    NewsDetailComponent,
    PaymentReceiptManagerComponent,
    PayrollDashboardComponent,
    AncillaryStaffListComponent,
    AncillaryStaffFormComponent,
    SalaryStructureListComponent,
    SalaryStructureFormComponent,
    SalaryAssignmentComponent,
    PayrollProcessComponent,
    PayrollEntriesComponent,
    PayrollReportsComponent,
    LoanOverviewComponent,
    ElearningComponent,
    EservicesComponent,
    StudentResponsesComponent,
    MarkResponseComponent,
    EwebComponent,
    EsubmitComponent,
    BlankPageComponent,
    StudentPortalComponent,
    ParentPortalComponent,
    DocEditorComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'en-GB' },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

