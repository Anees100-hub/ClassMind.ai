---
description: How to verify the ClassMind Dashboard system integration
---

# System Verification Workflow

Follow these steps to ensure all components of the ClassMind Dashboard are correctly integrated with the MongoDB backend and the unified authentication system.

## 1. Database & Connectivity Check
Verify that the frontend can communicate with the backend and that the database is populated.

- [ ] **Refresh the Browser**: Open the dashboard in your browser.
- [ ] **Check Console Logs**: Press `F12` and look at the "Console" tab.
- [ ] **Confirm Status**: You should see:
  - `Fetching data from backend...`
  - `Classes Response: 200`
  - `Data fetched successfully: { classes: 2, teachers: 5, students: 4 }` (numbers may vary).

## 2. Dynamic Data Verification
Ensure the UI is not showing placeholder data.

- [ ] **Classes Page**: Navigate to the "Classes" page. Verify that the classes match the ones in your database (e.g., CS401, CS502).
- [ ] **Student Progress**: Check the "Students" page. Verify that the progress percentages and programs are displayed correctly.
- [ ] **Analytics**: Open any "View Analytics" link. The charts should render without "TBD" placeholders.

## 3. Unified Authentication (Login)
Test the password-based login for different roles.

- [ ] **Logout**: Click the Logout button (if logged in).
- [ ] **Admin Login**: Login with `admin@classmind.ai` and `password123`.
- [ ] **Teacher Login**: Logout and login with `sarah.j@classmind.ai` and `password123`.
- [ ] **Student Login**: Logout and login with `student@classmind.ai` and `password123`.

## 4. Automatic User Creation (End-to-End)
Verify that adding a new member automatically creates a login account.

- [ ] **Login as Admin**: Access the dashboard as an administrator.
- [ ] **Add Student**: 
  - Go to the "Students" page.
  - Click "Add New Student".
  - Use a unique email (e.g., `newtest@student.edu`).
  - Set a name and program, then "Add Student".
- [ ] **Verify Database**: (Optional) Check the `users` collection in MongoDB to see if `newtest@student.edu` was added.
- [ ] **Test Login**:
  - Logout from Admin.
  - Try logging in with the email `newtest@student.edu` and password `password123`.
  - **Success**: You should be redirected to the Student Dashboard.

## 5. Synchronization Check
- [ ] **Edit Profile**: While logged in as Admin, edit the name of a teacher.
- [ ] **Re-login**: Logout and log back in as that teacher. Verify the name update is reflected in the top-right header.
- [ ] **Deletion**: Delete a test student. Verify that you can no longer log in with that student's email.
