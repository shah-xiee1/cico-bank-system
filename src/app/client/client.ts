import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { Observable, firstValueFrom, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';

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
  showQrModal = false;
  selectedTx: any = null;
  qrCodeDataUrl: string = '';

  paymentSource = 'CICO Bank Balance';
  recipientBank = 'CICO Bank';
  serviceFee = 0.00;
  currentUserAccountNumber$!: Observable<string>;

  otpInput: string = '';
  pendingTxDetails: any = null;
  generatedOtp = '';
  currentUserEmail = 'client@cico.com';
  showMockEmailToast = false;
  mockEmailSubject = '';
  mockEmailBody = '';
  mockEmailTime = '';
  toastTimeoutId: any = null;

  recentActivity$!: Observable<any[]>;
  balance$!: Observable<number>;
  otherClients$!: Observable<any[]>;
  currentUserPhone$!: Observable<string>;
  fullPhone$!: Observable<string>;
  currentBalanceNumeric: number = 0;
  systemConfig: any = null;

  ngOnInit() {
    this.currentUserId = localStorage.getItem('currentUser') || 'excel_john';
    this.currentUserName = localStorage.getItem('currentUserName') || 'Excel John';
    this.currentUserImage = this.currentUserId === 'elliara_liv' ? '/images/client2.jpg' : '/images/client.jpg';
    this.currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    this.dbService.initClientBalance(this.currentUserId);
    this.recentActivity$ = combineLatest([
      this.dbService.getTransactions(),
      this.dbService.getUsers()
    ]).pipe(
      map(([txs, users]: [any[], any[]]) => {
        const filtered = txs.filter((tx: any) => 
          tx.senderId === this.currentUserId || 
          (tx.recipientId === this.currentUserId && (tx.status === 'Approved' || tx.status === 'Refunded'))
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
              displayTitle = sender.name;
            } else {
              displayTitle = 'Incoming Transfer';
            }
          } else if (tx.senderId === this.currentUserId && recipient) {
            // For sender, if it was a client-to-client transfer, show recipient name
            displayTitle = recipient.name;
          }

          return { ...tx, amount: displayAmount, color: displayColor, title: displayTitle };
        });
      }),
      map((txs: any[]) => txs.sort((a: any, b: any) => {
        const getMs = (t: any) => typeof t === 'number' ? t : (t?.toMillis ? t.toMillis() : (t?.toDate ? t.toDate().getTime() : new Date(t || 0).getTime()));
        return getMs(b.timestamp) - getMs(a.timestamp);
      }))
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
    this.currentUserAccountNumber$ = this.dbService.getUsers().pipe(
      map((users: any[]) => {
        const me = users.find((u: any) => u.id === this.currentUserId);
        return me?.accountNumber || 'CICO-XXXX-XXXX';
      })
    );
    this.dbService.getSystemConfig().subscribe(config => {
      this.systemConfig = config;
      this.updateServiceFee();
    });
    this.dbService.getClientBalance(this.currentUserId).subscribe((data: any) => {
      if (data) {
        this.currentUserEmail = data.email || (this.currentUserId === 'excel_john' ? 'client@cico.com' : 'client2@cico.com');
      }
    });
  }

  openModal(type: 'send' | 'deposit' | 'detail' | 'qr', tx?: any) {
    if (type === 'send') this.showSendModal = true;
    if (type === 'deposit') this.showDepositModal = true;
    if (type === 'qr') {
      this.showQrModal = true;
      this.generateQrCode();
    }
    if (type === 'detail') {
      this.selectedTx = tx;
      this.showDetailModal = true;
    }
    this.otpInput = '';
  }

  async generateQrCode() {
    try {
      const accNum = await firstValueFrom(this.currentUserAccountNumber$);
      const dataToEncode = `CICO:${accNum}`;
      this.qrCodeDataUrl = await QRCode.toDataURL(dataToEncode, {
        width: 200,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('Error generating QR code', err);
    }
  }

  updateServiceFee() {
    if (this.paymentSource === 'CICO Bank Balance' && this.recipientBank === 'CICO Bank') {
      this.serviceFee = 0;
    } else {
      this.serviceFee = parseFloat(this.systemConfig?.transferFee?.toString().replace(/,/g, '')) || 15.00;
    }
  }

  getRecipientLabel(): string {
    if (this.recipientBank === 'CICO Bank') return 'Recipient CICO Account Number';
    if (this.recipientBank === 'GCash' || this.recipientBank === 'Maya') return 'Recipient Phone Number';
    return 'Recipient Account Number';
  }

  getRecipientPlaceholder(): string {
    if (this.recipientBank === 'CICO Bank') return 'e.g. CICO-XXXX-XXXX';
    if (this.recipientBank === 'GCash' || this.recipientBank === 'Maya') return 'e.g. 09XX XXX XXXX';
    return 'e.g. 10 or 12 digit Account Number';
  }

  onRecipientInput(event: any) {
    if (this.recipientBank === 'CICO Bank') {
      let val = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val && !val.startsWith('CICO')) {
        if (/^\d/.test(val)) {
          val = 'CICO' + val;
        }
      }
      let digits = val.substring(4).replace(/[^0-9]/g, '');
      if (digits.length > 8) {
        digits = digits.substring(0, 8);
      }
      let formatted = 'CICO';
      if (digits.length > 0) {
        formatted += '-' + digits.substring(0, 4);
      }
      if (digits.length > 4) {
        formatted += '-' + digits.substring(4, 8);
      }
      event.target.value = formatted;
    }
  }

  closeModals() {
    this.showSendModal = false;
    this.showDepositModal = false;
    this.showDetailModal = false;
    this.showOtpModal = false;
    this.showQrModal = false;
    this.selectedTx = null;
    this.pendingTxDetails = null;
    this.otpInput = '';
    this.showMockEmailToast = false;
    this.paymentSource = 'CICO Bank Balance';
    this.recipientBank = 'CICO Bank';
    this.updateServiceFee();
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
      this.toastTimeoutId = null;
    }
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

    // Perform validation for CICO Bank account format and existence
    if (type === 'send' && this.recipientBank === 'CICO Bank') {
      const cicoFormatRegex = /^CICO-\d{4}-\d{4}$/;
      if (!cicoFormatRegex.test(primary)) {
        alert('Invalid account format! Please ensure the recipient account number follows the CICO-XXXX-XXXX format.');
        return;
      }

      const clients = await firstValueFrom(this.otherClients$);
      const target = clients.find(c => (c.accountNumber || '').replace(/\s/g, '') === primary.replace(/\s/g, ''));
      if (!target) {
        // Check if transferring to self
        const currentUserData = await firstValueFrom(this.dbService.getClientBalance(this.currentUserId));
        if (currentUserData && currentUserData.accountNumber === primary.replace(/\s/g, '')) {
          alert('Transaction Denied! You cannot transfer to your own CICO Bank account.');
          return;
        }
        alert(`Transaction Denied! The CICO Bank account number "${primary}" does not exist.`);
        return;
      }
    }
    
    // Check for insufficient funds only if sending from CICO Bank Balance
    if (type === 'send' && this.paymentSource === 'CICO Bank Balance') {
      const totalRequired = numericAmount + this.serviceFee;
      if (totalRequired > this.currentBalanceNumeric) {
        alert(`Insufficient funds! Your current balance is ₱ ${this.currentBalanceNumeric.toLocaleString()}. You need ₱ ${totalRequired.toLocaleString()} (including ₱ ${this.serviceFee} service fee) to complete this transfer.`);
        return;
      }
    }

    // Check for Global Transfer Limit
    const limit = parseFloat(this.systemConfig?.transferLimit?.toString().replace(/,/g, '')) || 500000;

    if (type === 'send' && numericAmount > limit) {
      alert(`Transaction Denied! The global transfer limit is ₱ ${limit.toLocaleString()}. Please reduce your amount.`);
      return;
    }

    // type='send': primary=phone/account, secondary=''
    this.pendingTxDetails = { 
      type, 
      amount, 
      primary, 
      secondary,
      paymentSource: this.paymentSource,
      recipientBank: this.recipientBank,
      serviceFee: this.serviceFee
    };
    
    // Hide all form modals and show OTP modal
    this.showSendModal = false;
    this.showDepositModal = false;
    this.showOtpModal = true;
    this.otpInput = '';

    // Generate random 6-digit OTP and trigger simulated email toast
    this.generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    this.triggerMockEmailToast();
  }

  async verifyOtpAndProcess() {
    if (this.otpInput !== this.generatedOtp) {
      alert('Invalid OTP. Please check your simulated email notification banner at the top-right.');
      return;
    }

    if (!this.pendingTxDetails) return;

    const { type, amount, primary, secondary, paymentSource, recipientBank, serviceFee } = this.pendingTxDetails;

    // Optimistic Update: Close modal immediately
    this.closeModals();
    alert(`${type} transaction submitted and processed.`);
    this.router.navigate(['/client/transactions']);

    let targetRecipientId: string | null = null;
    let finalTitle = '';

    if (type === 'send') {
      const allUsers = await firstValueFrom(this.dbService.getUsers());
      const clients = allUsers.filter((u: any) => u.role === 'Client');
      
      const normalizePhone = (p: string) => p ? p.replace(/\D/g, '') : '';
      const normalizeAcc = (a: string) => a ? a.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
      const cleanPrimary = primary.replace(/\s/g, '');

      const target = clients.find(c => {
        const accMatch = normalizeAcc(c.accountNumber) === normalizeAcc(cleanPrimary);
        const phoneMatch = normalizePhone(c.phone) === normalizePhone(cleanPrimary);
        return accMatch || phoneMatch;
      });

      if (target) {
        targetRecipientId = target.id;
        if (recipientBank === 'CICO Bank') {
          finalTitle = `${target.name} (${target.accountNumber})`;
        } else {
          finalTitle = `${target.name} (${recipientBank}: ${primary})`;
        }
      } else {
        if (recipientBank === 'CICO Bank') {
          finalTitle = `${primary} (CICO Bank)`;
        } else {
          finalTitle = `${recipientBank} (${primary})`;
        }
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
      timestamp: new Date().getTime(),
      paymentSource: paymentSource || 'CICO Bank Balance',
      recipientBank: recipientBank || 'CICO Bank',
      serviceFee: serviceFee !== undefined ? serviceFee : 0
    };

    const txRef = await this.dbService.addTransaction(txData);
    try {
      await this.dbService.updateTransactionStatus(txRef.id, 'Approved', 'System (Auto)');
    } catch (err: any) {
      await this.dbService.updateTransactionStatus(txRef.id, 'Rejected', 'System (Auto)');
      console.error('Auto-approval failed:', err);
      alert('Transaction failed to process automatically: ' + err.message);
    }
  }

  triggerMockEmailToast() {
    this.showMockEmailToast = false;
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }

    setTimeout(() => {
      this.showMockEmailToast = true;
      this.mockEmailSubject = 'CICO Security: One-Time Password';
      this.mockEmailBody = `Your CICO authorization code is: ${this.generatedOtp}. Do not share this code with anyone.`;
      this.mockEmailTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      this.toastTimeoutId = setTimeout(() => {
        this.showMockEmailToast = false;
      }, 12000);
    }, 1200);
  }

  resendOtp() {
    this.generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    this.otpInput = '';
    this.triggerMockEmailToast();
    alert('A new dynamic OTP has been simulated and sent to your email.');
  }

  maskEmail(email: string): string {
    if (!email) return '';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) {
      return name + '***@' + domain;
    }
    return name.substring(0, 2) + '***@' + domain;
  }

  copyOtpToClipboard() {
    if (this.generatedOtp) {
      navigator.clipboard.writeText(this.generatedOtp).then(() => {
        alert('OTP code ' + this.generatedOtp + ' copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy text: ', err);
      });
    }
  }
}
