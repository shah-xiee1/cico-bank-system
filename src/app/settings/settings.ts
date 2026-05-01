import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  private router = inject(Router);

  logout() {
    this.router.navigate(['/']);
  }
}
