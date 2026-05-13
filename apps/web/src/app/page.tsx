import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12 gap-6">
      <h1 className="text-4xl font-bold">ClaimIt</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-md text-center">
        AI agent that monitors post-purchase prices and auto-generates refund claims.
      </p>

      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Demo card</CardTitle>
            <Badge variant="secondary">In progress</Badge>
          </div>
          <CardDescription>
            Frontend scaffold polished (ticket 5.1). Real UI tickets come next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Sample Button</Button>
        </CardContent>
      </Card>
    </main>
  );
}
