import {
  Directive,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { SuccessConfirmService } from '../services/success-confirm.service';

/**
 * When bound to a success message string, opens the system-wide
 * success confirmation dialog (green check + "Success!" + Ok) and
 * clears the local message after the dialog is closed so no duplicate appears.
 *
 * Usage:
 *   <span *ngIf="success" [smsSuccessConfirm]="success" (smsSuccessConfirmClear)="success = ''"></span>
 */
@Directive({
  standalone: false,
  selector: '[smsSuccessConfirm]',
  host: {
    // Hide local toast/alert chrome — the global dialog is the confirmation UI
    '[style.display]': '"none"',
    '[attr.aria-hidden]': '"true"',
  },
})
export class SmsSuccessConfirmDirective implements OnChanges {
  @Input('smsSuccessConfirm') message: string | null | undefined;
  @Input() smsSuccessTitle = 'Success!';
  @Output() smsSuccessConfirmClear = new EventEmitter<void>();

  private opening = false;
  private currentMessage = '';

  constructor(private successConfirm: SuccessConfirmService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['message'] && !changes['smsSuccessTitle']) return;
    const msg = String(this.message || '').trim();
    if (!msg || this.opening) return;

    // Prevent duplicate dialogs for the same message
    if (msg === this.currentMessage) return;
    this.currentMessage = msg;

    this.opening = true;
    const title = (this.smsSuccessTitle || 'Success!').trim() || 'Success!';

    this.successConfirm
      .show({ title, message: msg })
      .then(() => {
        // Only clear the message after the dialog is closed (user clicks Ok)
        this.smsSuccessConfirmClear.emit();
        this.currentMessage = '';
      })
      .finally(() => {
        this.opening = false;
      });
  }
}
