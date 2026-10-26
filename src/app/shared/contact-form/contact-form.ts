import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ContentService } from '../../core/content.service';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Replacement for the Contact Form 7 form. Submissions are POSTed as JSON to the
 * endpoint configured at build time (CONTACT_FORM_ENDPOINT), e.g. Formspree,
 * a Google Apps Script web app or a Cloud Function that forwards the e-mail.
 */
@Component({
  selector: 'app-contact-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contact-form.html',
  styleUrl: './contact-form.scss',
})
export class ContactForm {
  private readonly content = inject(ContentService);

  protected readonly endpoint = computed(() => this.content.site()?.contactFormEndpoint ?? '');
  protected readonly state = signal<SendState>('idle');
  protected readonly submitted = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    phone: ['', [Validators.maxLength(40), Validators.pattern(/^[\d\s+()-]*$/)]],
    subject: ['', [Validators.required, Validators.maxLength(200)]],
    message: ['', [Validators.maxLength(5000)]],
    // Honeypot: real users never see or fill this field
    website: [''],
  });

  protected invalid(control: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || this.submitted());
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid || this.state() === 'sending') {
      this.form.markAllAsTouched();
      return;
    }
    const { website, ...fields } = this.form.getRawValue();
    if (website) {
      this.state.set('sent');
      return;
    }

    this.state.set('sending');
    try {
      const response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...fields, _subject: `פרלמנט נשים: ${fields.subject}` }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.state.set('sent');
      this.form.reset();
      this.submitted.set(false);
    } catch {
      this.state.set('error');
    }
  }
}
