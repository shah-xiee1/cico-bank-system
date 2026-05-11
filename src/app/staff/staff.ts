import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { Observable, map, combineLatest } from 'rxjs';

@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './staff.html',
  styleUrl: './staff.css',
})
export class StaffComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);

  currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  userName: string = 'Staff';
  userImage: string = '/images/staff.jpg';
  fullPhone$!: Observable<string>;
  
  pendingTransactions$: Observable<any[]> = new Observable();
  selectedTx: any = null;
  
  stats = {
    pending: 0,
    processed: 0,
    totalVolume: '₱ 0'
  };

  ngOnInit() {
    this.userName = localStorage.getItem('currentUserName') || 'Cindy Ma. Lala';
    this.userImage = '/images/staff.jpg';
    this.pendingTransactions$ = combineLatest([
      this.dbService.getTransactions(),
      this.dbService.getUsers()
    ]).pipe(
      map(([txs, users]: [any[], any[]]) => {
        const pending = txs.filter((tx: any) => tx.status === 'Pending').sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
        this.stats.pending = pending.length;
        this.stats.processed = txs.filter((tx: any) => tx.status !== 'Pending').length;
        
        const total = txs.reduce((acc: number, tx: any) => {
          const amt = parseFloat((tx.amount || '').replace(/[^0-9.]/g, '')) || 0;
          return acc + amt;
        }, 0);
        this.stats.totalVolume = '₱ ' + total.toLocaleString();
        
        const enriched = pending.map((tx: any) => {
          const sender = users.find((u: any) => u.id === tx.senderId);
          const recipient = users.find((u: any) => u.id === tx.recipientId);
          
          return {
            ...tx,
            senderName: sender ? sender.name : (tx.senderId || 'System'),
            recipientName: recipient ? recipient.name : (tx.title || 'N/A'),
            image: sender ? sender.image : '/images/client.jpg'
          };
        });

        if (!this.selectedTx && enriched.length > 0) {
          this.selectedTx = enriched[0];
        } else if (this.selectedTx) {
          const updated = enriched.find((t: any) => t.id === this.selectedTx.id);
          if (updated) this.selectedTx = updated;
          else this.selectedTx = enriched.length > 0 ? enriched[0] : null;
        }
        
        return enriched;
      })
    );
    this.fullPhone$ = this.dbService.getUsers().pipe(
      map((users: any[]) => {
        const me = users.find((u: any) => u.name === this.userName);
        return me?.phone || '0900 000 0000';
      })
    );
  }

  selectTx(tx: any) {
    this.selectedTx = tx;
  }

  async approveTx() {
    if (this.selectedTx?.id) {
      const txId = this.selectedTx.id;
      const prevTx = this.selectedTx;
      // Optimistic update: clear selection immediately
      this.selectedTx = null;
      try {
        await this.dbService.updateTransactionStatus(txId, 'Approved', this.userName);
      } catch (err: any) {
        this.selectedTx = prevTx;
        alert('Error approving transaction: ' + err.message);
      }
    }
  }

  async rejectTx() {
    if (this.selectedTx?.id) {
      const txId = this.selectedTx.id;
      const prevTx = this.selectedTx;
      this.selectedTx = null;
      try {
        await this.dbService.updateTransactionStatus(txId, 'Rejected', this.userName);
      } catch (err: any) {
        this.selectedTx = prevTx;
        alert('Error rejecting transaction: ' + err.message);
      }
    }
  }
}
