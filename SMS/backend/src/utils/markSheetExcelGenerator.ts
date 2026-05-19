import * as XLSX from 'xlsx';
import { Settings } from '../entities/Settings';

interface MarkSheetExcelData {
  class: {
    id: string;
    name: string;
    form: string;
    classTeacherName?: string | null;
  };
  examType: string;
  subjects: Array<{ id: string; name: string }>;
  exams: Array<{
    id: string;
    name: string;
    examDate: Date;
    term: string | null;
  }>;
  markSheet: Array<{
    studentId: string;
    studentNumber: string;
    studentName: string;
    position: number;
    subjects: {
      [subjectId: string]: {
        subjectName: string;
        score: number;
        maxScore: number;
        percentage: number;
      };
    };
    totalScore: number;
    totalMaxScore: number;
    average: number;
  }>;
  generatedAt: Date;
}

export function createMarkSheetExcel(
  data: MarkSheetExcelData,
  _settings: Settings | null
): Buffer {
  const rows: (string | number)[][] = [];

  // Pass rate (like PDF)
  const passCount = data.markSheet.filter((r) => r.average >= 70).length;
  const passRate =
    data.markSheet.length > 0
      ? Math.round((passCount / data.markSheet.length) * 100)
      : 0;
  rows.push([`Pass Rate: ${passRate}% (students with 70% and above)`]);

  // Class teacher (like PDF)
  const classTeacherName = (data.class as any)?.classTeacherName;
  if (classTeacherName) {
    rows.push([`Class Teacher: ${classTeacherName}`]);
  }

  // Title
  rows.push(['MARK SHEET']);

  // Class, Exam Type, Generated (like PDF)
  const generatedDate = new Date(data.generatedAt);
  rows.push([
    `Class: ${data.class.name} (${data.class.form})`,
    `Exam Type: ${data.examType.toUpperCase().replace('_', ' ')}`,
    `Generated: ${generatedDate.toLocaleDateString()} ${generatedDate.toLocaleTimeString()}`
  ]);

  rows.push([]); // Empty row

  // Table header: Pos | Student No. | Student Name | [Subjects] | Total | Avg %
  const headerRow: (string | number)[] = [
    'Pos',
    'Student No.',
    'Student Name',
    ...data.subjects.map((s) => s.name),
    'Total',
    'Avg %'
  ];
  rows.push(headerRow);

  // Data rows (same structure as PDF: score/maxScore per subject)
  for (const row of data.markSheet) {
    const dataRow: (string | number)[] = [
      row.position,
      row.studentNumber,
      row.studentName,
      ...data.subjects.map((subject) => {
        const sub = row.subjects[subject.id];
        return sub ? `${sub.score}/${sub.maxScore}` : '-';
      }),
      `${row.totalScore}/${row.totalMaxScore}`,
      row.average.toFixed(2) + '%'
    ];
    rows.push(dataRow);
  }

  rows.push([]);
  rows.push([`Total Students: ${data.markSheet.length}`]);
  rows.push([`Exams Included: ${data.exams.length}`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  const colWidths = [
    { wch: 5 },
    { wch: 14 },
    { wch: 22 },
    ...data.subjects.map(() => ({ wch: 12 })),
    { wch: 14 },
    { wch: 10 }
  ];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mark Sheet');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
