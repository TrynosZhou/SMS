# Creating Administrator Account

## Method 1: Using Script (Recommended)

After setting up the database and starting the backend, run:

```bash
cd backend
npm run create-admin <username> <password> <email> [role]
```

**Example (Admin):**
```bash
npm run create-admin admin admin123 admin@school.com admin
```

**Example (Super Administrator):**
```bash
npm run create-admin superadmin super123 superadmin@school.com superadmin
```

This will create an account with:
- **Username**: admin (or superadmin)
- **Password**: admin123 (or super123)
- **Email**: admin@school.com (or superadmin@school.com)
- **Role**: Admin or Super Administrator (optional, defaults to 'admin')

**Role options:**
- `admin` - Regular administrator (default)
- `superadmin` - Super administrator with full system access

## Method 2: Using API

1. Start the backend server:
```bash
npm run dev
```

2. Register a user via API:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@school.com",
    "password": "admin123",
    "role": "admin"
  }'
```

3. The user will be created with admin role.

## Method 3: Direct Database (Not Recommended)

Only use if other methods don't work:

1. Register any user via API (without role, defaults to student)
2. Connect to database:
```sql
UPDATE users
SET role = 'admin', username = 'admin'
WHERE email = 'your_email@example.com';
```

For superadmin:
```sql
UPDATE users
SET role = 'superadmin', username = 'superadmin'
WHERE email = 'your_email@example.com';
```

## Login

After creating the admin account, you can login with:
- **Username**: admin (or whatever you set)
- **Password**: admin123 (or whatever you set)

OR

- **Email**: admin@school.com
- **Password**: admin123

Both username and email work for login!

## Default Superadmin Account

**To create a default superadmin account:**

```bash
cd backend
npm run create-admin superadmin super123 superadmin@school.com superadmin
```

This creates a superadmin with:
- **Username**: superadmin
- **Password**: super123
- **Email**: superadmin@school.com
- **Role**: Super Administrator (full system access)

