import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const adminLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const adminEnrollSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Include at least one uppercase letter")
    .regex(/[a-z]/, "Include at least one lowercase letter")
    .regex(/[0-9]/, "Include at least one number"),
  temporaryPassword: z.string().min(1, "Temporary password is required"),
});

type AdminLoginFormData = z.infer<typeof adminLoginSchema>;
type AdminEnrollFormData = z.infer<typeof adminEnrollSchema>;

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrollmentSubmitting, setIsEnrollmentSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginFormData>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const {
    register: registerEnrollment,
    handleSubmit: handleEnrollmentSubmit,
    reset: resetEnrollmentForm,
    formState: { errors: enrollmentErrors },
  } = useForm<AdminEnrollFormData>({
    resolver: zodResolver(adminEnrollSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      password: "",
      temporaryPassword: "",
    },
  });

  const onSubmit = async (data: AdminLoginFormData) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/login", {
        identifier: data.email,
        password: data.password,
      });
      const result = (await response.json()) as { user?: { role?: string } };

      if (result.user?.role !== "admin" && result.user?.role !== "super_admin") {
        try {
          await apiRequest("POST", "/api/auth/logout");
        } catch (logoutError) {
          console.error("Failed to clear non-admin session after admin login attempt:", logoutError);
        }

        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

        toast({
          title: "Access denied",
          description: "This portal is restricted to Atlas AI administrators.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Welcome back",
        description: "You have successfully signed in as an administrator.",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/admin");
    } catch (error) {
      console.error("Admin login error:", error);
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Unable to sign in. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onEnroll = async (data: AdminEnrollFormData) => {
    setIsEnrollmentSubmitting(true);
    try {
      const response = await apiRequest("POST", "/api/auth/admin/enroll", data);
      const result = (await response.json()) as { message?: string };
      toast({
        title: "Administrator access ready",
        description: result.message ?? "Your administrator credentials have been saved. You can sign in now.",
      });
      resetEnrollmentForm();
    } catch (error) {
      console.error("Admin enrollment error:", error);
      toast({
        title: "Enrollment failed",
        description: error instanceof Error ? error.message : "Unable to process the enrollment request.",
        variant: "destructive",
      });
    } finally {
      setIsEnrollmentSubmitting(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-background/95 p-4"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="mb-4 flex items-center justify-center">
            <Shield className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">Atlas AI Admin</CardTitle>
          <CardDescription className="text-center">
            Sign in with your administrator credentials to manage the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                data-testid="input-admin-email"
                {...register("email")}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                data-testid="input-admin-password"
                {...register("password")}
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-admin-login-submit">
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="my-6 border-t pt-6">
            <div className="mb-4 text-center">
              <h3 className="text-lg font-semibold">Need administrator access?</h3>
              <p className="text-sm text-muted-foreground">
                Use your invitation email and the temporary password provided by support to create or reset your admin login.
              </p>
            </div>
            <form onSubmit={handleEnrollmentSubmit(onEnroll)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="enroll-email">Email</Label>
                <Input
                  id="enroll-email"
                  type="email"
                  placeholder="you@example.com"
                  data-testid="input-admin-enroll-email"
                  {...registerEnrollment("email")}
                />
                {enrollmentErrors.email && <p className="text-sm text-destructive">{enrollmentErrors.email.message}</p>}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="enroll-first-name">First name (optional)</Label>
                  <Input
                    id="enroll-first-name"
                    type="text"
                    data-testid="input-admin-enroll-first-name"
                    {...registerEnrollment("firstName")}
                  />
                  {enrollmentErrors.firstName && (
                    <p className="text-sm text-destructive">{enrollmentErrors.firstName.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enroll-last-name">Last name (optional)</Label>
                  <Input
                    id="enroll-last-name"
                    type="text"
                    data-testid="input-admin-enroll-last-name"
                    {...registerEnrollment("lastName")}
                  />
                  {enrollmentErrors.lastName && (
                    <p className="text-sm text-destructive">{enrollmentErrors.lastName.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="enroll-temp-password">Temporary password</Label>
                <Input
                  id="enroll-temp-password"
                  type="password"
                  placeholder="Provided temporary password"
                  data-testid="input-admin-enroll-temp-password"
                  {...registerEnrollment("temporaryPassword")}
                />
                {enrollmentErrors.temporaryPassword && (
                  <p className="text-sm text-destructive">{enrollmentErrors.temporaryPassword.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="enroll-password">New administrator password</Label>
                <Input
                  id="enroll-password"
                  type="password"
                  placeholder="Create a strong password"
                  data-testid="input-admin-enroll-password"
                  {...registerEnrollment("password")}
                />
                {enrollmentErrors.password && (
                  <p className="text-sm text-destructive">{enrollmentErrors.password.message}</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isEnrollmentSubmitting}
                data-testid="button-admin-enroll-submit"
                variant="secondary"
              >
                {isEnrollmentSubmitting ? "Securing access..." : "Create or reset admin access"}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <Link
        href="/"
        className="absolute bottom-4 left-4 text-xs text-muted-foreground hover:text-primary"
        data-testid="link-admin-back-to-user-login"
      >
        ← Back to user login
      </Link>
    </div>
  );
}
