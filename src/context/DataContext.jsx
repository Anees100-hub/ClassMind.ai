import React, { createContext, useState, useContext, useEffect } from 'react';
import { apiFetch } from '../utils/api';

export const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
    // State
    const [classes, setClasses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [timetables, setTimetables] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [teacherNotifications, setTeacherNotifications] = useState([]);
    const [systemSettings, setSystemSettings] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);
    const [announcements, setAnnouncements] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(true);

    const refreshData = async () => {
        try {
            const [classesRes, teachersRes, studentsRes, timetableRes, materialsRes] = await Promise.all([
                apiFetch('/api/classes').then(r => r.ok ? r.json() : null),
                apiFetch('/api/teachers').then(r => r.ok ? r.json() : null),
                apiFetch('/api/students').then(r => r.ok ? r.json() : null),
                apiFetch('/api/timetable').then(r => r.ok ? r.json() : null),
                apiFetch('/api/materials/all').then(r => r.ok ? r.json() : null).catch(() => null)
            ]);
            if (classesRes) setClasses(classesRes);
            if (teachersRes) setTeachers(teachersRes);
            if (studentsRes) setStudents(studentsRes);
            if (timetableRes) setTimetables(timetableRes);
            if (materialsRes) setMaterials(Array.isArray(materialsRes) ? materialsRes : []);
            return { classes: classesRes, teachers: teachersRes, students: studentsRes, materials: materialsRes };
        } catch (error) {
            console.error("Refresh data error:", error);
            return null;
        }
    };

    const fetchNotifications = async (studentIdentifier) => {
        if (!studentIdentifier) return;
        try {
            const res = await apiFetch(`/api/notifications/student/${studentIdentifier}`);
            if (res.ok) {
                const data = await res.json();
                setNotifications(data);
            }
        } catch (e) {
            console.error("Error fetching notifications", e);
        }
    };

    const fetchTeacherNotifications = async (teacherIdentifier) => {
        if (!teacherIdentifier) return;
        try {
            const res = await apiFetch(`/api/notifications/teacher/${teacherIdentifier}`);
            if (res.ok) {
                const data = await res.json();
                setTeacherNotifications(data);
            }
        } catch (e) {
            console.error("Error fetching teacher notifications", e);
        }
    };

    const fetchAuditLogs = async () => {
        try {
            const res = await apiFetch('/api/settings/audit-logs');
            if (res.ok) setAuditLogs(await res.json());
        } catch (e) {
            console.error('Error fetching audit logs', e);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await apiFetch('/api/settings');
            if (res.ok) setSystemSettings(await res.json());
        } catch (e) {
            console.error('Error fetching settings', e);
        }
    };

    const saveSettings = async (settingsData) => {
        try {
            const res = await apiFetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsData)
            });
            if (res.ok) {
                const data = await res.json();
                setSystemSettings(data);
                await fetchAuditLogs();
                return { success: true, data };
            }
            const err = await res.json();
            return { success: false, message: err.message };
        } catch (e) {
            return { success: false, message: 'Network error' };
        }
    };

    const fetchAnnouncements = async () => {
        try {
            const res = await apiFetch('/api/settings/announcements');
            if (res.ok) setAnnouncements(await res.json());
        } catch (e) {
            console.error('Error fetching announcements', e);
        }
    };

    const fetchFullBackup = async () => {
        try {
            const res = await apiFetch('/api/settings/backup');
            if (res.ok) return await res.json();
        } catch (e) {
            console.error('Error fetching backup', e);
        }
        return null;
    };

    const fetchTimetable = async () => {
        try {
            const res = await apiFetch('/api/timetable');
            if (res.ok) {
                const data = await res.json();
                setTimetables(data);
            }
        } catch (e) {
            console.error("Error fetching timetable", e);
        }
    };

    // Fetch initial data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                console.log("Fetching data from backend...");
                const [classesRes, teachersRes, studentsRes, timetableRes, materialsRes] = await Promise.all([
                    apiFetch('/api/classes').then(r => r.ok ? r.json() : []),
                    apiFetch('/api/teachers').then(r => r.ok ? r.json() : []),
                    apiFetch('/api/students').then(r => r.ok ? r.json() : []),
                    apiFetch('/api/timetable').then(r => r.ok ? r.json() : []),
                    apiFetch('/api/materials/all').then(r => r.ok ? r.json() : []).catch(() => [])
                ]);

                console.log("Data fetched successfully:", { classes: classesRes.length, teachers: teachersRes.length, students: studentsRes.length, timetable: timetableRes.length });
                setClasses(classesRes);
                setTeachers(teachersRes);
                setStudents(studentsRes);
                setTimetables(timetableRes);
                setMaterials(Array.isArray(materialsRes) ? materialsRes : []);
            } catch (error) {
                console.error("Critical Data Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const getEnrolledStudents = (classId) => {
        const enrolled = students.filter(s => (s.enrolledClasses || []).includes(classId));
        return enrolled.map(student => ({
            ...student,
            name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
        }));
    };

    // Derived Data for specific views
    const getTeacherData = (email) => {
        const teacher = teachers.find(t => t.email === email);
        if (!teacher) return null;

        const assignedClasses = teacher.assignedClasses || [];
        const teacherId = Number(teacher.id);

        // Use BOTH sources: teacher.assignedClasses array AND instructorId on class
        // This handles cases where only one side was synced (e.g. after import or DB seeding)
        const teacherCourses = classes.filter(c => {
            const byAssigned = assignedClasses.includes(c.id) || assignedClasses.includes(String(c.id));
            const byInstructorId = c.instructorId !== undefined && c.instructorId !== null &&
                Number(c.instructorId) === teacherId;
            return byAssigned || byInstructorId;
        });

        const totalStudents = teacherCourses.reduce((acc, c) => {
            return acc + students.filter(s => (s.enrolledClasses || []).includes(c.id)).length;
        }, 0);

        const teacherMaterialsCount = materials.filter(m => String(m.teacherId) === String(teacher.id)).length;
        const dbMaterialsCount = teacher.materialsCount || 0;
        const finalMaterialsCount = Math.max(teacherMaterialsCount, dbMaterialsCount);

        const avgEngagement = 0; // Computed live on TeacherDashboard from emotion API

        return {
            ...teacher,
            courses: teacherCourses.map(c => ({
                ...c,
                studentsCount: students.filter(s => (s.enrolledClasses || []).includes(c.id)).length,
                materialsCount: materials.filter(m => m.classId === c.id).length
            })),
            summaryStats: [
                { id: 'classes', label: 'Active Classes', value: teacherCourses.length, icon: 'BookOpen', color: '#3B82F6' },
                { id: 'students', label: 'Total Students', value: totalStudents, icon: 'Users', color: '#A855F7' },
                { id: 'engagement', label: 'Avg. Engagement', value: avgEngagement ? `${avgEngagement}%` : '—', icon: 'TrendingUp', color: '#6366F1' },
                { id: 'materials', label: 'Materials Uploaded', value: finalMaterialsCount, icon: 'Upload', color: '#EC4899' },
            ]
        };
    };

    const getTeacherCourse = (email, courseId) => {
        const teacherData = getTeacherData(email);
        if (!teacherData || !courseId) return null;
        return teacherData.courses.find(c => c.id === courseId) || null;
    };

    const getStudentData = (email) => {
        const student = students.find(s => s.email === email);
        if (!student) return null;

        const enrolledClasses = student.enrolledClasses || [];
        const enrolledMaterials = materials.filter(m => enrolledClasses.includes(m.classId));
        // Only personal notifs or class-level notifs for enrolled classes (not all SYSTEM/others)
        const studentNotifs = notifications.filter(n =>
            Number(n.studentId) === Number(student.id) ||
            (
                n.classId &&
                enrolledClasses.includes(n.classId) &&
                (n.studentId == null || n.studentId === undefined) &&
                (n.teacherId == null || n.teacherId === undefined)
            )
        );

        return {
            ...student,
            notifications: studentNotifs,
            stats: [
                { label: 'Enrolled Classes', value: enrolledClasses.length.toString() },
                { label: 'Overall CGPA', value: student.overallCGPA || '0.00' },
                { label: 'Previous CGPA', value: student.previousCGPA || '0.00' },
                { label: 'New Updates', value: studentNotifs.filter(n => n.unread).length.toString() }
            ],
            classes: classes.filter(c => enrolledClasses.includes(c.id)).map(c => {
                const classMaterials = materials.filter(m => m.classId === c.id);
                const classSchedule = timetables.filter(t => t.courseId === c.id);
                const scheduleLabel = c.schedule || (classSchedule.length > 0
                    ? classSchedule.map(t => `${t.day?.slice(0, 3)} ${t.startTime}-${t.endTime}`).join(', ')
                    : 'TBD');
                return {
                    ...c,
                    instructor: c.instructorId
                        ? `${teachers.find(t => t.id === c.instructorId)?.firstName || ''} ${teachers.find(t => t.id === c.instructorId)?.lastName || ''}`.trim()
                        : 'Unassigned',
                    progress: student.progress ? parseInt(String(student.progress).replace('%', ''), 10) || 0 : 0,
                    previousCGPA: student.previousCGPA || '0.00',
                    overallCGPA: student.overallCGPA || '0.00',
                    nextSession: scheduleLabel,
                    materialsCount: classMaterials.length
                };
            })
        };
    };

    const getStudentCourse = (email, courseId) => {
        const studentData = getStudentData(email);
        if (!studentData || !courseId) return null;
        return studentData.classes.find(c => c.id === courseId) || null;
    };

    const markNotificationRead = async (notifId) => {
        try {
            const res = await apiFetch(`/api/notifications/${notifId}/read`, { method: 'PATCH' });
            if (res.ok) {
                setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, unread: false } : n));
                setTeacherNotifications(prev => prev.map(n => n.id === notifId ? { ...n, unread: false } : n));
            }
        } catch (e) {
            console.error("Error marking notification read", e);
        }
    };

    const markAllNotificationsRead = async ({ studentId, teacherId } = {}) => {
        try {
            const body = studentId ? { studentId } : teacherId ? { teacherId } : {};
            const res = await apiFetch('/api/notifications/read-all', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                if (studentId) {
                    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
                }
                if (teacherId) {
                    setTeacherNotifications(prev => prev.map(n => ({ ...n, unread: false })));
                }
            }
        } catch (e) {
            console.error("Error marking all read", e);
        }
    };

    const deleteNotification = async (notifId) => {
        try {
            const res = await apiFetch(`/api/notifications/${notifId}`, { method: 'DELETE' });
            if (res.ok) {
                setNotifications(prev => prev.filter(n => n.id !== notifId));
                setTeacherNotifications(prev => prev.filter(n => n.id !== notifId));
            }
        } catch (e) {
            console.error("Error deleting notification", e);
        }
    };

    const rescheduleClass = async (rescheduleData) => {
        try {
            const res = await apiFetch('/api/timetable/reschedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rescheduleData)
            });
            if (res.ok) {
                const data = await res.json();
                await fetchTimetable();
                await refreshData();
                return data;
            }
        } catch (e) {
            console.error("Error rescheduling class", e);
        }
        return null;
    };

    const changePassword = async (email, currentPassword, newPassword) => {
        try {
            const res = await apiFetch('/api/users/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, currentPassword, newPassword })
            });
            const data = await res.json();
            if (res.ok) return { success: true, message: data.message };
            return { success: false, message: data.message || 'Password change failed' };
        } catch (error) {
            console.error("Password change error", error);
            return { success: false, message: 'Network error' };
        }
    };

    const validateUser = async (email, password) => {
        try {
            console.log("Validating user credentials...");
            const res = await fetch('/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (res.ok) {
                const user = await res.json();
                if (user.token) localStorage.setItem('classmind_token', user.token);
                console.log('Login successful for:', email);
                return {
                    name: `${user.firstName} ${user.lastName}`,
                    email: user.email,
                    role: user.role,
                    id: user.id
                };
            } else {
                const err = await res.json().catch(() => ({}));
                console.warn('Login failed:', res.status, err.message);
                return { error: err.message || 'Invalid email or password' };
            }
        } catch (error) {
            console.error("Auth validation network error", error);
        }
        return null;
    };

    // CRUD Functions (Updated to call API)
    const addTeacher = async (teacher) => {
        try {
            const res = await apiFetch('/api/teachers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'Active',
                    office: 'Campus Building 4, Office 201',
                    materialsCount: 0,
                    ...teacher,
                    role: 'teacher',
                    assignedClasses: teacher.assignedClasses || []
                })
            });
            if (res.ok) {
                const newTeacher = await res.json();
                setTeachers(prev => [...prev, newTeacher]);
                return newTeacher; // Return the full teacher object so callers can use the assigned ID
            } else {
                console.error("Failed to add teacher:", await res.text());
                return null;
            }
        } catch (error) {
            console.error("Error adding teacher", error);
            return null;
        }
    };

    const updateTeacher = async (id, updatedData) => {
        const numId = Number(id);
        if (!id || isNaN(numId)) {
            console.error("[UPDATE DEBUG] Invalid ID passed to updateTeacher:", id);
            return false;
        }

        console.log(`[UPDATE DEBUG] Updating teacher ${id} (parsed: ${numId}) with data:`, updatedData);
        try {
            const res = await apiFetch(`/api/teachers/${numId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });

            console.log(`[UPDATE DEBUG] Response status: ${res.status}`);

            if (res.ok) {
                const data = await res.json();
                console.log(`[UPDATE DEBUG] Update success, received:`, data);
                // Use strict comparison with Number cast to ensure matches
                setTeachers(prev => prev.map(t => Number(t.id) === numId ? data : t));
                return true;
            } else {
                console.error(`[UPDATE DEBUG] Update failed: ${await res.text()}`);
                return false;
            }
        } catch (error) {
            console.error("[UPDATE DEBUG] Error update teacher", error);
            return false;
        }
    };

    const deleteTeacher = async (id) => {
        const numId = Number(id);
        try {
            const res = await apiFetch(`/api/teachers/${numId}`, { method: 'DELETE' });
            if (res.ok) {
                setTeachers(prev => prev.filter(t => t.id !== numId));
                await refreshData();
                await fetchAuditLogs();
                return { success: true };
            }
            const err = await res.json().catch(() => ({}));
            return { success: false, message: err.message || 'Failed to delete teacher' };
        } catch (error) {
            console.error('Error delete teacher', error);
            return { success: false, message: 'Network error while deleting teacher' };
        }
    };

    const addStudent = async (student) => {
        try {
            const res = await apiFetch('/api/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'Active',
                    progress: '0%',
                    previousCGPA: '0.00',
                    overallCGPA: '0.00',
                    materialsCount: 0,
                    updatesCount: 0,
                    ...student,
                    role: 'student',
                    enrolledClasses: student.enrolledClasses || []
                })
            });
            if (res.ok) {
                const newStudent = await res.json();
                setStudents(prev => [...prev, newStudent]);
                await fetchAuditLogs();
                return newStudent;
            } else {
                console.error("Failed to add student:", await res.text());
            }
        } catch (error) {
            console.error("Error adding student", error);
        }
        return null;
    };

    const updateStudent = async (id, updatedData) => {
        const numId = Number(id);
        console.log(`Updating student ${numId}`, updatedData);
        try {
            const res = await apiFetch(`/api/students/${numId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            if (res.ok) {
                const data = await res.json();
                setStudents(prev => prev.map(s => s.id === numId ? data : s));
                return true;
            } else {
                console.error("Failed to update student:", await res.text());
            }
        } catch (error) {
            console.error("Error updating student", error);
        }
        return false;
    };

    const deleteStudent = async (id) => {
        const numId = Number(id);
        try {
            const res = await apiFetch(`/api/students/${numId}`, { method: 'DELETE' });
            if (res.ok) {
                setStudents(prev => prev.filter(s => s.id !== numId));
                await refreshData();
                await fetchAuditLogs();
            }
        } catch (error) {
            console.error("Error deleting student", error);
        }
    };

    const addClass = async (newClass) => {
        try {
            const clsData = {
                ...newClass,
                id: newClass.id || `CS${Math.floor(Math.random() * 900) + 100}`,
                status: 'Active',
                studentsCount: 0, // Align with model
                stats: [{ label: 'Total Students', value: '0' }, { label: 'Avg Attendance', value: '0%' }, { label: 'Engagement', value: '0%' }, { label: 'Pending Reviews', value: '0' }],
                tracking: [],
                analytics: { summary: { engaged: 0, neutral: 0, disengaged: 0, improvement: 0 }, trends: [] },
                recentActivity: []
            };

            const res = await apiFetch('/api/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clsData)
            });
            if (res.ok) {
                const savedClass = await res.json();
                setClasses(prev => [...prev, savedClass]);

                if (clsData.instructorId) {
                    const numTeacherId = Number(clsData.instructorId);
                    setTeachers(prev => prev.map(t => {
                        if (Number(t.id) === numTeacherId) {
                            const newAssigned = Array.from(new Set([...(t.assignedClasses || []), savedClass.id]));
                            return { ...t, assignedClasses: newAssigned };
                        }
                        return t;
                    }));
                }

                return { success: true, data: savedClass };
            } else {
                const errData = await res.json().catch(() => ({}));
                let msg = errData.message || 'Failed to create class';
                if (msg.includes('duplicate key error') || msg.includes('E11000')) {
                    msg = `Course ID "${clsData.id}" already exists in the database. Please enter a unique Course Code.`;
                }
                console.error("Add class failed:", msg);
                return { success: false, message: msg };
            }
        } catch (error) {
            console.error("Error adding class", error);
            return { success: false, message: error.message || 'Network error while adding class' };
        }
    };

    const updateClass = async (id, updatedData) => {
        try {
            const res = await apiFetch(`/api/classes/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            if (res.ok) {
                const data = await res.json();
                setClasses(prev => prev.map(c => c.id === id ? data : c));

                if (updatedData.instructorId !== undefined) {
                    await refreshData();
                }
                return { success: true, data };
            }
            const err = await res.json().catch(() => ({}));
            return { success: false, message: err.message || 'Update failed' };
        } catch (error) {
            console.error("Error updating class", error);
            return { success: false, message: error.message };
        }
    };

    const deleteClass = async (id) => {
        try {
            const res = await apiFetch(`/api/classes/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setClasses(prev => prev.filter(c => c.id !== id));
                const updatedTeachers = await apiFetch('/api/teachers').then(r => r.json());
                setTeachers(updatedTeachers);
                await fetchAuditLogs();
            }
        } catch (error) {
            console.error("Error deleting class", error);
        }
    };

    const assignClassToTeacher = async (teacherId, classId) => {
        // Normalize teacherId to number for consistent comparison
        const numTeacherId = Number(teacherId);
        const teacher = teachers.find(t => Number(t.id) === numTeacherId);
        const cls = classes.find(c => c.id === classId);

        if (teacher && cls) {
            const currentAssigned = teacher.assignedClasses || [];
            const newAssignedClasses = Array.from(new Set([...currentAssigned, classId]));

            // Persist to Teacher and Class in parallel
            try {
                await Promise.all([
                    updateTeacher(numTeacherId, { assignedClasses: newAssignedClasses }),
                    updateClass(classId, {
                        instructorId: numTeacherId,
                        instructorName: `${teacher.firstName} ${teacher.lastName}`
                    })
                ]);
                // Update local teacher state immediately so UI reflects it
                setTeachers(prev => prev.map(t =>
                    Number(t.id) === numTeacherId
                        ? { ...t, assignedClasses: newAssignedClasses }
                        : t
                ));
                // Update local classes state immediately
                setClasses(prev => prev.map(c =>
                    c.id === classId
                        ? { ...c, instructorId: numTeacherId, instructorName: `${teacher.firstName} ${teacher.lastName}` }
                        : c
                ));
                await fetchAuditLogs();
            } catch (error) {
                console.error("Failed to persist assignment", error);
            }
        }
    };

    const enrollStudentInClass = async (studentId, classId) => {
        const student = students.find(s => s.id === studentId);
        const cls = classes.find(c => c.id === classId);

        if (student && cls && !(student.enrolledClasses || []).includes(classId)) {
            const newEnrolled = Array.from(new Set([...(student.enrolledClasses || []), classId]));

            // Update Class stats and studentsCount
            const currentCount = parseInt(cls.studentsCount || 0);
            const newStats = (cls.stats || []).map(s =>
                s.label === 'Total Students' ? { ...s, value: (currentCount + 1).toString() } : s
            );

            try {
                await Promise.all([
                    updateStudent(studentId, { enrolledClasses: newEnrolled }),
                    updateClass(classId, {
                        stats: newStats,
                        studentsCount: currentCount + 1
                    })
                ]);
                await refreshData();
            } catch (error) {
                console.error("Failed to persist enrollment", error);
            }
        }
    };

    const unenrollStudentFromClass = async (studentId, classId) => {
        const student = students.find(s => s.id === studentId);
        const cls = classes.find(c => c.id === classId);

        if (student && cls && (student.enrolledClasses || []).includes(classId)) {
            const newEnrolled = (student.enrolledClasses || []).filter(id => id !== classId);

            // Update Class stats and studentsCount
            const currentCount = parseInt(cls.studentsCount || 0);
            const newCount = Math.max(0, currentCount - 1);
            const newStats = (cls.stats || []).map(s =>
                s.label === 'Total Students' ? { ...s, value: newCount.toString() } : s
            );

            try {
                await Promise.all([
                    updateStudent(studentId, { enrolledClasses: newEnrolled }),
                    updateClass(classId, {
                        stats: newStats,
                        studentsCount: newCount
                    })
                ]);
                await refreshData();
            } catch (error) {
                console.error("Failed to persist unenrollment", error);
            }
        }
    };

    const bulkAddTeachers = async (teachersData) => {
        try {
            console.log("Starting bulk teacher import for", teachersData.length, "teachers...");
            const res = await apiFetch('/api/teachers/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teachersData)
            });
            if (res.ok) {
                const results = await res.json();
                console.log('Bulk Import Success:', results);
                // Refresh teachers
                const updatedTeachers = await apiFetch('/api/teachers').then(r => r.json());
                setTeachers(updatedTeachers);
                await fetchAuditLogs();
                return results;
            } else {
                console.error("Bulk add teachers failed:", await res.text());
            }
        } catch (error) {
            console.error("Error in bulkAddTeachers:", error);
        }
        return null;
    };

    const bulkAddStudents = async (studentsData) => {
        try {
            console.log("Starting bulk student import for", studentsData.length, "students...");
            const res = await apiFetch('/api/students/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(studentsData)
            });
            if (res.ok) {
                const results = await res.json();
                console.log('Bulk Import Success:', results);
                // Refresh students from backend to ensure data consistency
                const updatedStudents = await apiFetch('/api/students').then(r => r.json());
                setStudents(updatedStudents);
                await refreshData();
                await fetchAuditLogs();
                return results;
            } else {
                console.error("Bulk add students failed:", await res.text());
            }
        } catch (error) {
            console.error("Error in bulkAddStudents:", error);
        }
        return null;
    };

    return (
        <DataContext.Provider value={{
            teachers, students, classes, timetables, notifications, teacherNotifications, materials,
            systemSettings, auditLogs, announcements, loading,
            dashboardStats: {
                totalStudents: students.length,
                totalTeachers: teachers.length,
                totalClasses: classes.length,
                activeTeachers: teachers.filter(t => t.status === 'Active').length,
                activeClasses: classes.filter(c => c.status === 'Active').length
            },
            addTeacher, updateTeacher, deleteTeacher,
            addStudent, updateStudent, deleteStudent,
            addClass, updateClass, deleteClass,
            assignClassToTeacher, enrollStudentInClass, unenrollStudentFromClass,
            bulkAddStudents, bulkAddTeachers,
            validateUser, changePassword, getTeacherData, getTeacherCourse, getStudentData, getStudentCourse, getEnrolledStudents,
            refreshData, fetchNotifications, fetchTeacherNotifications, fetchTimetable,
            fetchSettings, saveSettings, fetchAuditLogs, fetchAnnouncements, fetchFullBackup,
            markNotificationRead, markAllNotificationsRead, deleteNotification, rescheduleClass
        }}>
            {children}
        </DataContext.Provider>
    );
};
