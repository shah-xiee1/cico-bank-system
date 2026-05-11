import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DatabaseService } from '../../../services/database.service';
import { Observable, map } from 'rxjs';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboardComponent implements OnInit {

  private router = inject(Router);
  private dbService = inject(DatabaseService);
  
  currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });


  systemAnalytics$: Observable<any> = new Observable();
  systemStats$: Observable<any> = new Observable();
  users$: Observable<any[]> = new Observable();
  
  userName: string = 'Admin';
  userImage: string = '/images/admin.jpg';

  ngOnInit() {
    this.userName = localStorage.getItem('currentUserName') || 'Hawk M. Beat';
    this.userImage = '/images/admin.jpg';
    this.dbService.initSystemConfig();
    this.users$ = this.dbService.getUsers().pipe(
      map(users => users.filter(user => user.name !== 'Jane Doe'))
    );
    
    this.systemStats$ = this.dbService.getSystemStats();

    this.systemAnalytics$ = this.dbService.getTransactions().pipe(
      map(txs => {
        const total = txs.length;
        if (total === 0) return { completion: 0, health: 100, success: 0, pending: 0, processed: 0, total: 0 };
        
        const pending = txs.filter(t => t.status === 'Pending').length;
        const approved = txs.filter(t => t.status === 'Approved').length;
        const rejected = txs.filter(t => t.status === 'Rejected').length;
        const processed = approved + rejected;

        return {
          completion: Math.round((processed / total) * 100),
          health: Math.round(((total - pending) / total) * 100),
          success: Math.round((approved / (processed || 1)) * 100),
          pending,
          processed,
          total
        };
      })
    );
  }

  logout() {
    this.router.navigate(['/']);
  }

  async resetData() {
    if (confirm('WARNING: This will permanently delete all transactions, history, and notifications, and reset balances to default. Are you sure you want to proceed?')) {
      await this.dbService.resetSystemData();
      alert('System data has been successfully reset.');
    }
  }
}
