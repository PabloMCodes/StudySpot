# StudySpot

> Find where you can actually study right now.

StudySpot is a real-time study spot discovery platform for UCF students and nearby Orlando cafés.  
Instead of guessing which places are full, students see a live availability score powered by verified check-ins and time-based trends — plus what others there are studying.

---

# StudySpot

StudySpot helps students know **where they can study before they waste time walking there.**

Launching open to all of Orlando, with early density focus around the University of Central Florida (UCF).

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
- Provides public profiles showing most visited study spots and most studied topics

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

- **Busyness level**
  - Plenty
  - Filling
  - Packed
- **Study topic** (optional, e.g., CS, Calc 2, MCAT)
- **“Open to Study” toggle** (optional)

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

Each location also displays a **Confidence Indicator**:

- 🟢 **High confidence** — dense recent activity
- 🟡 **Moderate confidence**
- ⚪ **Limited data**

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

> Note: No full messaging system is included in the MVP.

---

### User Profiles

Public profiles display:

- Total check-ins
- Most visited study spots
- Most studied topics

Profiles show aggregated data only.

No real-time tracking or live location broadcasting.

---

## Stretch Goals (If Time Allows)

The following features may be added if development remains on schedule:

- Direct messaging between users
- Full chat system for study sessions
- Saving favorite locations
- Location rating system
- User-created study spots
- Advanced gamification (badges, streaks, leaderboards)
- AI-powered natural language search (“What environment do you want?”)
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

> **“Where should I go to study right now?”**

