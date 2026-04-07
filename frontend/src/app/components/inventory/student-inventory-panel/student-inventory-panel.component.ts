import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { InventoryService } from '../../../services/inventory.service';

@Component({
  selector: 'app-student-inventory-panel',
  templateUrl: './student-inventory-panel.component.html',
  styleUrls: ['./student-inventory-panel.component.css']
})
export class StudentInventoryPanelComponent implements OnChanges {
  @Input() studentId = '';
  summary: any = null;
  loading = false;

  constructor(private inventory: InventoryService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['studentId']?.currentValue) {
      this.load();
    }
  }

  load() {
    if (!this.studentId) return;
    this.loading = true;
    this.inventory.getStudentSummary(this.studentId).subscribe({
      next: s => {
        this.summary = s;
        this.loading = false;
      },
      error: () => (this.loading = false)
    });
  }
}
