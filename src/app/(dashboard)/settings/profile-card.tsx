"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ProfileCard({
  name: initialName,
  image: initialImage,
}: {
  name: string;
  image: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [image, setImage] = useState(initialImage ?? "");
  const [pending, setPending] = useState(false);

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);

    // Better Auth's own API, never a direct write to the user table.
    const { error } = await authClient.updateUser({
      name: name.trim(),
      image: image.trim() || null,
    });

    setPending(false);

    if (error) {
      toast.error(error.message ?? "Couldn't save that. Try again.");
      return;
    }

    toast.success("Saved.");
    // The header shows the name, so refresh rather than making them reload.
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          What your teammates see next to the cards you&apos;re assigned.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              {image ? <AvatarImage src={image} alt="" /> : null}
              <AvatarFallback>{initials || "?"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Label htmlFor="avatar">Avatar URL</Label>
              <Input
                id="avatar"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
