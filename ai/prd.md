# Product Requirements Document (PRD) – LifeSync

## 1. Product Overview
**LifeSync** is a web application that helps users conduct structured weekly reflections on key areas of life.  
It allows note-taking in six categories (**Family**, **Friends**, **Pets**, **Body**, **Mind**, **Passions**),  
generates personalized summaries and recommendations through an **AI assistant**, archives entries,  
and supports users in maintaining life balance.

---

## 2. User Problem
Modern professionals and self-development-oriented individuals often experience:
- mental chaos and lack of time or space for reflection,  
- imbalance between work and personal life,  
- risk of burnout,  
- difficulty tracking progress in key life domains.  

**LifeSync** provides a structured framework for weekly reflection, helping users consciously manage  
their family life, relationships, physical and mental health, and passions.

---

## 3. Functional Requirements
1. User registration and email verification (US-001)  
2. Login and logout with protected routes (US-002)  
3. CRUD operations for notes by category (US-003, US-004, US-005)  
4. Dashboard with progress bars, streaks, and infinite scroll history of reports, weekly filtering (US-006, US-007)  
5. Report generation  
   - automatic weekly on a selected day (dropdown) (US-008, US-011)  
   - on-demand, limited to 3 reports per week (US-009, US-010)  
6. Communication: HTML email or in-app banner; consent toggles and unsubscribe in profile (US-012)  
7. AI assistant generating summaries and recommendations (US-013, US-014)  
8. Feedback modal after the first report: 3 emojis + comment (max 300 characters) (US-015, US-016)  
9. Event analytics for CRUD operations and reports in Supabase (US-017)  
10. Dashboard caching: 5-minute cache, invalidated on note CRUD  
11. Data retention: automatic deletion of notes/reports older than 6 months via cron at 02:00 (US-018)  
12. Infrastructure: Angular + Supabase JWT, Node.js/Express, Docker on DigitalOcean  
13. CI/CD: GitHub Actions (build → unit + e2e Playwright tests) → auto-deploy to staging, manual to production; secrets stored in GitHub Secrets  
14. Documentation: specification of `preferences` and `reports` tables in PRD; `/config/SYSTEM_PROMPT.ts` version-controlled  

---

## 4. Product Boundaries
- Web app MVP only — no native mobile applications  
- No backup export (data deleted after 6 months)  
- No integration with external services other than email  
- No advanced AI personalization beyond summary generation  
- No multilingual support  

---

## 5. User Stories

### US-001 – Registration and Email Verification
**Description:**  
As a new user, I want to create an account and verify my email to protect my data.  

**Acceptance Criteria:**  
- Verification link sent after registration  
- Clicking the link activates the account and redirects to the dashboard  
- Access to protected routes blocked until verification  

---

### US-002 – Login and Logout
**Description:**  
As a registered user, I want to log in and log out to secure access.  

**Acceptance Criteria:**  
- Correct credentials redirect to the dashboard  
- Incorrect credentials display an error message  
- After logout, the user is redirected to the login page  

---

### US-003 – Add Note
**Description:**  
As a user, I want to add a note in a selected category to track my progress.  

**Acceptance Criteria:**  
- Add-note modal opens after clicking a category chip  
- Maximum of 3 active categories allowed  
- New note appears instantly on the dashboard  

---

### US-004 – Edit Note
**Description:**  
As a user, I want to edit an existing note to correct or update information.  

**Acceptance Criteria:**  
- Edit modal opens after clicking the edit button  
- Changes immediately visible on the dashboard  

---

### US-005 – Delete Note
**Description:**  
As a user, I want to delete notes to maintain order.  

**Acceptance Criteria:**  
- Confirmation required before deletion  
- Deleted note disappears from the dashboard  

---

### US-006 – Dashboard Overview
**Description:**  
As a user, I want to see a progress bar for each category, streaks of days I added notes,  
and category cards to track my progress.  

**Acceptance Criteria:**  
- Dashboard loads in under 2 seconds  
- Correct display of note counts and streaks  

---

### US-007 – Report History Filtering
**Description:**  
As a user, I want to filter my report history by week.  

**Acceptance Criteria:**  
- Infinite scroll loads additional reports  
- Weekly dropdown filters reports correctly  

---

### US-008 – Automatic Weekly Report Generation
**Description:**  
As a user, I want to receive an automatic report once a week.  

**Acceptance Criteria:**  
- Weekly day selection available in preferences  
- Report generated and sent at the scheduled time  

---

### US-009 – On-Demand Report Generation
**Description:**  
As a user, I want to generate a report up to 3 times per week.  

**Acceptance Criteria:**  
- “Generate Report” button creates a new report  
- 3-per-week limit enforced  

---

### US-010 – On-Demand Report Limit Handling
**Description:**  
As a user, I want to be notified when the weekly report limit is reached.  

**Acceptance Criteria:**  
- Warning message shown when trying to generate a 4th report  

---

### US-011 – Weekly Report Day Preference
**Description:**  
As a user, I want to set the day of my weekly report.  

**Acceptance Criteria:**  
- Dropdown saves selected day  
- Report schedule updates accordingly  

---

### US-012 – Communication Preferences
**Description:**  
As a user, I want to select the delivery channel for my report and manage unsubscribing.  

**Acceptance Criteria:**  
- Toggle saves preferences  
- No emails sent after opting out  

---

### US-013 – Receive Email Report
**Description:**  
As a user, I want to receive an HTML report via email.  

**Acceptance Criteria:**  
- Email includes summary and recommendations  
- Renders correctly in major email clients  

---

### US-014 – Receive In-App Report
**Description:**  
As a user, I want to see a banner with my report inside the app.  

**Acceptance Criteria:**  
- Banner appears on the report day  
- Clicking opens the full report view  

---

### US-015 – Provide Feedback After Report
**Description:**  
As a user, I want to rate the report with emojis and an optional comment.  

**Acceptance Criteria:**  
- Feedback modal includes three emojis  
- Comment limited to 300 characters  

---

### US-016 – Handle Comment Length Limit After Report
**Description:**  
As a user, I want to be warned when exceeding 300 characters.  

**Acceptance Criteria:**  
- No more than 300 characters allowed  
- Remaining characters counter displayed  

---

### US-017 – Automatic Data Deletion After Retention Period
**Description:**  
As a system, I want to delete data older than 6 months.  

**Acceptance Criteria:**  
- Cron job at 02:00 deletes data older than 6 months  

---

### US-018 – Unauthorized Access Handling
**Description:**  
As an unauthenticated user, I want to be redirected to the login page when attempting access.  

**Acceptance Criteria:**  
- Unauthorized route access redirects to login page  

---

## 6. Success Metrics
- ≥90% of users configured their preferences (categories and schedule)  
- ≥75% of reports opened and read (email or in-app)  
- ≥75% positive feedback reactions after the first report  
- Dashboard cache operates correctly (5-minute interval)  
- Data retention executes as scheduled  
    