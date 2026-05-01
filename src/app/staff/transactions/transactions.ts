import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Observable, map } from 'rxjs';

export interface TxData {
  id?: string;
  date: string; client: string; desc: string;
  type: string; typeClass: string;
  amount: string; amountClass: string;
  status: string; statusClass: string;
  processedBy: string;
  timestamp: number;
}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './transactions.html',
  styleUrl: './transactions.css',
})
export class Transactions implements OnInit {
  private dbService = inject(DatabaseService);

  selectedTx: TxData | null = null;
  filterStatus = 'All';
  searchQuery = '';

  allTransactions$: Observable<TxData[]> = new Observable();
  
  stats = {
    pending: 0,
    approved: 0,
    rejected: 0,
    totalVolume: '₱ 0'
  };

  ngOnInit() {
    this.allTransactions$ = this.dbService.getTransactions().pipe(
      map(txs => {
        const mapped = txs.map(tx => {
          let dateStr = tx.time || 'Unknown Date';
          if (!tx.time && tx.timestamp) {
            const d = typeof tx.timestamp === 'number' ? new Date(tx.timestamp) : (tx.timestamp.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp));
            dateStr = d.toLocaleString();
          }

          return {
            id: tx.id,
            date: dateStr,
            client: tx.title || 'Unknown Client',
            desc: tx.reference || 'Transaction',
            type: tx.category || 'Transfer',
            typeClass: this.getTypeClass(tx.category || ''),
            amount: tx.amount || '0',
            amountClass: String(tx.amount || '').includes('-') ? 'negative' : 'positive',
            status: tx.status || 'Pending',
            statusClass: this.getStatusClass(tx.status || 'Pending'),
            processedBy: tx.processedBy || '',
            timestamp: tx.timestamp || 0
          };
        });

        // Update stats
        this.stats.pending = mapped.filter(t => t.status === 'Pending').length;
        this.stats.approved = mapped.filter(t => t.status === 'Approved').length;
        this.stats.rejected = mapped.filter(t => t.status === 'Rejected').length;
        
        const total = mapped.reduce((acc, tx) => {
          const amt = parseFloat(tx.amount.replace(/[^0-9.]/g, '')) || 0;
          return acc + amt;
        }, 0);
        this.stats.totalVolume = '₱ ' + total.toLocaleString();

        return mapped.sort((a, b) => b.timestamp - a.timestamp);
      })
    );
  }

  getTypeClass(category: string) {
    if (category === 'Deposit' || category === 'Income' || category === 'Remittance') return 'tag-deposit';
    if (category === 'Transfer') return 'tag-transfer';
    if (category === 'Cash-Out') return 'tag-cashout';
    return 'tag-payment';
  }

  getStatusClass(status: string) {
    if (status === 'Approved') return 'success';
    if (status === 'Rejected') return 'blocked';
    return 'pending';
  }

  setFilter(status: string) { this.filterStatus = status; }

  openModal(tx: TxData) { this.selectedTx = tx; }
  closeModal() { this.selectedTx = null; }

  async approveTx(tx: TxData) {
    if (tx.id) {
      await this.dbService.updateTransactionStatus(tx.id, 'Approved', 'Cindy Ma. Lala');
      if (this.selectedTx?.id === tx.id) this.closeModal();
    }
  }

  async rejectTx(tx: TxData) {
    if (tx.id) {
      await this.dbService.updateTransactionStatus(tx.id, 'Rejected', 'Cindy Ma. Lala');
      if (this.selectedTx?.id === tx.id) this.closeModal();
    }
  }

  getFiltered(txs: TxData[]): TxData[] {
    return txs.filter(tx => {
      const matchStatus = this.filterStatus === 'All' || tx.status === this.filterStatus;
      const q = this.searchQuery.toLowerCase();
      const matchSearch = !q || 
        (tx.client || '').toLowerCase().includes(q) || 
        (tx.amount || '').includes(q) || 
        (tx.desc || '').toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }
}
