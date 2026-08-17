import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * What a non-admin sees at /settings/system.
 *
 * The page calls notFound() so the server answers 404 rather than 200 — the
 * refusal is real, not a hidden link. This keeps it a readable page instead of
 * the stack trace a bare throw would produce.
 */
export default function SystemNotFound() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Not available</CardTitle>
        <CardDescription>
          This page is only for the person who set this instance of Lanes up.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
