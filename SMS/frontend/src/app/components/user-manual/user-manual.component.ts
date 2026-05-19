import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-user-manual',
  templateUrl: './user-manual.component.html',
  styleUrls: ['./user-manual.component.css']
})
export class UserManualComponent implements OnInit {
  manualContent: string = '';
  loading: boolean = true;
  error: string = '';

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadManual();
  }

  loadManual(): void {
    this.loading = true;
    // Try to load from assets first, then fallback to root
    this.http.get('assets/USER_MANUAL.md', { responseType: 'text' }).subscribe({
      next: (content) => {
        this.manualContent = this.convertMarkdownToHtml(content);
        this.loading = false;
      },
      error: () => {
        // If not in assets, try to load from root
        this.http.get('/USER_MANUAL.md', { responseType: 'text' }).subscribe({
          next: (content) => {
            this.manualContent = this.convertMarkdownToHtml(content);
            this.loading = false;
          },
          error: () => {
            // Fallback to embedded content
            this.loadEmbeddedManual();
            this.loading = false;
          }
        });
      }
    });
  }

  loadEmbeddedManual(): void {
    // Embedded manual content as fallback
    this.manualContent = `
      <div class="manual-header">
        <h1>School Management System - User Manual</h1>
        <p><strong>Version:</strong> 1.0 | <strong>Last Updated:</strong> January 2026</p>
      </div>
      <div class="manual-content">
        <p class="info-message">
          📖 The complete user manual is available. Please contact your administrator to access the full documentation.
        </p>
        <p>For detailed instructions on using the School Management System, please refer to the USER_MANUAL.md file in the project root directory.</p>
      </div>
    `;
  }

  convertMarkdownToHtml(markdown: string): string {
    let html = markdown;
    
    // Convert headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Convert bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Convert code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // Convert lists
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>');
    
    // Wrap consecutive list items
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Convert blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    
    // Convert horizontal rules
    html = html.replace(/^---$/gim, '<hr>');
    
    // Convert line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    
    // Wrap in paragraphs
    html = '<p>' + html + '</p>';
    
    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    
    return html;
  }

  getSafeHtml(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.manualContent);
  }

  scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
