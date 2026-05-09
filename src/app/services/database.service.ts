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

    // Adjust client balance and apply fees on approval
    if (newStatus === 'Approved') {
      const txSnap = await getDoc(txDocRef);
      const configSnap = await getDoc(doc(this.firestore, 'system/config'));
      const config = configSnap.data() || {};
      const transferFee = parseFloat(config['transferFee']?.toString().replace(/,/g, '')) || 0;

      if (txSnap.exists()) {
        const txData = txSnap.data();
        const amountStr: string = txData['amount'] || '0';
        const numericAmount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;

        const senderId = txData['senderId'];
        const recipientId = txData['recipientId'];
        const isDeposit = txData['category'] === 'Deposit';
        const isTransfer = txData['category'] === 'Transfer';

        if (isTransfer) {
          // Deduct Amount + Fee from sender
          if (senderId) {
            await this.adjustBalance(senderId, -(numericAmount + transferFee));
            if (transferFee > 0) {
              await this.logSystemActivity('Service Fee', transferFee);
              // Create a visible fee transaction for the client
              await this.addTransaction({
                title: `Service Fee (Ref: ${txData['reference'] || 'TXN'})`,
                time: new Date().toLocaleString(),
                amount: `- ₱ ${transferFee}`,
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
          }

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
      await setDoc(balanceDoc, { balance: 25000, name: clientId === 'excel_john' ? 'Excel John' : 'Elliara Liv', email: clientId === 'excel_john' ? 'client@cico.com' : 'client2@cico.com' });
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
    const txSnap = await getDocs(collection(this.firestore, 'transactions'));
    await Promise.all(txSnap.docs.map(d => deleteDoc(d.ref)));

    const notifSnap = await getDocs(collection(this.firestore, 'notifications'));
    await Promise.all(notifSnap.docs.map(d => deleteDoc(d.ref)));

    const sysHistorySnap = await getDocs(collection(this.firestore, 'system_funds_history'));
    await Promise.all(sysHistorySnap.docs.map(d => deleteDoc(d.ref)));

    const msgSnap = await getDocs(collection(this.firestore, 'messages'));
    await Promise.all(msgSnap.docs.map(d => deleteDoc(d.ref)));

    const clientsSnap = await getDocs(collection(this.firestore, 'clients'));
    await Promise.all(clientsSnap.docs.map(d => deleteDoc(d.ref)));

    const staffSnap = await getDocs(collection(this.firestore, 'staff'));
    await Promise.all(staffSnap.docs.map(d => deleteDoc(d.ref)));

    const adminSnap = await getDocs(collection(this.firestore, 'admin'));
    await Promise.all(adminSnap.docs.map(d => deleteDoc(d.ref)));

    // Reset client balances to 25000 and include phone numbers
    await setDoc(doc(this.firestore, 'clients/excel_john'), { balance: 25000, name: 'Excel John', email: 'client@cico.com', phone: '09171234567' });
    await setDoc(doc(this.firestore, 'clients/elliara_liv'), { balance: 25000, name: 'Elliara Liv', email: 'client2@cico.com', phone: '09189876543' });

    // Reset System Reserves
    await setDoc(doc(this.firestore, 'system/config'), { total_reserves: 1200000 });

    // Ensure staff and admin exist
    await setDoc(doc(this.firestore, 'staff/staff_1'), { name: 'Cindy Ma. Lala', email: 'staff@cico.com', role: 'Staff', status: 'Active', phone: '0920 123 4567' });
    await setDoc(doc(this.firestore, 'admin/admin_1'), { name: 'Hawk M. Beat', email: 'admin@cico.com', role: 'Admin', status: 'Active', phone: '0999 888 7777' });
  }
}
