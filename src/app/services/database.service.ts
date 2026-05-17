import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, setDoc, query, orderBy, runTransaction, writeBatch } from '@angular/fire/firestore';
import { Observable, from, combineLatest, map } from 'rxjs';
import { docData } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  private firestore: Firestore = inject(Firestore);

  constructor() {
    this.cleanupGhostData();
  }

  async cleanupGhostData() {
    try {
      const txSnap = await getDocs(collection(this.firestore, 'transactions'));
      txSnap.docs.forEach(d => {
        const data = d.data();
        const str = JSON.stringify(data).toLowerCase();
        if (str.includes('jane doe') || str.includes('jane_doe') || d.id === 'jane_doe') {
          deleteDoc(d.ref);
        } else if (data['amount'] === '+ ₱ 1,000' && data['title'] === 'GCash (09171234567)' && data['category'] === 'Deposit') {
          deleteDoc(d.ref);
        }
      });
      const notifSnap = await getDocs(collection(this.firestore, 'notifications'));
      notifSnap.docs.forEach(d => {
        const str = JSON.stringify(d.data()).toLowerCase();
        if (str.includes('jane doe') || str.includes('jane_doe') || d.id === 'jane_doe') deleteDoc(d.ref);
      });
      const msgSnap = await getDocs(collection(this.firestore, 'messages'));
      msgSnap.docs.forEach(d => {
        const str = JSON.stringify(d.data()).toLowerCase();
        if (str.includes('jane doe') || str.includes('jane_doe') || d.id === 'jane_doe' || str.includes('cindy ma. lala')) deleteDoc(d.ref);
      });
      const clientsSnap = await getDocs(collection(this.firestore, 'clients'));
      clientsSnap.docs.forEach(d => {
        const str = JSON.stringify(d.data()).toLowerCase();
        if (str.includes('jane doe') || str.includes('jane_doe') || d.id === 'jane_doe') deleteDoc(d.ref);
      });
    } catch (e) {
      console.error('Error cleaning up ghost data:', e);
    }
  }

  // --- TRANSACTIONS ---
  getTransactions(): Observable<any[]> {
    const txCollection = collection(this.firestore, 'transactions');
    return collectionData(txCollection, { idField: 'id' });
  }

  async addTransaction(txData: any) {
    const batch = writeBatch(this.firestore);
    const txCollection = collection(this.firestore, 'transactions');
    const newTxDocRef = doc(txCollection); // Pre-generate doc reference
    const timestamp = new Date().getTime();

    // 1. Write the Transaction
    batch.set(newTxDocRef, {
      ...txData,
      timestamp: timestamp
    });

    // 2. Write the Notification (Atomic Audit Trail)
    const notifCollection = collection(this.firestore, 'notifications');
    const newNotifDocRef = doc(notifCollection);
    batch.set(newNotifDocRef, {
      source: 'Client',
      type: txData.category || 'Transaction',
      description: `${txData.title} submitted a ${txData.category || 'Transaction'} of ${txData.amount}`,
      reference: txData.reference || newTxDocRef.id,
      status: 'Pending',
      timestamp: timestamp,
      date: new Date().toLocaleString()
    });

    await batch.commit();
    return newTxDocRef;
  }

  async updateTransactionStatus(id: string, newStatus: string, processedBy: string = '') {
    // --- 1. ALL READS ---
    const txDocRef = doc(this.firestore, `transactions/${id}`);
    const txSnap = await getDoc(txDocRef);
    if (!txSnap.exists()) throw new Error("Transaction does not exist!");

    const txData = txSnap.data();
    const currentStatus = txData['status'];

    if (currentStatus !== 'Pending' && newStatus !== currentStatus) {
      throw new Error(`Transaction already ${currentStatus}`);
    }

    let configSnap: any = null;
    let senderSnap: any = null;
    let recipientSnap: any = null;

    const isDeposit = txData['category'] === 'Deposit';
    const isTransfer = txData['category'] === 'Transfer';
    const senderId = txData['senderId'];
    const recipientId = txData['recipientId'];

    if (newStatus === 'Approved') {
      const configDocRef = doc(this.firestore, 'system/config');
      configSnap = await getDoc(configDocRef);

      if (senderId) {
        const senderDocRef = doc(this.firestore, `clients/${senderId}`);
        senderSnap = await getDoc(senderDocRef);
      }

      if (recipientId && isTransfer) {
        const recipientDocRef = doc(this.firestore, `clients/${recipientId}`);
        recipientSnap = await getDoc(recipientDocRef);
      }
    }

    // --- 2. BUSINESS LOGIC & CONSTRAINTS ---
    const currentTime = new Date().getTime();
    const currentDateString = new Date().toLocaleString();
    
    const updateData: any = { 
      status: newStatus,
      processedAt: currentTime,
      processedTime: currentDateString
    };
    if (processedBy) updateData.processedBy = processedBy;

    const notifData = {
      source: 'Staff',
      type: 'Transaction Review',
      description: `${processedBy || 'Staff'} ${newStatus} transaction ID: ${id}`,
      reference: id,
      status: newStatus,
      timestamp: currentTime,
      date: currentDateString
    };

    let senderNewBalance: number | null = null;
    let recipientNewBalance: number | null = null;
    let transferFeeAmount: number = 0;
    let numericAmount: number = 0;

    if (newStatus === 'Approved') {
      const config = configSnap?.data() || {};
      
      if (txData['serviceFee'] !== undefined) {
        transferFeeAmount = parseFloat(txData['serviceFee']?.toString() || '0') || 0;
      } else {
        transferFeeAmount = parseFloat(config['transferFee']?.toString().replace(/,/g, '')) || 0;
      }

      const amountStr: string = txData['amount'] || '0';
      numericAmount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;

      if (isTransfer) {
        const paymentSource = txData['paymentSource'] || 'CICO Bank Balance';
        if (paymentSource === 'CICO Bank Balance') {
          if (senderId && senderSnap?.exists()) {
            const currentBalance = senderSnap.data()?.['balance'] ?? 25000;
            const totalDeduction = numericAmount + transferFeeAmount;

            if (currentBalance < totalDeduction) {
              throw new Error("Insufficient funds for transfer and fees.");
            }
            senderNewBalance = currentBalance - totalDeduction;
          }
        } else {
          senderNewBalance = null;
        }

        const recipientBank = txData['recipientBank'] || 'CICO Bank';
        if (recipientBank === 'CICO Bank') {
          if (recipientId && recipientSnap?.exists()) {
            const currentRecBal = recipientSnap.data()?.['balance'] ?? 25000;
            recipientNewBalance = currentRecBal + numericAmount;
          }
        } else {
          recipientNewBalance = null;
        }
      } else if (isDeposit) {
        if (senderId && senderSnap?.exists()) {
          const currentBal = senderSnap.data()?.['balance'] ?? 25000;
          senderNewBalance = currentBal + numericAmount;
        }
      }
    }

    // --- 3. ALL WRITES ---
    const batch = writeBatch(this.firestore);

    // Transaction status
    batch.update(txDocRef, updateData);

    // Notification
    const notifCollection = collection(this.firestore, 'notifications');
    batch.set(doc(notifCollection), notifData);

    if (newStatus === 'Approved') {
      if (senderNewBalance !== null && senderId) {
        batch.update(doc(this.firestore, `clients/${senderId}`), { balance: senderNewBalance });
      }
      
      if (recipientNewBalance !== null && recipientId) {
        batch.update(doc(this.firestore, `clients/${recipientId}`), { balance: recipientNewBalance });
      }

      if (isTransfer) {
        if (senderId && transferFeeAmount > 0) {
          const historyCol = collection(this.firestore, 'system_funds_history');
          batch.set(doc(historyCol), {
            type: 'Service Fee',
            amount: transferFeeAmount,
            timestamp: new Date().getTime(),
            date: new Date().toLocaleString()
          });

          const txCol = collection(this.firestore, 'transactions');
          batch.set(doc(txCol), {
            title: `Service Fee (Ref: ${txData['reference'] || 'TXN'})`,
            time: new Date().toLocaleString(),
            amount: `- ₱ ${transferFeeAmount}`,
            color: 'bg-red',
            icon: 'F',
            status: 'Approved',
            category: 'Service Fee',
            reference: 'FEE-' + Math.floor(Math.random() * 1000000),
            senderId: senderId,
            recipientId: 'SYSTEM',
            timestamp: new Date().getTime(),
            processedBy: processedBy || 'System (Auto)'
          });
        }

        if (!recipientId) {
          const historyCol = collection(this.firestore, 'system_funds_history');
          batch.set(doc(historyCol), {
            type: 'Debit',
            amount: numericAmount,
            timestamp: new Date().getTime(),
            date: new Date().toLocaleString()
          });
        }
      } else if (isDeposit) {
        const historyCol = collection(this.firestore, 'system_funds_history');
        batch.set(doc(historyCol), {
          type: 'Credit',
          amount: numericAmount,
          timestamp: new Date().getTime(),
          date: new Date().toLocaleString()
        });
      }
    }

    await batch.commit();
  }

  async refundTransaction(id: string, processedBy: string = '') {
    // --- 1. ALL READS ---
    const txDocRef = doc(this.firestore, `transactions/${id}`);
    const txSnap = await getDoc(txDocRef);
    if (!txSnap.exists()) throw new Error("Transaction does not exist!");

    const txData = txSnap.data();
    if (txData['status'] !== 'Approved') {
      throw new Error(`Only Approved transactions can be refunded.`);
    }

    const senderId = txData['senderId'];
    const recipientId = txData['recipientId'];
    const isTransfer = txData['category'] === 'Transfer';
    const isDeposit = txData['category'] === 'Deposit';
    const amountStr: string = txData['amount'] || '0';
    const numericAmount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;

    let senderSnap: any = null;
    let recipientSnap: any = null;

    if (senderId) {
      senderSnap = await getDoc(doc(this.firestore, `clients/${senderId}`));
    }
    if (recipientId && isTransfer) {
      recipientSnap = await getDoc(doc(this.firestore, `clients/${recipientId}`));
    }

    // --- 2. LOGIC ---
    let senderNewBalance: number | null = null;
    let recipientNewBalance: number | null = null;

    if (isTransfer) {
      if (recipientId && recipientSnap?.exists()) {
        const currentRecBal = recipientSnap.data()?.['balance'] ?? 25000;
        if (currentRecBal < numericAmount) {
          throw new Error("Recipient has insufficient funds for a refund.");
        }
        recipientNewBalance = currentRecBal - numericAmount;
      }
      if (senderId && senderSnap?.exists()) {
        const currentSenderBal = senderSnap.data()?.['balance'] ?? 25000;
        // The system keeps the fee, so we only refund the numeric amount
        senderNewBalance = currentSenderBal + numericAmount;
      }
    } else if (isDeposit) {
      if (senderId && senderSnap?.exists()) {
        const currentBal = senderSnap.data()?.['balance'] ?? 25000;
        if (currentBal < numericAmount) {
          throw new Error("Client has insufficient funds to reverse the deposit.");
        }
        senderNewBalance = currentBal - numericAmount;
      }
    }

    const currentTime = new Date().getTime();
    const currentDateString = new Date().toLocaleString();

    const notifData = {
      source: 'Staff',
      type: 'Refund',
      description: `${processedBy || 'Staff'} refunded transaction ID: ${id}`,
      reference: id,
      status: 'Refunded',
      timestamp: currentTime,
      date: currentDateString
    };

    // --- 3. WRITES ---
    const batch = writeBatch(this.firestore);

    batch.update(txDocRef, { 
      status: 'Refunded', 
      processedAt: currentTime,
      processedTime: currentDateString,
      processedBy: processedBy || 'Staff'
    });

    const notifCollection = collection(this.firestore, 'notifications');
    batch.set(doc(notifCollection), notifData);

    if (senderNewBalance !== null && senderId) {
      batch.update(doc(this.firestore, `clients/${senderId}`), { balance: senderNewBalance });
    }
    if (recipientNewBalance !== null && recipientId) {
      batch.update(doc(this.firestore, `clients/${recipientId}`), { balance: recipientNewBalance });
    }

    if (isTransfer && !recipientId) {
      const historyCol = collection(this.firestore, 'system_funds_history');
      batch.set(doc(historyCol), {
        type: 'Refund (Reverse Debit)',
        amount: numericAmount,
        timestamp: currentTime,
        date: currentDateString
      });
    } else if (isDeposit) {
      const historyCol = collection(this.firestore, 'system_funds_history');
      batch.set(doc(historyCol), {
        type: 'Refund (Reverse Credit)',
        amount: numericAmount,
        timestamp: currentTime,
        date: currentDateString
      });
    }

    await batch.commit();
  }

  // --- CLIENT BALANCE ---
  getClientBalance(clientId: string = 'excel_john'): Observable<any> {
    const balanceDoc = doc(this.firestore, `clients/${clientId}`);
    return docData(balanceDoc) as Observable<any>;
  }

  async initClientBalance(clientId: string = 'excel_john') {
    const balanceDoc = doc(this.firestore, `clients/${clientId}`);
    const snap = await getDoc(balanceDoc);
    if (!snap.exists()) {
      await setDoc(balanceDoc, { 
        balance: 25000, 
        name: clientId === 'excel_john' ? 'Excel John' : 'Elliara Liv', 
        email: clientId === 'excel_john' ? 'client@cico.com' : 'client2@cico.com',
        accountNumber: clientId === 'excel_john' ? 'CICO-1001-0001' : 'CICO-1001-0002'
      });
    } else {
      const data = snap.data();
      if (!data['accountNumber']) {
        await updateDoc(balanceDoc, {
          accountNumber: clientId === 'excel_john' ? 'CICO-1001-0001' : 'CICO-1001-0002'
        });
      }
    }
  }

  async adjustBalance(clientId: string, delta: number) {
    const balanceDoc = doc(this.firestore, `clients/${clientId}`);
    const snap = await getDoc(balanceDoc);
    if (snap.exists()) {
      const current = snap.data()['balance'] ?? 25000;
      const newBalance = Math.max(0, current + delta);
      await updateDoc(balanceDoc, { balance: newBalance });
    } else {
      // Init with default then adjust
      await setDoc(balanceDoc, { balance: Math.max(0, 25000 + delta) });
    }
  }

  // --- NOTIFICATIONS (Admin Reports Feed) ---
  getNotifications(): Observable<any[]> {
    const notifCollection = collection(this.firestore, 'notifications');
    return collectionData(notifCollection, { idField: 'id' });
  }

  async addNotification(notifData: any) {
    const notifCollection = collection(this.firestore, 'notifications');
    return addDoc(notifCollection, {
      ...notifData,
      timestamp: new Date().getTime(),
      date: new Date().toLocaleString()
    });
  }

  // --- PASSWORD REQUESTS ---
  getPasswordRequests(): Observable<any[]> {
    const reqCollection = collection(this.firestore, 'password_requests');
    const q = query(reqCollection, orderBy('timestamp', 'desc'));
    return collectionData(q, { idField: 'id' }).pipe(
      map(requests => requests.map(req => ({
        ...req,
        image: req['email'] === 'client2@cico.com' ? '/images/client2.jpg' :
               req['email'] === 'client@cico.com' ? '/images/client.jpg' :
               req['role'] === 'Staff' ? '/images/staff.jpg' : '/images/admin.jpg'
      })))
    );
  }

  async addPasswordRequest(reqData: any) {
    const reqCollection = collection(this.firestore, 'password_requests');
    return addDoc(reqCollection, {
      ...reqData,
      timestamp: new Date().getTime()
    });
  }

  async removePasswordRequest(id: string) {
    const reqDocRef = doc(this.firestore, `password_requests/${id}`);
    return deleteDoc(reqDocRef);
  }

  // --- SYSTEM CONFIG ---
  getSystemConfig(): Observable<any> {
    const configDoc = doc(this.firestore, 'system/config');
    return docData(configDoc);
  }

  async updateSystemConfig(data: any) {
    const configDoc = doc(this.firestore, 'system/config');
    await setDoc(configDoc, data, { merge: true });
  }

  async initSystemConfig() {
    const configDoc = doc(this.firestore, 'system/config');
    const snap = await getDoc(configDoc);
    if (!snap.exists()) {
      await setDoc(configDoc, { 
        total_reserves: 1200000,
        twoFactor: true,
        maintenance: false,
        transferLimit: 500000,
        interestRate: 4.50,
        transferFee: 15.00,
        staffAutoApprove: false,
        verboseLogging: true
      });
    }
  }

  async logSystemActivity(type: string, amount: number) {
    const historyCol = collection(this.firestore, 'system_funds_history');
    await addDoc(historyCol, {
      type,
      amount,
      timestamp: new Date().getTime(),
      date: new Date().toLocaleString()
    });
  }

  getSystemHistory(): Observable<any[]> {
    const historyCol = collection(this.firestore, 'system_funds_history');
    return collectionData(historyCol, { idField: 'id' });
  }

  getSystemStats(): Observable<any> {
    const clientsCol = collection(this.firestore, 'clients');
    return combineLatest([
      this.getNotifications(),
      collectionData(clientsCol),
      this.getSystemConfig(),
      this.getTransactions()
    ]).pipe(
      map(([notifs, clients, reservesData, txs]) => {
        const totalClientBalances = clients.reduce((acc, c: any) => acc + (c.balance || 0), 0);
        const reserves = reservesData?.total_reserves ?? 1200000;
        return {
          totalUsers: 4, // Excel, Elliara, Admin, Staff
          totalFunds: '₱ ' + (reserves + totalClientBalances).toLocaleString(),
          reports: notifs.length,
          totalTransactions: txs.length
        };
      })
    );
  }

  // --- USERS (for Recent Platform Users) ---
  getUsers(): Observable<any[]> {
    const clientsCol = collection(this.firestore, 'clients');
    const staffCol = collection(this.firestore, 'staff');
    const adminCol = collection(this.firestore, 'admin');

    return combineLatest([
      collectionData(clientsCol, { idField: 'id' }),
      collectionData(staffCol, { idField: 'id' }),
      collectionData(adminCol, { idField: 'id' })
    ]).pipe(
      map(([clients, staff, admins]) => {
        const clientUsers = clients.map((c: any) => ({
          id: c.id,
          name: c['name'] || c['email'] || 'Unknown Client',
          email: c['email'] || '',
          phone: c['phone'] || (c['email'] === 'client2@cico.com' ? '0918 987 6543' : '0917 123 4567'),
          accountNumber: c['accountNumber'] || (c['id'] === 'excel_john' ? 'CICO-1001-0001' : 'CICO-1001-0002'),
          role: 'Client',
          status: c['status'] || 'Active',
          image: c['email'] === 'client2@cico.com' ? '/images/client2.jpg' : '/images/client.jpg'
        }));
        const staffUsers = staff.map((s: any) => ({
          id: s.id,
          name: s['name'] || s['email'] || 'Unknown Staff',
          email: s['email'] || '',
          phone: s['phone'] || '0920 123 4567',
          role: 'Staff',
          status: s['status'] || 'Active',
          image: '/images/staff.jpg'
        }));
        const adminUsers = admins.map((a: any) => ({
          id: a.id,
          name: a['name'] || a['email'] || 'Unknown Admin',
          email: a['email'] || '',
          phone: a['phone'] || '0999 888 7777',
          role: 'Admin',
          status: a['status'] || 'Active',
          image: '/images/admin.jpg'
        }));
        return [...clientUsers, ...staffUsers, ...adminUsers];
      })
    );
  }

  // --- MESSAGES (Support Chat) ---
  getMessages(clientId: string): Observable<any[]> {
    const msgCollection = collection(this.firestore, 'messages');
    const q = query(msgCollection, orderBy('timestamp', 'asc'));
    return collectionData(q, { idField: 'id' }).pipe(
      map(msgs => msgs.filter(m => m['clientId'] === clientId))
    );
  }

  getAllMessages(): Observable<any[]> {
    const msgCollection = collection(this.firestore, 'messages');
    const q = query(msgCollection, orderBy('timestamp', 'asc'));
    return collectionData(q, { idField: 'id' });
  }

  async sendMessage(clientId: string, senderRole: string, senderName: string, text: string) {
    const msgCollection = collection(this.firestore, 'messages');
    return addDoc(msgCollection, {
      clientId,
      senderRole,
      senderName,
      text,
      timestamp: new Date().getTime(),
      read: false
    });
  }

  // --- ADMIN RESET ---
  async resetSystemData() {
    const batch = writeBatch(this.firestore);

    const txSnap = await getDocs(collection(this.firestore, 'transactions'));
    txSnap.docs.forEach(d => batch.delete(d.ref));

    const notifSnap = await getDocs(collection(this.firestore, 'notifications'));
    notifSnap.docs.forEach(d => batch.delete(d.ref));

    const sysHistorySnap = await getDocs(collection(this.firestore, 'system_funds_history'));
    sysHistorySnap.docs.forEach(d => batch.delete(d.ref));

    const msgSnap = await getDocs(collection(this.firestore, 'messages'));
    msgSnap.docs.forEach(d => batch.delete(d.ref));

    const clientsSnap = await getDocs(collection(this.firestore, 'clients'));
    clientsSnap.docs.forEach(d => batch.delete(d.ref));

    const staffSnap = await getDocs(collection(this.firestore, 'staff'));
    staffSnap.docs.forEach(d => batch.delete(d.ref));

    const adminSnap = await getDocs(collection(this.firestore, 'admin'));
    adminSnap.docs.forEach(d => batch.delete(d.ref));

    // Reset client balances to 25000 and include phone numbers and CICO bank account numbers
    batch.set(doc(this.firestore, 'clients/excel_john'), { balance: 25000, name: 'Excel John', email: 'client@cico.com', phone: '09171234567', accountNumber: 'CICO-1001-0001' });
    batch.set(doc(this.firestore, 'clients/elliara_liv'), { balance: 25000, name: 'Elliara Liv', email: 'client2@cico.com', phone: '09189876543', accountNumber: 'CICO-1001-0002' });

    // Reset System Reserves
    batch.set(doc(this.firestore, 'system/config'), { total_reserves: 1200000 });

    // Ensure staff and admin exist
    batch.set(doc(this.firestore, 'staff/staff_1'), { name: 'Cindy Ma. Lala', email: 'staff@cico.com', role: 'Staff', status: 'Active', phone: '0920 123 4567' });
    batch.set(doc(this.firestore, 'admin/admin_1'), { name: 'Hawk M. Beat', email: 'admin@cico.com', role: 'Admin', status: 'Active', phone: '0999 888 7777' });

    await batch.commit();
  }
}
