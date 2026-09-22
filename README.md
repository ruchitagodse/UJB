# UJB Karma CRM

A full-stack CRM and community platform built with **Next.js 16, React 19 and Firebase** for managing member networking, referrals, financial workflows, prospects, events, content and community operations.

## 🌐 Overview

The platform provides separate workspaces for members and administrators while exposing authenticated API workflows for the application's business operations.

### Member Portal

- Member profiles
- CosmoOrbiters directory
- Referrals and deals
- Wallet and withdrawals
- Contribution points
- Redemption requests
- Prospects
- Monthly meetings
- Conclaves
- Dewdrop content
- Payments
- Notifications
- Network activity

### Admin Portal

- User and role management
- Referrals and payouts
- Accounts, invoices and wallets
- Withdrawals
- Prospects and journeys
- Events and registrations
- Content management
- Birthdays
- Festival WhatsApp campaigns
- Contribution points
- Tasks
- Onboarding configuration

### Public Workflows

Public/shareable prospect-action pages support:

- Feedback
- Notes
- Completion actions
- Thank-you journeys

## 🛠️ Tech Stack

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Sass / SCSS

### Backend

- Next.js API Route Handlers
- Firebase Admin SDK
- Firebase Firestore
- Firebase Storage

### Authentication

- WhatsApp OTP authentication for members
- Signed session cookies
- Firebase-based admin authentication
- Role-based authorization
- Protected API access

### Integrations

- WhatsApp APIs
- EmailJS
- OpenAI (optional)
- Firebase scheduled functions

## 🏗️ Architecture

The application follows an API-first approach:

```text
Protected UI
     ↓
Authenticated API
     ↓
Feature Workflows
     ↓
Repository Layer
     ↓
Firebase
