import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";
import type { ReactNode } from "react";

/* Inline styles throughout: an email client knows nothing about our CSS
   variables, and half of them strip <style> blocks outright. */
const main = {
  backgroundColor: "#f5f6f8",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: "32px 0",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #e3e5ea",
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "480px",
  padding: "32px",
};

const wordmark = {
  color: "#3f4be0",
  fontSize: "18px",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  margin: "0 0 24px",
};

const divider = { borderColor: "#e3e5ea", margin: "28px 0 16px" };

const footerText = {
  color: "#6b7180",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0",
};

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={wordmark}>Lanes</Text>
          {children}
          <Hr style={divider} />
          <Section>
            <Text style={footerText}>
              Lanes — every team&apos;s work, in its lane.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const styles = {
  heading: {
    color: "#1b1e28",
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: "28px",
    margin: "0 0 12px",
  },
  paragraph: {
    color: "#3d4150",
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0 0 16px",
  },
  button: {
    backgroundColor: "#3f4be0",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 600,
    padding: "10px 18px",
    textDecoration: "none",
  },
  fallback: {
    color: "#6b7180",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "16px 0 0",
    wordBreak: "break-all" as const,
  },
};
