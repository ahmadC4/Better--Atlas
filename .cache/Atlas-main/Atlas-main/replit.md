# ChatGPT-Like Web App

## Overview
This project is a modern ChatGPT-like web application providing an AI chat interface with a dark-mode-first design, sidebar for chat management, and a central conversation area. It supports multiple AI models and features a full-stack architecture with a React frontend, Express backend, and PostgreSQL for data persistence. Key capabilities include user authentication, a Pro plan for unlimited access, a personalized knowledge base, isolated project workspaces, and advanced AI model features like web search and code interpretation. The vision is to offer a comprehensive and customizable AI interaction platform.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (November 2025)
- **AdminLayout System and User Tabs Population** (Latest): Implemented complete admin dashboard with 12 management cards across both tabs
  - **System Tab Cards**: System Prompts, Output Templates, Tool Policies & Release Notes, Plans & Pricing, AI Agents & Library, Integrations/API Access
  - **User Tab Cards**: User Management, Organizations/Teams, User Plans & Subscriptions, User AI Agents, User Knowledge & Memory, Support/Tickets
  - **Component Updates**: AdminLayout accepts children/systemTabContent/userTabContent props for flexible page rendering
  - **Routing**: /admin route renders DashboardPage inside AdminLayout wrapper
  - **Permission Filtering**: Cards display based on user role and permissions using shared adminRoutes.ts config
  - **Technical**: Uses AdminCard component, icon mapping (Settings, FileText, Key, Bot, etc.), 3-column responsive grid layout
  - **Files Changed**: client/src/components/AdminLayout.tsx, shared/adminRoutes.ts (added API Access system card)
- **Temperature Standardization**: Eliminated "default" terminology from temperature settings
  - **Renamed Constants**: DEFAULT_TEMPERATURE → STANDARD_TEMPERATURE across all AI modules
  - **Renamed Functions**: getDefaultTemperatureForModel() → getModelTemperature()
  - **Updated Variables**: All defaultTemperature → modelTemperature for consistency
  - **Files Changed**: server/ai-models.ts, server/routes.ts, server/ai-service.ts, server/ai-providers.ts
  - **Temperature Values Verified**: Titan-V (0.6), GPT-5/5-mini (1.0), Perplexity (0.2), others (0.7)
- **Admin Dashboard Redesign** (October 2025): Complete overhaul with role-based access control and modular architecture
  - **RBAC Implementation**: Granular permission system with Super Admin, Admin, and User roles
  - **Sidebar Navigation**: Collapsible sidebar with grouped sections (System & Policies, Plans & Features, AI Agents, Access & Integrations)
  - **Modular Pages**: Split monolithic admin.tsx into 12+ separate pages for better maintainability
  - **View-Only Mode**: Admins can view but not edit System Prompts and Tool Policies (Super Admin only)
  - **Backend Security**: Permission-based middleware on all admin routes
  - **Dashboard Overview**: Quick stats and role-specific navigation
  - **Technical**: PERMISSIONS constants, requirePermission middleware, AdminLayout component, breadcrumb navigation
- **Archive Functionality Fix**: Fixed critical bug preventing archived chats from appearing in Settings
  - **Root Cause**: Archived chats query had conditional `enabled` flag that prevented refetching when invalidated
  - **Solution**: Removed enabled condition from query in ProfileSettingsDialog so it refetches when cache is invalidated
  - **Result**: Archived chats now properly appear in Settings → Account → Archived Chats after being archived from sidebar
  - **Technical**: Query invalidation now triggers immediate refetch regardless of dialog state
- **Chat Management Fixes**: Resolved archive and move-to-project functionality
  - **Archive Flow**: Archived chats properly disappear from sidebar and remain accessible in Settings → Account → Archived Chats section
  - **Move to Project**: Chats moved to projects disappear from main sidebar and only appear within their project context
  - **Technical Changes**: Added projectId filtering to getUserChats storage method, updated API endpoint to support projectId query parameter, sidebar fetches only global chats (projectId=null)
  - **ChatGPT-like Experience**: Each project now has its own isolated chat list
- **Profile Data Synchronization Fix**: Resolved field mapping issue
  - **Solution**: Updated schema to correctly map `bio` field to `about_me` database column
  - **Impact**: All profile fields now load/save correctly (name, occupation, bio, custom instructions, profile picture)

## System Architecture

### Frontend Architecture
The frontend is built with React 18, TypeScript, and Vite, using Wouter for routing. TanStack Query manages server state. Styling uses Tailwind CSS with custom CSS variables, complemented by Radix UI and Shadcn/ui for accessible components. The design defaults to dark mode, uses the Inter font, and is fully responsive.

### Backend Architecture
The backend uses Express.js with TypeScript for API endpoints. Drizzle ORM provides type-safe database operations with PostgreSQL. Authentication is email/password-based using Passport Local Strategy and bcrypt. Session management is handled via `connect-pg-simple`. A Pro plan system with access code validation is integrated.

