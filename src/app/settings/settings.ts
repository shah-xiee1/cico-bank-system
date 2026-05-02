import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  private router = inject(Router);
  private dbService = inject(DatabaseService);

  isSaving = false;
  userName: string = 'Hawk M. Beat';
  userImage: string = '/images/admin.jpg';
  config$!: Observable<any>;

  ngOnInit() {
    this.userName = localStorage.getItem('currentUserName') || 'Hawk M. Beat';
    this.config$ = this.dbService.getSystemConfig();
  }

  formatAmount(event: any) {
    let value = event.target.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
      event.target.value = new Intl.NumberFormat('en-US').format(parseFloat(value));
    }
  }

  async saveSettings(newData: any) {
    this.isSaving = true;
    await this.dbService.updateSystemConfig(newData);
    // Visual delay for premium feel
    await new Promise(resolve => setTimeout(resolve, 800));
    this.isSaving = false;
    alert('System settings updated successfully.');
  }

  logout() {
    this.router.navigate(['/']);
  }
}
