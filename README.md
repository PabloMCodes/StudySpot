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
- Enables lightweight open study groups
- Allows users to connect with eachother through messages or requests to join their study session.
- Students can rate and save favorite locations
- Students can see eachothers profiles to see most visited study spots or most common study topics, etc.
- Allow users to be able to create their own study spots
- AI prompting to search "What do you want your environment to be"
---

## Core Features

### Interactive Map

- Curated campus and Orlando study spots  
- Clickable location cards  
- Live availability score  
- Current heat level and top study tags  

---

### Verified Check-Ins

Users can check in and select:

- Study topic (e.g., CS, Calc 2, MCAT)  
- Vibe (Quiet / Collaborative)  

Check-ins:

- Are GPS-verified  
- Drive heat levels and topic clustering  
- Expire after inactivity  

---

### Availability Score

Calculated using:

- Active check-ins (high weight)  
- Manual crowd reports (medium weight)  
- Historical time-of-day patterns (medium weight)  