### Data Layer & Schema Design
PostgreSQL is the chosen database, utilizing UUIDs for primary keys. Core entities include Users, Sessions, Chats, Messages, Reactions, Usage Metrics, Knowledge Items, and Projects. JSONB metadata fields offer data flexibility. Drizzle schema defines tables with UUID generation and timestamps, and Zod is used for runtime type validation. The system supports 'free', 'pro', and 'enterprise' user tiers. The `user_preferences` table uses a `bio` field that maps to the `about_me` database column.

### AI Integration Architecture
The application integrates with Anthropic SDK for Claude models, and supports OpenAI, Groq, and Perplexity APIs, including streaming responses.
- **Web Search**: Automatically invoked via function calling for OpenAI, native pipelines for Perplexity Sonar, and Tavily for Titan-V.
- **Thinking Mode**: Fully implemented for Anthropic Claude; Titan-V and Perplexity Sonar have auto-enabled multi-step reasoning/deep research.
- **Deep Voyage Mode (Perplexity)**: Enhances system prompts for Perplexity Sonar Deep Research, adds `search_recency_filter` and `return_citations`, and appends source citations.
- **Code Interpreter**: Uses native E2B sandboxed Python execution for Titan-V and tool-based execution with Pyodide (WebAssembly Python sandbox) for OpenAI and Anthropic Claude.
- **Titan-V Models**: Offers advanced AI systems with autonomous web search (Tavily) and code execution (E2B sandbox).
- **Feature Controls**: Deep Voyage is user-toggleable; web search and code execution activate automatically for models that support those tools.

### Authentication & Authorization
Uses Email/Password Authentication with Passport Local Strategy, including registration, login, logout, and a forgot password flow. Session management uses HTTP-only secure cookies with PostgreSQL storage. Passwords are hashed with bcrypt. A Pro Plan System manages access and features based on user subscription.

**Role-Based Access Control (RBAC)**:
- **Super Admin**: `austin@c4saas.com` is automatically promoted to super_admin with full administrative privileges. Displays "Super Admin" badge (purple).
- **Admin**: First user is auto-promoted if no super admin exists. Limited admin access with view-only restrictions on core system settings.
- **User**: Default role for regular users with no admin access.

**RBAC Permission Matrix**:

| Feature Category | Super Admin | Admin | User |
|-----------------|-------------|-------|------|
| **System & Policies** |
| System Prompts | Edit | View Only | No Access |
| Output Templates | Edit | View Only | No Access |
| Tool Policies & Releases | Edit | View Only | No Access |
| **Plans & Features** |
| Plans & Models | Edit | Edit | No Access |
| Knowledge Base Settings | Edit | Edit | No Access |
| Memory Settings | Edit | Edit | No Access |
| Templates & Projects Settings | Edit | Edit | No Access |
| **AI Agents** |
| Manage Agents | Edit | Edit | No Access |
| Expert Library | Edit | Edit | No Access |
| **Access & Integrations** |
| API Access (Keys) | Edit | No Access | No Access |
| Access Codes | Edit | Edit | No Access |
| User Management | Edit | Edit | No Access |

**Permission Enforcement**:
- **Backend**: Permission-based middleware (`requirePermission`) validates access on all admin API routes
- **Frontend**: Navigation items filtered by role, edit controls disabled for view-only access
- **View-Only Mode**: Admins see "View Only" badges and disabled inputs on restricted pages

### User Profile System
Includes profile picture upload (base64-encoded) and account information management within settings, covering subscription status and plan options.

### Speech-to-Text Feature
Integrates Groq Whisper via a `/api/transcribe` endpoint for accurate audio transcription. The frontend uses MediaRecorder API for browser-based audio recording, with security measures like authentication and size limits.

### Knowledge Base System
Allows users to upload files (PDF, DOC/DOCX, TXT), fetch content from URLs, or add text notes to create a personalized knowledge base. This content is stored in a `knowledge_items` table and is automatically injected into AI system prompts for context.

### Projects System
Provides isolated workspaces with their own knowledge base, custom instructions, and chat context. Supports chat management (moving chats), shareable links, and project settings. Knowledge and instructions are project-specific when a `projectId` is present. Security ensures ownership verification and UUID-based share tokens for read-only access.

## External Dependencies

### Core Framework Dependencies
- React 18, Express.js, TypeScript, Vite.

### Database & ORM
- @neondatabase/serverless, Drizzle ORM, Drizzle Kit, connect-pg-simple.

### UI Framework & Components
- @radix-ui/, Tailwind CSS, class-variance-authority, clsx, tailwind-merge.

### AI & External Services
- @anthropic-ai/sdk, groq-sdk (for Whisper), OpenAI API, Perplexity API.

### State Management & Data Fetching
- @tanstack/react-query, React Hook Form, @hookform/resolvers, Zod.

### Authentication & Security
- Passport.js with passport-local, bcryptjs.

### Additional Utilities
- date-fns, nanoid, cmdk, Wouter.