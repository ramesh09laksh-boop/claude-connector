import { Button, Text } from "react-email";

import { EmailLayout, styles } from "./layout";

export default function VerifyEmail({
  name = "there",
  url = "https://example.invalid/verify",
}: {
  name?: string;
  url?: string;
}) {
  return (
    <EmailLayout preview="Confirm your email to get your team on the board">
      <Text style={styles.heading}>Confirm your email</Text>
      <Text style={styles.paragraph}>
        Hi {name} — one click and your Lanes account is ready. Confirming your
        address lets you create invite links so your teammates can join your
        board.
      </Text>
      <Button href={url} style={styles.button}>
        Confirm my email
      </Button>
      <Text style={styles.fallback}>
        If the button doesn&apos;t work, paste this into your browser: {url}
      </Text>
      <Text style={styles.fallback}>
        Didn&apos;t sign up for Lanes? You can ignore this email.
      </Text>
    </EmailLayout>
  );
}
