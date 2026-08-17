import { Button, Text } from "react-email";

import { EmailLayout, styles } from "./layout";

export default function ConfirmDelete({
  name = "there",
  url = "https://example.invalid/delete",
}: {
  name?: string;
  url?: string;
}) {
  return (
    <EmailLayout preview="Confirm you want to delete your Lanes account">
      <Text style={styles.heading}>Delete your Lanes account</Text>
      <Text style={styles.paragraph}>
        Hi {name} — you asked to delete your Lanes account. Confirming removes
        your profile and your memberships straight away, and it can&apos;t be
        undone. Cards you created stay on their team&apos;s board, unassigned.
      </Text>
      <Button href={url} style={styles.button}>
        Delete my account
      </Button>
      <Text style={styles.fallback}>
        If the button doesn&apos;t work, paste this into your browser: {url}
      </Text>
      <Text style={styles.fallback}>
        Changed your mind? Ignore this email and nothing happens.
      </Text>
    </EmailLayout>
  );
}
