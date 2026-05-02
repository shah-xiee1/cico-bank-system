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

  ngOnInit() {
    this.staffName = localStorage.getItem('currentUserName') || 'Cindy Ma. Lala';

    this.sessions$ = combineLatest([
      this.dbService.getAllMessages(),
      this.dbService.getUsers()
    ]).pipe(
      map(([msgs, users]: [any[], any[]]) => {
        const grouped = new Map<string, any>();
        
        msgs.forEach(m => {
          if (!m.clientId) return;

          if (!grouped.has(m.clientId)) {
            const clientUser = users.find(u => u.id === m.clientId);
            grouped.set(m.clientId, {
              clientId: m.clientId,
              clientName: clientUser ? clientUser.name : (m.senderRole === 'Client' ? m.senderName : 'Unknown Client'),
              clientImage: clientUser ? clientUser.image : '/images/client.jpg',
              messages: [],
              lastMessage: null
            });
          }
          
          const group = grouped.get(m.clientId);
          const clientUser = users.find(u => u.id === m.clientId);
          const staffUser = users.find(u => u.name === m.senderName && u.role === 'Staff');
          
          const enrichedMsg = {
            ...m,
            image: m.senderRole === 'Staff' 
              ? (staffUser ? staffUser.image : '/images/staff.jpg')
              : (clientUser ? clientUser.image : '/images/client.jpg')
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
          }
        } else if (sessions.length > 0) {
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
    
    // Clear input immediately for better UX
    this.newMessageText = '';
    
    try {
      await this.dbService.sendMessage(
        clientId,
        'Staff',
        this.staffName,
        text
      );
    } catch (err: any) {
      alert('Error sending message: ' + err.message);
      this.newMessageText = text; // Restore text on failure
    }
  }
}
