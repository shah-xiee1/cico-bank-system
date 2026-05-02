import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { Observable, firstValueFrom, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-client',
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './client.html',
  styleUrl: './client.css',
})
export class ClientComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);

  currentUserName = 'Client';
  currentUserId = 'excel_john';
  currentUserImage = '/images/client.jpg';
  currentDate: string = '';

  showSendModal = false;
  showDepositModal = false;
  showDetailModal = false;
  showOtpModal = false;
  selectedTx: any = null;

  otpInput: string = '';
  pendingTxDetails: any = null;

  recentActivity$!: Observable<any[]>;
  balance$!: Observable<number>;
  otherClients$!: Observable<any[]>;
  currentUserPhone$!: Observable<string>;
  fullPhone$!: Observable<string>;
  currentBalanceNumeric: number = 0;

  ngOnInit() {
    this.currentUserId = localStorage.getItem('currentUser') || 'excel_john';
    this.currentUserName = localStorage.getItem('currentUserName') || 'Excel John';
    this.currentUserImage = this.currentUserId === 'jane_doe' ? '/images/client2.jpg' : '/images/client.jpg';
    this.currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    this.dbService.initClientBalance(this.currentUserId);
    this.recentActivity$ = combineLatest([
      this.dbService.getTransactions(),
      this.dbService.getUsers()
    ]).pipe(
      map(([txs, users]: [any[], any[]]) => {
        const filtered = txs.filter((tx: any) => 
          tx.senderId === this.currentUserId || 
          (tx.recipientId === this.currentUserId && tx.status === 'Approved')
        );

        return filtered.map((tx: any) => {
          let displayAmount = tx.amount || '';
          let displayColor = tx.color || '';
          let displayTitle = tx.title || '';

          // Find sender/recipient details
          const sender = users.find((u: any) => u.id === tx.senderId);
          const recipient = users.find((u: any) => u.id === tx.recipientId);

          // If current user is the recipient, show as income and use sender info
          if (tx.recipientId === this.currentUserId) {
            if (displayAmount.includes('-')) {
              displayAmount = displayAmount.replace('-', '+');
              displayColor = 'bg-green';
            }
            if (sender) {
              displayTitle = `${sender.name} (${sender.phone})`;
            } else {
              displayTitle = 'Incoming Transfer';
            }
          } else if (tx.senderId === this.currentUserId && recipient) {
            // For sender, if it was a client-to-client transfer, show recipient name+phone
            displayTitle = `${recipient.name} (${recipient.phone})`;
          }

          return { ...tx, amount: displayAmount, color: displayColor, title: displayTitle };
        });
      }),
      map((txs: any[]) => txs.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)))
    );
    this.balance$ = this.dbService.getClientBalance(this.currentUserId).pipe(
      map((data: any) => {
        const bal = data?.balance ?? 25000;
        this.currentBalanceNumeric = bal;
        return bal;
      })
    );
    this.otherClients$ = this.dbService.getUsers().pipe(
      map((users: any[]) => users.filter((u: any) => u.role === 'Client' && u.id !== this.currentUserId))
    );
    this.currentUserPhone$ = this.dbService.getUsers().pipe(
      map((users: any[]) => {
        const me = users.find((u: any) => u.id === this.currentUserId);
        const phone = me?.phone || '0000';
        // Extract only digits and get last 4
        const digits = phone.replace(/\D/g, '');
        return '**** **** **** ' + digits.slice(-4);
      })
    );
    this.fullPhone$ = this.dbService.getUsers().pipe(
      map((users: any[]) => {
        const me = users.find((u: any) => u.id === this.currentUserId);
        return me?.phone || '0900 000 0000';
      })
    );
  }

  openModal(type: 'send' | 'deposit' | 'detail', tx?: any) {
    if (type === 'send') this.showSendModal = true;
    if (type === 'deposit') this.showDepositModal = true;
    if (type === 'detail') {
      this.selectedTx = tx;
      this.showDetailModal = true;
    }
    this.otpInput = '';
  }

  closeModals() {
    this.showSendModal = false;
    this.showDepositModal = false;
    this.showDetailModal = false;
    this.showOtpModal = false;
    this.selectedTx = null;
    this.pendingTxDetails = null;
    this.otpInput = '';
  }

  formatAmount(event: any) {
    let value = event.target.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
      event.target.value = new Intl.NumberFormat('en-US').format(parseFloat(value));
    }
  }

  async initiateTransaction(type: string, amount: string, primary: string, secondary: string = '') {
    if(!amount || !primary) {
      alert('Please fill out all required fields.');
      return;
    }

    const numericAmount = parseFloat(amount.replace(/,/g, '')) || 0;
    
    // Check for insufficient funds
    if (type === 'send' && numericAmount > this.currentBalanceNumeric) {
      alert(`Insufficient funds! Your current balance is ₱ ${this.currentBalanceNumeric.toLocaleString()}. You cannot send ₱ ${numericAmount.toLocaleString()}.`);
      return;
    }

    // Check for Global Transfer Limit
    const config = await firstValueFrom(this.dbService.getSystemConfig());
    const limit = parseFloat(config?.transferLimit?.toString().replace(/,/g, '')) || 500000;

    if (type === 'send' && numericAmount > limit) {
      alert(`Transaction Denied! The global transfer limit is ₱ ${limit.toLocaleString()}. Please reduce your amount.`);
      return;
    }

    // type='send': primary=phone, secondary=''
    // type='deposit': primary=method, secondary=phone
    this.pendingTxDetails = { type, amount, primary, secondary };
    
    // Hide all form modals and show OTP modal
    this.showSendModal = false;
    this.showDepositModal = false;
    this.showOtpModal = true;
    this.otpInput = '';
  }

  async verifyOtpAndProcess() {
    if (this.otpInput !== '123456') {
      alert('Invalid OTP. Please try again.');
      return;
    }

    if (!this.pendingTxDetails) return;

    const { type, amount, primary, secondary } = this.pendingTxDetails;

    // Optimistic Update: Close modal immediately
    this.closeModals();
    alert(`${type} transaction submitted and pending approval.`);
    this.router.navigate(['/client/transactions']);

    let targetRecipientId: string | null = null;
    let finalTitle = '';

    if (type === 'send') {
      const clients = await firstValueFrom(this.otherClients$);
      const target = clients.find(c => (c.phone || '').replace(/\s/g, '') === primary.replace(/\s/g, ''));
      if (target) {
        targetRecipientId = target.id;
        finalTitle = `${target.name} (${target.phone})`;
      } else {
        finalTitle = `${primary} (Transfer)`;
      }
    } else {
      finalTitle = `${primary} (${secondary})`;
    }

    let txData = {
      title: finalTitle,
      time: new Date().toLocaleString(),
      amount: type === 'deposit' ? `+ ₱ ${amount}` : `- ₱ ${amount}`,
      color: type === 'deposit' ? 'bg-green' : 'bg-red',
      icon: finalTitle.charAt(0).toUpperCase(),
      status: 'Pending',
      category: type === 'deposit' ? 'Deposit' : 'Transfer',
      reference: 'TXN-' + Math.floor(Math.random() * 1000000),
      senderId: this.currentUserId,
      recipientId: targetRecipientId,
      timestamp: new Date().getTime()
    };

    await this.dbService.addTransaction(txData);
  }
}
