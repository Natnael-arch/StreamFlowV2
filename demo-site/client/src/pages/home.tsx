import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Play,
  Square,
  Clock,
  Wallet,
  Users,
  TrendingUp,
  Zap,
  Copy,
  CheckCircle2,
  AlertCircle,
  Radio
} from "lucide-react";
import type {
  Session,
  StartSessionResponse,
  StopSessionResponse,
  GetAllSessionsResponse
} from "@shared/schema";

function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatMOVE(amount: number): string {
  if (amount < 0.0001) return amount.toExponential(2);
  if (amount < 1) return amount.toFixed(6);
  return amount.toFixed(4);
}

function StatusBadge({ status }: { status: Session["status"] }) {
  if (status === "active") {
    return (
      <Badge variant="default" className="bg-emerald-500 dark:bg-emerald-600">
        <Radio className="w-3 h-3 mr-1 animate-pulse" />
        Active
      </Badge>
    );
  }
  if (status === "settled") {
    return (
      <Badge variant="secondary">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Settled
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <Square className="w-3 h-3 mr-1" />
      Stopped
    </Badge>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ description: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleCopy}
      data-testid="button-copy"
    >
      {copied ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </Button>
  );
}

function RealTimeCostDisplay({
  sessionId,
  ratePerSecond,
  startTime,
  isActive
}: {
  sessionId: string;
  ratePerSecond: number;
  startTime: number;
  isActive: boolean;
}) {
  const [seconds, setSeconds] = useState(0);
  const [cost, setCost] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const calculateCurrent = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setSeconds(elapsed);
      setCost(elapsed * ratePerSecond);
    };

    calculateCurrent();
    const interval = setInterval(calculateCurrent, 1000);

    return () => clearInterval(interval);
  }, [isActive, startTime, ratePerSecond]);

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <div className="text-5xl font-mono font-bold tracking-tight" data-testid="text-cost">
        {formatMOVE(cost)} <span className="text-2xl text-muted-foreground">MOVE</span>
      </div>
      <div className="text-lg font-mono text-muted-foreground" data-testid="text-duration">
        {formatDuration(seconds)}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  onStop,
  isActive,
  onStopIsPending
}: {
  session: Session;
  onStop: (sessionId: string) => void;
  isActive: boolean;
  onStopIsPending?: boolean;
}) {
  return (
    <Card className={`${isActive ? 'border-emerald-500/50 dark:border-emerald-400/50' : ''}`} data-testid={`card-session-${session.sessionId}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={session.status} />
          <span className="text-xs font-mono text-muted-foreground">
            {formatAddress(session.sessionId)}
          </span>
          <CopyButton text={session.sessionId} />
        </div>
        {isActive && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onStop(session.sessionId)}
            disabled={onStopIsPending}
            data-testid="button-stop-session"
          >
            {onStopIsPending ? (
              <Clock className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Square className="w-4 h-4 mr-1" />
            )}
            {onStopIsPending ? "Stopping..." : "Stop"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Viewer</p>
            <p className="font-mono text-sm" data-testid="text-viewer-address">
              {formatAddress(session.viewerAddress)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Creator</p>
            <p className="font-mono text-sm" data-testid="text-creator-address">
              {formatAddress(session.creatorAddress)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rate</p>
            <p className="font-mono text-sm" data-testid="text-rate">
              {session.ratePerSecond} MOVE/sec
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="font-mono text-sm" data-testid="text-session-duration">
              {isActive ? (
                <RealTimeDuration startTime={session.startTime} />
              ) : (
                formatDuration(session.totalSeconds)
              )}
            </p>
          </div>
          {!isActive && (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Total Paid</p>
                <p className="font-mono text-sm font-semibold" data-testid="text-total-paid">
                  {formatMOVE(session.totalPaid)} MOVE
                </p>
              </div>
              {session.txHash && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Transaction</p>
                  <div className="flex items-center gap-1">
                    <p className="font-mono text-xs truncate" data-testid="text-tx-hash">
                      {formatAddress(session.txHash)}
                    </p>
                    <CopyButton text={session.txHash} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {isActive && (
          <div className="mt-4 pt-4 border-t">
            <RealTimeCostDisplay
              sessionId={session.sessionId}
              ratePerSecond={session.ratePerSecond}
              startTime={session.startTime}
              isActive={true}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RealTimeDuration({ startTime }: { startTime: number }) {
  const [duration, setDuration] = useState("0:00");

  useEffect(() => {
    const update = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setDuration(formatDuration(elapsed));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span>{duration}</span>;
}

function StatsCards({
  totalSessions,
  activeSessions,
  totalRevenue
}: {
  totalSessions: number;
  activeSessions: number;
  totalRevenue: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
          <Users className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-total-sessions">{totalSessions}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
          <Radio className="w-4 h-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="text-active-sessions">
            {activeSessions}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono" data-testid="text-total-revenue">
            {formatMOVE(totalRevenue)} <span className="text-sm text-muted-foreground">MOVE</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Home() {
  const { toast } = useToast();
  const [viewerAddress, setViewerAddress] = useState("");
  const [creatorAddress, setCreatorAddress] = useState("");
  const [ratePerSecond, setRatePerSecond] = useState("0.001");

  // Fetch all sessions
  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    refetch: refetchSessions
  } = useQuery<GetAllSessionsResponse>({
    queryKey: ["/api/sessions"],
    refetchInterval: 5000,
  });

  // Fetch stats
  const {
    data: statsData,
    refetch: refetchStats
  } = useQuery<{ totalSessions: number; activeSessions: number; totalRevenue: number }>({
    queryKey: ["/api/stats"],
    refetchInterval: 5000,
  });

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/session/start", {
        viewerAddress,
        creatorAddress,
        ratePerSecond: parseFloat(ratePerSecond),
      });
      return response.json() as Promise<StartSessionResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "Session Started",
        description: `Session ${formatAddress(data.sessionId)} is now active`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start session",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Stop session mutation
  const stopSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", "/api/session/stop", { sessionId });
      return response.json() as Promise<StopSessionResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "Session Stopped",
        description: `Total paid: ${formatMOVE(data.totalPaid)} MOVE for ${formatDuration(data.totalSeconds)}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to stop session",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStartSession = () => {
    if (!viewerAddress.trim()) {
      toast({ title: "Error", description: "Viewer address is required", variant: "destructive" });
      return;
    }
    if (!creatorAddress.trim()) {
      toast({ title: "Error", description: "Creator address is required", variant: "destructive" });
      return;
    }
    if (!ratePerSecond || parseFloat(ratePerSecond) <= 0) {
      toast({ title: "Error", description: "Rate must be greater than 0", variant: "destructive" });
      return;
    }
    startSessionMutation.mutate();
  };

  const handleStopSession = (sessionId: string) => {
    stopSessionMutation.mutate(sessionId);
  };

  const sessions = sessionsData?.sessions || [];
  const activeSessions = sessions.filter(s => s.status === "active");
  const completedSessions = sessions.filter(s => s.status !== "active");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-primary" />
            <h1 className="text-xl font-bold">StreamFlow</h1>
            <Badge variant="outline" className="hidden sm:flex">Demo Mode</Badge>
          </div>
          <div className="flex items-center gap-2">
            {statsData && (
              <Badge variant="secondary" className="font-mono">
                <Wallet className="w-3 h-3 mr-1" />
                {formatMOVE(statsData.totalRevenue)} MOVE
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        {/* Stats */}
        {statsData && (
          <div className="mb-8">
            <StatsCards
              totalSessions={statsData.totalSessions}
              activeSessions={statsData.activeSessions}
              totalRevenue={statsData.totalRevenue}
            />
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Start Session Form */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Start Session
                </CardTitle>
                <CardDescription>
                  Open a new pay-per-second streaming session
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="viewerAddress">Viewer Address</Label>
                  <Input
                    id="viewerAddress"
                    placeholder="0x..."
                    value={viewerAddress}
                    onChange={(e) => setViewerAddress(e.target.value)}
                    className="font-mono"
                    data-testid="input-viewer-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="creatorAddress">Creator Address</Label>
                  <Input
                    id="creatorAddress"
                    placeholder="0x..."
                    value={creatorAddress}
                    onChange={(e) => setCreatorAddress(e.target.value)}
                    className="font-mono"
                    data-testid="input-creator-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ratePerSecond">Rate (MOVE/second)</Label>
                  <Input
                    id="ratePerSecond"
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="0.001"
                    value={ratePerSecond}
                    onChange={(e) => setRatePerSecond(e.target.value)}
                    className="font-mono"
                    data-testid="input-rate"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleStartSession}
                  disabled={startSessionMutation.isPending}
                  data-testid="button-start-session"
                >
                  {startSessionMutation.isPending ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Start Watching
                    </>
                  )}
                </Button>

                {/* Demo Mode Info */}
                <div className="p-3 rounded-lg bg-muted/50 border border-dashed">
                  <p className="text-xs text-muted-foreground">
                    <strong>Demo Mode:</strong> x402 payments are simulated.
                    Use any wallet address format for testing.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sessions List */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active Sessions */}
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-500" />
                Active Sessions
                {activeSessions.length > 0 && (
                  <Badge variant="secondary">{activeSessions.length}</Badge>
                )}
              </h2>

              {sessionsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : activeSessions.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Radio className="w-12 h-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">
                      No active sessions<br />
                      <span className="text-sm">Start a session to begin streaming payments</span>
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {activeSessions.map((session) => (
                    <SessionCard
                      key={session.sessionId}
                      session={session}
                      onStop={handleStopSession}
                      isActive={true}
                      onStopIsPending={stopSessionMutation.isPending && stopSessionMutation.variables === session.sessionId}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Session History */}
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Session History
                {completedSessions.length > 0 && (
                  <Badge variant="outline">{completedSessions.length}</Badge>
                )}
              </h2>

              {completedSessions.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <Clock className="w-10 h-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground text-sm text-center">
                      No completed sessions yet
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {completedSessions.map((session) => (
                    <SessionCard
                      key={session.sessionId}
                      session={session}
                      onStop={handleStopSession}
                      isActive={false}
                      onStopIsPending={stopSessionMutation.isPending && stopSessionMutation.variables === session.sessionId}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="container px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span>StreamFlow - Pay-per-second Streaming</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Powered by x402 Protocol</span>
              <span>|</span>
              <span>Movement Blockchain</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
