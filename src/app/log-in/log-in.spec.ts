import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LogIn } from './log-in';

describe('LogIn', () => {
  let component: LogIn;
  let fixture: ComponentFixture<LogIn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogIn],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LogIn);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
