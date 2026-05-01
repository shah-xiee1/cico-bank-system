import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Observable, combineLatest, map } from 'rxjs';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports implements OnInit {
  private router = inject(Router);
  private dbService = inject(DatabaseService);

  passwordRequests$!: Observable<any[]>;
  notifications$!: Observable<any[]>;
  allTransactions$!: Observable<any[]>;
  systemHistory$!: Observable<any[]>;

  // Stats derived from transactions
  stats$!: Observable<{ total: number; pending: number; approved: number; rejected: number }>;

  // Filter
  activeFilter: 'All' | 'Client' | 'Staff' = 'All';
  filteredNotifications$!: Observable<any[]>;

  ngOnInit() {
    this.passwordRequests$ = this.dbService.getPasswordRequests();
    this.allTransactions$  = this.dbService.getTransactions();
    this.notifications$    = this.dbService.getNotifications();
    this.systemHistory$    = this.dbService.getSystemHistory();

    // Stats from transactions
    this.stats$ = this.allTransactions$.pipe(
      map(txs => ({
        total:    txs.length,
        pending:  txs.filter(t => t.status === 'Pending').length,
        approved: txs.filter(t => t.status === 'Approved').length,
        rejected: txs.filter(t => t.status === 'Rejected').length
      }))
    );

    this.applyFilter();
  }

  setFilter(f: 'All' | 'Client' | 'Staff') {
    this.activeFilter = f;
    this.applyFilter();
  }

  applyFilter() {
    this.filteredNotifications$ = this.notifications$.pipe(
      map(notifs => {
        const sorted = [...notifs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        if (this.activeFilter === 'All') return sorted;
        return sorted.filter(n => n.source === this.activeFilter);
      })
    );
  }

  async handleRequest(id: string, action: string) {
    if (action === 'Approve') {
      alert('Password reset link sent to user (Simulation). Request archived.');
    } else {
      alert('Password reset request rejected.');
    }
    await this.dbService.removePasswordRequest(id);
  }

  logout() {
    this.router.navigate(['/']);
  }

  getSourceBadgeClass(source: string): string {
    if (source === 'Client') return 'tag-client';
    if (source === 'Staff')  return 'tag-staff';
    return 'tag-system';
  }

  getStatusBadgeClass(status: string): string {
    if (status === 'Approved') return 'success';
    if (status === 'Rejected') return 'blocked';
    return 'pending';
  }
}
