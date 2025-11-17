import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Attendance, AttendanceStatus } from '../entities/Attendance';
import { Student } from '../entities/Student';
import { Class } from '../entities/Class';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { getCurrentSchoolId } from '../utils/schoolContext';

export const markAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    // Check if user has permission (teacher, admin, or superadmin)
    if (!user || (user.role !== UserRole.TEACHER && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'You do not have permission to mark attendance' });
    }

    const { classId, date, attendanceData } = req.body;
    let schoolId: string;
    try {
      schoolId = getCurrentSchoolId(req);
    } catch {
      return res.status(400).json({ message: 'School context not found' });
    }

    if (!classId || !date || !attendanceData || !Array.isArray(attendanceData)) {
      return res.status(400).json({ message: 'Class ID, date, and attendance data are required' });
    }

    const attendanceRepository = AppDataSource.getRepository(Attendance);
    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Verify class exists
    const classEntity = await classRepository.findOne({ where: { id: classId, schoolId } });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Get current term from settings
    const settings = await settingsRepository.findOne({
      where: { schoolId },
      order: { createdAt: 'DESC' }
    });
    const currentTerm = settings?.activeTerm || settings?.currentTerm || null;

    const attendanceDate = new Date(date);
    const results = [];

    // Delete existing attendance records for this class and date
    await attendanceRepository.delete({
      classId,
      date: attendanceDate,
      schoolId
    });

    // Create new attendance records
    for (const item of attendanceData) {
      const { studentId, status, remarks } = item;

      if (!studentId || !status) {
        continue;
      }

      // Verify student exists and belongs to the class
      const student = await studentRepository.findOne({
        where: { id: studentId, classId, schoolId }
      });

      if (!student) {
        continue;
      }

      const attendance = attendanceRepository.create({
        studentId,
        classId,
        date: attendanceDate,
        status: status as AttendanceStatus,
        term: currentTerm,
        remarks: remarks || null,
        markedBy: user.id,
        schoolId
      });

      const saved = await attendanceRepository.save(attendance);
      results.push(saved);
    }

    res.json({
      message: `Attendance marked successfully for ${results.length} student(s)`,
      count: results.length,
      date: attendanceDate.toISOString().split('T')[0],
      classId
    });
  } catch (error: any) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    // Check if user has permission
    if (!user || (user.role !== UserRole.TEACHER && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'You do not have permission to view attendance' });
    }

    const { classId, date, studentId, term, startDate, endDate } = req.query;
    let schoolId: string;
    try {
      schoolId = getCurrentSchoolId(req);
    } catch {
      return res.status(400).json({ message: 'School context not found' });
    }

    const attendanceRepository = AppDataSource.getRepository(Attendance);

    const query: any = { schoolId };

    if (classId) {
      query.classId = classId as string;
    }

    if (studentId) {
      query.studentId = studentId as string;
    }

    if (date) {
      query.date = new Date(date as string);
    }

    if (term) {
      query.term = term as string;
    }

    const attendance = await attendanceRepository.find({
      where: query,
      relations: ['student', 'class', 'markedByUser'],
      order: { date: 'DESC', createdAt: 'DESC' }
    });

    // Filter by date range if provided
    let filteredAttendance = attendance;
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      filteredAttendance = attendance.filter(a => {
        const attDate = new Date(a.date);
        return attDate >= start && attDate <= end;
      });
    }

    res.json({ attendance: filteredAttendance });
  } catch (error: any) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getAttendanceReport = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    // Check if user has permission
    if (!user || (user.role !== UserRole.TEACHER && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'You do not have permission to view attendance reports' });
    }

    const { classId, term, startDate, endDate } = req.query;
    let schoolId: string;
    try {
      schoolId = getCurrentSchoolId(req);
    } catch {
      return res.status(400).json({ message: 'School context not found' });
    }

    if (!classId) {
      return res.status(400).json({ message: 'Class ID is required' });
    }

    const attendanceRepository = AppDataSource.getRepository(Attendance);
    const studentRepository = AppDataSource.getRepository(Student);

    // Get all students in the class
    const students = await studentRepository.find({
      where: { classId: classId as string, isActive: true, schoolId },
      order: { firstName: 'ASC', lastName: 'ASC' }
    });

    // Build query for attendance
    const query: any = { classId: classId as string, schoolId };

    if (term) {
      query.term = term as string;
    }

    // Get all attendance records
    let attendanceRecords = await attendanceRepository.find({
      where: query,
      relations: ['student']
    });

    // Filter by date range if provided
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      attendanceRecords = attendanceRecords.filter(a => {
        const attDate = new Date(a.date);
        return attDate >= start && attDate <= end;
      });
    }

    // Calculate statistics for each student
    const report = students.map(student => {
      const studentAttendance = attendanceRecords.filter(a => a.studentId === student.id);
      
      const present = studentAttendance.filter(a => a.status === AttendanceStatus.PRESENT).length;
      const absent = studentAttendance.filter(a => a.status === AttendanceStatus.ABSENT).length;
      const late = studentAttendance.filter(a => a.status === AttendanceStatus.LATE).length;
      const excused = studentAttendance.filter(a => a.status === AttendanceStatus.EXCUSED).length;
      const total = studentAttendance.length;

      return {
        studentId: student.id,
        studentNumber: student.studentNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        present,
        absent,
        late,
        excused,
        total,
        attendanceRate: total > 0 ? ((present + excused) / total * 100).toFixed(2) : '0.00'
      };
    });

    res.json({
      classId,
      term: term || null,
      startDate: startDate || null,
      endDate: endDate || null,
      report,
      summary: {
        totalStudents: students.length,
        totalRecords: attendanceRecords.length,
        averageAttendanceRate: report.length > 0
          ? (report.reduce((sum, r) => sum + parseFloat(r.attendanceRate), 0) / report.length).toFixed(2)
          : '0.00'
      }
    });
  } catch (error: any) {
    console.error('Error generating attendance report:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getStudentTotalAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, term } = req.query;
    let schoolId: string;
    try {
      schoolId = getCurrentSchoolId(req);
    } catch {
      return res.status(400).json({ message: 'School context not found' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const attendanceRepository = AppDataSource.getRepository(Attendance);

    const query: any = { studentId: studentId as string, schoolId };

    if (term) {
      query.term = term as string;
    }

    const attendanceRecords = await attendanceRepository.find({
      where: query
    });

    const present = attendanceRecords.filter(a => a.status === AttendanceStatus.PRESENT).length;
    const excused = attendanceRecords.filter(a => a.status === AttendanceStatus.EXCUSED).length;
    const total = attendanceRecords.length;

    res.json({
      studentId,
      term: term || null,
      totalAttendance: total,
      present,
      excused,
      totalPresent: present + excused
    });
  } catch (error: any) {
    console.error('Error fetching student attendance:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

