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
  currentUserAccountNumber$!: Observable<string>;

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
          (tx.recipientId === this.currentUserId && (tx.status === 'Approved' || tx.status === 'Refunded'))
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
              displayTitle = sender.name;
            } else {
              displayTitle = 'Incoming Transfer';
            }
          } else if (tx.senderId === this.currentUserId && recipient) {
            displayTitle = recipient.name;
          }

          let displayType = tx.category || 'Transfer';
          if (tx.category === 'Transfer') {
            displayType = tx.recipientBank || 'CICO Bank';
          } else if (tx.category === 'Deposit') {
            if (tx.title) {
              const method = tx.title.split(' ')[0];
              if (['GCash', 'Maya', 'LandBank', 'UnionBank'].includes(method)) {
                displayType = method;
              }
            }
          }

          return { ...tx, time: dateStr, amount: displayAmount, title: displayTitle, displayType };
        }).sort((a: any, b: any) => {
          const getMs = (t: any) => typeof t === 'number' ? t : (t?.toMillis ? t.toMillis() : (t?.toDate ? t.toDate().getTime() : new Date(t || 0).getTime()));
          return getMs(b.timestamp) - getMs(a.timestamp);
        });
      })
    );
    this.currentUserAccountNumber$ = this.dbService.getUsers().pipe(
      map((users: any[]) => {
        const me = users.find((u: any) => u.id === this.currentUserId);
        return me?.accountNumber || 'CICO-XXXX-XXXX';
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
    if (status === 'Refunded' || status === 'Rejected') return 'rejected';
    return 'pending';
  }
}
