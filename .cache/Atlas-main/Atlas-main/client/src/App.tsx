import { Switch, Route, useLocation } from "wouter";
import { useEffect, type ComponentType } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Chat } from "@/components/Chat";
import UsagePage from "@/pages/usage";
import GoogleDrivePage from "@/pages/google-drive";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import AdminLogin from "@/pages/admin-login";
import { useAuth } from "@/hooks/useAuth";
import ExpertsDirectoryPage from "@/pages/experts";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AdminLayout } from "@/components/AdminLayout";
import DashboardPage from "@/pages/admin/DashboardPage";
import SystemPromptsPage from "@/pages/admin/SystemPromptsPage";
import OutputTemplatesPage from "@/pages/admin/OutputTemplatesPage";
import ToolPoliciesPage from "@/pages/admin/ToolPoliciesPage";
import PlansPage from "@/pages/admin/PlansPage";
import KnowledgeBasePage from "@/pages/admin/KnowledgeBasePage";
import MemoryPage from "@/pages/admin/MemoryPage";
import TemplatesProjectsPage from "@/pages/admin/TemplatesProjectsPage";
import AgentsPage from "@/pages/admin/AgentsPage";
import AdminExpertsPage from "@/pages/admin/ExpertsPage";
import APIAccessPage from "@/pages/admin/APIAccessPage";
import AccessCodesPage from "@/pages/admin/AccessCodesPage";
import UsersPage from "@/pages/admin/UsersPage";
import OrganizationsPage from "@/pages/admin/OrganizationsPage";
import TicketsPage from "@/pages/admin/TicketsPage";

type AdminRouteSlot = "system" | "user";

export interface AdminPageRoute {
  path: string;
  slot: AdminRouteSlot;
  Component: ComponentType;
  initialTab?: "system" | "user";
}

export const ADMIN_PAGE_ROUTES: AdminPageRoute[] = [
  { path: "/admin/system-prompts", slot: "system", Component: SystemPromptsPage },
  { path: "/admin/output-templates", slot: "system", Component: OutputTemplatesPage },
  { path: "/admin/tool-policies", slot: "system", Component: ToolPoliciesPage },
  { path: "/admin/plans", slot: "system", Component: PlansPage },
  { path: "/admin/knowledge-base", slot: "system", Component: KnowledgeBasePage },
  { path: "/admin/memory", slot: "system", Component: MemoryPage },
  { path: "/admin/templates-projects", slot: "system", Component: TemplatesProjectsPage },
  { path: "/admin/agents", slot: "system", Component: AgentsPage },
  { path: "/admin/experts", slot: "system", Component: AdminExpertsPage },
  { path: "/admin/api-access", slot: "system", Component: APIAccessPage },
  { path: "/admin/access-codes", slot: "system", Component: AccessCodesPage },
  { path: "/admin/users", slot: "user", Component: UsersPage, initialTab: "user" },
  { path: "/admin/orgs", slot: "user", Component: OrganizationsPage, initialTab: "user" },
  { path: "/admin/tickets", slot: "user", Component: TicketsPage, initialTab: "user" },
];

function AdminRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/app");
  }, [setLocation]);

  return null;
}

function UserHomeRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/app");
  }, [setLocation]);

  return null;
}

function Router() {
  const { isAuthenticated, isLoading, error, isAdmin } = useAuth();
  
  // Show loading screen only during initial authentication check
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  // If there's an error or user is not authenticated, show public routes
  if (!isAuthenticated || error) {
    return (
      <Switch>
        <Route path="/" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/admin-login" component={AdminLogin} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Show authenticated routes
  return (
    <Switch>
      <Route path="/app" component={Chat} />
      <Route path="/usage" component={UsagePage} />
      <Route path="/experts" component={ExpertsDirectoryPage} />
      <Route path="/google-drive" component={GoogleDrivePage} />

      {/* Admin Routes - Render shared tabbed layout */}
      <Route path="/admin">
        {isAdmin ? (
          <AdminLayout>
            <DashboardPage />
          </AdminLayout>
        ) : (
          <AdminRedirect />
        )}
      </Route>
      {ADMIN_PAGE_ROUTES.map(({ path, slot, Component, initialTab }) => (
        <Route key={path} path={path}>
          {isAdmin ? (
            slot === "system" ? (
              <AdminLayout systemTabContent={<Component />} initialTab={initialTab} />
            ) : (
              <AdminLayout userTabContent={<Component />} initialTab={initialTab} />
            )
          ) : (
            <AdminRedirect />
          )}
        </Route>
      ))}

      <Route path="/" component={UserHomeRedirect} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider defaultTheme="light">
            <Toaster />
            <Router />
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
