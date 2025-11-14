# Project Structure

## Directory Layout

```
SMS/
├── backend/                 # Node.js Backend
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   │   └── database.ts # TypeORM database configuration
│   │   ├── controllers/    # Request handlers
│   │   │   ├── auth.controller.ts
│   │   │   ├── student.controller.ts
│   │   │   ├── teacher.controller.ts
│   │   │   ├── exam.controller.ts
│   │   │   └── finance.controller.ts
│   │   ├── entities/       # TypeORM entities (database models)
│   │   │   ├── User.ts
│   │   │   ├── Student.ts
│   │   │   ├── Teacher.ts
│   │   │   ├── Parent.ts
│   │   │   ├── Class.ts
│   │   │   ├── Subject.ts
│   │   │   ├── Exam.ts
│   │   │   ├── Marks.ts
│   │   │   └── Invoice.ts
│   │   ├── middleware/    # Express middleware
│   │   │   └── auth.ts        # Authentication & authorization
│   │   ├── routes/           # API routes
│   │   │   ├── index.ts
│   │   │   ├── auth.routes.ts
│   │   │   ├── student.routes.ts
│   │   │   ├── teacher.routes.ts
│   │   │   ├── exam.routes.ts
│   │   │   ├── finance.routes.ts
│   │   │   ├── class.routes.ts
│   │   │   └── subject.routes.ts
│   │   └── server.ts        # Express server entry point
│   ├── scripts/             # Utility scripts
│   ├── package.json
│   ├── tsconfig.json
│   ├── nodemon.json
│   └── .env                 # Environment variables (create this)
│
├── frontend/                # Angular Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/  # Angular components
│   │   │   │   ├── login/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── students/
│   │   │   │   │   ├── student-list/
│   │   │   │   │   └── student-form/
│   │   │   │   ├── teachers/
│   │   │   │   │   ├── teacher-list/
│   │   │   │   │   └── teacher-form/
│   │   │   │   ├── exams/
│   │   │   │   │   ├── exam-list/
│   │   │   │   │   ├── exam-form/
│   │   │   │   │   ├── marks-entry/
│   │   │   │   │   ├── report-card/
│   │   │   │   │   └── rankings/
│   │   │   │   └── finance/
│   │   │   │       ├── invoice-list/
│   │   │   │       └── invoice-form/
│   │   │   ├── services/    # Angular services
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── student.service.ts
│   │   │   │   ├── teacher.service.ts
│   │   │   │   ├── exam.service.ts
│   │   │   │   ├── finance.service.ts
│   │   │   │   ├── class.service.ts
│   │   │   │   └── subject.service.ts
│   │   │   ├── guards/      # Route guards
│   │   │   │   └── auth.guard.ts
│   │   │   ├── interceptors/ # HTTP interceptors
│   │   │   │   └── auth.interceptor.ts
│   │   │   ├── app.module.ts
│   │   │   ├── app-routing.module.ts
│   │   │   └── app.component.ts
│   │   ├── styles.css
│   │   └── index.html
│   ├── angular.json
│   ├── package.json
│   └── tsconfig.json
│
├── README.md               # Main project documentation
├── SETUP.md                # Detailed setup instructions
├── QUICK_START.md          # Quick start guide
└── .gitignore             # Git ignore rules
```

## Key Files

### Backend

- **server.ts**: Main entry point, sets up Express server and database connection
- **config/database.ts**: TypeORM DataSource configuration
- **entities/**: Database models (User, Student, Teacher, etc.)
- **controllers/**: Business logic and request handling
- **routes/**: API endpoint definitions
- **middleware/auth.ts**: JWT authentication and authorization

### Frontend

- **app.module.ts**: Angular module configuration
- **app-routing.module.ts**: Route definitions
- **services/**: HTTP client services for API communication
- **components/**: UI components organized by feature
- **guards/auth.guard.ts**: Route protection
- **interceptors/auth.interceptor.ts**: JWT token injection

## Data Flow

1. **User Action** → Angular Component
2. **Component** → Service (HTTP call)
3. **Service** → Backend API (with JWT token)
4. **Backend** → Middleware (authentication/authorization)
5. **Middleware** → Controller
6. **Controller** → Repository (TypeORM)
7. **Repository** → PostgreSQL Database
8. **Response** flows back through the chain

## API Structure

All API endpoints are prefixed with `/api`:

- `/api/auth/*` - Authentication
- `/api/students/*` - Student management
- `/api/teachers/*` - Teacher management
- `/api/exams/*` - Exam and marks management
- `/api/finance/*` - Invoice and payment management
- `/api/classes/*` - Class management
- `/api/subjects/*` - Subject management

## Database Schema

The system uses the following main entities:

- **users**: User accounts with roles
- **students**: Student information
- **teachers**: Teacher information
- **parents**: Parent information
- **classes**: Class/Form information
- **subjects**: Subject information
- **exams**: Exam information
- **marks**: Student marks for exams
- **invoices**: Financial invoices

Relationships:
- User ↔ Student (One-to-One)
- User ↔ Teacher (One-to-One)
- User ↔ Parent (One-to-One)
- Student ↔ Parent (Many-to-One)
- Student ↔ Class (Many-to-One)
- Teacher ↔ Subject (Many-to-Many)
- Teacher ↔ Class (Many-to-Many)
- Exam ↔ Class (Many-to-One)
- Exam ↔ Subject (Many-to-Many)
- Marks ↔ Student (Many-to-One)
- Marks ↔ Exam (Many-to-One)
- Marks ↔ Subject (Many-to-One)
- Invoice ↔ Student (Many-to-One)

