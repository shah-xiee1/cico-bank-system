import { Routes } from '@angular/router';
import { LogIn } from './log-in/log-in';
import { ClientComponent } from './client/client';
import { StaffComponent } from './staff/staff';
import { AdminDashboardComponent } from './admin/admin_dashboard/admin-dashboard/admin-dashboard';
import { Transactions } from './staff/transactions/transactions';
import { Reports } from './admin/reports/reports';
import { Settings } from './settings/settings';
import { ClientTransactionsComponent } from './client/transactions/transactions';

export const routes: Routes = [
  { path: '', component: LogIn },
  { path: 'client', component: ClientComponent },
  { path: 'staff', component: StaffComponent },
  { path: 'admin', component: AdminDashboardComponent },
  { path: 'transactions', component: Transactions },
  { path: 'client/transactions', component: ClientTransactionsComponent },
  { path: 'reports', component: Reports },
  { path: 'settings', component: Settings }
];