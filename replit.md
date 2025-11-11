# ChatGPT-Like Web App

## Overview
This project is a modern ChatGPT-like web application providing an AI chat interface with a dark-mode-first design, sidebar for chat management, and a central conversation area. It supports multiple AI models and features a full-stack architecture with a React frontend, Express backend, and PostgreSQL for data persistence. Key capabilities include user authentication, a Pro plan for unlimited access, a personalized knowledge base, isolated project workspaces, and advanced AI model features like web search and code interpretation. The vision is to offer a comprehensive and customizable AI interaction platform.

## Recent Changes
### October 20, 2025 - Production Deployment Optimization
Fixed all deployment issues preventing successful Autoscale deployments:
- **Fast Startup**: Server now listens on port 5000 immediately (critical for Autoscale health checks), then runs expensive initialization (migrations, DB verification, release setup) in background
- **Production Migrations**: Removed REPLIT_DEPLOYMENT skip - migrations now run in production to ensure database schema is initialized
- **Health Check Endpoint**: Added `/health` endpoint that responds immediately with initialization status (initializing/ok/error)
- **Duplicate Method Removal**: Fixed duplicate getUserTeams method in server/storage/index.ts that caused build warnings
- **Startup Sequence**: Background initialization completes in ~6 seconds while server is already accepting requests
- **Result**: Deployments now pass health checks and start successfully in production

### October 20, 2025 - Production Deployment Database Fix
Fixed database connection issues for production deployments:
- **Issue**: App crashed in production with "getaddrinfo EAI_AGAIN helium" error because DATABASE_URL pointed to local development database hostname
- **Root Cause**: Neon serverless driver required WebSocket connections incompatible with Replit's PostgreSQL database
- **Driver Migration**: Switched from `@neondatabase/serverless` to standard `pg` (node-postgres) driver for compatibility with Replit's PostgreSQL
- **Production URL Handling**: Updated db.ts to check `/tmp/replitdb` file first (where Replit stores production DATABASE_URL), then fall back to environment variable
- **SSL Configuration**: Added automatic SSL detection based on connection string (enables SSL for Neon databases, disables for local Replit database)
- **Migration System**: Updated migrations.ts to use `drizzle-orm/node-postgres/migrator` instead of neon-serverless migrator
- **Result**: Application now works seamlessly in both development (local Replit database) and production (any PostgreSQL database including Neon)

### October 19, 2025 - Critical TDZ Error Fix
Fixed critical "Cannot access uninitialized variable" error preventing user-side app from loading:
- **Root Cause**: The scrollMessagesToBottom function was being used in useEffect hooks but created a closure that captured the `messages` variable
- **Issue**: useEffect with empty dependency array used stale closure, causing TDZ error when messages wasn't initialized
- **Solution**: Wrapped scrollMessagesToBottom in useCallback hook with proper dependencies [messages, pendingUserMessage, streamingAssistantMessage]
- **Impact**: Added scrollMessagesToBottom to dependency arrays of all useEffects that use it
- **Result**: Login page now loads successfully without errors, app is fully functional

### October 18, 2025 - Deployment Fix (Duplicate Code Removal)
Fixed critical deployment errors caused by duplicate code declarations:
- **Duplicate Variable**: Removed duplicate 'plan' variable declaration in server/routes.ts line 3986
- **Duplicate Methods in storage/index.ts**: Removed duplicate method implementations:
  - normalizeIdList (removed memory version, kept database-optimized version)
  - listProCoupons, createProCoupon, updateProCoupon, deleteProCoupon (removed memory storage versions)
  - getProCouponByCode, getProCouponRedemption, createProCouponRedemption (removed memory duplicates)
  - incrementProCouponRedemption, deleteProCouponRedemption (removed second implementations)
- **Result**: Server now starts successfully, migrations apply cleanly, all database operations use PostgreSQL (not in-memory Maps)

### October 18, 2025 - PlansPage Database Migration
Completely refactored Plan Management UI from platform_settings to database-driven system:
- **New Implementation**: PlansPage.tsx now uses /api/admin/plans API (removed 350+ lines of legacy code)
- **Dynamic Rendering**: Plans load from database - not hardcoded to Free/Pro/Enterprise
- **Individual Draft State**: Each plan has its own save button and draft tracking
- **Database Fields**: Maps dailyMessageLimit, maxFileSizeMb, storageQuotaGb, modelsAllowed, feature flags to UI controls
- **Safety Guards**: Added null checks to prevent crashes during initial data loading
- **Empty Models Logic**: UI correctly displays "All models" when modelsAllowed array is empty

### October 18, 2025 - Dynamic Plan System Migration
Migrated from hardcoded platform_settings to database-driven plan management:
- **Backend Integration**: Updated auth-service getUserLimits and getEffectiveCapabilities to read plan configuration from plans table instead of hardcoded platform_settings.planTiers
- **User Plan Assignment**: Modified PATCH /api/admin/users/:id/plan to set both planId (foreign key) and plan (legacy slug) fields for backward compatibility
- **Empty Allowlists Rule**: Empty modelsAllowed arrays ([]) now correctly expand to "all models allowed" instead of denying access
- **Plan Slug Normalization**: Plan names are converted to lowercase slugs ('Free' → 'free', 'Pro' → 'pro', 'Enterprise' → 'enterprise') to maintain compatibility with legacy requireProPlan checks
- **UI Updates**: Updated UsersPage.tsx to fetch plan options from /api/admin/plans API with robust slug generation for multi-word plan names
- **Architecture Pattern**: Established flow: Plans table (source of truth) → getUserLimits → Effective Capabilities API → UI components

