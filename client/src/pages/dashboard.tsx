import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Zap,
  LayoutDashboard,
  Users,
  DollarSign,
  Clock,
  Settings,
  TrendingUp,
  Activity,
  Radio,
  Wallet,
} from "lucide-react";
import type { Session } from "@shared/schema";

interface StreamStats {
  totalEarnings: number;
  activeViewers: number;
  avgSessionDuration: number;
  totalSessions: number;
}

const chartData = [
  { time: "00:00", revenue: 0.12 },
  { time: "04:00", revenue: 0.08 },
  { time: "08:00", revenue: 0.45 },
  { time: "12:00", revenue: 0.78 },
  { time: "16:00", revenue: 1.24 },
  { time: "20:00", revenue: 0.95 },
  { time: "Now", revenue: 0.67 },
];

const menuItems = [
  { title: "Overview", icon: LayoutDashboard, active: true },
  { title: "Audience", icon: Users, active: false },
  { title: "Payouts", icon: DollarSign, active: false },
  { title: "Settings", icon: Settings, active: false },
];

function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
          <div className="flex items-center gap-2 hover-elevate rounded-md p-1 -m-1 cursor-pointer">
            <Zap className="h-6 w-6 text-primary" />
            <span className="font-heading text-xl font-bold">StreamFlow</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    className={item.active ? "bg-sidebar-accent" : ""}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export default function Dashboard() {
  const wallet = useWallet();
  const { toast } = useToast();
  
  const { data: statsData, isLoading: statsLoading } = useQuery<{ stats: StreamStats }>({
    queryKey: ['/api/stats'],
    refetchInterval: 5000,
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{ sessions: Session[] }>({
    queryKey: ['/api/sessions'],
    refetchInterval: 5000,
  });

  const stats = statsData?.stats;
  const sessions = sessionsData?.sessions || [];
  const recentSessions = sessions.slice(0, 5);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-4 bg-background">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <h1 className="font-heading text-lg font-bold">Creator Dashboard</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="link-stream">
                  <Radio className="mr-2 h-4 w-4" />
                  View Stream
                </Button>
              </Link>
              <Button 
                variant="outline" 
                size="sm" 
                data-testid="button-wallet"
                onClick={async () => {
                  if (wallet.connected && wallet.address) {
                    await navigator.clipboard.writeText(wallet.address);
                    toast({ description: "Wallet address copied" });
                  }
                }}
              >
                <Wallet className="mr-2 h-4 w-4" />
                {wallet.connected ? wallet.formatAddress(wallet.address) : "Not Connected"}
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Earnings
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-cyber-cyan" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono tabular-nums text-cyber-cyan" data-testid="stat-earnings">
                    ${stats?.totalEarnings?.toFixed(2) || "0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    +12% from last week
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Active Viewers
                  </CardTitle>
                  <Users className="h-4 w-4 text-live" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono tabular-nums" data-testid="stat-viewers">
                    {stats?.activeViewers || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Currently watching
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Avg Session
                  </CardTitle>
                  <Clock className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono tabular-nums" data-testid="stat-duration">
                    {formatTime(stats?.avgSessionDuration || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Average watch time
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Sessions
                  </CardTitle>
                  <Activity className="h-4 w-4 text-cyber-pink" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono tabular-nums" data-testid="stat-sessions">
                    {stats?.totalSessions || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    All time sessions
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Real-time Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="hsl(var(--border))" 
                          opacity={0.3}
                        />
                        <XAxis 
                          dataKey="time" 
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickFormatter={(value) => `$${value}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "6px",
                            color: "hsl(var(--foreground))",
                          }}
                          formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ fill: "hsl(var(--primary))", strokeWidth: 0 }}
                          activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-cyber-pink" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sessionsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="animate-pulse flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 bg-muted rounded w-3/4" />
                            <div className="h-2 bg-muted rounded w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : recentSessions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No recent activity</p>
                    </div>
                  ) : (
                    recentSessions.map((session, index) => (
                      <div key={session.sessionId}>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/20 text-primary">
                              {session.viewerAddress.slice(2, 4).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {session.viewerAddress.slice(0, 6)}...{session.viewerAddress.slice(-4)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(session.totalSeconds)} watched
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm font-medium text-cyber-cyan tabular-nums">
                              +${session.totalPaid.toFixed(4)}
                            </p>
                            <Badge 
                              variant={session.status === "active" ? "default" : "secondary"}
                              className={session.status === "active" ? "bg-live text-xs" : "text-xs"}
                            >
                              {session.status}
                            </Badge>
                          </div>
                        </div>
                        {index < recentSessions.length - 1 && (
                          <Separator className="my-3" />
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
