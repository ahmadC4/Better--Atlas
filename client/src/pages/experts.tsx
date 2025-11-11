import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Users, Shield, Bot, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import type { Expert } from "@shared/schema";

interface ExpertsResponse {
  experts: Expert[];
  showUpsell?: boolean;
  upsellMessage?: string;
}

export default function ExpertsPage() {
  const [, navigate] = useLocation();
  const { data: expertsData, isLoading } = useQuery<ExpertsResponse>({
    queryKey: ['/api/experts'],
    staleTime: 60000, // 1 minute
  });
  
  const experts = expertsData?.experts ?? [];
  const showUpsell = expertsData?.showUpsell ?? false;
  const upsellMessage = expertsData?.upsellMessage ?? 'Upgrade your plan to access AI Experts';

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="border-b border-border/40 px-6 py-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">AI Experts</h1>
            <p className="text-sm text-muted-foreground">
              Choose specialized AI personalities to enhance your conversations
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Card key={n} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <Skeleton className="h-12 w-12 rounded-lg mb-3" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : showUpsell ? (
          // Show upsell message for Free plan users
          <div className="flex flex-col items-center justify-center h-[50vh] text-center">
            <Star className="h-12 w-12 text-primary/50 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Unlock AI Experts</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              {upsellMessage}
            </p>
            <p className="text-sm text-muted-foreground/80 mb-6">
              Get access to specialized AI personalities with domain expertise in various fields including:
            </p>
            <div className="grid grid-cols-2 gap-2 mb-8 text-sm">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span>Technical Experts</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span>Creative Assistants</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span>Business Advisors</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span>Research Specialists</span>
              </div>
            </div>
            <Button 
              onClick={() => navigate('/pricing')}
              size="lg"
              data-testid="upgrade-to-pro-button"
            >
              <Star className="h-4 w-4 mr-2" />
              View Upgrade Options
            </Button>
          </div>
        ) : !experts || experts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center">
            <Bot className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-medium text-muted-foreground">No experts available</h2>
            <p className="text-sm text-muted-foreground/80 mt-1">
              Experts will appear here once they're added by administrators
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {experts.map((expert) => (
              <Card 
                key={expert.id} 
                className="overflow-hidden hover:shadow-lg transition-shadow border-muted/50"
                data-testid={`expert-card-${expert.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Shield className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-base">{expert.name}</CardTitle>
                        {expert.isActive && (
                          <div className="flex items-center gap-1 mt-1">
                            <Sparkles className="h-3 w-3 text-green-500" />
                            <span className="text-xs text-green-500 font-medium">Active</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm line-clamp-3">
                    {expert.description || "A specialized AI expert ready to assist you with domain-specific knowledge and expertise."}
                  </CardDescription>
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Bot className="h-3 w-3" />
                      <span>Select in chat to use this expert</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}