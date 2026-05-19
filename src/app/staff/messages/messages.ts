import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Observable, combineLatest, map } from 'rxjs';

@Component({
  selector: 'app-staff-messages',
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './messages.html',
  styleUrl: './messages.css'
})
export class StaffMessagesComponent implements OnInit {
  private dbService = inject(DatabaseService);
  
  sessions$!: Observable<any[]>;
  selectedClientId: string | null = null;
  selectedClientName: string = '';
  selectedClientImage: string = '';
  activeMessages: any[] = [];
  newMessageText: string = '';

  staffName = 'Staff';
  staffImage = '/images/staff.jpg';
  staffAccountNumber$!: Observable<string>;

  ngOnInit() {
    this.staffName = localStorage.getItem('currentUserName') || 'Cindy Ma. Lala';
    this.staffAccountNumber$ = this.dbService.getUsers().pipe(
      map((users: any[]) => {
        const me = users.find((u: any) => u.name === this.staffName);
        return me?.accountNumber || 'CICO-2001-0001';
      })
    );

    this.sessions$ = combineLatest([
      this.dbService.getAllMessages(),
      this.dbService.getUsers()
    ]).pipe(
      map(([msgs, users]: [any[], any[]]) => {
        const grouped = new Map<string, any>();
        
        msgs.forEach(m => {
          if (!m.clientId) return;

          const clientUser = users.find(u => u.id === m.clientId);
          // FIX: Skip conversations for non-existent clients
          if (!clientUser) return; 

          if (!grouped.has(m.clientId)) {
            grouped.set(m.clientId, {
              clientId: m.clientId,
              clientName: clientUser.name,
              clientImage: clientUser.image,
              messages: [],
              lastMessage: null
            });
          }
          
          const group = grouped.get(m.clientId);
          const staffUser = users.find(u => u.name === m.senderName && u.role === 'Staff');
          
          const enrichedMsg = {
            ...m,
            senderName: m.senderRole === 'Client' ? clientUser.name : m.senderName,
            image: m.senderRole === 'Staff' 
              ? (staffUser ? staffUser.image : '/images/staff.jpg')
              : clientUser.image
          };
          
          group.messages.push(enrichedMsg);
          
          if (!group.lastMessage || m.timestamp > group.lastMessage.timestamp) {
            group.lastMessage = enrichedMsg;
          }
        });
        
        const sessions = Array.from(grouped.values()).sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
        
        // Sync current selection
        if (this.selectedClientId) {
          const current = sessions.find(s => s.clientId === this.selectedClientId);
          if (current) {
            this.activeMessages = current.messages;
            this.selectedClientName = current.clientName;
            this.selectedClientImage = current.clientImage;
          } else {
            this.selectedClientId = null;
            this.activeMessages = [];
          }
        }
        
        if (!this.selectedClientId && sessions.length > 0) {
          this.selectClient(sessions[0]);
        }
        
        return sessions;
      })
    );
  }

  selectClient(session: any) {
    this.selectedClientId = session.clientId;
    this.selectedClientName = session.clientName;
    this.selectedClientImage = session.clientImage;
    this.activeMessages = session.messages;
  }

  async sendMessage() {
    if (!this.newMessageText.trim() || !this.selectedClientId) return;
    
    const text = this.newMessageText.trim();
    const clientId = this.selectedClientId;
    
    // Clear input immediately
    this.newMessageText = '';

    // Optimistic UI: Add the message locally first for instant feedback
    const optimisticMsg = {
      clientId,
      senderRole: 'Staff',
      senderName: this.staffName,
      text,
      timestamp: new Date().getTime(),
      image: this.staffImage,
      isOptimistic: true
    };
    this.activeMessages = [...this.activeMessages, optimisticMsg];
    
    try {
      await this.dbService.sendMessage(
        clientId,
        'Staff',
        this.staffName,
        text
      );
    } catch (err: any) {
      // Rollback optimistic update on error
      this.activeMessages = this.activeMessages.filter(m => m !== optimisticMsg);
      alert('Error sending message: ' + err.message);
      this.newMessageText = text;
    }
  }
}
