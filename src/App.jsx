import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AnimatePresence } from 'framer-motion';
import Login from './pages/Login';
import Teachers from './pages/Teachers';
import Students from './pages/Students';
import Classes from './pages/Classes';
import AdminCourseAnalytics from './pages/AdminCourseAnalytics';
import AdminSettings from './pages/AdminSettings';
import Analytics from './pages/Analytics';
import SystemOverview from './pages/SystemOverview';
import StudentDashboard from './pages/StudentDashboard';
import StudentNotifications from './pages/StudentNotifications';
import ClassDetail from './pages/ClassDetail';
import MaterialDetail from './pages/MaterialDetail';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherCourseDetails from './pages/TeacherCourseDetails';
import TeacherStudentTracking from './pages/TeacherStudentTracking';
import TeacherAnalytics from './pages/TeacherAnalytics';
import TeacherUpload from './pages/TeacherUpload';
import TeacherReschedule from './pages/TeacherReschedule';
import TeacherAttendanceScanner from './pages/TeacherAttendanceScanner';
import AccountSettings from './pages/AccountSettings';
import TeacherNotifications from './pages/TeacherNotifications';
import MainLayout from './components/MainLayout';
import RoleGate from './components/RoleGate';
import './App.css';

/* eslint-disable react-refresh/only-export-components */
// Protected Route utilizing MainLayout
const ProtectedRoute = () => {
  const { currentUser } = useAuth();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <MainLayout />;
};

const LandingPage = () => {
  const { currentUser } = useAuth();
  if (currentUser?.role === 'student') return <StudentDashboard />;
  if (currentUser?.role === 'teacher') return <Navigate to="/teacher/dashboard" replace />;
  return <SystemOverview />;
};

function App() {
  return (
    <DataProvider>
      <AuthProvider>
        <Router>
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route element={<ProtectedRoute />}>
                {/* Home route dynamically renders dashboard based on role */}
                <Route path="/" element={<LandingPage />} />

                {/* Admin routes */}
                <Route path="/teachers" element={<RoleGate roles={['admin']}><Teachers /></RoleGate>} />
                <Route path="/students" element={<RoleGate roles={['admin']}><Students /></RoleGate>} />
                <Route path="/classes" element={<RoleGate roles={['admin']}><Classes /></RoleGate>} />
                <Route path="/analytics/:courseId" element={<RoleGate roles={['admin']}><AdminCourseAnalytics /></RoleGate>} />
                <Route path="/admin/course/:courseId/analytics" element={<RoleGate roles={['admin']}><AdminCourseAnalytics /></RoleGate>} />
                <Route path="/settings" element={<RoleGate roles={['admin']}><AdminSettings /></RoleGate>} />
                <Route path="/analytics" element={<RoleGate roles={['admin']}><Analytics /></RoleGate>} />

                <Route path="/account" element={<AccountSettings />} />

                {/* Student routes */}
                <Route path="/notifications" element={<RoleGate roles={['student']}><StudentNotifications /></RoleGate>} />
                <Route path="/class/:id" element={<RoleGate roles={['student']}><ClassDetail /></RoleGate>} />
                <Route path="/material/:id" element={<RoleGate roles={['student', 'teacher', 'admin']}><MaterialDetail /></RoleGate>} />

                {/* Teacher routes */}
                <Route path="/teacher/dashboard" element={<RoleGate roles={['teacher']}><TeacherDashboard /></RoleGate>} />
                <Route path="/teacher/notifications" element={<RoleGate roles={['teacher']}><TeacherNotifications /></RoleGate>} />
                <Route path="/teacher/course/:courseId" element={<RoleGate roles={['teacher']}><TeacherCourseDetails /></RoleGate>} />
                <Route path="/teacher/course/:courseId/tracking" element={<RoleGate roles={['teacher']}><TeacherStudentTracking /></RoleGate>} />
                <Route path="/teacher/course/:courseId/analytics" element={<RoleGate roles={['teacher']}><TeacherAnalytics /></RoleGate>} />
                <Route path="/teacher/course/:courseId/upload" element={<RoleGate roles={['teacher']}><TeacherUpload /></RoleGate>} />
                <Route path="/teacher/course/:courseId/reschedule" element={<RoleGate roles={['teacher']}><TeacherReschedule /></RoleGate>} />
                <Route path="/teacher/course/:courseId/attendance-scanner" element={<RoleGate roles={['teacher']}><TeacherAttendanceScanner /></RoleGate>} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </Router>
      </AuthProvider>
    </DataProvider>
  );
}

export default App;
