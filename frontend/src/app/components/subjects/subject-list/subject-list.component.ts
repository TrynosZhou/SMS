import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SubjectService } from '../../../services/subject.service';

@Component({
  selector: 'app-subject-list',
  templateUrl: './subject-list.component.html',
  styleUrls: ['./subject-list.component.css']
})
export class SubjectListComponent implements OnInit {
  subjects: any[] = [];
  loading = false;

  constructor(
    private subjectService: SubjectService,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadSubjects();
  }

  loadSubjects() {
    this.loading = true;
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.subjects = data;
        this.loading = false;
      },
      error: (err: any) => {
        console.error(err);
        this.loading = false;
      }
    });
  }

  editSubject(id: string) {
    this.router.navigate([`/subjects/${id}/edit`]);
  }
}