### October 18, 2025 - Login TDZ Error Fix
Fixed critical "Cannot access uninitialized variable" error in Chat.tsx blocking login:
- **Root Cause**: scrollMessagesToBottom function referenced `messages` on line 114, but `messages` wasn't declared until line 303
- **Temporal Dead Zone (TDZ)**: JavaScript prevents access to variables before their declaration in the same scope
- **Solution**: Moved scrollMessagesToBottom function definition to line 283, immediately after the messages useQuery declaration
- **Result**: Users can now successfully login and access chat without runtime errors
- **Additional Fixes**:
  - Fixed apiRequest signature usage throughout the application (correct order: method, url, data)
  - Added proper Message[] typing to messages query to prevent 'unknown' type errors
  - Corrected capabilities references from non-existent `capabilities.models.allowed` to `capabilities.allowlists.models`
  - Updated plan type support to include 'enterprise' tier alongside 'free' and 'pro'
  - Added proper typing to modelsApiData query and fixed provider comparison logic
  - Added attachments field to userMessage object to match Message schema requirements
  - Fixed use-effective-capabilities hook to properly parse API response with .json() call

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18, TypeScript, and Vite, using Wouter for routing. TanStack Query manages server state. Styling uses Tailwind CSS with custom CSS variables, complemented by Radix UI and Shadcn/ui for accessible components. The design defaults to dark mode, uses the Inter font, and is fully responsive.

### Backend Architecture
The backend uses Express.js with TypeScript for API endpoints. Drizzle ORM provides type-safe database operations with PostgreSQL. Authentication is email/password-based using Passport Local Strategy and bcrypt. Session management is handled via `connect-pg-simple`. A Pro plan system with access code validation is integrated.

### Data Layer & Schema Design
PostgreSQL is the chosen database, utilizing UUIDs for primary keys. Core entities include Users, Sessions, Chats, Messages, Reactions, Usage Metrics, Knowledge Items, Projects, and **Plans**. JSONB metadata fields offer data flexibility. Drizzle schema defines tables with UUID generation and timestamps, and Zod is used for runtime type validation.

**Plan System Architecture:**
- **Plans Table**: Database-driven plan configuration storing Free, Pro, and Enterprise tiers with feature flags (allowExperts, allowTemplates, allowModels, etc.), limits (dailyMessageLimit, maxFileSizeMb, storageQuotaGb), and allowlists (modelsAllowed, expertsAllowed, templatesAllowed)
- **Dual Field System**: Users have both `plan` (text field storing lowercase slug for backward compatibility) and `planId` (foreign key to plans table) - both kept in sync during assignment
- **Empty Allowlists Rule**: Empty arrays in modelsAllowed/expertsAllowed/templatesAllowed fields mean "allow all" not "deny all"
- **CRUD API**: Super Admins can manage plans via /api/admin/plans endpoints (GET, POST, PATCH, DELETE)
- The `user_preferences` table uses a `bio` field that maps to the `about_me` database column.

### AI Integration Architecture
The application integrates with Anthropic SDK for Claude models, and supports OpenAI, Groq, and Perplexity APIs, including streaming responses. Features include automatic web search (OpenAI, Perplexity Sonar, Tavily for Titan-V), "Thinking Mode" for multi-step reasoning, "Deep Voyage Mode" for Perplexity Sonar, and Code Interpreter using E2B sandboxed Python execution for Titan-V and Pyodide for OpenAI/Anthropic.

### Authentication & Authorization
Uses Email/Password Authentication with Passport Local Strategy, including registration, login, logout, and a forgot password flow. Session management uses HTTP-only secure cookies with PostgreSQL storage. Passwords are hashed with bcrypt.

**Dynamic Plan System:**
- Plans are stored in the database (plans table) as the single source of truth
- AuthService.getUserLimits() queries the user's linked plan and maps fields to expected limit structure
- AuthService.getEffectiveCapabilities() builds capabilities from database plan configuration, expanding empty allowlists to full catalogs
- The /api/auth/effective-capabilities endpoint serves as the centralized API consumed by all UI components for feature gating
- Plan assignment updates both planId (new foreign key) and plan (legacy slug) fields for backward compatibility with existing requireProPlan guards

**Role-Based Access Control (RBAC):**
- Three-tier system: Super Admin, Admin, and User roles
- Super Admins can manage plans, configure platform settings, and assign any plan tier to users
- Admins can manage users and teams within their permissions
- Enforcement via backend middleware and frontend navigation filtering

### User Profile System
Includes profile picture upload (base64-encoded) and account information management within settings, covering subscription status and plan options.

### Speech-to-Text Feature
Integrates Groq Whisper via a `/api/transcribe` endpoint for accurate audio transcription, using MediaRecorder API for browser-based audio recording with security measures.

### Knowledge Base System
Allows users to upload files (PDF, DOC/DOCX, TXT), fetch content from URLs, or add text notes to create a personalized knowledge base, injected into AI system prompts for context.

### Projects System
Provides isolated workspaces with their own knowledge base, custom instructions, and chat context. Supports chat management, shareable links, and project settings, ensuring ownership verification and UUID-based share tokens.

### Teams & Collaboration System (Enterprise Only)
Exclusive to Enterprise plan users, the Teams feature enables organizational collaboration with comprehensive team management capabilities. Teams can create multiple teams (configurable limit per organization), invite members via email, and manage permissions with a three-tier role system (Owner, Admin, Member). Email invitations are sent through GoHighLevel integration with secure token-based acceptance flow. Admin dashboard controls include configurable team limits (max teams per organization and max members per team) enforced throughout the backend. The system includes full CRUD operations for teams, member management with role-based permissions, and real-time usage tracking vs admin-configured limits.

## External Dependencies

### Core Framework Dependencies
- React 18, Express.js, TypeScript, Vite.

### Database & ORM
- pg (node-postgres), Drizzle ORM, Drizzle Kit, connect-pg-simple.

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