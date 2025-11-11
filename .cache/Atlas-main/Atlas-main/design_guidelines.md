# Atlas AI - Horizon UI Design Guidelines

## Design Approach
**Design System Approach**: Following Horizon UI design principles for a cohesive, professional AI chat application. Prioritizes functional efficiency, visual consistency, and seamless user experience across multiple AI model providers.

## Core Design Elements

### A. Color Palette
**Dark Mode Primary** (recommended default):
- Background: 225 15% 8% (deep indigo-black)
- Secondary background: 225 15% 12% (elevated panels)
- Card backgrounds: 225 15% 10% (subtle elevation)
- Text primary: 210 40% 98% (near white)
- Text secondary: 225 10% 65% (muted gray)
- Brand primary: 225 83% 53% (deep indigo)
- Brand secondary: 225 83% 47% (darker indigo for hover states)

**Light Mode**:
- Background: 0 0% 100% (pure white)
- Secondary background: 225 25% 97% (very light indigo tint)
- Card backgrounds: 0 0% 100% (white with shadows)
- Text primary: 225 15% 15% (deep indigo-gray)
- Text secondary: 225 10% 45% (medium gray)
- Brand primary: 225 83% 53% (consistent indigo)

### B. Typography
- **Primary**: DM Sans (Google Fonts) for all body text, UI elements, and chat content
- **Headings**: Poppins (Google Fonts) for section headers, model names, and emphasis
- **Monospace**: JetBrains Mono for code blocks and technical content
- **Sizes**: text-sm (secondary), text-base (primary), text-lg (headers), text-xl (page titles)

### C. Layout System
**Spacing**: Horizon UI 4px grid system using Tailwind units of 1, 2, 3, 4, 6, 8
- Base spacing: 4px increments (p-1, p-2, p-3, p-4)
- Component spacing: p-4 for cards, p-6 for major sections
- Layout gaps: gap-4 for component groups, gap-6 for section separation

**Radius**: Consistent 12px radius (rounded-xl) for all components including cards, buttons, inputs, and panels

### D. Component Library

**Left Sidebar** (280px desktop):
- Horizon card styling with subtle shadows
- New Chat button: Primary indigo background, prominent placement
- Chat history: Grouped by date with hover states
- Model provider sections: Collapsible groups for OpenAI, Anthropic, Groq, Perplexity
- Bottom profile area: User settings and preferences

**Top Navigation Bar**:
- Clean header with Horizon shadow system
- Model selector: Dropdown with provider logos and model names (GPT-4, Claude, Llama, etc.)
- Current chat title with breadcrumb navigation
- Theme toggle and settings access

**Chat Interface**:
- Horizon card containers for message grouping
- User messages: Right-aligned with primary indigo background
- AI responses: Left-aligned with secondary background cards
- Message actions: Copy, regenerate, edit on hover
- Input area: Horizon input styling with attachment button

**Responsive Behavior**:
- Desktop: Three-column layout (sidebar, chat, optional info panel)
- Tablet: Collapsible sidebar with overlay
- Mobile: Single column with hamburger menu sidebar

### E. Visual Effects
**Horizon Shadow System**:
- Card shadows: Subtle elevation for depth hierarchy
- Button shadows: Interactive feedback on hover/active
- Modal overlays: Proper backdrop blur and shadow stacking

**State Management**:
- Hover states: Subtle background color shifts
- Focus states: Indigo ring with proper contrast
- Loading states: Skeleton screens and progress indicators
- Error states: Subtle red accent with clear messaging

## Key UI Patterns

**Model Provider Integration**:
- Provider-specific color coding in sidebar organization
- Model availability indicators and performance metrics
- Seamless switching between providers mid-conversation

**Conversation Management**:
- Smart chat categorization and search
- Export/import conversation functionality
- Template management for common prompts

**Accessibility Features**:
- WCAG AA compliance with proper contrast ratios
- Keyboard navigation throughout entire interface
- Screen reader optimization for chat flow
- Reduced motion preferences support

## Professional Polish
- Consistent Horizon UI component styling across all elements
- Smooth micro-interactions following Horizon animation principles
- Clean visual hierarchy with proper spacing and typography scale
- Context-aware help and onboarding flows

This design maintains Horizon UI's sophisticated, professional aesthetic while optimizing for AI chat functionality and multi-provider workflows. The deep indigo brand creates trust and reliability essential for AI tools.