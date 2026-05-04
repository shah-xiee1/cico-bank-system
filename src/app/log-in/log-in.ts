import { Component, inject, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './log-in.html',
  styleUrls: ['./log-in.css']
})
export class LogIn implements AfterViewInit {

  @ViewChild('bgVideo') bgVideo!: ElementRef<HTMLVideoElement>;

  private router = inject(Router);
  private dbService = inject(DatabaseService);

  email: string = '';
  password: string = '';

  showForgotModal: boolean = false;
  recoverySent: boolean = false;
  forgotEmail: string = '';

  ngAfterViewInit() {
    if (this.bgVideo && this.bgVideo.nativeElement) {
      this.bgVideo.nativeElement.muted = true;
      this.bgVideo.nativeElement.play().catch(error => {
        console.error("Autoplay failed:", error);
      });
    }
  }

  async login() {
    const userEmail = this.email.toLowerCase().trim();

    // Check Maintenance Mode
    const config = await firstValueFrom(this.dbService.getSystemConfig());
    const isMaintenance = config?.maintenance || false;

    if (userEmail === 'admin@cico.com' && this.password === 'admin123') {
      localStorage.setItem('currentUser', 'admin_1');
      localStorage.setItem('currentUserName', 'Hawk M. Beat');
      localStorage.setItem('currentUserRole', 'Admin');
      this.router.navigate(['/admin']);
    } else if (userEmail === 'staff@cico.com' && this.password === 'staff123') {
      localStorage.setItem('currentUser', 'staff_1');
      localStorage.setItem('currentUserName', 'Cindy Ma. Lala');
      localStorage.setItem('currentUserRole', 'Staff');
      this.router.navigate(['/staff']);
    } else if (userEmail.includes('client') && isMaintenance) {
      alert('SYSTEM UNDER MAINTENANCE: The platform is currently being upgraded. Client access is temporarily suspended. Please try again later.');
      return;
    } else if (userEmail === 'client@cico.com' && this.password === 'client123') {
      localStorage.setItem('currentUser', 'excel_john');
      localStorage.setItem('currentUserName', 'Excel John');
      localStorage.setItem('currentUserRole', 'Client');
      this.router.navigate(['/client']);
    } else if (userEmail === 'client2@cico.com' && this.password === 'client2123') {
      localStorage.setItem('currentUser', 'elliara_liv');
      localStorage.setItem('currentUserName', 'Elliara Liv');
      localStorage.setItem('currentUserRole', 'Client');
      this.router.navigate(['/client']);
    }
 else {
      alert('Invalid email or password');
    }
  }

  toggleForgotModal(show: boolean) {
    this.showForgotModal = show;
    this.recoverySent = false;
    this.forgotEmail = '';
  }

  async sendRecovery() {
    if (this.forgotEmail) {
      const email = this.forgotEmail;
      // Determine role from email if possible, default to Client
      let assignedRole = 'Client';
      if (email.includes('admin')) assignedRole = 'Admin';
      else if (email.includes('staff')) assignedRole = 'Staff';

      // Optimistic update: show success state immediately
      this.recoverySent = true;

      try {
        // Push to Firestore in background
        await this.dbService.addPasswordRequest({
          user: email.split('@')[0], // Extract a mock username from email
          email: email,
          role: assignedRole,
          date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      } catch (err) {
        console.error("Recovery request failed:", err);
        // If it really fails, we could revert, but for a "forgot password" a success state is better UX
      }
    }
  }
}