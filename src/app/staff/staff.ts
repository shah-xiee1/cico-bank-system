import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { Observable, map } from 'rxjs';

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
  
  pendingTransactions$: Observable<any[]> = new Observable();
  selectedTx: any = null;
  
  stats = {
    pending: 0,
    processed: 0,
    totalVolume: '₱ 0'
  };

  ngOnInit() {
    this.pendingTransactions$ = this.dbService.getTransactions().pipe(
      map(txs => {
        const pending = txs.filter(tx => tx.status === 'Pending');
        this.stats.pending = pending.length;
        this.stats.processed = txs.filter(tx => tx.status !== 'Pending').length;
        
        const total = txs.reduce((acc, tx) => {
          const amt = parseFloat((tx.amount || '').replace(/[^0-9.]/g, '')) || 0;
          return acc + amt;
        }, 0);
        this.stats.totalVolume = '₱ ' + total.toLocaleString();
        
        if (!this.selectedTx && pending.length > 0) {
          this.selectedTx = pending[0];
        } else if (this.selectedTx) {
          // Keep current selection if it still exists in the list
          const updated = pending.find(t => t.id === this.selectedTx.id);
          if (updated) this.selectedTx = updated;
          else this.selectedTx = pending.length > 0 ? pending[0] : null;
        }
        
        return pending;
      })
    );
  }

  selectTx(tx: any) {
    this.selectedTx = tx;
  }

  async approveTx() {
    if (this.selectedTx?.id) {
      await this.dbService.updateTransactionStatus(this.selectedTx.id, 'Approved', 'Cindy Ma. Lala');
      // Selection will be updated by the observable
    }
  }

  async rejectTx() {
    if (this.selectedTx?.id) {
      await this.dbService.updateTransactionStatus(this.selectedTx.id, 'Rejected', 'Cindy Ma. Lala');
    }
  }
}
