/**
 * Instant Audit Trigger
 * Called by submit-form.js after form submission
 * Triggers /plg-internet-visibility-audit via Claude API and emails results
 */

const Anthropic = require("@anthropic-ai/sdk").default;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function triggerInstantAudit(businessName, city, businessType, email) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not set, skipping instant audit");
    return null;
  }

  try {
    // Trigger the audit via Claude
    const prompt = `Run the /plg-internet-visibility-audit skill with these inputs:

Business: ${businessName}
Location: ${city}
Service Type: ${businessType}

Generate the full audit report. Output it in a clean, email-ready format that can be sent directly to ${email}. Include:
- Overall visibility score (0-100)
- Current GBP status
- Review analysis
- Citation authority
- Competitor comparison
- Top 3 quick wins (actionable in week 1)

Format as markdown for easy email reading.`;

    const message = await client.messages.create({
      model: "claude-opus-4-1-20250805",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const auditContent =
      message.content[0].type === "text" ? message.content[0].text : null;

    if (!auditContent) {
      throw new Error("Failed to generate audit content");
    }

    // Queue email via Resend
    if (process.env.RESEND_API_KEY) {
      await sendAuditEmail(businessName, email, auditContent);
    }

    return {
      success: true,
      auditGenerated: true,
      emailQueued: !!process.env.RESEND_API_KEY,
    };
  } catch (error) {
    console.error("Instant audit error:", error);
    // Don't fail the form submission — audit is a bonus
    return { success: false, error: error.message };
  }
}

async function sendAuditEmail(businessName, recipientEmail, auditContent) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 32px 20px; }
    .header { background: #0f1419; color: #fff; padding: 24px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 4px 0 0; color: #9ca3af; }
    .content { background: #f9fafb; padding: 32px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none; }
    .content h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; }
    .content ul { margin: 12px 0; padding-left: 20px; }
    .content li { margin: 8px 0; }
    .cta { background: #f59e0b; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Google Visibility Audit</h1>
      <p>Prime Local Growth</p>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Your instant audit for <strong>${businessName}</strong> is ready below. This snapshot shows exactly where you stand on Google and what the fastest wins are.</p>

      ${auditContent.replace(/^/gm, "<p>").replace(/\n\n/g, "</p><p>")}

      <p style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
        <strong>Next step:</strong> Reply to this email or visit <a href="https://primelocalgrowth.com" style="color: #f59e0b;">primelocalgrowth.com</a> if you'd like to discuss a plan.
      </p>
      <p style="color: #6b7280; font-size: 14px;">
        — Adam Rome<br>Prime Local Growth<br>adam@primelocalgrowth.com
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Adam Rome <adam@primelocalgrowth.com>",
        to: recipientEmail,
        subject: `Your ${businessName} Google Visibility Audit`,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend error: ${response.status}`);
    }

    console.log("Audit email sent to", recipientEmail);
  } catch (error) {
    console.error("Audit email send failed:", error);
  }
}
