import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { Observable } from 'rxjs';
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

  ngOnInit() {
    this.currentUserId = localStorage.getItem('currentUser') || 'excel_john';
    this.currentUserName = localStorage.getItem('currentUserName') || 'Excel John';
    this.currentUserImage = this.currentUserId === 'jane_doe' ? '/images/client2.jpg' : '/images/client.jpg';
    this.currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    this.dbService.initClientBalance(this.currentUserId);
    this.recentActivity$ = this.dbService.getTransactions().pipe(
      map(txs => txs.filter(tx => tx.senderId === this.currentUserId || tx.recipientId === this.currentUserId || (!tx.senderId && !tx.recipientId))),
      map(txs => txs.map(tx => {
        let displayAmount = tx.amount || '';
        let displayColor = tx.color || '';
        let displayTitle = tx.title || '';
        // If current user is the recipient, show as income
        if (tx.recipientId === this.currentUserId) {
            if (displayAmount.includes('-')) {
                displayAmount = displayAmount.replace('-', '+');
                displayColor = 'bg-green';
            }
            if (tx.senderId === 'excel_john') displayTitle = 'Excel John (client@cico.com)';
            else if (tx.senderId === 'jane_doe') displayTitle = 'Jane Doe (client2@cico.com)';
            else displayTitle = 'Incoming Transfer';
        }
        return { ...tx, amount: displayAmount, color: displayColor, title: displayTitle };
      })),
      map(txs => txs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)))
    );
    this.balance$ = this.dbService.getClientBalance(this.currentUserId).pipe(
      map((data: any) => data?.balance ?? 25000)
    );
    this.otherClients$ = this.dbService.getUsers().pipe(
      map(users => users.filter(u => u.role === 'Client' && u.id !== this.currentUserId))
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

  initiateTransaction(type: string, amount: string, recipientIdOrMethod: string, recipientName: string = '') {
    if(!amount || !recipientIdOrMethod) {
      alert('Please fill out all required fields.');
      return;
    }

    this.pendingTxDetails = { type, amount, recipientIdOrMethod, recipientName };
    
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

    const { type, amount, recipientIdOrMethod, recipientName } = this.pendingTxDetails;

    // For Send, recipientName is the actual name string we can pass, or we just look it up.
    // We will just use 'Transfer' or 'Deposit' for the title.
    const titleText = type === 'deposit' ? recipientIdOrMethod : (recipientName || 'Client Transfer');

    let txData = {
      title: titleText,
      time: new Date().toLocaleString(),
      amount: type === 'deposit' ? `+ ₱ ${amount}` : `- ₱ ${amount}`,
      color: type === 'deposit' ? 'bg-green' : 'bg-red',
      icon: titleText.charAt(0).toUpperCase(),
      status: 'Pending',
      category: type === 'deposit' ? 'Deposit' : 'Transfer',
      reference: 'TXN-' + Math.floor(Math.random() * 1000000),
      senderId: this.currentUserId,
      recipientId: type === 'send' ? recipientIdOrMethod : null
    };

    await this.dbService.addTransaction(txData);
    this.closeModals();
    alert(`${type} transaction submitted and pending approval.`);
    // Navigate to transaction history instead of staff
    this.router.navigate(['/client/transactions']);
  }
}
