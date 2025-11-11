import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Chat } from "@/components/Chat";
import UsagePage from "@/pages/usage";
import GoogleDrivePage from "@/pages/google-drive";
import TeamsPage from "@/pages/teams";
import TeamInvitationPage from "@/pages/team-invitation";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import AdminLogin from "@/pages/admin-login";
import { useAuth } from "@/hooks/useAuth";
import DashboardPage from "@/pages/admin/DashboardPage";
import ExpertsPage from "@/pages/experts";
import TemplatesPage from "@/pages/templates";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AdminLayout } from "@/components/AdminLayout";
import SystemPromptsPage from "@/pages/admin/SystemPromptsPage";
import OutputTemplatesPage from "@/pages/admin/OutputTemplatesPage";
import ToolPoliciesPage from "@/pages/admin/ToolPoliciesPage";
import ModelsPage from "@/pages/admin/ModelsPage";
import { PlansManagementPage } from "@/pages/admin/PlansManagementPage";
import PricingPage from "@/pages/pricing";
import KnowledgeBase from "@/pages/KnowledgeBase";
import KnowledgeBasePage from "@/pages/admin/KnowledgeBasePage";
import MemoryPage from "@/pages/admin/MemoryPage";
import TemplatesProjectsPage from "@/pages/admin/TemplatesProjectsPage";
import AgentsPage from "@/pages/admin/AgentsPage";
import ExpertsAdminPage from "@/pages/admin/ExpertsPage";
import APIAccessPage from "@/pages/admin/APIAccessPage";
import AccessCodesPage from "@/pages/admin/AccessCodesPage";
import UsersPage from "@/pages/admin/UsersPage";
import AnalyticsPage from "@/pages/admin/AnalyticsPage";

const ADMIN_ROUTES = [
  { path: "/admin", Component: DashboardPage },
  { path: "/admin/system-prompts", Component: SystemPromptsPage },
  { path: "/admin/output-templates", Component: OutputTemplatesPage },
  { path: "/admin/tool-policies", Component: ToolPoliciesPage },
  { path: "/admin/models", Component: ModelsPage },
  { path: "/admin/plans", Component: PlansManagementPage },
  { path: "/admin/pricing", Component: PricingPage },
  { path: "/admin/knowledge-base", Component: KnowledgeBasePage },
  { path: "/admin/memory", Component: MemoryPage },
  { path: "/admin/templates-projects", Component: TemplatesProjectsPage },
  { path: "/admin/agents", Component: AgentsPage },
  { path: "/admin/experts", Component: ExpertsAdminPage },
  { path: "/admin/api-access", Component: APIAccessPage },
  { path: "/admin/access-codes", Component: AccessCodesPage },
  { path: "/admin/users", Component: UsersPage },
  { path: "/admin/analytics", Component: AnalyticsPage },
] as const;

function AdminRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/");
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
      <Route path="/" component={Chat} />
      <Route path="/usage" component={UsagePage} />
      <Route path="/experts" component={ExpertsPage} />
      <Route path="/templates" component={TemplatesPage} />
      <Route path="/knowledge" component={KnowledgeBase} />
      <Route path="/teams" component={TeamsPage} />
      <Route path="/team-invitation" component={TeamInvitationPage} />
      <Route path="/google-drive" component={GoogleDrivePage} />
      
      {/* Admin Routes - Wrapped in AdminLayout */}
      {ADMIN_ROUTES.map(({ path, Component }) => (
        <Route key={path} path={path}>
          {isAdmin ? (
            <AdminLayout>
              <Component />
            </AdminLayout>
          ) : (
            <AdminRedirect />
          )}
        </Route>
      ))}
      
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
