import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Observable, map } from 'rxjs';

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
  
  allTransactions: any[] = [];
  filteredTransactions: any[] = [];

  currentUserId = 'excel_john';
  currentUserName = 'Excel John';

  ngOnInit() {
    this.currentUserId = localStorage.getItem('currentUser') || 'excel_john';
    this.currentUserName = localStorage.getItem('currentUserName') || 'Excel John';

    this.dbService.getTransactions().subscribe(txs => {
      // Filter transactions for current user
      const userTxs = txs.filter(tx => tx.senderId === this.currentUserId || tx.recipientId === this.currentUserId || (!tx.senderId && !tx.recipientId));
      
      this.allTransactions = userTxs.map(tx => {
        let dateStr = tx.time || 'Unknown Date';
        if (!tx.time && tx.timestamp) {
          const d = typeof tx.timestamp === 'number' ? new Date(tx.timestamp) : (tx.timestamp.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp));
          dateStr = d.toLocaleString();
        }
        
        let displayAmount = tx.amount || '';
        let displayTitle = tx.title || '';
        // If current user is the recipient, show as income and swap title
        if (tx.recipientId === this.currentUserId) {
            if (displayAmount.includes('-')) {
                displayAmount = displayAmount.replace('-', '+');
            }
            if (tx.senderId === 'excel_john') displayTitle = 'Excel John (client@cico.com)';
            else if (tx.senderId === 'jane_doe') displayTitle = 'Jane Doe (client2@cico.com)';
            else displayTitle = 'Incoming Transfer';
        }

        return { ...tx, time: dateStr, amount: displayAmount, title: displayTitle };
      });
      this.applyFilters();
    });
  }

  setFilter(type: string) {
    this.filterType = type;
    this.applyFilters();
  }

  applyFilters() {
    this.filteredTransactions = this.allTransactions
      .filter(tx => {
        const q = this.searchQuery.toLowerCase();
        const matchSearch = !q || 
          (tx.title || '').toLowerCase().includes(q) || 
          (tx.reference || '').toLowerCase().includes(q) ||
          (tx.category || '').toLowerCase().includes(q);
        
        const matchType = this.filterType === 'All' || 
          (this.filterType === 'Income' && (tx.amount || '').includes('+')) ||
          (this.filterType === 'Expenses' && (tx.amount || '').includes('-'));

        return matchSearch && matchType;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  getStatusClass(status: string) {
    if (status === 'Approved') return 'success';
    if (status === 'Rejected') return 'blocked';
    return 'pending';
  }
}
