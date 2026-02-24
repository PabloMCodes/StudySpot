# StudySpot

> Find where you can actually study right now.

StudySpot is a real-time study spot discovery platform for UCF students and nearby Orlando cafés.  
Instead of guessing which places are full, students see a live availability score powered by verified check-ins and time-based trends — plus what others there are studying.

---

## MVP Goal

Build a web app that:

- Displays campus and nearby Orlando study spots on an interactive map
- Allows verified check-ins with study topic tags
- Calculates a live availability score
- Ranks locations by likelihood of finding a seat and personal preference
- Enables lightweight scheduled study sessions
- Allows users to join study sessions and view participant lists
- Allows users to toggle “Open to Study” to connect with others at the same location
- Provides public user profiles
- Allows users to follow other users
- Allows users to save, rate, and write notes about study spots

---

## Core Features

### Interactive Map

- Curated campus and Orlando study spots
- Clickable location cards
- Map view + ranked list view
- Filters:
  - Open now
  - Distance
  - Basic vibe tags (quiet, outlets)
- Optional user location centering

Each location displays:

- Live availability score
- Confidence indicator (High / Moderate / Limited)
- Last updated timestamp
- Upcoming study sessions

---

### Verified Check-Ins

Users can check in and select:

- Busyness level
  - Plenty
  - Filling
  - Packed
- Study topic (optional, e.g., CS, Calc 2, MCAT)
- “Open to Study” toggle (optional)

Check-ins:

- Are location-aware (GPS-based when possible)
- Drive live availability calculations
- Contribute to historical time-of-day patterns
- Expire for live scoring after inactivity
- Are stored long-term for future modeling

---

### Availability Score

Availability is calculated using:

- Active recent check-ins (high weight)
- Time-of-day baseline pattern (medium weight)
- Day-of-week patterns (medium weight)

Each location displays a Confidence Indicator:

- High confidence — dense recent activity
- Moderate confidence
- Limited data

This ensures transparency, especially in low-activity areas.

---

### Study Sessions (Lightweight Social Layer)

Users can create scheduled study sessions at a location:

- Topic
- Start time
- End time
- Maximum participants
- Public visibility

Other users can:

- View upcoming sessions at a location
- See how many participants have joined
- View participant profiles
- Join a session if space is available

Sessions automatically expire after their end time.

No full messaging system is included in the MVP.

---

### User Profiles

Public profiles display:

- Total check-ins
- Most visited study spots
- Most studied topics
- Saved or favorited locations
- Optional ratings
- Optional public notes

Profiles show aggregated data only.

No real-time tracking or live location broadcasting.

---

### Save, Rate, and Personal Notes

Users can:

- Save or favorite study spots
- Add a rating (optional)
- Write a personal note
- Set note visibility:
  - Private
  - Public

Public notes appear only on the user’s profile.

Private notes are visible only to the user.

Notes are not displayed globally on location pages.

---

### Follow System (Level 1 Social)

Users can:

- Follow other users
- View public profiles of users they follow
- See follower and following counts

The follow system does not include:

- Mutual friend approval
- Messaging
- Activity feeds
- Notifications

This keeps the social layer lightweight and focused.

---

## Stretch Goals (If Time Allows)

The following features may be added if development remains on schedule:

- Direct messaging between users
- Full chat system for study sessions
- Friends-only content visibility tier
- Location rating aggregation system
- User-created study spots
- Advanced gamification (badges, streaks, leaderboards)
- AI-powered natural language search
- Advanced ML-based recommendation engine
- Notification system for study sessions

---

## Product Philosophy

StudySpot prioritizes:

- Real human signal over scraped or fabricated data
- Transparency through confidence indicators
- Lightweight social coordination without overcomplication
- Clean, fast UX with minimal friction

The goal is to make answering this question effortless:

“Where should I go to study right now?”

Hello