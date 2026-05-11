import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Observable, map, combineLatest } from 'rxjs';

@Component({
  selector: 'app-client-transactions',
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './transactions.html',
  styleUrl: './transactions.css'
})
export class ClientTransactionsComponent implements OnInit {
  private dbService = inject(DatabaseService);

  searchQuery = '';
  filterType = 'All';
  
  transactions$!: Observable<any[]>;
  currentUserId: string = 'excel_john';
  currentUserName: string = 'Excel John';
  currentUserImage: string = '/images/client.jpg';
  fullPhone$!: Observable<string>;

  ngOnInit() {
    this.currentUserId = localStorage.getItem('currentUser') || 'excel_john';
    this.currentUserName = localStorage.getItem('currentUserName') || 'Excel John';
    this.currentUserImage = this.currentUserId === 'elliara_liv' ? '/images/client2.jpg' : '/images/client.jpg';

    this.transactions$ = combineLatest([
      this.dbService.getTransactions(),
      this.dbService.getUsers()
    ]).pipe(
      map(([txs, users]: [any[], any[]]) => {
        // Filter for current user
        const userTxs = txs.filter((tx: any) => 
          tx.senderId === this.currentUserId || 
          (tx.recipientId === this.currentUserId && tx.status === 'Approved')
        );

        return userTxs.map((tx: any) => {
          let dateStr = tx.time || 'Unknown Date';
          if (!tx.time && tx.timestamp) {
            const d = typeof tx.timestamp === 'number' ? new Date(tx.timestamp) : (tx.timestamp.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp));
            dateStr = d.toLocaleString();
          }
          
          let displayAmount = tx.amount || '';
          let displayTitle = tx.title || '';
          
          // Find sender/recipient details
          const sender = users.find((u: any) => u.id === tx.senderId);
          const recipient = users.find((u: any) => u.id === tx.recipientId);

          if (tx.recipientId === this.currentUserId) {
            if (displayAmount.includes('-')) {
              displayAmount = displayAmount.replace('-', '+');
            }
            if (sender) {
              displayTitle = `${sender.name} (${sender.phone})`;
            } else {
              displayTitle = 'Incoming Transfer';
            }
          } else if (tx.senderId === this.currentUserId && recipient) {
            displayTitle = `${recipient.name} (${recipient.phone})`;
          }

          return { ...tx, time: dateStr, amount: displayAmount, title: displayTitle };
        }).sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      })
    );
    this.fullPhone$ = this.dbService.getUsers().pipe(
      map((users: any[]) => {
        const me = users.find((u: any) => u.id === this.currentUserId);
        return me?.phone || '0900 000 0000';
      })
    );
  }

  getFiltered(txs: any[]): any[] {
    return txs.filter((tx: any) => {
      const q = this.searchQuery.toLowerCase();
      const matchSearch = !q || 
        (tx.title || '').toLowerCase().includes(q) || 
        (tx.reference || '').toLowerCase().includes(q) ||
        (tx.category || '').toLowerCase().includes(q);
      
      const matchType = this.filterType === 'All' || 
        (this.filterType === 'Income' && (tx.amount || '').includes('+')) ||
        (this.filterType === 'Expenses' && (tx.amount || '').includes('-'));

      return matchSearch && matchType;
    });
  }

  setFilter(type: string) {
    this.filterType = type;
  }

  getStatusClass(status: string) {
    if (status === 'Approved') return 'success';
    if (status === 'Rejected') return 'rejected';
    return 'pending';
  }
}
