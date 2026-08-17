import { Button, Text } from "react-email";

import { EmailLayout, styles } from "./layout";

export default function ResetPassword({
  name = "there",
  url = "https://example.invalid/reset",
}: {
  name?: string;
  url?: string;
}) {
  return (
    <EmailLayout preview="Reset your Lanes password">
      <Text style={styles.heading}>Reset your password</Text>
      <Text style={styles.paragraph}>
        Hi {name} — someone asked to reset the password on your Lanes account.
        Use the link below to choose a new one. It expires in an hour.
      </Text>
      <Button href={url} style={styles.button}>
        Choose a new password
      </Button>
      <Text style={styles.fallback}>
        If the button doesn&apos;t work, paste this into your browser: {url}
      </Text>
      <Text style={styles.fallback}>
        If this wasn&apos;t you, ignore this email — your password stays as it
        is.
      </Text>
    </EmailLayout>
  );
}
