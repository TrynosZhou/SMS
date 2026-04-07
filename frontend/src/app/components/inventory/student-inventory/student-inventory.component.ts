import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../../../services/inventory.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-student-inventory',
  templateUrl: './student-inventory.component.html',
  styleUrls: ['./student-inventory.component.css']
})
export class StudentInventoryComponent implements OnInit {
  summary: any = null;
  loading = true;
  err = '';

  constructor(private inventory: InventoryService, public auth: AuthService) {}

  ngOnInit() {
    this.inventory.getMySummary().subscribe({
      next: s => {
        this.summary = s;
        this.loading = false;
      },
      error: e => {
        this.err = e.error?.message || 'Could not load';
        this.loading = false;
      }
    });
  }
}
