# StudySpot
Find study spots lol.

> Find where you can actually study right now.

StudySpot helps students see real-time availability of study locations around UCF and nearby Orlando cafés. Instead of guessing which places are full, users see a probability score based on recent student updates and time-based trends.

---

## MVP Goal

Build a web app that:

- Shows study spots on a map  
- Lets students submit crowd status  
- Calculates a live availability score  
- Ranks locations by likelihood of finding a seat  

---

## Tech Stack

**Frontend**
- Next.js (React + TypeScript)
- Tailwind CSS
- Mapbox or Google Maps API

**Backend**
- FastAPI (Python)

**Database**
- PostgreSQL (Supabase / Neon)

**Hosting**
- Vercel (frontend)
- Railway / Render (backend)

---

## 🧠 Core Features (MVP)

### 1. Interactive Map
- Display curated study spots
- Clickable location cards
- Show availability score

### 2. Crowd Report Submission
Users can submit:
- Plenty of seats
- Filling
- Packed

Reports are timestamped and decay over time.

### 3. Availability Score
Calculated using:
- Recent reports (high weight)
- Historical time-of-day patterns (medium weight)

Example output:
Seat Probability: 72%

### 4. Filters
- Quiet
- Has outlets
- Open now

---

## Basic Database Structure

**study_spots**
- id
- name
- lat
- lng
- has_outlets
- quiet_rating

**crowd_reports**
- id
- study_spot_id
- status
- created_at

---

## Mission

Help students know where they can study before they waste time walking there.
