import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Observable, map, combineLatest } from 'rxjs';

@Component({
  selector: 'app-client-messages',
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './messages.html',
  styleUrl: './messages.css'
})
export class ClientMessagesComponent implements OnInit {
  private dbService = inject(DatabaseService);

  messages$!: Observable<any[]>;
  currentUserId: string = 'excel_john';
  currentUserName: string = 'Excel John';
  currentUserImage: string = '/images/client.jpg';
  fullPhone$!: Observable<string>;
  
  newMessageText: string = '';

  ngOnInit() {
    this.currentUserId = localStorage.getItem('currentUser') || 'excel_john';
    this.currentUserName = localStorage.getItem('currentUserName') || 'Excel John';
    this.currentUserImage = this.currentUserId === 'jane_doe' ? '/images/client2.jpg' : '/images/client.jpg';

    this.messages$ = combineLatest([
      this.dbService.getMessages(this.currentUserId),
      this.dbService.getUsers()
    ]).pipe(
      map(([msgs, users]: [any[], any[]]) => {
        return msgs.map((m: any) => {
          if (m.senderRole === 'Staff') {
            const staff = users.find((u: any) => u.name === m.senderName);
            return { ...m, image: staff ? staff.image : '/images/staff.jpg' };
          }
          return m;
        });
      })
    );
    this.fullPhone$ = this.dbService.getUsers().pipe(
      map((users: any[]) => {
        const me = users.find((u: any) => u.id === this.currentUserId);
        return me?.phone || '0900 000 0000';
      })
    );
  }

  async sendMessage() {
    if (!this.newMessageText.trim()) return;
    
    await this.dbService.sendMessage(
      this.currentUserId,
      'Client',
      this.currentUserName,
      this.newMessageText.trim()
    );
    this.newMessageText = '';
  }
}
