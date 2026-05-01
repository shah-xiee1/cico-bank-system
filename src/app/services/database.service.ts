import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, setDoc, query, orderBy } from '@angular/fire/firestore';
import { Observable, from, combineLatest, map } from 'rxjs';
import { docData } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  private firestore: Firestore = inject(Firestore);

  // --- TRANSACTIONS ---
  getTransactions(): Observable<any[]> {
    const txCollection = collection(this.firestore, 'transactions');
    return collectionData(txCollection, { idField: 'id' });
  }

  async addTransaction(txData: any) {
    const txCollection = collection(this.firestore, 'transactions');
    const docRef = await addDoc(txCollection, {
      ...txData,
      timestamp: new Date().getTime()
    });
    // Automatically log a notification for admin reports
    await this.addNotification({
      source: 'Client',
      type: txData.category || 'Transaction',
      description: `${txData.title} submitted a ${txData.category || 'Transaction'} of ${txData.amount}`,
      reference: txData.reference || docRef.id,
      status: 'Pending'
    });
    return docRef;
  }

  async updateTransactionStatus(id: string, newStatus: string, processedBy: string = '') {
    const txDocRef = doc(this.firestore, `transactions/${id}`);
    const updateData: any = { status: newStatus };
    if (processedBy) updateData.processedBy = processedBy;
    await updateDoc(txDocRef, updateData);

    // Adjust client balance on approval
    if (newStatus === 'Approved') {
      const txSnap = await getDoc(txDocRef);
      if (txSnap.exists()) {
        const txData = txSnap.data();
        const amountStr: string = txData['amount'] || '0';
        const numericAmount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;
        
        const senderId = txData['senderId'];
        const recipientId = txData['recipientId'];
        const isDeposit = txData['category'] === 'Deposit';
        const isTransfer = txData['category'] === 'Transfer';

        if (isTransfer) {
          if (senderId) await this.adjustBalance(senderId, -numericAmount);
          
          if (recipientId) {
            // Client to client transfer
            await this.adjustBalance(recipientId, numericAmount);
          } else {
            // Outbound transfer/bill payment
            await this.logSystemActivity('Debit', numericAmount);
          }
        } else if (isDeposit) {
          if (senderId) await this.adjustBalance(senderId, numericAmount);
          await this.logSystemActivity('Credit', numericAmount);
        } else {
          // Fallback for older legacy records
          const isDebit = amountStr.includes('-');
          const isDep = amountStr.includes('+');
          if (isDebit && numericAmount > 0) {
            await this.adjustBalance('excel_john', -numericAmount);
            await this.logSystemActivity('Debit', numericAmount);
          } else if (isDep && numericAmount > 0) {
            await this.adjustBalance('excel_john', numericAmount);
            await this.logSystemActivity('Credit', numericAmount);
          }
        }
      }
    }

    // Log staff action as notification for admin reports
    await this.addNotification({
      source: 'Staff',
      type: 'Transaction Review',
      description: `${processedBy || 'Staff'} ${newStatus} transaction ID: ${id}`,
      reference: id,
      status: newStatus
    });
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
      await setDoc(balanceDoc, { balance: 25000, name: clientId === 'excel_john' ? 'Excel John' : 'Jane Doe', email: clientId === 'excel_john' ? 'client@cico.com' : 'client2@cico.com' });
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
    return collectionData(reqCollection, { idField: 'id' });
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

  // --- SYSTEM STATS ---
  getSystemReserves(): Observable<any> {
    const reservesDoc = doc(this.firestore, 'system/config');
    return docData(reservesDoc);
  }

  async initSystemConfig() {
    const reservesDoc = doc(this.firestore, 'system/config');
    const snap = await getDoc(reservesDoc);
    if (!snap.exists()) {
      await setDoc(reservesDoc, { total_reserves: 1200000 });
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
    return combineLatest([
      this.getNotifications(),
      this.getClientBalance('excel_john'),
      this.getSystemReserves(),
      this.getTransactions()
    ]).pipe(
      map(([notifs, balData, reservesData, txs]) => {
        const bal = balData?.balance ?? 25000;
        const reserves = reservesData?.total_reserves ?? 1200000;
        return {
          totalUsers: 4, // Excel, Jane, Admin, Staff
          totalFunds: '₱ ' + (reserves + bal).toLocaleString(),
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
          name: c.name || c.email || 'Unknown Client',
          email: c.email || '',
          phone: c.phone || '09000000000',
          role: 'Client',
          status: c.status || 'Active'
        }));
        const staffUsers = staff.map((s: any) => ({
          id: s.id,
          name: s.name || s.email || 'Unknown Staff',
          email: s.email || '',
          role: 'Staff',
          status: s.status || 'Active'
        }));
        const adminUsers = admins.map((a: any) => ({
          id: a.id,
          name: a.name || a.email || 'Unknown Admin',
          email: a.email || '',
          role: 'Admin',
          status: a.status || 'Active'
        }));
        return [...clientUsers, ...staffUsers, ...adminUsers];
      })
    );
  }

  // --- ADMIN RESET ---
  async resetSystemData() {
    const txSnap = await getDocs(collection(this.firestore, 'transactions'));
    await Promise.all(txSnap.docs.map(d => deleteDoc(d.ref)));

    const notifSnap = await getDocs(collection(this.firestore, 'notifications'));
    await Promise.all(notifSnap.docs.map(d => deleteDoc(d.ref)));

    const sysHistorySnap = await getDocs(collection(this.firestore, 'system_funds_history'));
    await Promise.all(sysHistorySnap.docs.map(d => deleteDoc(d.ref)));

    // Reset client balances to 25000 and include phone numbers
    await setDoc(doc(this.firestore, 'clients/excel_john'), { balance: 25000, name: 'Excel John', email: 'client@cico.com', phone: '09171234567' });
    await setDoc(doc(this.firestore, 'clients/jane_doe'), { balance: 25000, name: 'Jane Doe', email: 'client2@cico.com', phone: '09189876543' });

    // Reset System Reserves
    await setDoc(doc(this.firestore, 'system/config'), { total_reserves: 1200000 });
  }
}
