import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-staff-messages',
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './messages.html',
  styleUrl: './messages.css'
})
export class StaffMessagesComponent implements OnInit, OnDestroy {
  private dbService = inject(DatabaseService);
  private cdr = inject(ChangeDetectorRef);
  
  chatSessions: any[] = [];
  selectedClientId: string | null = null;
  selectedClientName: string = '';
  
  activeMessages: any[] = [];
  newMessageText: string = '';

  staffName = 'Staff';
  staffImage = '/images/staff.jpg';

  allMessages: any[] = [];
  users: any[] = [];

  private msgsSub!: Subscription;
  private usersSub!: Subscription;

  public debugInfo: string = 'Initializing...';

  ngOnInit() {
    this.staffName = localStorage.getItem('currentUserName') || 'Cindy Ma. Lala';
    this.staffImage = '/images/staff.jpg';

    try {
      this.usersSub = this.dbService.getUsers().subscribe({
        next: (u) => {
          this.users = u || [];
          this.processMessages();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.debugInfo = 'Error loading users: ' + err?.message;
          this.cdr.detectChanges();
        }
      });
    } catch (e: any) {
      this.debugInfo = 'Sync Error Users: ' + e?.message;
      this.cdr.detectChanges();
    }

    try {
      this.msgsSub = this.dbService.getAllMessages().subscribe({
        next: (msgs) => {
          this.allMessages = msgs || [];
          this.debugInfo = `Loaded ${this.allMessages.length} messages from DB.`;
          this.processMessages();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.debugInfo = 'Error loading messages: ' + err?.message;
          this.cdr.detectChanges();
        }
      });
    } catch (e: any) {
      this.debugInfo = 'Sync Error Msgs: ' + e?.message;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    if (this.msgsSub) this.msgsSub.unsubscribe();
    if (this.usersSub) this.usersSub.unsubscribe();
  }

  processMessages() {
    if (!this.allMessages) return;
    
    const grouped = new Map<string, any>();
    
    this.allMessages.forEach(m => {
      if (!m.clientId) return;

      if (!grouped.has(m.clientId)) {
        const clientUser = this.users.find(u => u.id === m.clientId);
        grouped.set(m.clientId, {
          clientId: m.clientId,
          clientName: clientUser ? clientUser.name : (m.senderRole === 'Client' ? m.senderName : 'Unknown Client'),
          clientImage: clientUser ? clientUser.image : '/images/client.jpg',
          messages: [],
          lastMessage: null
        });
      }
      
      const group = grouped.get(m.clientId);
      group.messages.push(m);
      
      if (!group.lastMessage || m.timestamp > group.lastMessage.timestamp) {
        group.lastMessage = m;
      }
    });
    
    this.chatSessions = Array.from(grouped.values()).sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
    
    if (this.selectedClientId) {
      this.activeMessages = this.chatSessions.find(s => s.clientId === this.selectedClientId)?.messages || [];
      if (this.activeMessages.length === 0 && this.chatSessions.length > 0) {
        this.selectClient(this.chatSessions[0]);
      }
    } else if (this.chatSessions.length > 0) {
      this.selectClient(this.chatSessions[0]);
    }
  }

  selectClient(session: any) {
    this.selectedClientId = session.clientId;
    this.selectedClientName = session.clientName;
    this.activeMessages = session.messages;
    this.cdr.detectChanges();
  }

  async sendMessage() {
    if (!this.newMessageText.trim() || !this.selectedClientId) return;
    
    try {
      await this.dbService.sendMessage(
        this.selectedClientId,
        'Staff',
        this.staffName,
        this.newMessageText.trim()
      );
      this.newMessageText = '';
      this.cdr.detectChanges();
    } catch (err: any) {
      alert('Error sending message: ' + err.message);
    }
  }
}
