import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { useX402 } from "@/hooks/use-x402";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Play, 
  Pause, 
  Users, 
  Wallet,
  LayoutDashboard,
  Zap,
  TrendingUp,
  Radio,
  ExternalLink
} from "lucide-react";
import type { StartSessionResponse } from "@shared/schema";

const DEMO_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

interface StreamStats {
  totalEarnings: number;
  activeViewers: number;
  avgSessionDuration: number;
  totalSessions: number;
}

export default function StreamView() {
  const { toast } = useToast();
  const wallet = useWallet();
  const x402 = useX402();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  
  const ratePerSecond = 0.001;
  const viewerAddress = wallet.address || "0x0000000000000000000000000000000000000000";
  const creatorAddress = "0xea563f61047c73ecb0160d9d9eefb7a38e35edbfdaf3953f0dbe1cdee9982cff";

  // Control video playback based on watching state
  useEffect(() => {
    if (videoRef.current) {
      if (isWatching) {
        videoRef.current.play().catch(console.error);
      } else {
        videoRef.current.pause();
      }
    }
  }, [isWatching]);
  
  const { data: statsData } = useQuery<{ stats: StreamStats }>({
    queryKey: ['/api/stats'],
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerAddress,
          creatorAddress,
          ratePerSecond,
        }),
        credentials: 'include',
      });
      const data = await response.json();
      if (response.status === 409 && data.sessionId) {
        return { sessionId: data.sessionId, message: "Resumed existing session" };
      }
      if (!response.ok) {
        throw new Error(data.error || "Failed to start session");
      }
      return data as StartSessionResponse;
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setIsWatching(true);
      setElapsedTime(0);
      setTotalCost(0);
      toast({
        title: "Stream Started",
        description: data.message || "Payment session is now active",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start stream session",
        variant: "destructive",
      });
    },
  });

  const handleStopAndSettle = async () => {
    if (!sessionId) return;
    
    // Stop timer immediately when user clicks
    setIsWatching(false);
    setIsSettling(true);
    
    try {
      const result = await x402.settleSession(sessionId);
      setLastTxHash(result.txHash);
      
      toast({
        title: "Payment Settled",
        description: `Paid $${result.settledAmount.toFixed(4)} to creator via x402`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    } catch (error) {
      toast({
        title: "Settlement Error",
        description: error instanceof Error ? error.message : "Failed to settle payment",
        variant: "destructive",
      });
    } finally {
      setIsSettling(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isWatching) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
        setTotalCost((prev) => prev + ratePerSecond);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isWatching]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleConnectWallet = async () => {
    try {
      await wallet.connect();
      toast({
        title: "Wallet Connected",
        description: "Wallet connected successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect wallet",
        variant: "destructive",
      });
    }
  };

  const handleToggleStream = () => {
    if (isWatching) {
      handleStopAndSettle();
    } else {
      startMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <span className="font-heading text-xl font-bold">StreamFlow</span>
          </div>
          
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" data-testid="link-dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Creator Dashboard
              </Button>
            </Link>
            
            {wallet.connected ? (
              <Button 
                variant="outline" 
                size="sm" 
                data-testid="button-wallet-connected"
                onClick={async () => {
                  if (wallet.address) {
                    await navigator.clipboard.writeText(wallet.address);
                    toast({ description: "Wallet address copied" });
                  }
                }}
              >
                <Wallet className="mr-2 h-4 w-4" />
                {wallet.formatAddress(wallet.address)}
              </Button>
            ) : (
              <Button onClick={handleConnectWallet} disabled={wallet.isLoading} data-testid="button-connect-wallet">
                <Wallet className="mr-2 h-4 w-4" />
                {wallet.isLoading ? "Connecting..." : "Connect Wallet"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="relative aspect-video rounded-lg overflow-hidden bg-card border border-card-border">
              {/* Video Player */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                src={DEMO_VIDEO_URL}
                loop
                muted
                playsInline
                poster=""
                data-testid="video-stream"
              />
              
              {/* Overlay when not watching */}
              {!isWatching && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <Radio className="h-16 w-16 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">
                      {isSettling ? "Processing payment..." : "Click Start Watching to begin"}
                    </p>
                  </div>
                </div>
              )}
              
              <div className="absolute top-4 left-4 flex items-center gap-2">
                {isWatching ? (
                  <Badge className="bg-live text-live-foreground animate-pulse-glow" data-testid="badge-live">
                    <span className="mr-1.5 h-2 w-2 rounded-full bg-live-foreground animate-pulse-dot inline-block" />
                    LIVE
                  </Badge>
                ) : (
                  <Badge variant="secondary" data-testid="badge-offline">
                    <span className="mr-1.5 h-2 w-2 rounded-full bg-muted-foreground inline-block" />
                    PAUSED
                  </Badge>
                )}
              </div>
              
              <div className="absolute top-4 right-4">
                <Badge variant="secondary" className="gap-1.5">
                  <Users className="h-3 w-3" />
                  <span data-testid="text-viewer-count">{statsData?.stats?.activeViewers || 0}</span>
                </Badge>
              </div>
              
              <div className="absolute bottom-4 left-4 flex items-center gap-3">
                <Avatar className="h-10 w-10 border-2 border-primary">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-primary text-primary-foreground font-heading">CR</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-heading font-semibold text-foreground">CryptoCreator</p>
                  <p className="text-sm text-muted-foreground">Movement Gaming</p>
                </div>
              </div>
            </div>
            
            <Card>
              <CardContent className="p-4">
                <h2 className="font-heading text-xl font-bold mb-2">Ultimate Web3 Gaming Stream</h2>
                <p className="text-muted-foreground text-sm">
                  Join the revolution of pay-per-second streaming powered by Movement blockchain and x402 micropayments.
                </p>
              </CardContent>
            </Card>
            
            <div className="space-y-3">
              <h3 className="font-heading font-semibold">Related Streams</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2].map((i) => (
                  <Card key={i} className="overflow-hidden hover-elevate cursor-pointer">
                    <div className="aspect-video bg-gradient-to-br from-cyber-cyan/20 via-background to-primary/20 relative">
                      <Badge className="absolute top-2 left-2 bg-live text-live-foreground text-xs">LIVE</Badge>
                    </div>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-secondary">U{i}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">Stream Title {i}</p>
                          <p className="text-xs text-muted-foreground">Creator {i}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <Card className="border-primary/50">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-heading font-bold text-lg">Payment Stream</h3>
                  <Badge variant="outline" className="text-cyber-cyan border-cyber-cyan/50">
                    x402
                  </Badge>
                </div>
                
                <Separator />
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Rate</span>
                    <span className="font-mono text-sm tabular-nums" data-testid="text-rate">
                      ${ratePerSecond.toFixed(4)}/sec
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Total Cost</span>
                    <span className="font-mono text-2xl font-bold tabular-nums text-primary" data-testid="text-total-cost">
                      ${totalCost.toFixed(4)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Time Watched</span>
                    <span className="font-mono text-sm tabular-nums" data-testid="text-time-watched">
                      {formatTime(elapsedTime)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={isWatching ? "default" : "secondary"} className={isWatching ? "bg-live" : ""}>
                      {isWatching ? "Streaming" : "Paused"}
                    </Badge>
                  </div>
                </div>
                
                <Separator />
                
                <Button
                  className="w-full"
                  size="lg"
                  variant={isWatching ? "destructive" : "default"}
                  onClick={handleToggleStream}
                  disabled={!wallet.connected || startMutation.isPending || isSettling}
                  data-testid="button-toggle-stream"
                >
                  {startMutation.isPending ? (
                    "Starting..."
                  ) : isSettling ? (
                    "Settling Payment..."
                  ) : isWatching ? (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      Stop & Settle
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Start Watching
                    </>
                  )}
                </Button>
                
                {lastTxHash && !isWatching && (
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <span>Last tx:</span>
                    <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">
                      {lastTxHash.slice(0, 12)}...
                    </code>
                    {!lastTxHash.startsWith('demo_') && (
                      <ExternalLink className="h-3 w-3" />
                    )}
                  </div>
                )}
                
                {!wallet.connected && (
                  <p className="text-xs text-center text-muted-foreground">
                    Connect your wallet to start watching
                  </p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-heading font-semibold">Stream Stats</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total Earnings</p>
                    <p className="font-mono font-bold tabular-nums text-cyber-cyan" data-testid="text-total-earnings">
                      ${statsData?.stats?.totalEarnings?.toFixed(2) || "0.00"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Active Viewers</p>
                    <p className="font-mono font-bold tabular-nums" data-testid="text-active-viewers">
                      {statsData?.stats?.activeViewers || 0}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Avg Duration</p>
                    <p className="font-mono font-bold tabular-nums">
                      {formatTime(statsData?.stats?.avgSessionDuration || 0)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Sessions</p>
                    <p className="font-mono font-bold tabular-nums">
                      {statsData?.stats?.totalSessions || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-heading font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  About x402
                </h3>
                <p className="text-sm text-muted-foreground">
                  x402 enables real-time micropayments on Movement blockchain. 
                  Pay only for what you watch, by the second.
                </p>
              </CardContent>
            </Card>
            
            {wallet.connected && x402.isProductionMode && (
              <Card className="border-amber-500/50 bg-amber-500/5">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-heading font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Wallet className="h-4 w-4" />
                    Movement Testnet Setup
                  </h3>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>Configure your wallet for Movement testnet:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>Open wallet settings</li>
                      <li>Add custom network</li>
                      <li>RPC URL: <code className="bg-muted px-1 rounded text-xs">https://testnet.movementnetwork.xyz/v1</code></li>
                      <li>Chain ID: <code className="bg-muted px-1 rounded text-xs">250</code></li>
                    </ol>
                    <p className="text-xs pt-2">
                      Get testnet tokens from{" "}
                      <a 
                        href="https://faucet.testnet.movementnetwork.xyz/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary underline hover:no-underline inline-flex items-center gap-1"
                        data-testid="link-movement-faucet"
                      >
                        Movement Faucet
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
