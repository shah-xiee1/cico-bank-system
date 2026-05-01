import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './log-in.html',
  styleUrls: ['./log-in.css']
})
export class LogIn {

  private router = inject(Router);
  private dbService = inject(DatabaseService);

  email: string = '';
  password: string = '';

  showForgotModal: boolean = false;
  recoverySent: boolean = false;
  forgotEmail: string = '';

  login() {
    const userEmail = this.email.toLowerCase().trim();

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
    } else if (userEmail === 'client@cico.com' && this.password === 'client123') {
      localStorage.setItem('currentUser', 'excel_john');
      localStorage.setItem('currentUserName', 'Excel John');
      localStorage.setItem('currentUserRole', 'Client');
      this.router.navigate(['/client']);
    } else if (userEmail === 'client2@cico.com' && this.password === 'client2123') {
      localStorage.setItem('currentUser', 'jane_doe');
      localStorage.setItem('currentUserName', 'Jane Doe');
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
      // Determine role from email if possible, default to Client
      let assignedRole = 'Client';
      if (this.forgotEmail.includes('admin')) assignedRole = 'Admin';
      else if (this.forgotEmail.includes('staff')) assignedRole = 'Staff';

      // Push to Firestore
      await this.dbService.addPasswordRequest({
        user: this.forgotEmail.split('@')[0], // Extract a mock username from email
        email: this.forgotEmail,
        role: assignedRole,
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      this.recoverySent = true;
    }
  }
}