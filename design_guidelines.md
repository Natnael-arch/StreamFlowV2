# StreamFlow Design Guidelines

## Design Approach
**Reference-Based Approach** drawing from:
- **Streaming**: Twitch, YouTube Live (video-first layouts, live indicators, chat interfaces)
- **Payments**: Stripe, Cash App (clean transaction displays, trust signals)
- **Real-time Apps**: Discord, Slack (live status updates, activity feeds)

Core principle: Build trust through clarity while maintaining the energy of live streaming.

## Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, and 8 for consistency (p-2, m-4, gap-6, h-8)

**Page Structure**:
- Dashboard layout with persistent sidebar (w-64) showing active sessions and wallet balance
- Main content area (flex-1) for video player and payment controls
- Fixed bottom bar (h-16) displaying real-time cost accumulation

## Typography Hierarchy
**Font Stack**: 
- Primary: Inter (headers, UI elements) - weights 400, 600, 700
- Monospace: JetBrains Mono (payment amounts, addresses, timers)

**Scale**:
- Hero/Display: text-4xl to text-5xl, font-bold
- Section Headers: text-2xl, font-semibold
- Body/Cards: text-base, font-normal
- Payment Stats: text-lg, font-mono
- Metadata/Labels: text-sm, text-xs for secondary info

## Core Components

### Navigation Header (h-16)
- Logo left with StreamFlow branding
- Wallet connection status right (address truncated with tooltip)
- Live session indicator (pulsing dot + "LIVE" badge when streaming)

### Video Player Card
- 16:9 aspect ratio container with rounded-lg borders
- Overlay controls: play/pause, volume, fullscreen
- Floating payment rate badge (top-right): "0.001 MOVE/sec"
- Status bar below player: creator name, viewer count, session duration

### Payment Control Panel
- Prominent "Start Watching" / "Stop Session" button (w-full, h-12, rounded-lg)
- Real-time cost ticker below button (text-3xl, font-mono, updating each second)
- Session stats grid (2 columns): Total Time, Total Paid, Rate, Session ID

### Session History Table
- Clean table layout with hover states
- Columns: Creator, Duration, Amount Paid, Status, Timestamp
- Status badges: "Active" (pulsing), "Completed", "Stopped"
- Monospace formatting for addresses and amounts

### Sidebar Elements
- Active Sessions list (scrollable, max-h-96)
- Each session: thumbnail + creator + live timer
- Wallet balance card at top (sticky)
- Quick stats: Total Sessions, Total Spent Today

## Interactive States
- Loading: Skeleton screens for session cards
- Empty states: Illustrated messages ("No active sessions", "Connect wallet to start")
- Error toasts: Top-right notifications for payment failures
- Success confirmations: Green checkmark animations on successful settlements

## Responsive Behavior
- Desktop (lg:): Sidebar visible, 2-column payment stats
- Tablet (md:): Collapsible sidebar, stacked stats
- Mobile: Hidden sidebar (hamburger menu), single column layout, sticky payment controls

## Images
**Hero Section** (if landing page needed):
- Full-width hero (h-screen) with gradient overlay
- Background: Streaming-related imagery (content creator setup, live broadcast scene)
- Centered content with blurred-background CTA buttons

**Dashboard**:
- No large hero images
- Small creator avatars (w-10 h-10, rounded-full)
- Placeholder video thumbnails for inactive sessions

**Trust Elements**:
- Movement blockchain logo in footer
- x402 protocol badge
- Privy wallet integration indicator

## Critical Dashboard Layout
```
[Header: Logo | Wallet Status]
[Sidebar] | [Video Player (16:9)]
          | [Payment Controls Panel]
          | [Real-time Cost Display]
          | [Session Stats Grid]
[Footer: Session History Table]
```

Payment ticker updates every second with smooth number transitions. All monetary values use monospace font for readability. Session IDs truncated with copy-to-clipboard functionality.