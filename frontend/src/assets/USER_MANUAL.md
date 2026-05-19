# School Management System - User Manual

**Version:** 1.0  
**Last Updated:** January 2026

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [User Roles and Permissions](#user-roles-and-permissions)
4. [Dashboard](#dashboard)
5. [Student Management](#student-management)
6. [Teacher Management](#teacher-management)
7. [Class Management](#class-management)
8. [Subject Management](#subject-management)
9. [Exam Management](#exam-management)
10. [Marks Entry](#marks-entry)
11. [Report Cards](#report-cards)
12. [Rankings](#rankings)
13. [Finance Management](#finance-management)
14. [Attendance Management](#attendance-management)
15. [Record Book](#record-book)
16. [Timetable Management](#timetable-management)
17. [Settings](#settings)
18. [Parent Portal](#parent-portal)
19. [Teacher Portal](#teacher-portal)
20. [Student Portal](#student-portal)
21. [Troubleshooting](#troubleshooting)

---

## Introduction

### What is the School Management System?

The School Management System (SMS) is a comprehensive web-based platform designed to streamline school operations, manage student records, handle academic assessments, process financial transactions, and facilitate communication between administrators, teachers, students, and parents.

### Key Features

- **Student Management**: Complete student enrollment and record keeping
- **Teacher Management**: Teacher profiles and class assignments
- **Academic Management**: Exams, marks entry, report cards, and rankings
- **Financial Management**: Invoice creation, payment tracking, and balance management
- **Attendance Tracking**: Daily attendance marking and reporting
- **Record Books**: Digital record books for teachers
- **Timetable Management**: Class and teacher timetable generation
- **Parent Portal**: Access to children's academic and financial information
- **Role-Based Access**: Secure access control based on user roles

### System Requirements

- **Web Browser**: Chrome, Firefox, Edge, or Safari (latest versions)
- **Internet Connection**: Required for accessing the system
- **Screen Resolution**: Minimum 1024x768 pixels (recommended: 1920x1080)

---

## Getting Started

### Accessing the System

1. Open your web browser
2. Navigate to the School Management System URL (provided by your administrator)
3. You will see the login page

> **📸 Screenshot Placeholder:** Login page showing the sign-in form with username and password fields

### Logging In

#### For Administrators, Teachers, and Staff

1. Enter your **Username** (provided by the administrator)
2. Enter your **Password**
3. Click the **🔐 Sign In** button

#### For Students

1. Enter your **Student ID** as the username
2. Enter your **Date of Birth** in the format: `dd/mm/yyyy` (e.g., 15/03/2010)
3. Click the **🔐 Sign In** button

> **📸 Screenshot Placeholder:** Login form with example credentials filled in

#### For Parents

1. Enter your **Email address** or **Username**
2. Enter your **Password**
3. Click the **🔐 Sign In** button

### Creating a New Account (Sign Up)

If you need to create a new account:

1. Click the **➕ Sign Up** tab on the login page
2. Select your **Role** from the dropdown:
   - SuperAdmin
   - Admin
   - Accountant
   - Parent
3. Fill in all required fields:
   - Email (for Parents)
   - Username
   - First Name
   - Last Name
   - Contact Number (Zimbabwean format: 07XXXXXXXX or +2637XXXXXXXX)
   - Password (minimum 8 characters)
   - Confirm Password
4. Click **➕ Create Account**

> **Note:** Teachers must use temporary accounts provided by the administrator.

> **📸 Screenshot Placeholder:** Sign-up form with all fields visible

### Password Reset

If you forgot your password:

1. Click the **🔑 Reset Password** tab
2. Enter your **Email Address**
3. Click **🔑 Send Reset Link**
4. Check your email for the reset link

> **📸 Screenshot Placeholder:** Password reset form

---

## User Roles and Permissions

The system supports multiple user roles with different access levels:

### SuperAdmin
- **Full Access**: Complete system access to all modules
- **Can Manage**: All settings, users, and system configurations

### Admin
- **Access**: Students, Teachers, Classes, Subjects, Exams, Report Cards, Rankings, Finance, Attendance, Settings
- **Cannot Access**: Some advanced system settings

### Teacher
- **Access**: Students, Classes, Subjects, Exams, Report Cards, Rankings, Attendance, Record Book, My Classes
- **Cannot Access**: Finance, Settings, Teacher Management

### Accountant
- **Access**: Students, Finance (Invoices, Payments), Dashboard
- **Cannot Access**: Settings, Academic modules

### Parent
- **Access**: Dashboard, Report Cards (children only), Invoices (children only), Inbox
- **Cannot Access**: All administrative modules

### Student
- **Access**: Personal Report Cards, Personal Invoice Statements
- **Cannot Access**: All administrative modules

> **📸 Screenshot Placeholder:** Permission matrix table showing access by role

---

## Dashboard

### Overview

The Dashboard provides a quick overview of key statistics and information based on your role.

### Admin Dashboard

**Features:**
- Total Students count
- Total Teachers count
- Total Classes count
- Recent Activities
- Quick Access buttons to major modules
- School Name display

> **📸 Screenshot Placeholder:** Admin dashboard with statistics cards

### Teacher Dashboard

**Features:**
- Assigned Classes
- Upcoming Exams
- Pending Marks Entry
- Quick Links to:
  - My Classes
  - Record Book
  - Marks Entry

> **📸 Screenshot Placeholder:** Teacher dashboard view

### Parent Dashboard

**Features:**
- Linked Children list
- Recent Report Cards
- Outstanding Invoices
- Messages/Notifications

> **📸 Screenshot Placeholder:** Parent dashboard view

### Navigation Menu

The left sidebar contains navigation links to all accessible modules:
- 📊 Dashboard
- 📚 Students
- 👨‍🏫 Teachers
- 🎓 Classes
- 📖 Subjects
- 📝 Exams
- 📄 Report Cards
- 🏆 Rankings
- 💰 Finance
- ✅ Attendance
- 📚 Record Book
- ⚙️ Settings

> **📸 Screenshot Placeholder:** Navigation sidebar menu

---

## Student Management

### Viewing Students

1. Click **📚 Students** in the navigation menu
2. You will see a list of all students
3. Use the search bar to filter by:
   - Student ID
   - First Name
   - Last Name
   - Class

> **📸 Screenshot Placeholder:** Student list page with search functionality

### Adding a New Student

1. Click **📚 Students** in the navigation menu
2. Click the **➕ Add New Student** button
3. Fill in the student information:
   - **Student Number** (unique identifier)
   - **First Name** *
   - **Last Name** *
   - **Date of Birth** * (format: dd/mm/yyyy)
   - **Gender** *
   - **Class** * (select from dropdown)
   - **Contact Number** (parent/guardian)
   - **Email** (optional)
   - **Address** (optional)
   - **Photo** (optional - upload student photo)
4. Click **💾 Save Student**

> **📸 Screenshot Placeholder:** Student form with all fields

### Editing Student Information

1. Navigate to **📚 Students**
2. Find the student in the list
3. Click the **✏️ Edit** button next to the student
4. Update the required fields
5. Click **💾 Save Changes**

### Viewing Student Details

1. Navigate to **📚 Students**
2. Click on a student's name or ID
3. View complete student profile including:
   - Personal information
   - Academic records
   - Attendance history
   - Financial records

> **📸 Screenshot Placeholder:** Student detail view

### Transferring Students

1. Navigate to **📚 Students**
2. Click **🔄 Transfer Student** button
3. Select the student from the dropdown
4. Select the **New Class**
5. Select the **Term**
6. Enter transfer date
7. Click **✅ Transfer**

> **📸 Screenshot Placeholder:** Student transfer form

### Bulk Operations

- **Export to Excel**: Download student list
- **Filter by Class**: View students by class
- **Search**: Quick search by name or ID

---

## Teacher Management

### Viewing Teachers

1. Click **👨‍🏫 Teachers** in the navigation menu
2. View list of all teachers with:
   - Teacher ID
   - Name
   - Email
   - Assigned Classes

> **📸 Screenshot Placeholder:** Teacher list page

### Adding a New Teacher

1. Click **👨‍🏫 Teachers** in the navigation menu
2. Click **➕ Add New Teacher** button
3. Fill in teacher information:
   - **Teacher ID** (unique identifier)
   - **First Name** *
   - **Last Name** *
   - **Email** *
   - **Contact Number** *
   - **Gender** *
   - **Date of Birth**
   - **Address** (optional)
   - **Photo** (optional)
4. Click **💾 Save Teacher**

> **📸 Screenshot Placeholder:** Teacher form

### Assigning Classes to Teachers

1. Navigate to **👨‍🏫 Teachers**
2. Click **✏️ Edit** on a teacher
3. Scroll to **Assigned Classes** section
4. Select classes from the dropdown
5. Click **💾 Save Changes**

> **Note:** Teachers can also be assigned classes through the Subject Assignment module.

### Editing Teacher Information

1. Navigate to **👨‍🏫 Teachers**
2. Find the teacher
3. Click **✏️ Edit**
4. Update information
5. Click **💾 Save Changes**

---

## Class Management

### Viewing Classes

1. Click **🎓 Classes** in the navigation menu
2. View all classes with:
   - Class Name
   - Class Teacher
   - Number of Students
   - Subjects

> **📸 Screenshot Placeholder:** Class list page

### Adding a New Class

1. Click **🎓 Classes** in the navigation menu
2. Click **➕ Add New Class** button
3. Fill in class information:
   - **Class Name** * (e.g., "Stage 5 Gold")
   - **Class Teacher** (select from dropdown)
   - **Description** (optional)
4. Click **💾 Save Class**

> **📸 Screenshot Placeholder:** Class form

### Editing Class Information

1. Navigate to **🎓 Classes**
2. Click **✏️ Edit** on a class
3. Update information
4. Click **💾 Save Changes**

### Viewing Class Lists

1. Navigate to **🎓 Classes**
2. Click **📋 Class Lists** button
3. Select a class from the dropdown
4. View complete student list for that class
5. Export to PDF or Excel if needed

> **📸 Screenshot Placeholder:** Class list view with students

---

## Subject Management

### Viewing Subjects

1. Click **📖 Subjects** in the navigation menu
2. View all subjects with:
   - Subject Name
   - Subject Code
   - Assigned Teachers

> **📸 Screenshot Placeholder:** Subject list page

### Adding a New Subject

1. Click **📖 Subjects** in the navigation menu
2. Click **➕ Add New Subject** button
3. Fill in subject information:
   - **Subject Name** * (e.g., "Mathematics")
   - **Subject Code** * (e.g., "MATH")
   - **Description** (optional)
4. Click **💾 Save Subject**

> **📸 Screenshot Placeholder:** Subject form

### Assigning Subjects to Teachers

1. Navigate to **📖 Subjects**
2. Click **👨‍🏫 Assign Subject** button
3. Select **Class** from dropdown
4. Select **Subject** from dropdown
5. Select **Teacher** from dropdown
6. Click **✅ Assign**

> **📸 Screenshot Placeholder:** Subject assignment form

### Viewing Teaching Load

1. Navigate to **📖 Subjects**
2. Click **📊 Teaching Load** button
3. View distribution of subjects across teachers
4. See which teachers teach which subjects in which classes

> **📸 Screenshot Placeholder:** Teaching load report

---

## Exam Management

### Viewing Exams

1. Click **📝 Exams** in the navigation menu
2. View all exams with:
   - Exam Name
   - Class
   - Term
   - Exam Type
   - Subject
   - Status

> **📸 Screenshot Placeholder:** Exam list page

### Creating a New Exam

1. Click **📝 Exams** in the navigation menu
2. Click **➕ Create Exam** button
3. Fill in exam details:
   - **Class** * (select from dropdown)
   - **Term** * (auto-filled from settings)
   - **Exam Type** * (Mid Term, End of Term, Final, etc.)
   - **Subject** * (select from dropdown)
   - **Exam Name** (optional - auto-generated if not provided)
   - **Date** (optional)
4. Click **💾 Create Exam**

> **📸 Screenshot Placeholder:** Exam creation form

### Editing Exam Details

1. Navigate to **📝 Exams**
2. Find the exam
3. Click **✏️ Edit**
4. Update information
5. Click **💾 Save Changes**

### Deleting Exams

1. Navigate to **📝 Exams**
2. Find the exam
3. Click **🗑️ Delete**
4. Confirm deletion

> **⚠️ Warning:** Deleting an exam will also delete all associated marks.

---

## Marks Entry

### Accessing Marks Entry

1. Navigate to **📝 Exams**
2. Select criteria:
   - **Class** *
   - **Term** (auto-filled)
   - **Exam Type** *
   - **Subject** *
3. Click **🔍 Load Students** button

> **📸 Screenshot Placeholder:** Marks entry selection criteria

### Entering Marks

Once students are loaded:

1. You will see a table with all students in the selected class
2. A **progress bar** at the top shows completion percentage
3. For each student:
   - Enter **Marks** (0-100) in the marks field
   - Optionally add **Remarks** (comments)
   - Status will show as "✓ Entered" or "○ Pending"
4. Use quick actions:
   - **🔢 Fill Empty with 0**: Fill all empty marks with zero
   - **🗑️ Clear All**: Clear all entered marks
5. Click **💾 Save All Marks** when done

> **📸 Screenshot Placeholder:** Marks entry table with students and marks

### Features

- **Auto-save**: Marks are automatically saved as you type
- **Validation**: System validates marks are between 0-100
- **Progress Tracking**: See completion percentage at the top
- **Search**: Search for specific students by name or ID
- **Status Indicators**: Visual indicators show which students have marks entered

### Bulk Operations

- **Fill Empty with 0**: Quickly fill all empty marks with zero
- **Clear All**: Remove all entered marks (use with caution)

### Publishing Results

After entering all marks:

1. Navigate to **📝 Exams**
2. Click **📢 Publish Results** button
3. Select the exam
4. Click **✅ Publish**

> **⚠️ Note:** Once published, marks cannot be edited. Students, parents, and teachers can view the results.

> **📸 Screenshot Placeholder:** Publish results page

---

## Report Cards

### Generating Report Cards

1. Click **📄 Report Cards** in the navigation menu
2. Select criteria:
   - **Class** *
   - **Term** *
   - **Exam Type** *
3. Click **🔍 Generate Report Cards** button
4. System will generate report cards for all students in the class

> **📸 Screenshot Placeholder:** Report card generation page

### Viewing Report Cards

1. Navigate to **📄 Report Cards**
2. Select class, term, and exam type
3. Click **🔍 Generate Report Cards**
4. View list of generated report cards
5. Click on a student's name to view their report card

> **📸 Screenshot Placeholder:** Report card view with student grades

### Report Card Features

Each report card includes:
- Student Information
- Class and Term Information
- Subject-wise marks and grades
- Overall Average
- Position in Class
- Teacher Remarks
- Principal Remarks

### Exporting Report Cards

1. View a report card
2. Click **📄 Download PDF** button
3. Report card will be downloaded as PDF

> **📸 Screenshot Placeholder:** PDF report card example

### Adding Remarks

1. Navigate to **📄 Report Cards**
2. Select a student's report card
3. Click **✏️ Add Remarks**
4. Enter teacher or principal remarks
5. Click **💾 Save Remarks**

---

## Rankings

### Viewing Class Rankings

1. Click **🏆 Rankings** in the navigation menu
2. Select criteria:
   - **Class** *
   - **Term** *
   - **Exam Type** *
3. Click **🔍 Generate Rankings** button
4. View ranked list of students

> **📸 Screenshot Placeholder:** Rankings page with student positions

### Ranking Features

- **Position**: Student's rank in class
- **Student Name**: Full name
- **Total Marks**: Sum of all subject marks
- **Average**: Overall percentage
- **Grade**: Letter grade (A, B, C, D, F)

### Exporting Rankings

1. Generate rankings
2. Click **📊 Export to Excel** button
3. Rankings will be downloaded as Excel file

---

## Finance Management

> **⚠️ Access:** Only Admin, Accountant, and SuperAdmin can access Finance module. Teachers cannot access this module.

### Viewing Invoices

1. Click **💰 Finance** → **📄 Invoices** in the navigation menu
2. View all invoices with:
   - Invoice Number
   - Student Name
   - Amount
   - Due Date
   - Status (Paid/Unpaid)

> **📸 Screenshot Placeholder:** Invoice list page

### Creating a New Invoice

1. Navigate to **💰 Finance** → **📄 Invoices**
2. Click **➕ Create Invoice** button
3. Fill in invoice details:
   - **Student** * (select from dropdown)
   - **Invoice Type** * (Tuition, Uniform, Other)
   - **Amount** *
   - **Due Date** *
   - **Description** (optional)
   - **Items** (for uniform invoices - add uniform items)
4. Click **💾 Create Invoice**

> **📸 Screenshot Placeholder:** Invoice creation form

### Recording Payments

1. Navigate to **💰 Finance** → **💵 Record Payment**
2. Select **Student** from dropdown
3. Select **Invoice** from dropdown
4. Enter **Payment Amount** *
5. Enter **Payment Date** *
6. Select **Payment Method** (Cash, Bank Transfer, etc.)
7. Enter **Reference Number** (optional)
8. Click **💾 Record Payment**

> **📸 Screenshot Placeholder:** Payment recording form

### Viewing Outstanding Balances

1. Navigate to **💰 Finance** → **📊 Outstanding Balance**
2. View all students with outstanding balances
3. Filter by:
   - Class
   - Amount range
   - Payment status

> **📸 Screenshot Placeholder:** Outstanding balances report

### Invoice Statements

1. Navigate to **💰 Finance** → **📋 Invoice Statements**
2. Select **Student** from dropdown
3. View complete financial history:
   - All invoices
   - All payments
   - Current balance

> **📸 Screenshot Placeholder:** Invoice statement view

### Exporting Financial Reports

- **Export to Excel**: Download invoice list
- **Print Invoice**: Print individual invoices
- **Generate Statement**: Create PDF statement

---

## Attendance Management

### Marking Attendance

1. Click **✅ Attendance** → **📝 Mark Attendance** in the navigation menu
2. Select criteria:
   - **Class** *
   - **Date** * (defaults to today)
3. Click **🔍 Load Students** button
4. For each student, mark:
   - **Present** ✓
   - **Absent** ✗
   - **Late** ⏰
5. Click **💾 Save Attendance**

> **📸 Screenshot Placeholder:** Attendance marking interface

### Viewing Attendance Reports

1. Navigate to **✅ Attendance** → **📊 Attendance Reports**
2. Select criteria:
   - **Class** *
   - **Date Range** *
   - **Student** (optional - for individual reports)
3. Click **🔍 Generate Report**
4. View attendance statistics:
   - Total days
   - Days present
   - Days absent
   - Attendance percentage

> **📸 Screenshot Placeholder:** Attendance report with statistics

### Features

- **Bulk Marking**: Mark all students as present/absent with one click
- **Individual Tracking**: Track attendance for specific students
- **Monthly Reports**: Generate monthly attendance summaries
- **Export**: Export reports to Excel

---

## Record Book

### Teacher Record Book

Teachers can access their personal record book:

1. Click **📚 My Record Book** in the navigation menu (Teacher view)
2. Select **Class** from dropdown
3. View record book with:
   - Student list
   - Test marks (Test 1, Test 2, etc.)
   - Topics covered
   - Dates

> **📸 Screenshot Placeholder:** Teacher record book view

### Admin View - Teacher Record Books

Administrators can view any teacher's record book:

1. Navigate to **👨‍🏫 Teachers** → **📚 Teacher Record Books**
2. Search for a teacher
3. Select the teacher
4. Select their class
5. View the record book

> **📸 Screenshot Placeholder:** Admin view of teacher record book

### Features

- **Multiple Tests**: Record up to 10 tests per class
- **Topic Tracking**: Record topics covered for each test
- **Date Tracking**: Record test dates
- **Export**: Export to PDF or Excel
- **Print**: Print record book

### Entering Test Marks

1. Open record book for a class
2. Navigate to the test column
3. Enter marks for each student
4. Marks are automatically saved

---

## Timetable Management

### Configuring Timetable Settings

1. Click **📅 Timetable** → **⚙️ Config** in the navigation menu
2. Configure:
   - **Days of Week**: Select which days classes run
   - **Periods per Day**: Number of periods
   - **Period Duration**: Length of each period
   - **Break Times**: When breaks occur
3. Click **💾 Save Configuration**

> **📸 Screenshot Placeholder:** Timetable configuration page

### Generating Timetable

1. Navigate to **📅 Timetable** → **🔄 Generate**
2. Select **Term** and **Academic Year**
3. Select **View Type**:
   - **Class View**: See timetable by class
   - **Teacher View**: See timetable by teacher
   - **Summary View**: Overview of all timetables
4. Click **🔄 Generate Timetable**
5. System will generate timetable based on:
   - Class assignments
   - Subject assignments
   - Teacher availability

> **📸 Screenshot Placeholder:** Generated timetable view

### Editing Timetable

1. Generate timetable
2. Click on a time slot to edit
3. Select:
   - **Subject**
   - **Teacher**
   - **Room** (optional)
4. Click **💾 Save**

### Locking Timetable Entries

1. After generating timetable
2. Click **🔒 Lock** on an entry
3. Locked entries cannot be edited
4. Click **🔓 Unlock** to make editable again

### Exporting Timetable

- **Print**: Print timetable
- **Export to PDF**: Download as PDF
- **Export to Excel**: Download as Excel

---

## Settings

> **⚠️ Access:** Only Admin and SuperAdmin can access Settings.

### General Settings

1. Click **⚙️ Settings** in the navigation menu
2. Configure:
   - **School Name** *
   - **School Motto** (optional)
   - **Current Term** *
   - **Academic Year** *
   - **Contact Information**
3. Click **💾 Save Settings**

> **📸 Screenshot Placeholder:** Settings page

### Module Access Control

1. Navigate to **⚙️ Settings**
2. Scroll to **Module Access** section
3. Configure which roles can access which modules:
   - Students
   - Teachers
   - Classes
   - Subjects
   - Exams
   - Report Cards
   - Rankings
   - Finance
   - Attendance
   - Settings
4. Click **💾 Save Module Access**

> **📸 Screenshot Placeholder:** Module access configuration

### User Management

1. Navigate to **⚙️ Settings** → **👥 Manage Accounts**
2. View all users
3. Actions available:
   - **Edit User**: Update user information
   - **Reset Password**: Reset user password
   - **Deactivate**: Deactivate user account
   - **Activate**: Activate user account

> **📸 Screenshot Placeholder:** User management page

---

## Parent Portal

### Accessing Parent Portal

Parents log in with their credentials and are automatically directed to the Parent Dashboard.

### Linking Students

1. Navigate to **👪 Link Students**
2. Enter your child's **Student ID**
3. Enter your child's **Date of Birth** (dd/mm/yyyy)
4. Click **🔗 Link Student**
5. Repeat for additional children

> **📸 Screenshot Placeholder:** Link students page

### Viewing Report Cards

1. Navigate to **📄 Report Cards**
2. Select a child from the dropdown
3. Select **Term** and **Exam Type**
4. Click **🔍 View Report Card**
5. View complete report card with:
   - All subject marks
   - Grades
   - Position
   - Remarks

> **📸 Screenshot Placeholder:** Parent view of report card

### Viewing Invoices

1. Navigate to **💰 Invoices**
2. View all invoices for linked children
3. See:
   - Invoice details
   - Amount due
   - Payment status
   - Payment history

> **📸 Screenshot Placeholder:** Parent invoice view

### Inbox

1. Navigate to **📬 Inbox**
2. View messages from:
   - School administration
   - Teachers
   - System notifications

> **📸 Screenshot Placeholder:** Parent inbox

---

## Teacher Portal

### Teacher Dashboard

Teachers have access to a specialized dashboard showing:
- Assigned classes
- Upcoming exams
- Pending marks entry
- Quick links to key features

> **📸 Screenshot Placeholder:** Teacher dashboard

### My Classes

1. Navigate to **🎓 My Classes**
2. View all classes assigned to you
3. See:
   - Class name
   - Number of students
   - Subjects you teach
   - Quick actions

> **📸 Screenshot Placeholder:** My classes view

### Record Book

See [Record Book](#record-book) section above for details.

### Marks Entry

See [Marks Entry](#marks-entry) section above for details.

### Managing Account

1. Navigate to **👤 Manage Account**
2. Update:
   - Personal information
   - Contact details
   - Password
3. Click **💾 Save Changes**

---

## Student Portal

### Accessing Student Portal

Students log in with:
- **Username**: Student ID
- **Password**: Date of Birth (dd/mm/yyyy)

### Viewing Report Card

1. Navigate to **📄 My Report Card**
2. Select **Term** and **Exam Type**
3. View your report card with:
   - All subject marks
   - Grades
   - Position in class
   - Teacher remarks

> **📸 Screenshot Placeholder:** Student report card view

### Viewing Invoice Statement

1. Navigate to **💰 My Invoice Statement**
2. View:
   - All invoices
   - Payment history
   - Outstanding balance

> **📸 Screenshot Placeholder:** Student invoice statement

---

## Troubleshooting

### Login Issues

**Problem:** Cannot log in
- **Solution:** 
  - Verify username/Student ID is correct
  - For students: Ensure date of birth is in dd/mm/yyyy format
  - Check if Caps Lock is on
  - Contact administrator to reset password

**Problem:** "Invalid credentials" error
- **Solution:**
  - Double-check username and password
  - Use password reset feature
  - Contact administrator

### Marks Entry Issues

**Problem:** Cannot save marks
- **Solution:**
  - Ensure marks are between 0-100
  - Check if results are published (published results cannot be edited)
  - Refresh page and try again

**Problem:** Students not loading
- **Solution:**
  - Verify class, term, exam type, and subject are selected
  - Check if students are enrolled in the selected class
  - Refresh page

### Report Card Issues

**Problem:** Report cards not generating
- **Solution:**
  - Ensure marks are entered for all students
  - Verify exam is published
  - Check class, term, and exam type selection

### Finance Issues

**Problem:** Cannot access Finance module
- **Solution:**
  - Verify your role has Finance access
  - Teachers cannot access Finance module
  - Contact administrator if you need access

### General Issues

**Problem:** Page not loading
- **Solution:**
  - Check internet connection
  - Clear browser cache
  - Try different browser
  - Refresh page (Ctrl+F5 or Cmd+Shift+R)

**Problem:** Slow performance
- **Solution:**
  - Close unnecessary browser tabs
  - Clear browser cache
  - Check internet speed
  - Contact administrator if issue persists

---

## Keyboard Shortcuts

- **Ctrl + S**: Save (in forms)
- **Esc**: Close modals/dialogs
- **Ctrl + F**: Search (in lists)
- **Tab**: Navigate between fields

---

## Best Practices

### For Administrators

1. **Regular Backups**: Ensure system data is backed up regularly
2. **User Management**: Regularly review and update user accounts
3. **Settings**: Keep school information and term settings up to date
4. **Security**: Regularly change passwords and review access permissions

### For Teachers

1. **Marks Entry**: Enter marks promptly after exams
2. **Record Books**: Keep record books updated regularly
3. **Attendance**: Mark attendance daily
4. **Communication**: Use the system to communicate with parents

### For Parents

1. **Linking Students**: Link all your children to your account
2. **Regular Check-ins**: Check report cards and invoices regularly
3. **Payment**: Pay invoices on time to avoid outstanding balances
4. **Communication**: Check inbox for important messages

---

## Support and Contact

For technical support or questions:

1. **Contact Administrator**: Reach out to your school administrator
2. **System Help**: Check this manual for detailed instructions
3. **Email Support**: Contact system administrator via email

---

## Appendix

### Date Formats

- **Date of Birth**: dd/mm/yyyy (e.g., 15/03/2010)
- **Dates in System**: dd/mm/yyyy format throughout

### Contact Number Format

- **Zimbabwean Format**: 
  - 07XXXXXXXX (10 digits)
  - +2637XXXXXXXX (international format)

### Password Requirements

- Minimum 8 characters
- Recommended: Mix of letters, numbers, and special characters

### File Upload Limits

- **Student Photos**: Maximum 5MB
- **File Formats**: JPG, PNG, PDF

---

## Version History

- **Version 1.0** (January 2026): Initial release
  - Complete user manual
  - All modules documented
  - Role-based access guide

---

**End of User Manual**

For the most up-to-date information, please refer to the system help section or contact your administrator.

