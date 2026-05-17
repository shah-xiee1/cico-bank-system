import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Observable, map, combineLatest } from 'rxjs';

export interface TxData {
  id?: string;
  date: string; client: string; desc: string;
  type: string; typeClass: string;
  amount: string; amountClass: string;
  status: string; statusClass: string;
  processedBy: string;
  timestamp: number;
  image: string;
  senderName: string;
  recipientName: string;
  paymentSource?: string;
  recipientBank?: string;
  serviceFee?: number;
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
  
  userName: string = 'Staff';
  userImage: string = '/images/staff.jpg';

  stats = {
    approved: 0,
    refunded: 0,
    totalVolume: '₱ 0'
  };

  ngOnInit() {
    this.userName = localStorage.getItem('currentUserName') || 'Cindy Ma. Lala';
    this.userImage = '/images/staff.jpg';
    this.allTransactions$ = combineLatest([
      this.dbService.getTransactions(),
      this.dbService.getUsers()
    ]).pipe(
      map(([txs, users]: [any[], any[]]) => {
        const mapped = txs.map((tx: any) => {
          let dateStr = tx.time || 'Unknown Date';
          if (!tx.time && tx.timestamp) {
            const d = typeof tx.timestamp === 'number' ? new Date(tx.timestamp) : (tx.timestamp.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp));
            dateStr = d.toLocaleString();
          }

          const sender = users.find((u: any) => u.id === tx.senderId);
          const recipient = users.find((u: any) => u.id === tx.recipientId);

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
            timestamp: tx.timestamp || 0,
            image: sender ? sender.image : '/images/client.jpg',
            senderName: sender ? `${sender.name} (${sender.accountNumber || sender.phone})` : (tx.senderId || 'System'),
            recipientName: tx.category === 'Service Fee' ? 'CICO Bank (Fee)' : (recipient ? `${recipient.name} (${recipient.accountNumber || recipient.phone})` : (tx.title || 'N/A')),
            paymentSource: tx.paymentSource || '',
            recipientBank: tx.recipientBank || '',
            serviceFee: tx.serviceFee !== undefined ? tx.serviceFee : undefined
          };
        });

        // Update stats
        this.stats.approved = mapped.filter((t: any) => t.status === 'Approved').length;
        this.stats.refunded = mapped.filter((t: any) => t.status === 'Refunded').length;
        
        const total = mapped.reduce((acc: number, tx: any) => {
          const amt = parseFloat(tx.amount.replace(/[^0-9.]/g, '')) || 0;
          return acc + amt;
        }, 0);
        this.stats.totalVolume = '₱ ' + total.toLocaleString();

        return mapped.sort((a: any, b: any) => b.timestamp - a.timestamp);
      })
    );
  }

  getTypeClass(category: string) {
    if (category === 'Deposit' || category === 'Income' || category === 'Remittance') return 'tag-deposit';
    if (category === 'Transfer') return 'tag-transfer';
    if (category === 'Cash-Out') return 'tag-cashout';
    if (category === 'Service Fee') return 'tag-fee';
    return 'tag-payment';
  }

  getStatusClass(status: string) {
    if (status === 'Approved') return 'approved';
    if (status === 'Refunded' || status === 'Rejected') return 'rejected';
    return 'pending';
  }

  setFilter(status: string) { this.filterStatus = status; }

  openModal(tx: TxData) { this.selectedTx = tx; }
  closeModal() { this.selectedTx = null; }

  async refundTx(tx: TxData) {
    if (tx.id) {
      if (!confirm('Are you sure you want to refund this transaction?')) return;
      const wasSelected = this.selectedTx?.id === tx.id;
      if (wasSelected) this.closeModal();
      
      try {
        await this.dbService.refundTransaction(tx.id, this.userName);
        alert('Transaction refunded successfully.');
      } catch (err: any) {
        if (wasSelected) this.openModal(tx);
        alert('Error refunding transaction: ' + err.message);
      }
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
