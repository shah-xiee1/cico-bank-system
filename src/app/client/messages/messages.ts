import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Observable, map, combineLatest, Subscription } from 'rxjs';

@Component({
  selector: 'app-client-messages',
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './messages.html',
  styleUrl: './messages.css'
})
export class ClientMessagesComponent implements OnInit, OnDestroy {
  private dbService = inject(DatabaseService);
  private sub = new Subscription();

  messages$!: Observable<any[]>;
  activeMessages: any[] = [];
  currentUserId: string = 'excel_john';
  currentUserName: string = 'Excel John';
  currentUserImage: string = '/images/client.jpg';
  fullPhone$!: Observable<string>;
  
  newMessageText: string = '';

  ngOnInit() {
    this.currentUserId = localStorage.getItem('currentUser') || 'excel_john';
    this.currentUserName = localStorage.getItem('currentUserName') || 'Excel John';
    this.currentUserImage = this.currentUserId === 'elliara_liv' ? '/images/client2.jpg' : '/images/client.jpg';

    this.messages$ = combineLatest([
      this.dbService.getMessages(this.currentUserId),
      this.dbService.getUsers()
    ]).pipe(
      map(([msgs, users]: [any[], any[]]) => {
        const enriched = msgs.map((m: any) => {
          if (m.senderRole === 'Staff') {
            const staff = users.find((u: any) => u.name === m.senderName);
            return { ...m, image: staff ? staff.image : '/images/staff.jpg' };
          }
          return m;
        });
        this.activeMessages = enriched;
        return enriched;
      })
    );

    this.sub.add(this.messages$.subscribe());

    this.fullPhone$ = this.dbService.getUsers().pipe(
      map((users: any[]) => {
        const me = users.find((u: any) => u.id === this.currentUserId);
        return me?.phone || '0900 000 0000';
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  async sendMessage() {
    if (!this.newMessageText.trim()) return;
    
    const text = this.newMessageText.trim();
    this.newMessageText = '';

    // Optimistic UI: Add the message locally first
    const optimisticMsg = {
      clientId: this.currentUserId,
      senderRole: 'Client',
      senderName: this.currentUserName,
      text,
      timestamp: new Date().getTime(),
      isOptimistic: true
    };
    this.activeMessages = [...this.activeMessages, optimisticMsg];

    try {
      await this.dbService.sendMessage(
        this.currentUserId,
        'Client',
        this.currentUserName,
        text
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      this.activeMessages = this.activeMessages.filter(m => m !== optimisticMsg);
      this.newMessageText = text;
    }
  }
}
