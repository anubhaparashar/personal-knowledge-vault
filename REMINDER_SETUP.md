# Reminder Setup

The app supports practical reminders that work from a static GitHub Pages build, plus calendar export for deadlines.

## Works immediately

- In-app reminders are checked when the app opens.
- Due, due-soon and overdue items appear in the dashboard reminder panel.
- Dismissed reminder cards stay dismissed for the current browser session.
- Each deadline can download an `.ics` calendar file.
- Each deadline can open a prefilled Google Calendar event.

## Requires browser permission

Browser notifications are only requested after the user clicks **Enable browser reminders** in the dashboard. The app does not ask automatically on first load.

Static GitHub Pages cannot guarantee background notifications while the tab is closed. Browser notification behavior depends on the browser, OS and whether the app tab is active.

## Requires a backend

Email reminders, scheduled push notifications and true background checks require a scheduled backend such as Firebase scheduled Functions or another trusted server. Do not treat the static website as able to send reminders while closed.

A scheduled Firebase implementation would need:

- A deployed scheduled Function.
- A Firestore query over `users/{uid}/pages/{pageId}` records.
- A secure mail or push-notification provider.
- Per-user opt-in settings.
- Careful handling so encrypted note contents are never sent to logs or third-party services.

Firebase scheduled Functions may require enabling billing for the Firebase project.