import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { Observable } from 'rxjs';

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
  
  newMessageText: string = '';

  ngOnInit() {
    this.currentUserId = localStorage.getItem('currentUser') || 'excel_john';
    this.currentUserName = localStorage.getItem('currentUserName') || 'Excel John';
    this.currentUserImage = this.currentUserId === 'jane_doe' ? '/images/client2.jpg' : '/images/client.jpg';

    this.messages$ = this.dbService.getMessages(this.currentUserId);
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
