import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, MessageSquare, Sparkles, Shield } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">
            Welcome to Atlas AI
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Your intelligent conversation partner powered by advanced AI models
          </p>
          <Button 
            size="lg" 
            onClick={handleLogin}
            className="text-lg px-8 py-6"
            data-testid="button-login"
          >
            Sign In to Get Started
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-20">
          <Card>
            <CardHeader>
              <Brain className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Multiple AI Models</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Access GPT, Claude, and other cutting-edge language models in one place
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <MessageSquare className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Smart Conversations</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Engage in intelligent dialogues with context-aware AI that remembers your preferences
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Sparkles className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Personalized Experience</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Customize AI responses with your profile, memories, and custom instructions
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Secure & Private</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Your data is protected with enterprise-grade security and authentication
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-20">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl">Ready to Experience AI?</CardTitle>
              <CardDescription className="text-lg">
                Sign in with your preferred provider to start chatting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                size="lg" 
                onClick={handleLogin}
                data-testid="button-login-cta"
              >
                Sign In Now
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                Create an account or sign in with your email
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}