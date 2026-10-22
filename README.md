# UTM DeepTech Website

Inventory management and member portal for UTM DeepTech, the underwater robotics club at UTM.

Live site: https://utm-deeptech.web.app

## Tech stack

- Vanilla HTML / CSS / JavaScript (no framework)
- Firebase Auth (Google sign-in)
- Firestore (database)
- Firebase Hosting (deployment)

## Features

- Public-facing inventory view (no login required)
- Google sign-in for members
- Role-based access (admin / lead / member)
- Department-scoped editing (leads can only edit their own department)
- Append-only change history per item (used / lost / broken / borrowed / returned / purchased)

## Project structure

```
deeptech-website/
├── public/              # Website files served by Firebase Hosting
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── firestore.rules      # Database security rules
├── firestore.indexes.json
└── firebase.json
```

## Local development

You need Node.js 18+ and the Firebase CLI installed.

```bash
# Install Firebase CLI (one-time)
npm install -g firebase-tools

# Login
firebase login

# Run locally
firebase serve
```

Open `http://localhost:5000` in your browser.

## Deploying

```bash
firebase deploy
```

This pushes both the website files and the security rules. To deploy only one:

```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

## Roles

User roles are stored in the `users` collection in Firestore. To change a role, edit the document directly in the Firebase console.

| Role | Permissions |
|------|-------------|
| `member` | View inventory and history (default) |
| `lead` | Edit items in their assigned department only |
| `admin` | Full access — edit anything, manage roles |

When a user signs in for the first time, they're automatically created as a `member`.

## Adding new admins

1. Have the new admin sign in once on the site (creates their user record)
2. Open Firebase Console → Firestore → `users` collection
3. Find their email, change `role` to `admin`, save

## Contributing

1. Clone the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make changes and test locally with `firebase serve`
4. Commit and push, then open a pull request
